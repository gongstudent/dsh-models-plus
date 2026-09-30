/**
 * Loopback Local Route proxy plugin for DeepSeek Harness.
 * Provides an HTTP proxy server on a configurable port (default 8317)
 * translating OpenAI (/v1/chat/completions, /v1/responses) and
 * Anthropic (/v1/messages) protocols to providers configured in Harness.
 *
 * @module dsh-models-plus
 */

import type { Context, Volatile } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { LocalRouteServer } from './local-route.ts'
import { DEFAULT_LOCAL_ROUTE_PORT, resolveProfiles } from './config.ts'

export interface LocalRouteConfig {
  enabled: Volatile<boolean>
  port: Volatile<number>
}

export const Config = z.object({
  enabled: z.boolean().default(false).volatile(),
  port: z.number().step(1).min(1024).max(65535).default(DEFAULT_LOCAL_ROUTE_PORT).volatile(),
})

export const name = 'dsh-local-route'
export const inject = ['credentials']

export { LocalRouteServer } from './local-route.ts'
export type { LocalRouteProtocol, LocalRouteServerOptions } from './local-route.ts'

/**
 * Extract active provider profiles configured in DSH.
 * Inspects ctx.configEditor, ctx.loader, and ctx.settings.
 */
function extractProviders(ctx: Context): Record<string, any> {
  // 1. Try reading from configEditor
  try {
    const configEditor = ctx.get('configEditor') as any
    if (configEditor?.configuration) {
      const piAi = configEditor.configuration().find((c: any) => c.entry.options.id === 'llm-pi-ai')
      if (piAi?.override?.providers || piAi?.inherited?.providers) {
        return { ...(piAi.inherited?.providers ?? {}), ...(piAi.override?.providers ?? {}) }
      }
    }
  } catch {}

  // 2. Try reading from loader entries
  try {
    const loader = (ctx as any).loader
    if (loader?.entries) {
      for (const entry of loader.entries()) {
        if (entry.options?.id === 'llm-pi-ai' && entry.options?.config?.providers) {
          return entry.options.config.providers
        }
      }
    }
  } catch {}

  // 3. Try reading from settingsForms
  try {
    const settings = ctx.get('settings') as any
    if (settings?.describe) {
      const descriptors = settings.describe()
      const piAi = descriptors.find((d: any) => d.ns === 'llm-pi-ai')
      if (piAi?.value?.providers) {
        return piAi.value.providers
      }
    }
  } catch {}

  return {}
}

export function apply(ctx: Context, config: LocalRouteConfig): void {
  const getProfiles = () => {
    const providers = extractProviders(ctx)
    return resolveProfiles(providers)
  }

  const resolveApiKey = async (provider: string, profile: any): Promise<string | undefined> => {
    const ref = profile.apiKeyEnv
    if (!ref) return undefined
    try {
      const credentials = ctx.get('credentials') as any
      if (credentials?.resolve) {
        const hit = await credentials.resolve(ref)
        if (hit?.value && hit.value.length > 0) return hit.value
      }
    } catch {}
    return process.env[ref]
  }

  const server = new LocalRouteServer({
    profiles: getProfiles,
    resolveApiKey,
    logger: {
      info: msg => ctx.logger.info(msg),
      error: (msg, err) => {
        ctx.logger.error(msg)
        ctx.logger.error(err)
      },
    },
  })

  const sync = (): void => {
    const isEnabled = typeof (config.enabled as any)?.get === 'function'
      ? config.enabled.get()
      : (config.enabled as unknown as boolean) === true
    const currentPort = typeof (config.port as any)?.get === 'function'
      ? config.port.get()
      : (typeof config.port === 'number' ? config.port : DEFAULT_LOCAL_ROUTE_PORT)

    void server.configure({
      enabled: isEnabled,
      port: currentPort,
    }).catch(err => {
      ctx.logger.warn('Failed to configure local route server: %s', err instanceof Error ? err.message : String(err))
    })
  }

  sync()

  ctx.on('loader/volatile-update', sync)
  ctx.on('settings/document-updated', sync)
  ctx.on('app-boot/config-reload', sync)
  ctx.effect(() => async () => { await server.close() })
}

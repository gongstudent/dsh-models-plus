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
import type { PiAiProviderProfile, ResolvedPiAiProviderProfile } from './config.ts'
import type { HarnessEventBus } from './harness.ts'

export interface LocalRouteConfig {
  enabled: Volatile<boolean>
  port: Volatile<number>
}

/**
 * Mark one configuration value loader-volatile, so an edit applies live.
 *
 * The harness extends schemastery with this modifier; the published schemastery
 * declares neither the member nor a shape this package can augment (see
 * ./harness.ts), so the single call crossing that boundary names the method it
 * needs and keeps the receiver, because the modifier may return a new schema
 * rather than mutate this one.
 *
 * A host without the modifier — an older harness, or a plain Node import in a
 * test — gets the plain schema instead: the value then applies on the next
 * restart rather than live, which is a far smaller loss than the plugin
 * refusing to load at all.
 * @param schema - the schema to mark volatile.
 * @returns the harness's schema when it supports the modifier, otherwise the input.
 */
function volatileSchema<T>(schema: T): T {
  const modifier = (schema as T & { volatile?: () => T }).volatile
  return typeof modifier === 'function' ? modifier.call(schema) : schema
}

export const Config = z.object({
  enabled: volatileSchema(z.boolean().default(false)),
  port: volatileSchema(z.number().step(1).min(1024).max(65535).default(DEFAULT_LOCAL_ROUTE_PORT)),
})

export const name = 'dsh-local-route'
export const inject = ['credentials']

export { LocalRouteServer } from './local-route.ts'
export type { LocalRouteProtocol, LocalRouteServerOptions } from './local-route.ts'

/** One-line rendering of an unknown throwable for a log call. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Extract active provider profiles configured in DSH.
 *
 * Inspects ctx.configEditor, ctx.loader, and ctx.settings in that order — the
 * same three views a request may be served from — and reports the first source
 * that answers. `undefined` therefore means "no source could be read", which
 * the caller must not confuse with "the source describes no providers": the
 * former is a transient read failure that must keep the last serving route
 * set, the latter is a deployment that genuinely configured none.
 * @param ctx - host context carrying the configuration services.
 * @returns the configured providers keyed by route, or `undefined` when no
 *   configuration source answered.
 */
function extractProviders(ctx: Context): Record<string, PiAiProviderProfile> | undefined {
  // 1. configEditor holds the merged (inherited + user override) view the
  //    settings page renders, so it is the most complete single answer.
  try {
    const configEditor = ctx.get('configEditor') as any
    const configuration = typeof configEditor?.configuration === 'function' ? configEditor.configuration() : undefined
    if (Array.isArray(configuration)) {
      const piAi = configuration.find((c: any) => c.entry.options.id === 'llm-pi-ai')
      if (piAi !== undefined) {
        return { ...(piAi.inherited?.providers ?? {}), ...(piAi.override?.providers ?? {}) }
      }
    }
  } catch {}

  // 2. The loader's entry options carry the composition-time route set.
  try {
    const loader = (ctx as any).loader
    if (typeof loader?.entries === 'function') {
      for (const entry of loader.entries()) {
        if (entry.options?.id === 'llm-pi-ai') return entry.options?.config?.providers ?? {}
      }
    }
  } catch {}

  // 3. The settings service describes each namespace as a redacted document.
  try {
    const settings = ctx.get('settings') as any
    if (typeof settings?.describe === 'function') {
      const piAi = settings.describe().find((d: any) => d.ns === 'llm-pi-ai')
      if (piAi !== undefined) return piAi.value?.providers ?? {}
    }
  } catch {}

  return undefined
}

export function apply(ctx: Context, config: LocalRouteConfig): void {
  /**
   * The serving route set, rebuilt when configuration changes rather than on
   * every request: resolution materializes each route's model catalog and
   * pi-ai provider, which is work per configuration revision, not per proxy
   * call, and a request must never pay for it.
   */
  let profiles: ReadonlyMap<string, ResolvedPiAiProviderProfile> = new Map()

  /**
   * Re-resolve the route set, keeping the previous one when the replacement is
   * unreadable or unserviceable. Resolution happens on the configuration path
   * now, so a rejected snapshot can no longer fail every in-flight request
   * with a 502 — the last good routes keep serving until the configuration is
   * corrected.
   */
  const refreshProfiles = (): void => {
    let providers: Record<string, PiAiProviderProfile> | undefined
    try {
      providers = extractProviders(ctx)
    } catch (error) {
      ctx.logger.warn('dsh-local-route: reading provider configuration failed (%s); keeping the previous route set', message(error))
      return
    }
    if (providers === undefined) {
      ctx.logger.warn('dsh-local-route: no provider configuration source answered; keeping the previous route set')
      return
    }
    try {
      profiles = resolveProfiles(providers)
    } catch (error) {
      ctx.logger.warn('dsh-local-route: provider configuration is not serviceable (%s); keeping the previous route set', message(error))
    }
  }

  const resolveApiKey = async (provider: string, profile: ResolvedPiAiProviderProfile): Promise<string | undefined> => {
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
    profiles: () => profiles,
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

    refreshProfiles()

    void server.configure({
      enabled: isEnabled,
      port: currentPort,
    }).catch(err => {
      ctx.logger.warn('Failed to configure local route server: %s', message(err))
    })
  }

  sync()

  // The loader, settings and boot services emit these; see ./harness.ts for why
  // the published cordis event map does not carry them.
  const bus = ctx as unknown as HarnessEventBus
  bus.on('loader/volatile-update', sync)
  bus.on('settings/document-updated', () => { sync() })
  bus.on('app-boot/config-reload', () => { sync() })
  ctx.effect(() => async () => { await server.close() })
}

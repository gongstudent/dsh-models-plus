/**
 * Models settings and product-onboarding plugin, browser half. It registers
 * the Models page plus the ordered internal-testing and official-DeepSeek
 * onboarding dialogs, whose UI shares this package's modal wrapper. The Host
 * settings and credential contracts stay behind their existing wire APIs.
 * Export discipline:
 * packages/client/AGENTS.md.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
// Type-only: pulls the shell's SlotMap merge (the 'settings.section' entry).
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: pulls the locale plugin's Context merge (ctx.locale).
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: pulls the ctx.remote merge and the forwarded-event key face
// (settings/credentials invalidations ride the allowlist) into this program.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { ModelsSection } from './ModelsSection.tsx'
import type { ModelsSectionInjected } from './ModelsSection.tsx'
import { DeepSeekOnboardingDialog } from './DeepSeekOnboardingDialog.tsx'
import type { DeepSeekOnboardingInjected } from './DeepSeekOnboardingDialog.tsx'
import { WelcomeNotice } from './WelcomeNotice.tsx'
import type { WelcomeNoticeInjected } from './WelcomeNotice.tsx'
import { refreshWelcomeIfLoaded, WelcomeNoticeStore } from './welcome-store.ts'
import { ModelsSettingsStore } from './store.ts'
import { en, zh, type ModelsKey } from './locales.ts'
import { WELCOME_NOTICE_SETTINGS_NAMESPACE } from '../onboarding-copy.ts'

export type { ModelsSectionInjected, ModelsSectionProps } from './ModelsSection.tsx'
export type { ModelsKey } from './locales.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The Models page + product-onboarding copy. */
    'settings.models': ModelsKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.models'
export type { ModelsSettingsState, ProviderRow } from './store.ts'

/**
 * Refetch the page snapshot only after its first load: an unopened Models
 * page must not fetch on background invalidations.
 * @param controller - the page store.
 */
export function refreshIfLoaded(controller: ModelsSettingsStore): void {
  if (controller.store.getSnapshot().status === 'idle') return
  void controller.load()
}

/**
 * Required services (cordis fiber inject). The target slot is declared by
 * ui-settings' apply, whose activation order relative to this one is NOT
 * constrained; registration depends on each slot through `slots.inject()`.
 */
export const inject = [
  'slots',
  'locale',
  'remote',
  'remote.credentials',
  'remote.llm',
  'remote.settings',
]

/**
 * Compatibility bridge providing an IApiClient-compatible surface
 * backed by modern DSH's ctx.remote.
 */
function createApiAdapter(ctx: ClientContext): Pick<IApiClient, 'settings' | 'credentials' | 'llm'> {
  const connection = ctx.get('connection') as ConnectionHandle | undefined
  const connApi = connection?.api as any
  const remote = (ctx as any).remote

  return {
    settings: {
      describe: async (req?: any) => {
        if (remote?.settings?.describe) {
          const res = await remote.settings.describe()
          return {
            ok: res.ok,
            result: res.ok ? { ok: true, value: res.value } : { ok: false, error: res.error },
            value: res.value,
          }
        }
        if (connApi?.settings?.describe) {
          return connApi.settings.describe(req ?? {})
        }
        throw new Error('settings service is not available')
      },
      mutate: async (args: any, ...rest: any[]) => {
        let ns: string
        let ops: any[]
        let expectedRevision: number | undefined
        if (typeof args === 'string') {
          ns = args
          ops = rest[0]
          expectedRevision = rest[1]
        } else {
          ns = args.ns
          ops = args.ops
          expectedRevision = args.expectedRevision
        }

        if (remote?.settings?.mutate) {
          const res = await remote.settings.mutate(ns, ops, expectedRevision)
          let error = res.error
          if (!res.ok && res.error) {
            const code = (res.error.code === 'settings/conflict' || res.error.code === 'settings-conflict')
              ? 'settings-conflict'
              : res.error.code
            error = { ...res.error, code }
          }
          return {
            ok: res.ok,
            result: res.ok ? { ok: true, value: res.value } : { ok: false, error },
          }
        }
        if (connApi?.settings?.mutate) {
          return connApi.settings.mutate({ ns, ops, expectedRevision })
        }
        throw new Error('settings service is not available')
      },
    },
    credentials: {
      describe: async (args: { refs: string[] } | string[]) => {
        const refs = Array.isArray(args) ? args : args.refs
        if (remote?.credentials?.describe) {
          const res = await remote.credentials.describe(refs)
          return {
            ok: res.ok,
            result: res.ok ? {
              ok: true,
              value: {
                credentials: res.value,
                ...res.value,
              },
            } : {
              ok: false,
              error: res.error,
            },
            value: {
              credentials: res.value,
              ...res.value,
            },
          }
        }
        if (connApi?.credentials?.describe) {
          return connApi.credentials.describe({ refs })
        }
        throw new Error('credentials service is not available')
      },
      set: async (args: { ref: string; value: string } | string, val?: string) => {
        const ref = typeof args === 'string' ? args : args.ref
        const value = typeof args === 'string' ? val! : args.value
        if (remote?.credentials?.set) {
          const res = await remote.credentials.set(ref, value)
          return {
            ok: res.ok,
            result: res,
          }
        }
        if (connApi?.credentials?.set) {
          return connApi.credentials.set({ ref, value })
        }
        throw new Error('credentials service is not available')
      },
      unset: async (args: { ref: string } | string) => {
        const ref = typeof args === 'string' ? args : args.ref
        if (remote?.credentials?.unset) {
          const res = await remote.credentials.unset(ref)
          return {
            ok: res.ok,
            result: res,
          }
        }
        if (connApi?.credentials?.unset) {
          return connApi.credentials.unset({ ref })
        }
        throw new Error('credentials service is not available')
      },
    },
    llm: {
      providers: async (req?: any) => {
        if (remote?.llm?.listConfigurableProviders) {
          const res = await remote.llm.listConfigurableProviders()
          return {
            ok: res.ok,
            result: res.ok ? {
              ok: true,
              value: {
                providers: res.value,
              },
            } : {
              ok: false,
              error: res.error,
            },
            value: {
              providers: res.value,
            },
          }
        }
        if (connApi?.llm?.providers) {
          return connApi.llm.providers(req ?? {})
        }
        throw new Error('llm service is not available')
      },
      discoverModels: async (args: any, maybeRequest?: any) => {
        let settingsNs: string
        let request: any
        if (typeof args === 'string') {
          settingsNs = args
          request = maybeRequest
        } else {
          settingsNs = args.settingsNs
          const { settingsNs: _, ...rest } = args
          request = rest
        }
        if (remote?.llm?.discoverModels) {
          const res = await remote.llm.discoverModels(settingsNs, request)
          return {
            ok: res.ok,
            result: res.ok ? {
              ok: true,
              value: {
                models: res.value,
                ...(Array.isArray(res.value) ? {} : res.value),
              },
            } : {
              ok: false,
              error: res.error,
            },
            value: {
              models: res.value,
              ...(Array.isArray(res.value) ? {} : res.value),
            },
          }
        }
        if (connApi?.llm?.discoverModels) {
          return connApi.llm.discoverModels(args, maybeRequest)
        }
        throw new Error('llm service is not available')
      },
    },
  } as Pick<IApiClient, 'settings' | 'credentials' | 'llm'>
}

/**
 * Register the Models section once the `settings.section` declaration is on
 * the ledger, wire its store to the connection, and keep it fresh on every
 * pushed invalidation (settings, credentials, or provider topology).
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-models: copy dictionaries')

  const connection = ctx.get('connection') as ConnectionHandle | undefined
  const api = createApiAdapter(ctx)
  const controller = new ModelsSettingsStore(api)
  // Registration-time text (the nav label thunk) and the inject faces share
  // one bound translate; copy freshness rides the locale revision.
  const t = ctx.locale.bind(NS) as ModelsSectionInjected['t']
  const injected = (): ModelsSectionInjected => ({
    controller,
    hooks: { snapshot: controller.store },
    api,
    t,
  })
  const deepSeekOnboardingInjected = (): DeepSeekOnboardingInjected => ({
    controller,
    hooks: { models: controller.store },
    api,
    t,
  })
  const welcomeController = new WelcomeNoticeStore(
    api,
    connection?.isLoopback ?? true ? 'host' : 'memory',
  )
  const welcomeInjected = (): WelcomeNoticeInjected => ({
    controller: welcomeController,
    hooks: { welcome: welcomeController.store },
    t,
  })

  // Pushed invalidations converge every open surface without polling: any
  // settings/credentials/topology change refetches once the page loaded.
  ctx.effect(() => {
    const refreshModels = (): void => { refreshIfLoaded(controller) }
    const refreshAll = (): void => {
      refreshModels()
      refreshWelcomeIfLoaded(welcomeController)
    }
    const disposers: Array<(() => void) | undefined> = [
      ctx.remote?.$on?.('settings/document-updated', (ns: string) => {
        refreshModels()
        if (ns === WELCOME_NOTICE_SETTINGS_NAMESPACE) refreshWelcomeIfLoaded(welcomeController)
      }),
      ctx.remote?.$on?.('credentials/reference-updated' as any, refreshModels),
      ctx.remote?.$on?.('llm/adapters-updated' as any, refreshModels),
      ctx.on('connection/reset', refreshAll),
    ]
    return () => {
      for (const dispose of disposers) {
        if (typeof dispose === 'function') dispose()
      }
    }
  }, 'ui-settings-models: pushed invalidations')

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'models',
    order: 10,
    label: () => t('nav'),
    inject: injected,
  }, ModelsSection))
  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'welcome-notice',
    order: -100,
    inject: welcomeInjected,
  }, WelcomeNotice))
  ctx.slots.inject('settings.onboarding', () => ctx.slots.register({
    name: 'settings.onboarding',
    id: 'deepseek-official',
    order: 0,
    inject: deepSeekOnboardingInjected,
  }, DeepSeekOnboardingDialog))
}

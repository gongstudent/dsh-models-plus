/**
 * Loopback Local Route & Provider Extras UI extension plugin for DeepSeek Harness.
 * Extends the official Models settings page via official slots:
 * - `settings.models.footer`: Local route proxy controls.
 * - `settings.models.provider-card`: Header & body overrides for pi-ai providers.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { LocalRouteCard } from './LocalRouteCard.tsx'
import { ProviderExtrasCard } from './ProviderExtrasCard.tsx'
import { en, zh } from './locales.ts'

export { LocalRouteCard } from './LocalRouteCard.tsx'
export { ProviderExtrasCard } from './ProviderExtrasCard.tsx'
export { en, zh } from './locales.ts'
export type { ModelsKey } from './locales.ts'

const NS = 'dsh-models-plus'

/**
 * Required services (cordis fiber inject).
 * Injects into slots after ui-settings-models declared extension seats.
 */
export const inject = [
  'slots',
  'locale',
  'remote',
  'remote.settings',
]

/**
 * Register extensions into official Models section slots.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-models-plus: local route copy')

  // 1. 注册本地路由底部卡片
  ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer',
    id: 'dsh-local-route-footer',
    locale: NS,
    order: 100,
    inject: () => ({ ctx }),
  }, LocalRouteCard))

  // 2. 注册每个 provider 卡片内的请求头与请求体覆盖面板
  ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
    name: 'settings.models.provider-card',
    key: 'llm-pi-ai',
    locale: NS,
    order: 50,
    inject: () => ({ ctx }),
  }, ProviderExtrasCard))
}

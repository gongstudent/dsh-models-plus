/**
 * Loopback Local Route & Provider Extras UI extension plugin for DeepSeek Harness.
 * Extends the official Models settings page via official slots:
 * - `settings.models.footer`: Local route proxy controls & Custom API draft portal.
 * - `settings.models.provider-card`: Header, body & protocol overrides for declared custom providers.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { LocalRouteCard, LocalRouteFooterSection } from './LocalRouteCard.tsx'
import { ProviderExtrasCard } from './ProviderExtrasCard.tsx'
import { CustomApiDraftPortal } from './CustomApiDraftPortal.tsx'
import { en, zh } from './locales.ts'

export { LocalRouteCard, LocalRouteFooterSection } from './LocalRouteCard.tsx'
export { ProviderExtrasCard } from './ProviderExtrasCard.tsx'
export { CustomApiDraftPortal } from './CustomApiDraftPortal.tsx'
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

  // 1. 注册本地路由底部卡片与自定义模型 API 挂载通道
  ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer',
    id: 'dsh-local-route-footer',
    locale: NS,
    order: 100,
    inject: () => ({ ctx }),
  }, LocalRouteFooterSection))

  // 2. 注册每个已保存自定义 provider 卡片内的请求头与协议覆盖面板（严格 declared === true）
  ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
    name: 'settings.models.provider-card',
    key: 'llm-pi-ai',
    locale: NS,
    order: 50,
    inject: () => ({ ctx }),
  }, ProviderExtrasCard))
}

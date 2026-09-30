/**
 * Loopback Local Route UI extension plugin for DeepSeek Harness.
 * Extends the official Models settings page via the `settings.models.footer` slot.
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { LocalRouteCard } from './LocalRouteCard.tsx'
import { en, zh } from './locales.ts'

export { LocalRouteCard } from './LocalRouteCard.tsx'
export { en, zh } from './locales.ts'
export type { ModelsKey } from './locales.ts'

const NS = 'settings.models'

/**
 * Required services (cordis fiber inject).
 * Injects into slots after ui-settings-models declared 'settings.models.footer'.
 */
export const inject = [
  'slots',
  'locale',
  'remote',
  'remote.settings',
]

/**
 * Register the local-route control card into the official Models section footer.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-models-plus: local route copy')

  ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer',
    id: 'dsh-local-route-footer',
    order: 100,
    inject: () => ({ ctx }),
  }, LocalRouteCard))
}

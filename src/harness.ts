/**
 * The DeepSeek Harness API surface this package consumes beyond the published
 * package types.
 *
 * The harness serves the same packages this repository builds against, but it
 * augments them: schemastery gains `volatile()`, cordis gains the lifecycle
 * events the loader, settings and boot services emit, and the client shell
 * contributes the `slots` and `locale` services. None of that augmentation
 * ships in the published artifacts, so a typecheck against them alone would
 * refuse code that is correct in the harness.
 *
 * Cordis's `Context` and `Events` cannot be augmented from here — the package
 * root re-exports them from submodules, so `declare module
 * '@deepseek-ai/cordis'` would declare a second interface beside the real one
 * instead of merging with it — and schemastery's schema interface is reached
 * through a type the published declarations do not expose to augmentation
 * either. The shapes below are therefore applied where this package crosses
 * that boundary, keeping every harness dependency explicit and in one place.
 *
 * @module dsh-models-plus/harness
 */

/** Lifecycle events emitted by harness services, by event name. */
export interface HarnessEvents {
  /** The loader re-read its volatile configuration values. */
  'loader/volatile-update': () => void
  /** A settings namespace document changed; the namespace is named. */
  'settings/document-updated': (namespace: string) => void
  /** Boot finished loading configuration, so plugins may re-read it. */
  'app-boot/config-reload': () => void
}

/** The host event bus, narrowed to {@link HarnessEvents}. */
export interface HarnessEventBus {
  on<Name extends keyof HarnessEvents>(name: Name, listener: HarnessEvents[Name]): () => void
}

/** The client shell's settings-page extension seats. */
export interface ClientSlots {
  inject(seat: string, contribute: () => unknown): void
  register(
    seat: { name: string; id: string; order?: number; locale?: string; inject?: () => unknown },
    component: (props: any) => unknown,
  ): unknown
}

/** The client shell's per-namespace copy registry. */
export interface ClientLocale {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
}

/** The client shell services this package registers through. */
export interface ClientShellServices {
  slots: ClientSlots
  locale: ClientLocale
}

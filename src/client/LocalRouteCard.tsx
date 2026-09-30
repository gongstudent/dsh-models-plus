import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import styles from './LocalRouteCard.module.css'
import { en, zh, type ModelsKey } from './locales.ts'

interface LocalRouteNsInfo {
  ns: string
  enabled: boolean
  port: number
  pathPrefix: string[]
  revision: number
}

function resolveLocalRouteSettings(namespaces: any[]): LocalRouteNsInfo {
  const own = namespaces?.find((n: any) => n.ns === 'dsh-local-route')
  if (own) {
    const val = own.value
    return {
      ns: 'dsh-local-route',
      enabled: val?.enabled === true,
      port: typeof val?.port === 'number' ? val.port : 8317,
      pathPrefix: [],
      revision: own.revision ?? 0,
    }
  }

  const piAi = namespaces?.find((n: any) => n.ns === 'llm-pi-ai')
  if (piAi) {
    const val = piAi.value
    return {
      ns: 'llm-pi-ai',
      enabled: val?.localRoute?.enabled === true,
      port: typeof val?.localRoute?.port === 'number' ? val.localRoute.port : 8317,
      pathPrefix: ['localRoute'],
      revision: piAi.revision ?? 0,
    }
  }

  return {
    ns: 'dsh-local-route',
    enabled: false,
    port: 8317,
    pathPrefix: [],
    revision: 0,
  }
}

export function LocalRouteCard({
  ctx,
  t: propsT,
}: {
  ctx?: Context
  t?: (key: ModelsKey) => string
}): ReactNode {
  const [enabled, setEnabled] = useState(false)
  const [portDraft, setPortDraft] = useState('8317')
  const [activePort, setActivePort] = useState(8317)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | undefined>(undefined)
  const [nsInfo, setNsInfo] = useState<LocalRouteNsInfo | null>(null)

  const lang = (ctx as any)?.locale?.getSnapshot?.()?.active ?? 'zh'
  const t = useCallback((key: ModelsKey): string => {
    if (typeof propsT === 'function') {
      try {
        const val = propsT(key)
        if (val) return val
      } catch {}
    }
    const dict = lang === 'zh' ? zh : en
    return dict[key] ?? en[key] ?? key
  }, [lang, propsT])

  const refresh = useCallback(async () => {
    try {
      const remote = (ctx as any)?.remote
      if (!remote?.settings?.describe) return
      const res = await remote.settings.describe()
      if (res?.ok && res.value?.namespaces) {
        const info = resolveLocalRouteSettings(res.value.namespaces)
        setNsInfo(info)
        setEnabled(info.enabled)
        setActivePort(info.port)
        setPortDraft(String(info.port))
      }
    } catch {
      // Background query failure is ignored
    }
  }, [ctx])

  useEffect(() => {
    void refresh()
    const remote = (ctx as any)?.remote
    const off = remote?.$on?.('settings/document-updated', (ns: string) => {
      if (ns === 'dsh-local-route' || ns === 'llm-pi-ai') {
        void refresh()
      }
    })
    return () => { off?.() }
  }, [ctx, refresh])

  const parsedPort = /^\d+$/.test(portDraft) ? Number(portDraft) : Number.NaN
  const portValid = Number.isInteger(parsedPort) && parsedPort >= 1024 && parsedPort <= 65535

  const write = async (nextEnabled: boolean, targetPort: number): Promise<void> => {
    if (pending) return
    setPending(true)
    setFailure(undefined)
    try {
      const remote = (ctx as any)?.remote
      const targetNs = nsInfo?.ns ?? 'dsh-local-route'
      const ops = (nsInfo?.pathPrefix.length ?? 0) === 0
        ? [
            { op: 'set', path: ['enabled'], value: nextEnabled },
            { op: 'set', path: ['port'], value: targetPort },
          ]
        : [
            { op: 'set', path: [...nsInfo!.pathPrefix], value: { enabled: nextEnabled, port: targetPort } },
          ]

      const res = await remote?.settings?.mutate(targetNs, ops, nsInfo?.revision)
      if (res?.ok) {
        setEnabled(nextEnabled)
        setActivePort(targetPort)
        setPortDraft(String(targetPort))
      } else {
        setFailure(res?.error?.message ?? 'Failed to apply configuration')
      }
    } catch (err: unknown) {
      setFailure(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
      void refresh()
    }
  }

  const handleToggle = () => {
    if (!portValid) {
      setFailure(t('localRoutePortInvalid'))
      return
    }
    void write(!enabled, parsedPort)
  }

  const handlePortBlur = () => {
    if (!portValid) {
      setFailure(t('localRoutePortInvalid'))
      return
    }
    if (parsedPort !== activePort) {
      void write(enabled, parsedPort)
    }
  }

  const address = t('localRouteAddress').replace('{port}', String(portValid ? parsedPort : activePort))

  return (
    <section className={styles.localRouteControl} aria-labelledby="local-route-title">
      <div className={styles.localRouteHead}>
        <div>
          <h3 id="local-route-title" className={styles.localRouteTitle}>
            {t('localRoute')}
          </h3>
          <p className={styles.localRouteAddress}>{address}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={t('localRouteEnabled')}
          title={enabled ? t('localRouteStop') : t('localRouteStart')}
          className={styles.routeSwitch}
          disabled={pending}
          onClick={handleToggle}
        >
          <span className={styles.routeSwitchTrack} data-on={enabled || undefined} aria-hidden="true">
            <span className={styles.routeSwitchThumb} />
          </span>
        </button>
      </div>

      <div className={styles.controlsRow}>
        <label className={styles.routePortField}>
          <span className={styles.fieldLabel}>{t('localRoutePort')}</span>
          <input
            type="number"
            min={1024}
            max={65535}
            step={1}
            className={`${styles.input} ${styles.routePortInput}`}
            value={portDraft}
            disabled={pending || enabled}
            onChange={(e) => {
              setPortDraft(e.target.value)
              setFailure(undefined)
            }}
            onBlur={handlePortBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
          />
        </label>

        <p className={enabled ? styles.routeRunning : styles.routeStopped}>
          {pending ? t('localRouteApplying') : enabled ? `● ${t('localRouteRunning')}` : `○ ${t('localRouteStopped')}`}
        </p>
      </div>

      {failure !== undefined ? <p className={styles.error}>{failure}</p> : null}
    </section>
  )
}

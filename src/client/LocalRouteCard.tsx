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

function parseJsonObject(text: string): { ok: boolean; value?: Record<string, unknown> } {
  const trimmed = text.trim()
  if (trimmed.length === 0) return { ok: true, value: undefined }
  try {
    const parsed = JSON.parse(trimmed)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return { ok: true, value: parsed as Record<string, unknown> }
    }
    return { ok: false }
  } catch {
    return { ok: false }
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

  // 渠道配置状态
  const [providerList, setProviderList] = useState<Array<{ id: string; name: string }>>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('')
  const [inboundApi, setInboundApi] = useState<string>('')
  const [outboundApi, setOutboundApi] = useState<string>('openai-completions')
  const [headersText, setHeadersText] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [savingProvider, setSavingProvider] = useState(false)
  const [providerSaveSuccess, setProviderSaveSuccess] = useState(false)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [piAiRevision, setPiAiRevision] = useState<number | undefined>(undefined)
  const [rawProviders, setRawProviders] = useState<Record<string, any>>({})

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

        // 读取所有 pi-ai 渠道
        const piAi = res.value.namespaces.find((n: any) => n.ns === 'llm-pi-ai')
        if (piAi?.value?.providers) {
          setPiAiRevision(piAi.revision)
          const provs = piAi.value.providers as Record<string, any>
          setRawProviders(provs)
          const list = Object.entries(provs).map(([id, item]: [string, any]) => ({
            id,
            name: item.displayName ? `${item.displayName} (${id})` : id,
          }))
          setProviderList(list)
          if (!selectedProvider && list.length > 0) {
            setSelectedProvider(list[0].id)
          }
        }
      }
    } catch {
      // Background query failure is ignored
    }
  }, [ctx, selectedProvider])

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

  // 当选择的渠道发生变化时，更新当前表单数据
  useEffect(() => {
    if (!selectedProvider || !rawProviders[selectedProvider]) return
    const cur = rawProviders[selectedProvider]
    setInboundApi(cur.inboundApi ?? '')
    setOutboundApi(cur.api ?? 'openai-completions')
    setHeadersText(cur.headers ? JSON.stringify(cur.headers, null, 2) : '')
    setBodyText(cur.bodyOverrides ? JSON.stringify(cur.bodyOverrides, null, 2) : '')
    setProviderError(null)
    setProviderSaveSuccess(false)
  }, [selectedProvider, rawProviders])

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

  const headerParse = parseJsonObject(headersText)
  const bodyParse = parseJsonObject(bodyText)
  const headersValid = headerParse.ok
  const bodyValid = bodyParse.ok

  const handleSaveProvider = async () => {
    if (!selectedProvider || !headersValid || !bodyValid || savingProvider) return
    setSavingProvider(true)
    setProviderError(null)
    setProviderSaveSuccess(false)

    try {
      const remote = (ctx as any)?.remote
      const ops: any[] = []
      const basePath = ['providers', selectedProvider]

      // 入站协议
      if (inboundApi.length > 0) {
        ops.push({ op: 'set', path: [...basePath, 'inboundApi'], value: inboundApi })
      } else {
        ops.push({ op: 'unset', path: [...basePath, 'inboundApi'] })
      }

      // 出站协议 (api)
      if (outboundApi.length > 0) {
        ops.push({ op: 'set', path: [...basePath, 'api'], value: outboundApi })
      }

      // 请求头
      if (headerParse.value !== undefined) {
        ops.push({ op: 'set', path: [...basePath, 'headers'], value: headerParse.value })
      } else {
        ops.push({ op: 'unset', path: [...basePath, 'headers'] })
      }

      // 请求体
      if (bodyParse.value !== undefined) {
        ops.push({ op: 'set', path: [...basePath, 'bodyOverrides'], value: bodyParse.value })
      } else {
        ops.push({ op: 'unset', path: [...basePath, 'bodyOverrides'] })
      }

      const res = await remote?.settings?.mutate('llm-pi-ai', ops, piAiRevision)
      if (res?.ok) {
        setProviderSaveSuccess(true)
        setTimeout(() => setProviderSaveSuccess(false), 2000)
      } else {
        setProviderError(res?.error?.message ?? '保存失败')
      }
    } catch (e: any) {
      setProviderError(e.message || String(e))
    } finally {
      setSavingProvider(false)
      void refresh()
    }
  }

  const address = t('localRouteAddress').replace('{port}', String(portValid ? parsedPort : activePort))

  return (
    <section className={styles.localRouteControl} aria-labelledby="local-route-title">
      {/* 头部：标题与启停开关 */}
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

      {/* 端口配置行 */}
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

      {/* 渠道协议与参数映射区域 */}
      <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.1))' }}>
        <h4 style={{ margin: '0 0 10px', fontSize: '13px', fontWeight: 600, color: 'var(--dsw-alias-label-primary, #fff)' }}>
          {t('providerConfigHeading')}
        </h4>

        {providerList.length === 0 ? (
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.5))' }}>
            {t('noProvidersHint')}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {/* 目标渠道选择器 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span className={styles.fieldLabel}>{t('selectProviderLabel')}</span>
              <select
                style={{
                  height: '28px',
                  padding: '0 8px',
                  fontSize: '12px',
                  borderRadius: '6px',
                  border: '1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15))',
                  background: 'var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.2))',
                  color: 'var(--dsw-alias-label-primary, #fff)',
                  outline: 'none',
                  cursor: 'pointer',
                }}
                value={selectedProvider}
                onChange={e => setSelectedProvider(e.target.value)}
              >
                {providerList.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {selectedProvider && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', background: 'var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.1))', padding: '12px', borderRadius: '8px', border: '1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08))' }}>
                {/* 协议选择行 */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                  <div>
                    <div style={{ marginBottom: '4px' }}>
                      <span className={styles.fieldLabel}>{t('inboundApi')}</span>
                    </div>
                    <select
                      style={{
                        width: '100%',
                        height: '28px',
                        padding: '0 8px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: '1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15))',
                        background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04))',
                        color: 'var(--dsw-alias-label-primary, #fff)',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                      value={inboundApi}
                      onChange={e => setInboundApi(e.target.value)}
                    >
                      <option value="">{t('inboundApiAuto')}</option>
                      <option value="openai-completions">{t('protocolOpenAiCompletions')}</option>
                      <option value="anthropic-messages">{t('protocolAnthropicMessages')}</option>
                      <option value="openai-responses">{t('protocolOpenAiResponses')}</option>
                    </select>
                  </div>

                  <div>
                    <div style={{ marginBottom: '4px' }}>
                      <span className={styles.fieldLabel}>{t('outboundApi')}</span>
                    </div>
                    <select
                      style={{
                        width: '100%',
                        height: '28px',
                        padding: '0 8px',
                        fontSize: '12px',
                        borderRadius: '6px',
                        border: '1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15))',
                        background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04))',
                        color: 'var(--dsw-alias-label-primary, #fff)',
                        outline: 'none',
                        cursor: 'pointer',
                      }}
                      value={outboundApi}
                      onChange={e => setOutboundApi(e.target.value)}
                    >
                      <option value="openai-completions">{t('protocolOpenAiCompletions')}</option>
                      <option value="anthropic-messages">{t('protocolAnthropicMessages')}</option>
                      <option value="openai-responses">{t('protocolOpenAiResponses')}</option>
                    </select>
                  </div>
                </div>

                {/* 请求头覆盖 */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span className={styles.fieldLabel}>{t('headers')}</span>
                    {!headersValid && <span className={styles.error}>{t('headersInvalid')}</span>}
                  </div>
                  <textarea
                    rows={2}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '6px 8px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      borderRadius: '6px',
                      border: `1px solid ${headersValid ? 'var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15))' : 'var(--dsw-alias-state-danger-primary, #e54d2e)'}`,
                      background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04))',
                      color: 'var(--dsw-alias-label-primary, #fff)',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                    value={headersText}
                    placeholder={t('headersPlaceholder')}
                    onChange={e => setHeadersText(e.target.value)}
                  />
                </div>

                {/* 请求体覆盖 */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span className={styles.fieldLabel}>{t('bodyOverrides')}</span>
                    {!bodyValid && <span className={styles.error}>{t('bodyOverridesInvalid')}</span>}
                  </div>
                  <textarea
                    rows={2}
                    style={{
                      width: '100%',
                      boxSizing: 'border-box',
                      padding: '6px 8px',
                      fontSize: '12px',
                      fontFamily: 'monospace',
                      borderRadius: '6px',
                      border: `1px solid ${bodyValid ? 'var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15))' : 'var(--dsw-alias-state-danger-primary, #e54d2e)'}`,
                      background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04))',
                      color: 'var(--dsw-alias-label-primary, #fff)',
                      outline: 'none',
                      resize: 'vertical',
                    }}
                    value={bodyText}
                    placeholder={t('bodyOverridesPlaceholder')}
                    onChange={e => setBodyText(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '4px' }}>
                  <button
                    type="button"
                    style={{
                      height: '28px',
                      padding: '0 14px',
                      fontSize: '12px',
                      borderRadius: '6px',
                      border: '1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.2))',
                      background: 'var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.08))',
                      color: 'var(--dsw-alias-label-primary, #fff)',
                      cursor: (!headersValid || !bodyValid || savingProvider) ? 'not-allowed' : 'pointer',
                      opacity: (!headersValid || !bodyValid || savingProvider) ? 0.5 : 1,
                    }}
                    disabled={!headersValid || !bodyValid || savingProvider}
                    onClick={handleSaveProvider}
                  >
                    {savingProvider ? t('saving') : t('saveParams')}
                  </button>
                  {providerSaveSuccess && (
                    <span style={{ fontSize: '12px', color: 'var(--dsw-alias-state-success-primary, #30a46c)' }}>
                      ✓ {t('saved')}
                    </span>
                  )}
                  {providerError && (
                    <span className={styles.error}>{providerError}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

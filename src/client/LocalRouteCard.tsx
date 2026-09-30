import { useState, useEffect, useCallback, useRef } from 'react'
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
  const [outboundApi, setOutboundApi] = useState<string>('')
  const [headersText, setHeadersText] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [savingProvider, setSavingProvider] = useState(false)
  const [providerSaveSuccess, setProviderSaveSuccess] = useState(false)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [piAiRevision, setPiAiRevision] = useState<number | undefined>(undefined)
  const [rawProviders, setRawProviders] = useState<Record<string, any>>({})
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 用户在参数框中还有未保存的编辑时，后台刷新不得覆盖它们
  const formDirtyRef = useRef(false)
  const portDirtyRef = useRef(false)

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

  // 不依赖 selectedProvider：否则每次切换渠道都会重建订阅并重复查询一次设置
  const refresh = useCallback(async (): Promise<void> => {
    try {
      const remote = (ctx as any)?.remote
      if (!remote?.settings?.describe) return
      const res = await remote.settings.describe()
      if (!res?.ok || !res.value?.namespaces) return
      const info = resolveLocalRouteSettings(res.value.namespaces)
      setNsInfo(info)
      setEnabled(info.enabled)
      setActivePort(info.port)
      if (!portDirtyRef.current) setPortDraft(String(info.port))

      const piAi = res.value.namespaces.find((n: any) => n.ns === 'llm-pi-ai')
      if (!piAi?.value?.providers) return
      setPiAiRevision(piAi.revision)
      const provs = piAi.value.providers as Record<string, any>
      setRawProviders(provs)
      const list = Object.entries(provs).map(([id, item]: [string, any]) => ({
        id,
        name: item?.displayName ? `${item.displayName} (${id})` : id,
      }))
      setProviderList(list)
      // 保留仍然存在的选择，否则回落到第一个渠道；用更新函数读取旧值让本回调
      // 与当前选择解耦
      setSelectedProvider(prev => (prev.length > 0 && provs[prev] !== undefined ? prev : list[0]?.id ?? ''))
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

  // 成功提示的计时器随组件卸载一起清理
  useEffect(() => () => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
  }, [])

  // 切换渠道或配置被外部修改时回显已保存的值；用户正在编辑时不覆盖
  useEffect(() => {
    if (!selectedProvider || formDirtyRef.current) return
    const cur = rawProviders[selectedProvider]
    if (cur === undefined) return
    setInboundApi(cur.inboundApi ?? '')
    setOutboundApi(cur.api ?? '')
    setHeadersText(cur.headers ? JSON.stringify(cur.headers, null, 2) : '')
    setBodyText(cur.bodyOverrides ? JSON.stringify(cur.bodyOverrides, null, 2) : '')
  }, [selectedProvider, rawProviders])

  // 当用户主动切换渠道时才重置状态
  const handleSelectProvider = (id: string) => {
    if (successTimerRef.current) clearTimeout(successTimerRef.current)
    formDirtyRef.current = false
    setProviderSaveSuccess(false)
    setProviderError(null)
    setSelectedProvider(id)
  }

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
        portDirtyRef.current = false
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
    if (successTimerRef.current) clearTimeout(successTimerRef.current)

    try {
      const remote = (ctx as any)?.remote
      const ops: any[] = []
      const basePath = ['providers', selectedProvider]

      // 本地路由对外协议 (inboundApi)
      if (inboundApi.length > 0) {
        ops.push({ op: 'set', path: [...basePath, 'inboundApi'], value: inboundApi })
      } else {
        ops.push({ op: 'unset', path: [...basePath, 'inboundApi'] })
      }

      // 上游模型协议 (api)：留空表示继承目录默认，必须 unset，否则会把渠道
      // 从“复用官方 provider”改写成显式协议
      if (outboundApi.length > 0) {
        ops.push({ op: 'set', path: [...basePath, 'api'], value: outboundApi })
      } else {
        ops.push({ op: 'unset', path: [...basePath, 'api'] })
      }

      // 请求头 (headers)
      if (headerParse.value !== undefined) {
        ops.push({ op: 'set', path: [...basePath, 'headers'], value: headerParse.value })
      } else {
        ops.push({ op: 'unset', path: [...basePath, 'headers'] })
      }

      // 请求体 (bodyOverrides)
      if (bodyParse.value !== undefined) {
        ops.push({ op: 'set', path: [...basePath, 'bodyOverrides'], value: bodyParse.value })
      } else {
        ops.push({ op: 'unset', path: [...basePath, 'bodyOverrides'] })
      }

      const res = await remote?.settings?.mutate('llm-pi-ai', ops, piAiRevision)
      if (res?.ok) {
        formDirtyRef.current = false
        setProviderSaveSuccess(true)
        successTimerRef.current = setTimeout(() => {
          setProviderSaveSuccess(false)
        }, 3000)
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

  const editForm = (apply: () => void) => {
    formDirtyRef.current = true
    setProviderSaveSuccess(false)
    apply()
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

      {/* 端口配置行：运行中改动端口即在 blur 时热重绑 */}
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
            disabled={pending}
            onChange={(e) => {
              portDirtyRef.current = true
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
      <div className={styles.panelSection}>
        <h4 className={styles.panelHeading}>{t('providerConfigHeading')}</h4>

        {providerList.length === 0 ? (
          <p className={styles.emptyHint}>{t('noProvidersHint')}</p>
        ) : (
          <div className={styles.panelBody}>
            {/* 目标渠道选择器 */}
            <div className={styles.providerRow}>
              <span className={styles.fieldLabel}>{t('selectProviderLabel')}</span>
              <select
                className={styles.providerSelect}
                value={selectedProvider}
                onChange={e => handleSelectProvider(e.target.value)}
              >
                {providerList.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {selectedProvider && (
              <div className={styles.panelBox}>
                {/* 协议选择行：上游模型协议 与 本地路由对外协议 */}
                <div className={styles.protocolGrid}>
                  {/* 1. 上游模型协议 */}
                  <div>
                    <div className={styles.protocolField}>
                      <span className={styles.fieldLabel}>{t('upstreamApi')}</span>
                    </div>
                    <select
                      className={styles.protocolSelect}
                      value={outboundApi}
                      onChange={e => editForm(() => { setOutboundApi(e.target.value) })}
                    >
                      <option value="">{t('upstreamApiAuto')}</option>
                      <option value="openai-completions">{t('protocolOpenAiCompletions')}</option>
                      <option value="anthropic-messages">{t('protocolAnthropicMessages')}</option>
                      <option value="openai-responses">{t('protocolOpenAiResponses')}</option>
                    </select>
                  </div>

                  {/* 2. 本地路由对外协议 */}
                  <div>
                    <div className={styles.protocolField}>
                      <span className={styles.fieldLabel}>{t('localRouteClientApi')}</span>
                    </div>
                    <select
                      className={styles.protocolSelect}
                      value={inboundApi}
                      onChange={e => editForm(() => { setInboundApi(e.target.value) })}
                    >
                      <option value="">{t('protocolAuto')}</option>
                      <option value="openai-completions">{t('protocolOpenAiCompletions')}</option>
                      <option value="anthropic-messages">{t('protocolAnthropicMessages')}</option>
                      <option value="openai-responses">{t('protocolOpenAiResponses')}</option>
                    </select>
                  </div>
                </div>

                {/* 请求头覆盖 */}
                <div>
                  <div className={styles.jsonHead}>
                    <span className={styles.fieldLabel}>{t('headers')}</span>
                    {!headersValid && <span className={styles.error}>{t('headersInvalid')}</span>}
                  </div>
                  <textarea
                    rows={2}
                    className={`${styles.jsonInput} ${headersValid ? '' : styles.jsonInputInvalid}`}
                    value={headersText}
                    placeholder={t('headersPlaceholder')}
                    onChange={e => editForm(() => { setHeadersText(e.target.value) })}
                  />
                </div>

                {/* 请求体覆盖 */}
                <div>
                  <div className={styles.jsonHead}>
                    <span className={styles.fieldLabel}>{t('bodyOverrides')}</span>
                    {!bodyValid && <span className={styles.error}>{t('bodyOverridesInvalid')}</span>}
                  </div>
                  <textarea
                    rows={2}
                    className={`${styles.jsonInput} ${bodyValid ? '' : styles.jsonInputInvalid}`}
                    value={bodyText}
                    placeholder={t('bodyOverridesPlaceholder')}
                    onChange={e => editForm(() => { setBodyText(e.target.value) })}
                  />
                </div>

                <div className={styles.actionsRow}>
                  <button
                    type="button"
                    className={styles.saveButton}
                    disabled={!headersValid || !bodyValid || savingProvider}
                    onClick={handleSaveProvider}
                  >
                    {savingProvider ? t('saving') : t('saveParams')}
                  </button>
                  {providerSaveSuccess && (
                    <span className={styles.successText}>
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

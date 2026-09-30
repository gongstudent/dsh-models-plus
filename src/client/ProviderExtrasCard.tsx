import { useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import styles from './ProviderExtrasCard.module.css'
import { en, zh, type ModelsKey } from './locales.ts'

interface ProviderCardProps {
  ctx?: Context
  t?: (key: ModelsKey) => string
  provider?: {
    provider: string
    displayName: string
    settingsNs: string
    settingsPath: readonly string[]
    active?: boolean
    declared?: boolean
    error?: string
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

export function ProviderExtrasCard(props: ProviderCardProps): ReactNode {
  const { ctx, provider } = props

  // 排除官方 DeepSeek 账号卡片，自定义渠道与第三方渠道均正常支持
  if (provider?.provider === 'deepseek-account' || provider?.provider === 'deepseek-official') {
    return null
  }

  const [open, setOpen] = useState(false)
  const [inboundApi, setInboundApi] = useState<string>('')
  const [outboundApi, setOutboundApi] = useState<string>('openai-completions')
  const [headersText, setHeadersText] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [revision, setRevision] = useState<number | undefined>(undefined)

  const lang = (ctx as any)?.locale?.getSnapshot?.()?.active ?? 'zh'
  const t = useCallback((key: ModelsKey): string => {
    if (typeof props.t === 'function') {
      try {
        const val = props.t(key)
        if (val) return val
      } catch {}
    }
    const dict = lang === 'zh' ? zh : en
    return dict[key] ?? en[key] ?? key
  }, [lang, props.t])

  const providerId = provider?.provider

  const loadData = useCallback(async () => {
    if (!providerId) return
    try {
      const remote = (ctx as any)?.remote
      if (!remote?.settings?.describe) return
      const res = await remote.settings.describe()
      if (res?.ok && res.value?.namespaces) {
        const ns = res.value.namespaces.find((n: any) => n.ns === 'llm-pi-ai')
        if (ns?.value) {
          setRevision(ns.revision)
          const profile = ns.value.providers?.[providerId]
          if (profile) {
            setInboundApi(profile.inboundApi ?? '')
            setOutboundApi(profile.api ?? 'openai-completions')
            setHeadersText(profile.headers ? JSON.stringify(profile.headers, null, 2) : '')
            setBodyText(profile.bodyOverrides ? JSON.stringify(profile.bodyOverrides, null, 2) : '')
          }
        }
      }
    } catch {
      // Ignore
    }
  }, [ctx, providerId])

  useEffect(() => {
    void loadData()
    const remote = (ctx as any)?.remote
    const off = remote?.$on?.('settings/document-updated', (ns: string) => {
      if (ns === 'llm-pi-ai') void loadData()
    })
    return () => { off?.() }
  }, [ctx, loadData])

  const headerParse = parseJsonObject(headersText)
  const bodyParse = parseJsonObject(bodyText)
  const headersValid = headerParse.ok
  const bodyValid = bodyParse.ok

  const handleSave = async () => {
    if (!headersValid || !bodyValid || saving || !providerId) return
    setSaving(true)
    setError(null)
    setSaveSuccess(false)

    try {
      const remote = (ctx as any)?.remote
      const ops: any[] = []
      const basePath = ['providers', providerId]

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

      const res = await remote?.settings?.mutate('llm-pi-ai', ops, revision)
      if (res?.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 2000)
      } else {
        setError(res?.error?.message ?? '保存失败')
      }
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setSaving(false)
      void loadData()
    }
  }

  return (
    <div className={styles.container}>
      <button
        type="button"
        className={styles.toggleBtn}
        onClick={() => setOpen(!open)}
      >
        <span>{open ? '▾' : '▸'}</span>
        <span>{t('customParamsHeading')}</span>
      </button>

      {open && (
        <div className={styles.content}>
          {/* 入站协议 */}
          <div className={styles.field}>
            <div className={styles.fieldLabelRow}>
              <span className={styles.fieldLabel}>{t('inboundApi')}</span>
            </div>
            <select
              className={styles.select}
              value={inboundApi}
              onChange={e => setInboundApi(e.target.value)}
            >
              <option value="">{t('inboundApiAuto')}</option>
              <option value="openai-completions">{t('protocolOpenAiCompletions')}</option>
              <option value="anthropic-messages">{t('protocolAnthropicMessages')}</option>
              <option value="openai-responses">{t('protocolOpenAiResponses')}</option>
            </select>
          </div>

          {/* 出站协议 */}
          <div className={styles.field}>
            <div className={styles.fieldLabelRow}>
              <span className={styles.fieldLabel}>{t('outboundApi')}</span>
            </div>
            <select
              className={styles.select}
              value={outboundApi}
              onChange={e => setOutboundApi(e.target.value)}
            >
              <option value="openai-completions">{t('protocolOpenAiCompletions')}</option>
              <option value="anthropic-messages">{t('protocolAnthropicMessages')}</option>
              <option value="openai-responses">{t('protocolOpenAiResponses')}</option>
            </select>
          </div>

          {/* 自定义请求头 */}
          <div className={styles.field}>
            <div className={styles.fieldLabelRow}>
              <span className={styles.fieldLabel}>{t('headers')}</span>
              {!headersValid && <span className={styles.error}>{t('headersInvalid')}</span>}
            </div>
            <textarea
              rows={3}
              className={`${styles.textarea} ${!headersValid ? styles.textareaInvalid : ''}`}
              value={headersText}
              placeholder={t('headersPlaceholder')}
              onChange={e => setHeadersText(e.target.value)}
            />
          </div>

          {/* 自定义请求体 */}
          <div className={styles.field}>
            <div className={styles.fieldLabelRow}>
              <span className={styles.fieldLabel}>{t('bodyOverrides')}</span>
              {!bodyValid && <span className={styles.error}>{t('bodyOverridesInvalid')}</span>}
            </div>
            <textarea
              rows={3}
              className={`${styles.textarea} ${!bodyValid ? styles.textareaInvalid : ''}`}
              value={bodyText}
              placeholder={t('bodyOverridesPlaceholder')}
              onChange={e => setBodyText(e.target.value)}
            />
          </div>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.saveBtn}
              disabled={!headersValid || !bodyValid || saving}
              onClick={handleSave}
            >
              {saving ? t('saving') : t('saveParams')}
            </button>
            {saveSuccess && <span className={styles.success}>✓ {t('saved')}</span>}
            {error && <span className={styles.error}>{error}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

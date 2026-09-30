import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import styles from './LocalRouteCard.module.css'
import { en, zh, type ModelsKey } from './locales.ts'

interface ProviderCardProps {
  ctx?: Context
  t?: (key: ModelsKey) => string
  provider?: {
    provider: string
    displayName: string
    settingsNs: string
    settingsPath: readonly string[]
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
  const [open, setOpen] = useState(false)
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

  if (!providerId) return null

  const headerParse = parseJsonObject(headersText)
  const bodyParse = parseJsonObject(bodyText)
  const headersValid = headerParse.ok
  const bodyValid = bodyParse.ok

  const handleSave = async () => {
    if (!headersValid || !bodyValid || saving) return
    setSaving(true)
    setError(null)
    setSaveSuccess(false)

    try {
      const remote = (ctx as any)?.remote
      const ops: any[] = []
      const basePath = ['providers', providerId]

      if (headerParse.value !== undefined) {
        ops.push({ op: 'set', path: [...basePath, 'headers'], value: headerParse.value })
      } else {
        ops.push({ op: 'unset', path: [...basePath, 'headers'] })
      }

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
    <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--dsw-alias-border-l2, rgba(255,255,255,0.12))' }}>
      <button
        type="button"
        style={{
          background: 'none',
          border: 'none',
          padding: '4px 0',
          cursor: 'pointer',
          fontSize: '12px',
          color: 'var(--dsw-alias-state-business-primary, #4d6bfe)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
        onClick={() => setOpen(!open)}
      >
        <span>{open ? '▼' : '▶'}</span>
        <span>{t('customParamsHeading')}</span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,0.7))' }}>
                {t('headers')}
              </span>
              {!headersValid && (
                <span style={{ fontSize: '11px', color: 'var(--dsw-alias-state-danger-primary, #e54d2e)' }}>
                  {t('headersInvalid')}
                </span>
              )}
            </div>
            <textarea
              rows={3}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '6px 8px',
                fontSize: '12px',
                fontFamily: 'monospace',
                background: 'var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.2))',
                border: `1px solid ${headersValid ? 'var(--dsw-alias-border-l2, rgba(255,255,255,0.15))' : 'var(--dsw-alias-state-danger-primary, #e54d2e)'}`,
                borderRadius: '6px',
                color: 'var(--dsw-alias-label-primary, #fff)',
                outline: 'none',
                resize: 'vertical',
              }}
              value={headersText}
              placeholder={t('headersPlaceholder')}
              onChange={e => setHeadersText(e.target.value)}
            />
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', color: 'var(--dsw-alias-label-secondary, rgba(255,255,255,0.7))' }}>
                {t('bodyOverrides')}
              </span>
              {!bodyValid && (
                <span style={{ fontSize: '11px', color: 'var(--dsw-alias-state-danger-primary, #e54d2e)' }}>
                  {t('bodyOverridesInvalid')}
                </span>
              )}
            </div>
            <textarea
              rows={3}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '6px 8px',
                fontSize: '12px',
                fontFamily: 'monospace',
                background: 'var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.2))',
                border: `1px solid ${bodyValid ? 'var(--dsw-alias-border-l2, rgba(255,255,255,0.15))' : 'var(--dsw-alias-state-danger-primary, #e54d2e)'}`,
                borderRadius: '6px',
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
              disabled={!headersValid || !bodyValid || saving}
              onClick={handleSave}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                cursor: (!headersValid || !bodyValid || saving) ? 'not-allowed' : 'pointer',
                borderRadius: '6px',
                border: '1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.2))',
                background: 'var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.1))',
                color: 'var(--dsw-alias-label-primary, #fff)',
                opacity: (!headersValid || !bodyValid || saving) ? 0.5 : 1,
              }}
            >
              {saving ? t('saving') : t('saveParams')}
            </button>
            {saveSuccess && (
              <span style={{ fontSize: '12px', color: 'var(--dsw-alias-state-success-primary, #30a46c)' }}>
                ✓ {t('saved')}
              </span>
            )}
            {error && (
              <span style={{ fontSize: '12px', color: 'var(--dsw-alias-state-danger-primary, #e54d2e)' }}>
                {error}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import styles from './ProviderExtrasCard.module.css'
import { en, zh, type ModelsKey } from './locales.ts'

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

export function CustomApiDraftPortal({ ctx }: { ctx: Context }): ReactNode {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [open, setOpen] = useState(true)
  const [inboundApi, setInboundApi] = useState<string>('')
  const [outboundApi, setOutboundApi] = useState<string>('openai-completions')
  const [headersText, setHeadersText] = useState('')
  const [bodyText, setBodyText] = useState('')
  const [saveStatus, setSaveStatus] = useState<string | null>(null)

  // 保持当前填写的参数引用，供创建监听时使用
  const currentValues = useRef({ inboundApi, outboundApi, headersText, bodyText })
  useEffect(() => {
    currentValues.current = { inboundApi, outboundApi, headersText, bodyText }
  }, [inboundApi, outboundApi, headersText, bodyText])

  const lang = (ctx as any)?.locale?.getSnapshot?.()?.active ?? 'zh'
  const t = useCallback((key: ModelsKey): string => {
    const dict = lang === 'zh' ? zh : en
    return dict[key] ?? en[key] ?? key
  }, [lang])

  // 监听并挂载到 [id$="-custom-panel"] 内部
  useEffect(() => {
    let div: HTMLDivElement | null = null

    const check = () => {
      const panel = document.querySelector<HTMLElement>('[id$="-custom-panel"]')
      if (!panel || panel.hidden) {
        if (div && div.parentNode) {
          div.parentNode.removeChild(div)
          div = null
          setContainer(null)
        }
        return
      }

      const editor = panel.querySelector<HTMLElement>('[class*="editor"]') ?? panel
      if (!div || !editor.contains(div)) {
        div = document.createElement('div')
        div.className = 'dsh-custom-api-draft-extras'
        const footer = editor.querySelector('[class*="editorFooter"]')
        if (footer) {
          editor.insertBefore(div, footer)
        } else {
          editor.appendChild(div)
        }
        setContainer(div)
      }
    }

    check()
    const observer = new MutationObserver(check)
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
    return () => {
      observer.disconnect()
      if (div && div.parentNode) {
        div.parentNode.removeChild(div)
      }
    }
  }, [])

  // 监听创建提交并持久化额外字段
  useEffect(() => {
    const remote = (ctx as any)?.remote
    const off = remote?.$on?.('settings/document-updated', async (ns: string) => {
      if (ns !== 'llm-pi-ai') return
      // 当自定义模型 API 保存触发了 document-updated，提取刚填写的 routeId 并保存额外字段
      const panel = document.querySelector<HTMLElement>('[id$="-custom-panel"]')
      const routeInput = panel?.querySelector<HTMLInputElement>('input[placeholder="acme-gateway"]')
        ?? panel?.querySelector<HTMLInputElement>('input[aria-label*="Provider ID"]')
        ?? panel?.querySelector<HTMLInputElement>('input')
      const routeId = routeInput?.value?.trim()?.toLowerCase()
      if (!routeId) return

      const { inboundApi: inApi, outboundApi: outApi, headersText: hText, bodyText: bText } = currentValues.current
      const hParse = parseJsonObject(hText)
      const bParse = parseJsonObject(bText)

      const ops: any[] = []
      const basePath = ['providers', routeId]

      if (inApi) {
        ops.push({ op: 'set', path: [...basePath, 'inboundApi'], value: inApi })
      }
      if (outApi) {
        ops.push({ op: 'set', path: [...basePath, 'api'], value: outApi })
      }
      if (hParse.ok && hParse.value !== undefined) {
        ops.push({ op: 'set', path: [...basePath, 'headers'], value: hParse.value })
      }
      if (bParse.ok && bParse.value !== undefined) {
        ops.push({ op: 'set', path: [...basePath, 'bodyOverrides'], value: bParse.value })
      }

      if (ops.length > 0) {
        try {
          await remote?.settings?.mutate('llm-pi-ai', ops)
        } catch {
          // ignore
        }
      }
    })
    return () => { off?.() }
  }, [ctx])

  if (!container) return null

  const headerParse = parseJsonObject(headersText)
  const bodyParse = parseJsonObject(bodyText)
  const headersValid = headerParse.ok
  const bodyValid = bodyParse.ok

  return createPortal(
    <div className={styles.container} style={{ marginBottom: '12px' }}>
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
              rows={2}
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
              rows={2}
              className={`${styles.textarea} ${!bodyValid ? styles.textareaInvalid : ''}`}
              value={bodyText}
              placeholder={t('bodyOverridesPlaceholder')}
              onChange={e => setBodyText(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>,
    container,
  )
}

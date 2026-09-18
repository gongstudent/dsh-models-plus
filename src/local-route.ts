/** Loopback HTTP proxy and protocol conversion for configured pi-ai routes. */

import { createServer } from 'node:http'
import type { IncomingHttpHeaders, IncomingMessage, Server, ServerResponse } from 'node:http'
import type { ResolvedPiAiProviderProfile } from './config.ts'
import { DEFAULT_LOCAL_ROUTE_PORT } from './config.ts'

export type LocalRouteProtocol = 'openai-completions' | 'openai-responses' | 'anthropic-messages'

const HOST = '127.0.0.1'
const MAX_BODY_BYTES = 10 * 1024 * 1024
const SELECTOR_HEADER = 'x-dsh-provider'
const PROTOCOL_PATHS: Readonly<Record<LocalRouteProtocol, string>> = {
  'openai-completions': '/v1/chat/completions',
  'openai-responses': '/v1/responses',
  'anthropic-messages': '/v1/messages',
}

interface LocalRouteLogger {
  info(message: string): void
  error(message: string, error: unknown): void
}

export interface LocalRouteServerOptions {
  profiles: () => ReadonlyMap<string, ResolvedPiAiProviderProfile>
  resolveApiKey: (provider: string, profile: ResolvedPiAiProviderProfile) => Promise<string | undefined>
  logger?: LocalRouteLogger
}

interface SelectedRoute {
  provider: string
  profile: ResolvedPiAiProviderProfile
  model: ReturnType<ResolvedPiAiProviderProfile['piProvider']['getModels']>[number]
  inbound: LocalRouteProtocol
  outbound: LocalRouteProtocol
}

interface CanonicalResponse {
  id: string
  model: string
  text: string
  finishReason: string | null
  toolCalls: Array<{ id: string; name: string; arguments: string }>
  inputTokens?: number
  outputTokens?: number
}

/**
 * A request this route refuses before any upstream call.
 *
 * Carries the status the caller sees, so a request naming a model no route
 * serves is not reported as an upstream failure: the two demand opposite
 * responses — fix the request, or retry against a recovered upstream. Every
 * other throw on the request path reaches the caller as `502`.
 */
class LocalRouteRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
    this.name = 'LocalRouteRequestError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function protocolOfPath(pathname: string): LocalRouteProtocol | undefined {
  return (Object.entries(PROTOCOL_PATHS) as Array<[LocalRouteProtocol, string]>)
    .find(([, path]) => path === pathname)?.[0]
}

function isLocalRouteProtocol(value: unknown): value is LocalRouteProtocol {
  return value === 'openai-completions' || value === 'openai-responses' || value === 'anthropic-messages'
}

function scalarText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function jsonText(value: unknown, fallback = '{}'): string {
  if (typeof value === 'string') return value
  if (value === undefined) return fallback
  const encoded = JSON.stringify(value)
  return typeof encoded === 'string' ? encoded : fallback
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  const parts: unknown[] = value
  return parts.flatMap((part) => {
    if (!isRecord(part)) return []
    const text = part['text'] ?? part['input_text'] ?? part['output_text']
    return typeof text === 'string' ? [text] : []
  }).join('')
}

function openAIContent(value: unknown): unknown {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return value
  const parts: unknown[] = value
  return parts.map((part) => {
    if (!isRecord(part)) return part
    if (part['type'] === 'text' && typeof part['text'] === 'string') {
      return { type: 'text', text: part['text'] }
    }
    if (part['type'] === 'image' && isRecord(part['source'])) {
      const source = part['source']
      const url = source['type'] === 'base64'
        ? `data:${scalarText(source['media_type'], 'application/octet-stream')};base64,${scalarText(source['data'])}`
        : source['url']
      return { type: 'image_url', image_url: { url } }
    }
    if (part['type'] === 'input_text' || part['type'] === 'output_text') {
      return { type: 'text', text: part['text'] }
    }
    if (part['type'] === 'input_image') return { type: 'image_url', image_url: { url: part['image_url'] } }
    return part
  })
}

function anthropicContent(value: unknown): unknown[] {
  if (typeof value === 'string') return [{ type: 'text', text: value }]
  if (!Array.isArray(value)) return [{ type: 'text', text: scalarText(value) }]
  const parts: unknown[] = value
  return parts.map((part) => {
    if (!isRecord(part)) return { type: 'text', text: scalarText(part) }
    if (part['type'] === 'text' || part['type'] === 'tool_use' || part['type'] === 'tool_result') return part
    if (part['type'] === 'image_url' && isRecord(part['image_url'])) {
      const url = part['image_url']['url']
      if (typeof url === 'string' && url.startsWith('data:')) {
        const match = /^data:([^;,]+);base64,(.*)$/.exec(url)
        if (match !== null) return { type: 'image', source: { type: 'base64', media_type: match[1], data: match[2] } }
      }
      return { type: 'image', source: { type: 'url', url } }
    }
    return { type: 'text', text: textOf([part]) }
  })
}

function responsesContent(value: unknown): unknown[] {
  if (typeof value === 'string') return [{ type: 'input_text', text: value }]
  if (!Array.isArray(value)) return [{ type: 'input_text', text: scalarText(value) }]
  const parts: unknown[] = value
  return parts.map((part) => {
    if (!isRecord(part)) return { type: 'input_text', text: scalarText(part) }
    if (part['type'] === 'text') return { type: 'input_text', text: part['text'] }
    if (part['type'] === 'image_url' && isRecord(part['image_url'])) {
      return { type: 'input_image', image_url: part['image_url']['url'] }
    }
    return part
  })
}

/** Convert one supported request into OpenAI Chat Completions as an intermediate form. */
export function requestToChat(protocol: LocalRouteProtocol, body: Record<string, unknown>): Record<string, unknown> {
  if (protocol === 'openai-completions') return { ...body }
  if (protocol === 'anthropic-messages') {
    const messages: Record<string, unknown>[] = []
    if (body['system'] !== undefined) messages.push({ role: 'system', content: openAIContent(body['system']) })
    for (const item of Array.isArray(body['messages']) ? body['messages'] : []) {
      if (!isRecord(item)) continue
      const blocks = Array.isArray(item['content']) ? item['content'] : [item['content']]
      const toolResults = blocks.filter(block => isRecord(block) && block['type'] === 'tool_result')
      for (const result of toolResults) {
        if (!isRecord(result)) continue
        messages.push({
          role: 'tool',
          tool_call_id: result['tool_use_id'],
          content: textOf(result['content']),
        })
      }
      const normal = blocks.filter(block => !(isRecord(block) && block['type'] === 'tool_result'))
      if (normal.length === 0) continue
      const toolCalls = normal.flatMap((block) => {
        if (!isRecord(block) || block['type'] !== 'tool_use') return []
        return [{
          id: block['id'],
          type: 'function',
          function: { name: block['name'], arguments: JSON.stringify(block['input'] ?? {}) },
        }]
      })
      const contentBlocks = normal.filter(block => !(isRecord(block) && block['type'] === 'tool_use'))
      messages.push({
        role: item['role'],
        content: openAIContent(contentBlocks),
        ...toolCalls.length === 0 ? {} : { tool_calls: toolCalls },
      })
    }
    const tools = Array.isArray(body['tools'])
      ? body['tools'].filter(isRecord).map(tool => ({
        type: 'function',
        function: { name: tool['name'], description: tool['description'], parameters: tool['input_schema'] },
      }))
      : undefined
    return {
      model: body['model'],
      messages,
      ...body['max_tokens'] === undefined ? {} : { max_tokens: body['max_tokens'] },
      ...body['temperature'] === undefined ? {} : { temperature: body['temperature'] },
      ...body['top_p'] === undefined ? {} : { top_p: body['top_p'] },
      ...body['stop_sequences'] === undefined ? {} : { stop: body['stop_sequences'] },
      ...body['stream'] === undefined ? {} : { stream: body['stream'] },
      ...tools === undefined ? {} : { tools },
      ...body['tool_choice'] === undefined ? {} : { tool_choice: body['tool_choice'] },
      ...body['metadata'] === undefined ? {} : { metadata: body['metadata'] },
    }
  }

  const messages: Record<string, unknown>[] = []
  if (body['instructions'] !== undefined) messages.push({ role: 'system', content: body['instructions'] })
  const input = body['input']
  if (typeof input === 'string') messages.push({ role: 'user', content: input })
  for (const item of Array.isArray(input) ? input : []) {
    if (!isRecord(item)) continue
    if (item['type'] === 'function_call_output') {
      messages.push({ role: 'tool', tool_call_id: item['call_id'], content: item['output'] })
    } else if (item['type'] === 'function_call') {
      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: [{
          id: item['call_id'],
          type: 'function',
          function: { name: item['name'], arguments: item['arguments'] },
        }],
      })
    } else {
      messages.push({ role: item['role'] ?? 'user', content: openAIContent(item['content']) })
    }
  }
  const tools = Array.isArray(body['tools'])
    ? body['tools'].filter(isRecord).map(tool => tool['type'] === 'function'
      ? { type: 'function', function: { name: tool['name'], description: tool['description'], parameters: tool['parameters'] } }
      : tool)
    : undefined
  return {
    model: body['model'],
    messages,
    ...body['max_output_tokens'] === undefined ? {} : { max_tokens: body['max_output_tokens'] },
    ...body['temperature'] === undefined ? {} : { temperature: body['temperature'] },
    ...body['top_p'] === undefined ? {} : { top_p: body['top_p'] },
    ...body['stream'] === undefined ? {} : { stream: body['stream'] },
    ...tools === undefined ? {} : { tools },
    ...body['tool_choice'] === undefined ? {} : { tool_choice: body['tool_choice'] },
    ...body['metadata'] === undefined ? {} : { metadata: body['metadata'] },
  }
}

/** Convert the intermediate Chat request to the selected upstream protocol. */
export function requestFromChat(
  protocol: LocalRouteProtocol,
  chat: Record<string, unknown>,
  defaultMaxTokens: number,
): Record<string, unknown> {
  if (protocol === 'openai-completions') return { ...chat }
  const sourceMessages = Array.isArray(chat['messages']) ? chat['messages'].filter(isRecord) : []
  const system = sourceMessages.filter(message => message['role'] === 'system').map(message => textOf(message['content'])).join('\n\n')
  const messages = sourceMessages.filter(message => message['role'] !== 'system')

  if (protocol === 'anthropic-messages') {
    const converted = messages.map((message) => {
      if (message['role'] === 'tool') {
        return {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: message['tool_call_id'], content: message['content'] }],
        }
      }
      const content = anthropicContent(message['content'])
      const toolCalls = Array.isArray(message['tool_calls']) ? message['tool_calls'].filter(isRecord) : []
      for (const call of toolCalls) {
        const fn = isRecord(call['function']) ? call['function'] : {}
        let input: unknown = {}
        try { input = JSON.parse(jsonText(fn['arguments'])) as unknown } catch { input = { raw: fn['arguments'] } }
        content.push({ type: 'tool_use', id: call['id'], name: fn['name'], input })
      }
      return { role: message['role'] === 'assistant' ? 'assistant' : 'user', content }
    })
    const tools = Array.isArray(chat['tools'])
      ? chat['tools'].filter(isRecord).map((tool) => {
        const fn = isRecord(tool['function']) ? tool['function'] : {}
        return { name: fn['name'], description: fn['description'], input_schema: fn['parameters'] }
      })
      : undefined
    return {
      model: chat['model'],
      messages: converted,
      max_tokens: chat['max_completion_tokens'] ?? chat['max_tokens'] ?? defaultMaxTokens,
      ...system.length === 0 ? {} : { system },
      ...chat['temperature'] === undefined ? {} : { temperature: chat['temperature'] },
      ...chat['top_p'] === undefined ? {} : { top_p: chat['top_p'] },
      ...chat['stop'] === undefined ? {} : { stop_sequences: chat['stop'] },
      ...chat['stream'] === undefined ? {} : { stream: chat['stream'] },
      ...tools === undefined ? {} : { tools },
      ...chat['tool_choice'] === undefined ? {} : { tool_choice: chat['tool_choice'] },
      ...chat['metadata'] === undefined ? {} : { metadata: chat['metadata'] },
    }
  }

  const input = messages.flatMap((message): Record<string, unknown>[] => {
    if (message['role'] === 'tool') {
      return [{ type: 'function_call_output', call_id: message['tool_call_id'], output: message['content'] }]
    }
    const toolCalls = Array.isArray(message['tool_calls']) ? message['tool_calls'].filter(isRecord) : []
    const entries: Record<string, unknown>[] = []
    if (message['content'] !== undefined && message['content'] !== null) {
      entries.push({ role: message['role'], content: responsesContent(message['content']) })
    }
    for (const call of toolCalls) {
      const fn = isRecord(call['function']) ? call['function'] : {}
      entries.push({ type: 'function_call', call_id: call['id'], name: fn['name'], arguments: fn['arguments'] })
    }
    return entries
  })
  const tools = Array.isArray(chat['tools'])
    ? chat['tools'].filter(isRecord).map((tool) => {
      const fn = isRecord(tool['function']) ? tool['function'] : {}
      return { type: 'function', name: fn['name'], description: fn['description'], parameters: fn['parameters'] }
    })
    : undefined
  return {
    model: chat['model'],
    input,
    ...system.length === 0 ? {} : { instructions: system },
    ...chat['max_completion_tokens'] === undefined && chat['max_tokens'] === undefined
      ? {}
      : { max_output_tokens: chat['max_completion_tokens'] ?? chat['max_tokens'] },
    ...chat['temperature'] === undefined ? {} : { temperature: chat['temperature'] },
    ...chat['top_p'] === undefined ? {} : { top_p: chat['top_p'] },
    ...chat['stream'] === undefined ? {} : { stream: chat['stream'] },
    ...tools === undefined ? {} : { tools },
    ...chat['tool_choice'] === undefined ? {} : { tool_choice: chat['tool_choice'] },
    ...chat['metadata'] === undefined ? {} : { metadata: chat['metadata'] },
  }
}

function usageNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function responseToCanonical(protocol: LocalRouteProtocol, body: Record<string, unknown>): CanonicalResponse {
  if (protocol === 'openai-completions') {
    const choices = Array.isArray(body['choices']) ? body['choices'].filter(isRecord) : []
    const choice = choices[0] ?? {}
    const message = isRecord(choice['message']) ? choice['message'] : {}
    const usage = isRecord(body['usage']) ? body['usage'] : {}
    const inputTokens = usageNumber(usage['prompt_tokens'])
    const outputTokens = usageNumber(usage['completion_tokens'])
    return {
      id: scalarText(body['id'], `chatcmpl-${Date.now()}`),
      model: scalarText(body['model']),
      text: textOf(message['content']),
      finishReason: typeof choice['finish_reason'] === 'string' ? choice['finish_reason'] : null,
      toolCalls: (Array.isArray(message['tool_calls']) ? message['tool_calls'].filter(isRecord) : []).map((call) => {
        const fn = isRecord(call['function']) ? call['function'] : {}
        return { id: scalarText(call['id']), name: scalarText(fn['name']), arguments: jsonText(fn['arguments']) }
      }),
      ...inputTokens === undefined ? {} : { inputTokens },
      ...outputTokens === undefined ? {} : { outputTokens },
    }
  }
  if (protocol === 'anthropic-messages') {
    const content = Array.isArray(body['content']) ? body['content'].filter(isRecord) : []
    const usage = isRecord(body['usage']) ? body['usage'] : {}
    const inputTokens = usageNumber(usage['input_tokens'])
    const outputTokens = usageNumber(usage['output_tokens'])
    return {
      id: scalarText(body['id'], `msg_${Date.now()}`),
      model: scalarText(body['model']),
      text: textOf(content),
      finishReason: body['stop_reason'] === 'max_tokens'
        ? 'length'
        : body['stop_reason'] === 'tool_use'
          ? 'tool_calls'
          : typeof body['stop_reason'] === 'string' ? 'stop' : null,
      toolCalls: content.filter(block => block['type'] === 'tool_use').map(block => ({
        id: scalarText(block['id']),
        name: scalarText(block['name']),
        arguments: jsonText(block['input']),
      })),
      ...inputTokens === undefined ? {} : { inputTokens },
      ...outputTokens === undefined ? {} : { outputTokens },
    }
  }
  const output = Array.isArray(body['output']) ? body['output'].filter(isRecord) : []
  const usage = isRecord(body['usage']) ? body['usage'] : {}
  const inputTokens = usageNumber(usage['input_tokens'])
  const outputTokens = usageNumber(usage['output_tokens'])
  const text = typeof body['output_text'] === 'string'
    ? body['output_text']
    : output.flatMap((item): unknown[] => {
      const content = item['content']
      return Array.isArray(content) ? content as unknown[] : []
    }).map(textOf).join('')
  return {
    id: scalarText(body['id'], `resp_${Date.now()}`),
    model: scalarText(body['model']),
    text,
    finishReason: body['status'] === 'completed' ? 'stop' : null,
    toolCalls: output.filter(item => item['type'] === 'function_call').map(item => ({
      id: scalarText(item['call_id'] ?? item['id']),
      name: scalarText(item['name']),
      arguments: jsonText(item['arguments']),
    })),
    ...inputTokens === undefined ? {} : { inputTokens },
    ...outputTokens === undefined ? {} : { outputTokens },
  }
}

function canonicalToResponse(protocol: LocalRouteProtocol, value: CanonicalResponse): Record<string, unknown> {
  if (protocol === 'openai-completions') {
    const toolCalls = value.toolCalls.map(call => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: call.arguments },
    }))
    return {
      id: value.id,
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: value.model,
      choices: [{
        index: 0,
        message: { role: 'assistant', content: value.text, ...toolCalls.length === 0 ? {} : { tool_calls: toolCalls } },
        finish_reason: toolCalls.length > 0 ? 'tool_calls' : value.finishReason,
      }],
      usage: {
        prompt_tokens: value.inputTokens ?? 0,
        completion_tokens: value.outputTokens ?? 0,
        total_tokens: (value.inputTokens ?? 0) + (value.outputTokens ?? 0),
      },
    }
  }
  if (protocol === 'anthropic-messages') {
    const content: Record<string, unknown>[] = value.text.length === 0 ? [] : [{ type: 'text', text: value.text }]
    for (const call of value.toolCalls) {
      let input: unknown = {}
      try { input = JSON.parse(call.arguments) as unknown } catch { input = { raw: call.arguments } }
      content.push({ type: 'tool_use', id: call.id, name: call.name, input })
    }
    return {
      id: value.id,
      type: 'message',
      role: 'assistant',
      model: value.model,
      content,
      stop_reason: value.toolCalls.length > 0 ? 'tool_use' : value.finishReason === 'length' ? 'max_tokens' : 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: value.inputTokens ?? 0, output_tokens: value.outputTokens ?? 0 },
    }
  }
  const messageId = `msg_${value.id}`
  const output: Record<string, unknown>[] = value.text.length === 0 ? [] : [{
    id: messageId,
    type: 'message',
    status: 'completed',
    role: 'assistant',
    content: [{ type: 'output_text', text: value.text, annotations: [] }],
  }]
  output.push(...value.toolCalls.map(call => ({
    id: `fc_${call.id}`,
    type: 'function_call',
    status: 'completed',
    call_id: call.id,
    name: call.name,
    arguments: call.arguments,
  })))
  return {
    id: value.id,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    model: value.model,
    output,
    output_text: value.text,
    usage: {
      input_tokens: value.inputTokens ?? 0,
      output_tokens: value.outputTokens ?? 0,
      total_tokens: (value.inputTokens ?? 0) + (value.outputTokens ?? 0),
    },
  }
}

function endpoint(baseURL: string, protocol: LocalRouteProtocol): string {
  const target = PROTOCOL_PATHS[protocol]
  const base = new URL(baseURL)
  const normalized = base.pathname.replace(/\/+$/, '')
  if (normalized.endsWith(target) || (target.startsWith('/v1/') && normalized.endsWith(target.slice(3)))) return base.toString()
  const suffix = normalized.endsWith('/v1') ? target.slice(3) : target
  base.pathname = `${normalized}${suffix}`.replace(/\/+/g, '/')
  return base.toString()
}

function selectRoute(
  profiles: ReadonlyMap<string, ResolvedPiAiProviderProfile>,
  inbound: LocalRouteProtocol,
  body: Record<string, unknown>,
  headers: IncomingHttpHeaders,
): SelectedRoute {
  const headerSelector = headers[SELECTOR_HEADER]
  const selector = typeof headerSelector === 'string'
    ? headerSelector
    : typeof body['provider'] === 'string' ? body['provider'] : undefined
  const modelId = typeof body['model'] === 'string' ? body['model'] : undefined
  if (modelId === undefined || modelId.length === 0) {
    throw new LocalRouteRequestError('Request body must contain a non-empty model.', 400)
  }

  const candidates = [...profiles.entries()].flatMap(([provider, profile]) => {
    if (profile.inboundApi !== inbound) return []
    const model = profile.piProvider.getModels().find(candidate => candidate.id === modelId)
    if (model === undefined || !isLocalRouteProtocol(model.api)) return []
    return [{ provider, profile, model, inbound, outbound: model.api }]
  })
  if (selector !== undefined) {
    const selected = candidates.find(candidate => candidate.provider === selector)
    if (selected === undefined) {
      throw new LocalRouteRequestError(`Provider "${selector}" does not expose model "${modelId}" through ${inbound}.`, 404)
    }
    return selected
  }
  if (candidates.length === 0) {
    throw new LocalRouteRequestError(`No local route exposes model "${modelId}" through ${inbound}.`, 404)
  }
  if (candidates.length > 1) {
    throw new LocalRouteRequestError(
      `Model "${modelId}" is ambiguous; send the ${SELECTOR_HEADER} header with one of: ${candidates.map(c => c.provider).join(', ')}.`,
      400,
    )
  }
  return candidates[0] as SelectedRoute
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0
  const chunks: Buffer[] = []
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) throw new Error('Request body exceeds the 10 MiB local-route limit.')
    chunks.push(buffer)
  }
  let parsed: unknown
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown } catch { throw new Error('Request body must be valid JSON.') }
  if (!isRecord(parsed)) throw new Error('Request body must be a JSON object.')
  return parsed
}

const OMITTED_REQUEST_HEADERS = new Set([
  'connection', 'content-length', 'host', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade', SELECTOR_HEADER,
])

function upstreamHeaders(
  request: IncomingMessage,
  route: SelectedRoute,
  apiKey: string | undefined,
): Headers {
  const headers = new Headers()
  for (const [name, raw] of Object.entries(request.headers)) {
    if (OMITTED_REQUEST_HEADERS.has(name.toLowerCase()) || raw === undefined) continue
    headers.set(name, Array.isArray(raw) ? raw.join(', ') : raw)
  }
  headers.set('content-type', 'application/json')
  for (const [name, value] of Object.entries(route.model.headers ?? {})) headers.set(name, value)
  if (apiKey !== undefined) {
    if (route.outbound === 'anthropic-messages') headers.set('x-api-key', apiKey)
    else headers.set('authorization', `Bearer ${apiKey}`)
  }
  if (route.outbound === 'anthropic-messages' && !headers.has('anthropic-version')) {
    headers.set('anthropic-version', '2023-06-01')
  }
  for (const [name, value] of Object.entries(route.profile.headers ?? {})) headers.set(name, value)
  return headers
}

function writeJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(body))
}

function writeError(response: ServerResponse, protocol: LocalRouteProtocol | undefined, status: number, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error)
  if (protocol === 'anthropic-messages') {
    writeJson(response, status, { type: 'error', error: { type: 'invalid_request_error', message } })
  } else {
    writeJson(response, status, { error: { type: 'invalid_request_error', message } })
  }
}

async function pipeResponse(upstream: Response, response: ServerResponse): Promise<void> {
  const headers: Record<string, string> = {}
  for (const [name, value] of upstream.headers) {
    if (name.toLowerCase() !== 'content-length' && name.toLowerCase() !== 'content-encoding') headers[name] = value
  }
  response.writeHead(upstream.status, headers)
  if (upstream.body === null) {
    response.end()
    return
  }
  const reader = upstream.body.getReader()
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      response.write(result.value)
    }
  } finally {
    reader.releaseLock()
    response.end()
  }
}

function sse(response: ServerResponse, event: string | undefined, data: unknown): void {
  if (event !== undefined) response.write(`event: ${event}\n`)
  response.write(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`)
}

function writeSyntheticStream(response: ServerResponse, protocol: LocalRouteProtocol, body: Record<string, unknown>): void {
  response.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  })
  if (protocol === 'openai-completions') {
    const choice = (Array.isArray(body['choices']) && isRecord(body['choices'][0])) ? body['choices'][0] : {}
    const message = isRecord(choice['message']) ? choice['message'] : {}
    // A streaming tool call is addressed by `index`, which the non-streaming
    // message this synthesizes from does not carry: the official OpenAI client
    // accumulates into `tool_calls[delta.index]`, so an absent index writes
    // every call to the same undefined slot and the caller receives none.
    // Emission order is the numbering, because one buffered response holds the
    // whole list.
    const rawCalls = message['tool_calls']
    const calls: unknown[] | undefined = Array.isArray(rawCalls) ? rawCalls : undefined
    const delta = calls === undefined
      ? message
      : { ...message, tool_calls: calls.map((call, index) => isRecord(call) ? { index, ...call } : call) }
    sse(response, undefined, {
      id: body['id'], object: 'chat.completion.chunk', created: body['created'], model: body['model'],
      choices: [{ index: 0, delta, finish_reason: null }],
    })
    sse(response, undefined, {
      id: body['id'], object: 'chat.completion.chunk', created: body['created'], model: body['model'],
      choices: [{ index: 0, delta: {}, finish_reason: choice['finish_reason'] ?? 'stop' }],
    })
    sse(response, undefined, '[DONE]')
  } else if (protocol === 'anthropic-messages') {
    sse(response, 'message_start', { type: 'message_start', message: { ...body, content: [], stop_reason: null, stop_sequence: null } })
    const content = Array.isArray(body['content']) ? body['content'] : []
    content.forEach((block, index) => {
      const record = isRecord(block) ? block : { type: 'text', text: String(block) }
      sse(response, 'content_block_start', { type: 'content_block_start', index, content_block: { ...record, ...record['type'] === 'text' ? { text: '' } : {} } })
      if (record['type'] === 'text') sse(response, 'content_block_delta', { type: 'content_block_delta', index, delta: { type: 'text_delta', text: record['text'] } })
      sse(response, 'content_block_stop', { type: 'content_block_stop', index })
    })
    sse(response, 'message_delta', { type: 'message_delta', delta: { stop_reason: body['stop_reason'], stop_sequence: null }, usage: body['usage'] })
    sse(response, 'message_stop', { type: 'message_stop' })
  } else {
    sse(response, 'response.created', { type: 'response.created', response: { ...body, status: 'in_progress', output: [] } })
    const text = typeof body['output_text'] === 'string' ? body['output_text'] : ''
    if (text.length > 0) sse(response, 'response.output_text.delta', { type: 'response.output_text.delta', delta: text })
    sse(response, 'response.completed', { type: 'response.completed', response: body })
  }
  response.end()
}

async function handleProxy(
  request: IncomingMessage,
  response: ServerResponse,
  options: LocalRouteServerOptions,
): Promise<void> {
  const url = new URL(request.url ?? '/', `http://${HOST}`)
  if (request.method === 'GET' && url.pathname === '/health') {
    writeJson(response, 200, { status: 'ok', host: HOST, routes: [...options.profiles().keys()] })
    return
  }
  const inbound = protocolOfPath(url.pathname)
  if (request.method !== 'POST' || inbound === undefined) {
    writeError(response, inbound, 404, new Error(`Use POST ${Object.values(PROTOCOL_PATHS).join(', ')} or GET /health.`))
    return
  }
  let body: Record<string, unknown>
  try {
    body = await readBody(request)
  } catch (error) {
    writeError(response, inbound, 400, error)
    return
  }
  try {
    const route = selectRoute(options.profiles(), inbound, body, request.headers)
    const apiKey = await options.resolveApiKey(route.provider, route.profile)
    const inboundStream = body['stream'] === true
    const cleanBody = { ...body }
    delete cleanBody['provider']
    let outboundBody = route.inbound === route.outbound
      ? cleanBody
      : requestFromChat(route.outbound, requestToChat(inbound, cleanBody), route.model.maxTokens)
    outboundBody = { ...outboundBody, ...route.profile.bodyOverrides }
    // The local endpoint must retain the caller's response framing. Cross-protocol
    // streams are buffered and synthesized after a non-streaming upstream call.
    outboundBody['stream'] = route.inbound === route.outbound && inboundStream
      ? outboundBody['stream'] !== false
      : false
    const upstream = await fetch(endpoint(route.model.baseUrl, route.outbound), {
      method: 'POST',
      headers: upstreamHeaders(request, route, apiKey),
      body: JSON.stringify(outboundBody),
    })
    if (!upstream.ok) {
      await pipeResponse(upstream, response)
      return
    }
    if (route.inbound === route.outbound && outboundBody['stream'] === true) {
      await pipeResponse(upstream, response)
      return
    }
    const raw: unknown = await upstream.json()
    if (!isRecord(raw)) throw new Error('Upstream response must be a JSON object.')
    const canonical = route.inbound === route.outbound ? undefined : responseToCanonical(route.outbound, raw)
    if (canonical !== undefined && canonical.model.length === 0) canonical.model = route.model.id
    const converted = canonical === undefined ? raw : canonicalToResponse(route.inbound, canonical)
    if (inboundStream) writeSyntheticStream(response, route.inbound, converted)
    else writeJson(response, upstream.status, converted)
  } catch (error) {
    writeError(response, inbound, error instanceof LocalRouteRequestError ? error.status : 502, error)
  }
}

/** Owns the atomic start/stop/rebind lifecycle for one plugin instance. */
export class LocalRouteServer {
  private server: Server | undefined
  private activePort: number | undefined
  private transition: Promise<void> = Promise.resolve()

  constructor(private readonly options: LocalRouteServerOptions) {}

  /** Actual listening port; useful for diagnostics and port-zero tests. */
  get port(): number | undefined {
    return this.activePort
  }

  /** Apply desired settings in order; changing ports keeps the old listener if the new bind fails. */
  configure(config: { enabled?: boolean; port?: number } | undefined): Promise<void> {
    const enabled = config?.enabled === true
    const port = config?.port ?? DEFAULT_LOCAL_ROUTE_PORT
    const run = async (): Promise<void> => {
      if (!enabled) {
        await this.stop(true)
        return
      }
      if (this.server !== undefined && this.activePort === port) return
      const candidate = createServer((request, response) => {
        void handleProxy(request, response, this.options).catch((error: unknown) => {
          if (!response.headersSent) writeError(response, undefined, 500, error)
          else response.destroy(error instanceof Error ? error : new Error(String(error)))
        })
      })
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => { candidate.off('listening', onListening); reject(error) }
        const onListening = (): void => { candidate.off('error', onError); resolve() }
        candidate.once('error', onError)
        candidate.once('listening', onListening)
        candidate.listen(port, HOST)
      })
      const address = candidate.address()
      const actualPort = typeof address === 'object' && address !== null ? address.port : port
      const previous = this.server
      this.server = candidate
      this.activePort = actualPort
      if (previous !== undefined) {
        previous.closeAllConnections()
        await new Promise<void>(resolve => previous.close(() => { resolve() }))
      }
      this.options.logger?.info(`llm-pi-ai: local route listening at http://${HOST}:${String(actualPort)}`)
    }
    this.transition = this.transition.then(run, run).catch((error: unknown) => {
      this.options.logger?.error(`llm-pi-ai: failed to apply local route on ${HOST}:${String(port)}`, error)
      throw error
    })
    return this.transition
  }

  /** Stop accepting requests and close active connections. */
  async close(): Promise<void> {
    await this.transition.catch(() => {})
    await this.stop(true)
  }

  private async stop(force = false): Promise<void> {
    const server = this.server
    if (server === undefined) return
    this.server = undefined
    this.activePort = undefined
    if (force) server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => { resolve() }))
    this.options.logger?.info('llm-pi-ai: local route stopped')
  }
}

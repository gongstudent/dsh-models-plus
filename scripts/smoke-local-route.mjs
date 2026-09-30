/**
 * Behavioural smoke test for the local-route proxy, run against a stubbed
 * upstream endpoint.
 *
 * Covers route selection and ambiguity, protocol conversion in both directions,
 * stream synthesis, caller-hangup propagation, error mapping, per-route header
 * and body overrides, and route-set replacement. It imports the real source
 * rather than a copy, so it fails when the proxy's observable behaviour changes.
 *
 * Usage: pnpm smoke
 *   Node's type stripping is enabled through --experimental-transform-types,
 *   which the parameter-property constructor in local-route.ts requires.
 */
import { createServer } from 'node:http'
import { connect } from 'node:net'
import assert from 'node:assert/strict'
import { LocalRouteServer } from '../src/local-route.ts'

const HOST = '127.0.0.1'
const sleep = ms => new Promise(r => setTimeout(r, ms))
const DEFAULT_BEHAVIOR = 'openai-json'

let behavior = DEFAULT_BEHAVIOR
const seen = []

async function respond(res) {
  if (behavior === 'never') return
  if (behavior === 'error') {
    res.writeHead(500, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ error: { message: 'upstream boom' } }))
    return
  }
  if (behavior === 'openai-sse') {
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    res.write('data: {"id":"chatcmpl-s","choices":[{"delta":{"content":"chunk"}}]}\n\n')
    res.end('data: [DONE]\n\n')
    return
  }
  if (behavior === 'anthropic-json') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-test',
      content: [{ type: 'text', text: 'hello from anthropic' }],
      stop_reason: 'end_turn', usage: { input_tokens: 5, output_tokens: 3 },
    }))
    return
  }
  res.writeHead(200, { 'content-type': 'application/json' })
  res.end(JSON.stringify({
    id: 'chatcmpl-1', object: 'chat.completion', model: 'gpt-test',
    choices: [{ index: 0, message: { role: 'assistant', content: 'hello from upstream' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 11, completion_tokens: 7 },
  }))
}

const upstream = createServer(async (req, res) => {
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  const raw = Buffer.concat(chunks).toString('utf8')
  const record = { url: req.url, headers: req.headers, body: raw === '' ? null : JSON.parse(raw), closed: false }
  seen.push(record)
  const markClosed = () => { record.closed = true }
  req.on('close', markClosed)
  res.on('close', markClosed)
  await respond(res)
})
await new Promise(r => upstream.listen(0, HOST, r))
const baseUrl = `http://${HOST}:${upstream.address().port}/v1`

const model = (id, api) => ({
  id, name: id, api, provider: 'p', baseUrl, maxTokens: 4096, contextWindow: 32768,
  input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
})
const profile = (provider, models, extra = {}) => ({
  provider, displayName: provider, streamIdleTimeoutMs: 1000, retryPolicy: {},
  configuredMaxTokens: new Map(), piProvider: { getModels: () => models }, ...extra,
})

const openai = profile('alpha', [model('shared-model', 'openai-completions'), model('alpha-only', 'openai-completions')])
const anthropic = profile('beta', [model('shared-model', 'anthropic-messages'), model('claude-only', 'anthropic-messages')])
const pinned = profile('gamma', [model('pinned-model', 'openai-completions')], { inboundApi: 'anthropic-messages' })
const custom = profile('delta', [model('custom-model', 'openai-completions')], {
  headers: { 'x-custom': 'yes' },
  bodyOverrides: { temperature: 0.42 },
})

let routes = new Map([['alpha', openai], ['beta', anthropic], ['gamma', pinned], ['delta', custom]])

const server = new LocalRouteServer({
  profiles: () => routes,
  resolveApiKey: async provider => `key-for-${provider}`,
  logger: { info: () => {}, error: () => {} },
})
await server.configure({ enabled: true, port: 0 })
const port = server.port

async function call(path, body, headers = {}) {
  const res = await fetch(`http://${HOST}:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = undefined }
  return { status: res.status, text, json }
}

/** One raw HTTP/1.1 exchange, optionally hanging up mid-answer. */
function rawExchange(path, body, { hangupAfterMs } = {}) {
  return new Promise(resolve => {
    const payload = JSON.stringify(body)
    let received = ''
    let hungUp = false
    const socket = connect(port, HOST, () => {
      socket.write(
        `POST ${path} HTTP/1.1\r\nHost: ${HOST}\r\nConnection: close\r\nContent-Type: application/json\r\n`
        + `Content-Length: ${Buffer.byteLength(payload)}\r\n\r\n${payload}`,
      )
    })
    if (hangupAfterMs !== undefined) {
      setTimeout(() => { hungUp = true; socket.destroy() }, hangupAfterMs)
    }
    socket.on('data', chunk => { received += chunk.toString('utf8') })
    socket.on('error', () => {})
    socket.on('close', () => resolve({ hungUp, received }))
  })
}

// A hung check must name itself instead of wedging the run.
const watchdog = setTimeout(() => { console.log('WATCHDOG: run exceeded 90s'); process.exit(2) }, 90_000)
watchdog.unref()

const results = []
async function test(name, fn) {
  try {
    await Promise.race([fn(), sleep(10_000).then(() => { throw new Error('timed out after 10s') })])
    results.push({ name, ok: true })
    console.log(`PASS  ${name}`)
  } catch (error) {
    results.push({ name, ok: false })
    console.log(`FAIL  ${name}: ${error.message}`)
  } finally {
    behavior = DEFAULT_BEHAVIOR
  }
}

await test('GET /health lists routes and endpoints', async () => {
  const res = await fetch(`http://${HOST}:${port}/health`)
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.deepEqual(body.routes.sort(), ['alpha', 'beta', 'delta', 'gamma'])
  assert.equal(body.endpoints.length, 3)
})

await test('unknown model is refused with 404', async () => {
  const res = await call('/v1/chat/completions', { model: 'nope' })
  assert.equal(res.status, 404)
  assert.match(res.json.error.message, /No local route exposes model "nope"/)
})

await test('empty model is refused with 400', async () => {
  assert.equal((await call('/v1/chat/completions', { model: '' })).status, 400)
})

await test('a model on two routes is ambiguous without the selector header', async () => {
  const res = await call('/v1/chat/completions', { model: 'shared-model' })
  assert.equal(res.status, 400)
  assert.match(res.json.error.message, /ambiguous/)
  assert.match(res.json.error.message, /x-dsh-provider/)
})

await test('selector header picks the named route and forwards its credential', async () => {
  behavior = 'anthropic-json'
  const res = await call('/v1/chat/completions', { model: 'shared-model', messages: [] }, { 'x-dsh-provider': 'beta' })
  assert.equal(res.status, 200)
  const record = seen[seen.length - 1]
  // beta serves that model over the anthropic protocol, so the request is
  // converted on the way out and the answer on the way back.
  assert.equal(record.url, '/v1/messages')
  assert.equal(record.headers['x-api-key'], 'key-for-beta')
  assert.equal(record.headers.authorization, undefined)
  assert.equal(res.json.choices[0].message.content, 'hello from anthropic')
})

await test('openai-in/openai-out passes the body through and returns the upstream JSON', async () => {
  const res = await call('/v1/chat/completions', { model: 'alpha-only', messages: [{ role: 'user', content: 'hi' }], temperature: 0.1 })
  assert.equal(res.status, 200)
  assert.equal(res.json.choices[0].message.content, 'hello from upstream')
  const record = seen[seen.length - 1]
  assert.equal(record.headers.authorization, 'Bearer key-for-alpha')
  assert.equal(record.body.model, 'alpha-only')
  assert.equal(record.body.temperature, 0.1)
  assert.equal(record.body.stream, false)
})

await test('a route pinned to one inbound protocol refuses the others', async () => {
  assert.equal((await call('/v1/chat/completions', { model: 'pinned-model' })).status, 404)
})

await test('anthropic-in/openai-out converts the request and the response', async () => {
  const res = await call('/v1/messages', {
    model: 'alpha-only',
    system: 'be brief',
    max_tokens: 64,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    tools: [{ name: 'lookup', description: 'd', input_schema: { type: 'object' } }],
  })
  assert.equal(res.status, 200)
  assert.equal(res.json.type, 'message')
  assert.equal(res.json.content[0].text, 'hello from upstream')
  assert.equal(res.json.stop_reason, 'end_turn')
  assert.equal(res.json.usage.input_tokens, 11)
  const record = seen[seen.length - 1]
  assert.equal(record.body.messages[0].role, 'system')
  assert.equal(record.body.messages[0].content, 'be brief')
  assert.equal(record.body.messages[1].role, 'user')
  assert.match(JSON.stringify(record.body.messages[1].content), /hi/)
  assert.equal(record.body.max_tokens, 64)
  assert.equal(record.body.tools[0].function.name, 'lookup')
  assert.equal(record.headers['anthropic-version'], undefined)
})

await test('openai-in/anthropic-out converts the request and the response', async () => {
  behavior = 'anthropic-json'
  const res = await call('/v1/chat/completions', { model: 'claude-only', messages: [{ role: 'user', content: 'hi' }] })
  assert.equal(res.status, 200)
  assert.equal(res.json.choices[0].message.content, 'hello from anthropic')
  assert.equal(res.json.usage.prompt_tokens, 5)
  const record = seen[seen.length - 1]
  assert.equal(record.url, '/v1/messages')
  assert.equal(record.headers['x-api-key'], 'key-for-beta')
  assert.equal(record.headers['anthropic-version'], '2023-06-01')
  assert.equal(record.body.max_tokens, 4096)
  assert.match(JSON.stringify(record.body.messages), /hi/)
})

await test('cross-protocol stream is synthesised from a buffered answer', async () => {
  const res = await call('/v1/messages', {
    model: 'alpha-only', stream: true, max_tokens: 32,
    messages: [{ role: 'user', content: 'hi' }],
  })
  assert.equal(res.status, 200)
  assert.match(res.text, /event: message_start/)
  assert.match(res.text, /hello from upstream/)
  assert.match(res.text, /event: message_stop/)
  assert.equal(seen[seen.length - 1].body.stream, false)
})

await test('same-protocol stream is piped through untouched', async () => {
  behavior = 'openai-sse'
  const res = await call('/v1/chat/completions', { model: 'alpha-only', stream: true, messages: [{ role: 'user', content: 'hi' }] })
  assert.equal(res.status, 200)
  assert.match(res.text, /chatcmpl-s/)
  assert.match(res.text, /\[DONE\]/)
  assert.equal(seen[seen.length - 1].body.stream, true)
})

await test('upstream failure is forwarded with its status and body', async () => {
  behavior = 'error'
  const res = await call('/v1/chat/completions', { model: 'alpha-only', messages: [] })
  assert.equal(res.status, 500)
  assert.match(res.text, /upstream boom/)
})

await test('per-route headers and body overrides reach the upstream', async () => {
  const res = await call('/v1/chat/completions', { model: 'custom-model', messages: [] }, { 'x-dsh-provider': 'delta' })
  assert.equal(res.status, 200)
  const record = seen[seen.length - 1]
  assert.equal(record.headers['x-custom'], 'yes')
  assert.equal(record.body.temperature, 0.42)
  assert.equal(record.headers['x-dsh-provider'], undefined)
})

await test('a replaced route set is picked up without a rebind', async () => {
  const previous = routes
  routes = new Map([['alpha', profile('alpha', [model('replacement-model', 'openai-completions')])]])
  assert.equal((await call('/v1/chat/completions', { model: 'replacement-model', messages: [] })).status, 200)
  assert.equal((await call('/v1/chat/completions', { model: 'alpha-only' })).status, 404)
  routes = previous
})

await test('a caller hangup tears the upstream request down', async () => {
  behavior = 'never'
  rawExchange('/v1/chat/completions', { model: 'alpha-only', messages: [] }, { hangupAfterMs: 250 })
  const record = await (async () => {
    for (let i = 0; i < 60; i++) {
      const last = seen[seen.length - 1]
      if (last !== undefined && last.closed) return last
      await sleep(50)
    }
    return seen[seen.length - 1]
  })()
  assert.notEqual(record, undefined, 'the upstream should have received the request')
  assert.equal(record.closed, true, 'the upstream connection should be closed after the caller hangs up')
})

await test('the server keeps serving after an aborted request', async () => {
  const response = await rawExchange('/v1/chat/completions', { model: 'alpha-only', messages: [] })
  assert.match(response.received, /HTTP\/1\.1 200/)
  assert.match(response.received, /hello from upstream/)
})

await test('disabling stops the listener', async () => {
  await server.configure({ enabled: false, port: 0 })
  await assert.rejects(fetch(`http://${HOST}:${port}/health`))
})

await server.close()
upstream.closeAllConnections()
await new Promise(r => upstream.close(r))

const failed = results.filter(r => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) process.exitCode = 1
import { launchEnvironmentOf } from "@deepseek-ai/dsh-launch-environment";
import * as dshLlm from "@deepseek-ai/dsh-llm";
import { CONTEXT_WINDOW_EXCEEDED_CODE, EMPTY_RESPONSE_CODE, INVALID_CREDENTIAL_CODE, LlmAdapter, LlmError, QUOTA_EXCEEDED_CODE, ReasoningEffortId, RetryPolicySchema, assertUsableApiKey, attributionHeaders, contentHasImage, isContextWindowExceededError, isQuotaExceededError, normalizeApiKey, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { createModels, createProvider, getSupportedThinkingLevels, isContextOverflow } from "@earendil-works/pi-ai";
import { MAX_TIMER_DELAY_MS, idleWatchdog, timeoutOf } from "@deepseek-ai/dsh-timeout";
import { builtinProviders, getBuiltinModels, getBuiltinProviders } from "@earendil-works/pi-ai/providers/all";
import z from "@deepseek-ai/schemastery";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
import { createServer } from "node:http";
//#region src/replay.ts
/**
* Durable pi-ai replay metadata and assistant-history reconstruction.
*
* Harness content remains the durable source for text and tool calls. This
* module stores only the provider-native metadata needed to reconstruct a
* pi-ai assistant message on a later request.
*
* @module dsh-llm-pi-ai/replay
*/
/** Parse tool-call argument JSON; tolerate model malformations with {}. */
function parseArguments(raw) {
	try {
		const parsed = JSON.parse(raw);
		if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return parsed;
	} catch {}
	return {};
}
/** Construct the zero usage value required by historical pi-ai messages. */
function emptyPiUsage() {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		cost: {
			input: 0,
			output: 0,
			cacheRead: 0,
			cacheWrite: 0,
			total: 0
		}
	};
}
/**
* Project a successful pi-ai response into the minimal durable replay state.
* @param message - completed native pi-ai assistant response.
* @returns the versioned lossless-JSON replay projection.
*/
function toPiReplayState(message) {
	return {
		kind: "pi-ai",
		version: 1,
		api: message.api,
		provider: message.provider,
		model: message.model,
		...message.responseModel === void 0 ? {} : { responseModel: message.responseModel },
		...message.responseId === void 0 ? {} : { responseId: message.responseId },
		stopReason: message.stopReason,
		blocks: message.content.map((block) => {
			switch (block.type) {
				case "text": return {
					type: "text",
					...block.textSignature === void 0 ? {} : { textSignature: block.textSignature }
				};
				case "thinking": return {
					type: "reasoning",
					...block.thinkingSignature === void 0 ? {} : { thinkingSignature: block.thinkingSignature },
					...block.redacted === void 0 ? {} : { redacted: block.redacted }
				};
				case "toolCall": return {
					type: "tool-call",
					...block.thoughtSignature === void 0 ? {} : { thoughtSignature: block.thoughtSignature }
				};
			}
		})
	};
}
function invalidReplay(message) {
	throw new LlmError(`invalid pi-ai replay state: ${message}`, "INVALID_REPLAY_STATE");
}
/** Validate the adapter-private state before it reaches pi-ai. */
function readReplayState(value) {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return invalidReplay("expected an object");
	const state = value;
	if (state["kind"] !== "pi-ai") return invalidReplay("unknown state kind");
	if (state["version"] !== 1) return invalidReplay(`unsupported version ${String(state["version"])}`);
	for (const key of [
		"api",
		"provider",
		"model"
	]) if (typeof state[key] !== "string" || state[key].length === 0) return invalidReplay(`${key} must be a non-empty string`);
	if (![
		"stop",
		"length",
		"toolUse",
		"error",
		"aborted"
	].includes(String(state["stopReason"]))) return invalidReplay("unknown stopReason");
	if (state["responseModel"] !== void 0 && typeof state["responseModel"] !== "string") return invalidReplay("responseModel must be a string");
	if (state["responseId"] !== void 0 && typeof state["responseId"] !== "string") return invalidReplay("responseId must be a string");
	if (!Array.isArray(state["blocks"])) return invalidReplay("blocks must be an array");
	for (const [index, value] of state["blocks"].entries()) {
		if (typeof value !== "object" || value === null || Array.isArray(value)) return invalidReplay(`block ${index} must be an object`);
		const block = value;
		if (![
			"text",
			"reasoning",
			"tool-call"
		].includes(String(block["type"]))) return invalidReplay(`block ${index} has an unknown type`);
		for (const signature of [
			"textSignature",
			"thinkingSignature",
			"thoughtSignature"
		]) if (block[signature] !== void 0 && typeof block[signature] !== "string") return invalidReplay(`block ${index} ${signature} must be a string`);
		if (block["redacted"] !== void 0 && typeof block["redacted"] !== "boolean") return invalidReplay(`block ${index} redacted must be boolean`);
	}
	return state;
}
/** Convert provider-neutral blocks without trusting them as same-model replay. */
function foreignAssistant(message) {
	const source = message.source.kind === "model" ? message.source : void 0;
	const content = [];
	for (const block of message.content) switch (block.type) {
		case "text":
			content.push({
				type: "text",
				text: block.text
			});
			break;
		case "reasoning":
			content.push({
				type: "thinking",
				thinking: block.text
			});
			break;
		case "tool-call":
			content.push({
				type: "toolCall",
				id: block.id,
				name: block.name,
				arguments: parseArguments(block.arguments)
			});
			break;
		case "image": throw new LlmError("pi-ai chat history cannot represent structured assistant image output", "UNSUPPORTED_CONTENT");
	}
	return {
		role: "assistant",
		content,
		api: "dsh-foreign",
		provider: source?.provider ?? "dsh-foreign",
		model: source?.model ?? "dsh-foreign",
		usage: emptyPiUsage(),
		stopReason: content.some((piece) => piece.type === "toolCall") ? "toolUse" : "stop",
		timestamp: 0
	};
}
/** Recombine durable Harness content with validated pi-ai replay metadata. */
function replayedAssistant(message, source, rawState) {
	const state = readReplayState(rawState);
	if (state.provider !== source.provider) return invalidReplay("provider does not match assistant source");
	if (state.model !== source.model) return invalidReplay("model does not match assistant source");
	if (state.blocks.length !== message.content.length) return invalidReplay("block count does not match assistant content");
	return {
		role: "assistant",
		content: message.content.map((block, index) => {
			const replay = state.blocks[index];
			if (replay === void 0 || replay.type !== block.type) return invalidReplay(`block ${index} does not match assistant content`);
			switch (block.type) {
				case "text": return {
					type: "text",
					text: block.text,
					...replay.type === "text" && replay.textSignature !== void 0 ? { textSignature: replay.textSignature } : {}
				};
				case "reasoning": return {
					type: "thinking",
					thinking: block.text,
					...replay.type === "reasoning" && replay.thinkingSignature !== void 0 ? { thinkingSignature: replay.thinkingSignature } : {},
					...replay.type === "reasoning" && replay.redacted !== void 0 ? { redacted: replay.redacted } : {}
				};
				case "tool-call": return {
					type: "toolCall",
					id: block.id,
					name: block.name,
					arguments: parseArguments(block.arguments),
					...replay.type === "tool-call" && replay.thoughtSignature !== void 0 ? { thoughtSignature: replay.thoughtSignature } : {}
				};
				/* v8 ignore next -- readReplayState rejects unknown replay tags, so an equal plugin-added Harness tag cannot reach this switch */
				default: return invalidReplay(`block ${index} has an unsupported Harness type`);
			}
		}),
		api: state.api,
		provider: state.provider,
		model: state.model,
		...state.responseModel === void 0 ? {} : { responseModel: state.responseModel },
		...state.responseId === void 0 ? {} : { responseId: state.responseId },
		usage: emptyPiUsage(),
		stopReason: state.stopReason,
		timestamp: 0
	};
}
/**
* Convert one durable Harness assistant message into pi-ai history.
* @param message - assistant content with required source and optional adapter-owned replay metadata.
* @returns a native pi-ai assistant message reconstructed from durable content.
*/
function toPiAssistant(message) {
	const source = message.source;
	return source.kind !== "model" || source.replayState === void 0 ? foreignAssistant(message) : replayedAssistant(message, source, source.replayState);
}
//#endregion
//#region src/context.ts
/**
* Harness request-history conversion into pi-ai's Context vocabulary.
*
* @module dsh-llm-pi-ai/context
*/
const CallId$1 = (id) => (dshLlm.CallId ?? dshLlm.ToolCallId ?? ((x) => x))(id);
/** Join the text blocks of a harness message. */
function flattenText(message) {
	return message.content.filter((block) => block.type === "text").map((block) => block.text).join("");
}
/** Flatten text recursively inside one tool result. */
function toolResultText(blocks) {
	return blocks.map((block) => block.type === "text" ? block.text : block.type === "tool-result" ? toolResultText(block.content) : "").join("");
}
async function userContent(blocks, attachments) {
	const content = [];
	for (const block of blocks) switch (block.type) {
		case "text":
			if (block.text.length > 0) content.push({
				type: "text",
				text: block.text
			});
			break;
		case "image": {
			const stored = await attachments.readImage(block.attachment);
			content.push({
				type: "image",
				data: Buffer.from(stored.data).toString("base64"),
				mimeType: stored.ref.mediaType
			});
			break;
		}
		case "tool-result": {
			const nested = await userContent(block.content, attachments);
			if (typeof nested === "string") {
				if (nested.length > 0) content.push({
					type: "text",
					text: nested
				});
			} else content.push(...nested);
		}
	}
	if (content.every((block) => block.type === "text")) return content.map((block) => block.text).join("");
	return content;
}
function toolsOf(options) {
	return options.tools?.map((tool) => ({
		name: tool.name,
		description: tool.description,
		parameters: tool.parameters
	}));
}
/** Assemble the request-level pi-ai context envelope shared by both conversion paths. */
function piContext(options, messages) {
	const tools = toolsOf(options);
	return {
		...options.system !== void 0 ? { systemPrompt: options.system } : {},
		messages,
		...tools !== void 0 && tools.length > 0 ? { tools } : {}
	};
}
function textOnlyContext(options) {
	const toolNames = /* @__PURE__ */ new Map();
	const messages = [];
	for (const message of options.messages) {
		if (contentHasImage(message.content)) throw new LlmError("pi-ai image conversion requires the durable attachment service", "UNSUPPORTED_CONTENT");
		if (message.role === "system") {
			messages.push({
				role: "user",
				content: flattenText(message),
				timestamp: 0
			});
			continue;
		}
		if (message.role === "assistant") {
			const assistant = toPiAssistant(message);
			for (const block of assistant.content) if (block.type === "toolCall") toolNames.set(CallId$1(block.id), block.name);
			messages.push(assistant);
			continue;
		}
		const text = flattenText(message);
		const results = message.content.filter((block) => block.type === "tool-result");
		if (text.length > 0 || results.length === 0) messages.push({
			role: "user",
			content: text,
			timestamp: 0
		});
		for (const result of results) messages.push({
			role: "toolResult",
			toolCallId: result.toolCallId,
			toolName: toolNames.get(result.toolCallId) ?? "unknown",
			content: [{
				type: "text",
				text: toolResultText(result.content) || "(no output)"
			}],
			isError: result.isError ?? false,
			timestamp: 0
		});
	}
	return piContext(options, messages);
}
function toPiContext(options, attachments) {
	return attachments === void 0 ? textOnlyContext(options) : toPiContextWithImages(options, attachments);
}
async function toPiContextWithImages(options, attachments) {
	const toolNames = /* @__PURE__ */ new Map();
	const messages = [];
	for (const message of options.messages) {
		if (message.role === "system") {
			if (contentHasImage(message.content)) throw new LlmError("pi-ai cannot represent an image in an in-history system message", "UNSUPPORTED_CONTENT");
			messages.push({
				role: "user",
				content: flattenText(message),
				timestamp: 0
			});
			continue;
		}
		if (message.role === "assistant") {
			const assistant = toPiAssistant(message);
			for (const block of assistant.content) if (block.type === "toolCall") toolNames.set(CallId$1(block.id), block.name);
			messages.push(assistant);
			continue;
		}
		const content = await userContent(message.content.filter((block) => block.type !== "tool-result"), attachments);
		const results = message.content.filter((block) => block.type === "tool-result");
		if (content.length > 0 || results.length === 0) messages.push({
			role: "user",
			content,
			timestamp: 0
		});
		for (const result of results) {
			const resultContent = await userContent(result.content, attachments);
			messages.push({
				role: "toolResult",
				toolCallId: result.toolCallId,
				toolName: toolNames.get(result.toolCallId) ?? "unknown",
				content: typeof resultContent === "string" ? [{
					type: "text",
					text: resultContent || "(no output)"
				}] : resultContent,
				isError: result.isError ?? false,
				timestamp: 0
			});
		}
	}
	return piContext(options, messages);
}
//#endregion
//#region src/stream.ts
/**
* pi-ai assistant event translation into the Harness streaming protocol.
*
* pi-ai tool-call arguments are parsed objects while the Harness keeps their
* raw JSON representation. pi-ai also reports failures as terminal stream
* events, which this module maps into Harness finish chunks.
*
* @module dsh-llm-pi-ai/stream
*/
const CallId = (id) => (dshLlm.CallId ?? dshLlm.ToolCallId ?? ((x) => x))(id);
/**
* Map pi-ai usage (reasoning folded into output by pi-ai).
* @param usage - cumulative usage from the terminal pi-ai event.
* @returns harness counts; cache fields appear only when non-zero (pi-ai reports zeros, not absence).
*/
function mapUsage(usage) {
	return {
		inputTokens: usage.input,
		outputTokens: usage.output,
		...usage.cacheRead > 0 ? { cacheReadTokens: usage.cacheRead } : {},
		...usage.cacheWrite > 0 ? { cacheWriteTokens: usage.cacheWrite } : {}
	};
}
function classifyPiAiError(message) {
	if (/\b(?:401|403)\b/.test(message)) return "AUTH";
	if (isQuotaExceededError(message)) return QUOTA_EXCEEDED_CODE;
	if (/\b429\b|rate.?limit/i.test(message)) return "RATE_LIMIT";
	if (/\b400\b|invalid.?request/i.test(message)) return "INVALID_REQUEST";
	if (/\b5\d\d\b/.test(message)) return "SERVER";
	if (/\btime(?:d)?\s*out\b|timeout/i.test(message)) return "TIMEOUT";
	if (/stream ended (?:before|without)\b/i.test(message)) return "TRANSPORT";
	if (/\b(?:network|connection|socket|fetch)\b|\bECONN[A-Z]+\b/i.test(message) || /\b(?:other side closed|HTTP2 request did not get a response|WebSocket closed unexpectedly)\b/i.test(message) || /\bterminated\b|premature close/i.test(message)) return "TRANSPORT";
	return "PI_AI_ERROR";
}
/**
* Map a terminal pi-ai event to the harness finish reason.
* @param message - the assistant message carried by the `done` or `error` event.
* @param contextWindow - resolved catalog capacity for usage-based overflow detection.
* @returns the mapped harness reason. Recognized error text, `stop` usage above
*   `contextWindow`, and zero-output `length` usage that fills the window map
*   to `CONTEXT_WINDOW_EXCEEDED`; a `stop` with no content blocks maps to an
*   `EMPTY_RESPONSE` error.
*/
function mapStopReason(message, contextWindow) {
	const piAiOverflow = isContextOverflow(message, contextWindow);
	const harnessOverflow = message.stopReason === "error" && message.errorMessage !== void 0 && isContextWindowExceededError(message.errorMessage);
	if (piAiOverflow || harnessOverflow) return {
		kind: "error",
		failure: {
			message: message.errorMessage ?? `pi-ai detected context overflow for model "${message.model}"`,
			code: CONTEXT_WINDOW_EXCEEDED_CODE
		}
	};
	switch (message.stopReason) {
		case "stop":
			if (message.content.length === 0) return {
				kind: "error",
				failure: {
					message: `model "${message.model}" returned a completed response with no content`,
					code: EMPTY_RESPONSE_CODE
				}
			};
			return { kind: "stop" };
		case "length": return { kind: "max-tokens" };
		case "toolUse": return { kind: "tool-calls" };
		case "aborted": return {
			kind: "aborted",
			failure: {
				message: message.errorMessage ?? "pi-ai stream aborted",
				code: "ABORTED"
			}
		};
		case "error": {
			const text = message.errorMessage ?? "pi-ai stream error";
			return {
				kind: "error",
				failure: {
					message: text,
					code: classifyPiAiError(text)
				}
			};
		}
	}
}
/**
* Translate the pi-ai event stream into StreamChunks. pi-ai never throws
* mid-stream — failures arrive as `error` events, which become error/aborted
* `finish` chunks (the harness protocol's other error-delivery style).
* @param events - one assistant turn's pi-ai event stream.
* @param contextWindow - resolved catalog capacity for usage-based overflow detection.
* @returns the harness chunks, ending with `usage` then `finish`; throws
*   `LlmError` (`STREAM_CLOSED`) if the source ends without a terminal event.
*/
async function* toStreamChunks(events, contextWindow) {
	const toolIds = /* @__PURE__ */ new Map();
	for await (const event of events) switch (event.type) {
		case "start": break;
		case "text_start":
			yield {
				type: "block-start",
				index: event.contentIndex,
				blockType: "text"
			};
			break;
		case "text_delta":
			yield {
				type: "text-delta",
				index: event.contentIndex,
				text: event.delta
			};
			break;
		case "text_end":
			yield {
				type: "block-end",
				index: event.contentIndex,
				block: {
					type: "text",
					text: event.content
				}
			};
			break;
		case "thinking_start":
			yield {
				type: "block-start",
				index: event.contentIndex,
				blockType: "reasoning"
			};
			break;
		case "thinking_delta":
			yield {
				type: "reasoning-delta",
				index: event.contentIndex,
				text: event.delta
			};
			break;
		case "thinking_end":
			yield {
				type: "block-end",
				index: event.contentIndex,
				block: {
					type: "reasoning",
					text: event.content
				}
			};
			break;
		case "toolcall_start": {
			const partial = event.partial.content[event.contentIndex];
			const id = partial?.type === "toolCall" ? partial.id : "";
			const name = partial?.type === "toolCall" ? partial.name : "";
			toolIds.set(event.contentIndex, {
				id,
				name
			});
			yield {
				type: "block-start",
				index: event.contentIndex,
				blockType: "tool-call"
			};
			break;
		}
		case "toolcall_delta": {
			const known = toolIds.get(event.contentIndex);
			yield {
				type: "tool-call-delta",
				index: event.contentIndex,
				id: CallId(known?.id ?? ""),
				...known?.name !== void 0 && known.name.length > 0 ? { name: known.name } : {},
				argumentsDelta: event.delta
			};
			break;
		}
		case "toolcall_end":
			yield {
				type: "block-end",
				index: event.contentIndex,
				block: {
					type: "tool-call",
					id: CallId(event.toolCall.id),
					name: event.toolCall.name,
					arguments: JSON.stringify(event.toolCall.arguments)
				}
			};
			break;
		case "done":
			yield {
				type: "usage",
				usage: mapUsage(event.message.usage)
			};
			yield {
				type: "finish",
				reason: mapStopReason(event.message, contextWindow),
				replayState: toPiReplayState(event.message)
			};
			return;
		case "error":
			yield {
				type: "usage",
				usage: mapUsage(event.error.usage)
			};
			yield {
				type: "finish",
				reason: mapStopReason(event.error, contextWindow)
			};
			return;
	}
	throw new LlmError("pi-ai event stream ended without done/error", "STREAM_CLOSED");
}
//#endregion
//#region \0@oxc-project+runtime@0.150.0/helpers/esm/usingCtx.js
function _usingCtx() {
	var r = "function" == typeof SuppressedError ? SuppressedError : function(r, e) {
		var n = Error();
		return n.name = "SuppressedError", n.error = r, n.suppressed = e, n;
	}, e = {}, n = [];
	function using(r, e) {
		if (null != e) {
			if (Object(e) !== e) throw new TypeError("using declarations can only be used with objects, functions, null, or undefined.");
			if (r) var o = e[Symbol.asyncDispose || Symbol["for"]("Symbol.asyncDispose")];
			if (void 0 === o && (o = e[Symbol.dispose || Symbol["for"]("Symbol.dispose")], r)) var t = o;
			if ("function" != typeof o) throw new TypeError("Object is not disposable.");
			t && (o = function o() {
				try {
					t.call(e);
				} catch (r) {
					return Promise.reject(r);
				}
			}), n.push({
				v: e,
				d: o,
				a: r
			});
		} else r && n.push({
			d: e,
			a: r
		});
		return e;
	}
	return {
		e,
		u: using.bind(null, !1),
		a: using.bind(null, !0),
		d: function d() {
			var o, t = this.e, s = 0;
			function next() {
				for (; o = n.pop();) try {
					if (!o.a && 1 === s) return s = 0, n.push(o), Promise.resolve().then(next);
					if (o.d) {
						var r = o.d.call(o.v);
						if (o.a) return s |= 2, Promise.resolve(r).then(next, err);
					} else s |= 1;
				} catch (r) {
					return err(r);
				}
				if (1 === s) return t !== e ? Promise.reject(t) : Promise.resolve();
				if (t !== e) throw t;
			}
			function err(n) {
				return t = t !== e ? new r(n, t) : n, next();
			}
			return next();
		}
	};
}
//#endregion
//#region src/adapter.ts
/**
* Generic pi-ai-backed implementation of the Harness LLM seam.
*
* Each resolution produces one **immutable** snapshot — the profiles plus a
* `Models` collection holding the `Provider` each route built — and an
* operation captures a whole snapshot before its first `await`. A
* configuration change builds a *new* collection rather than mutating the one
* in use, because `Models.streamSimple()` is lazy: it resolves the provider
* when the stream is first consumed, which is after the credential await, so a
* mutated collection would let a request that started under one configuration
* finish under another — or fail with a provider that no longer exists. This is
* what makes the seam's per-step call freeze (`llm.prepareCall()`) hold all the
* way down: switching models mid-reply takes effect on the next step, never
* inside the one in flight.
*
* Credentials stay outside that collection. The harness resolves a route's key
* through its own seam and passes it as the request's `apiKey` option, which
* pi-ai treats as the highest-priority auth override — so `Models` never holds
* a credential store and the harness keeps its fail-loud reference semantics.
*
* @module dsh-llm-pi-ai/adapter
*/
/** Copy profile stream knobs into pi-ai's common option vocabulary. */
function profileOptions(profile, reasoning, apiKey) {
	const enabledReasoning = reasoning === "off" ? void 0 : reasoning;
	return {
		...apiKey === void 0 ? {} : { apiKey },
		...enabledReasoning === void 0 ? {} : { reasoning: enabledReasoning },
		...profile.thinkingBudgets === void 0 ? {} : { thinkingBudgets: profile.thinkingBudgets },
		...profile.cacheRetention === void 0 ? {} : { cacheRetention: profile.cacheRetention },
		...profile.transport === void 0 ? {} : { transport: profile.transport },
		...profile.timeoutMs === void 0 ? {} : { timeoutMs: profile.timeoutMs },
		...profile.websocketConnectTimeoutMs === void 0 ? {} : { websocketConnectTimeoutMs: profile.websocketConnectTimeoutMs },
		maxRetries: 0
	};
}
/**
* The profile default this exact model can actually take, for DESCRIBING it.
* A configured level the model does not support yields none rather than
* throwing: `resolveModel` builds the model catalog, and a catalog that fails
* takes its whole provider out of every picker — so one mis-set profile field
* would hide every model on the route, including the ones that support the
* level. The request path still refuses, which is where a bad configuration
* belongs: describing what a model can do must not fail because a deployment
* asked it for something it cannot.
* @param model - the resolved model descriptor.
* @param effort - the profile's configured level, if any.
* @returns the level when this model supports it, otherwise undefined.
*/
function describableReasoningLevel(model, effort) {
	if (effort === void 0) return void 0;
	return getSupportedThinkingLevels(model).some((level) => level === effort) ? effort : void 0;
}
/** Validate an explicit Harness/profile effort without invoking pi-ai's clamp. */
function resolveReasoningLevel(model, effort) {
	if (effort === void 0) return void 0;
	if (getSupportedThinkingLevels(model).some((level) => level === effort)) return effort;
	throw new LlmError(`pi-ai provider "${model.provider}" model "${model.id}" does not support reasoning effort "${effort}"`, "UNSUPPORTED_REASONING_EFFORT");
}
/**
* Selectable reasoning efforts for one model, or nothing at all.
*
* A model that carries no reasoning metadata — every hand-declared one, and
* every catalog model pi-ai marks as non-reasoning — is reported by pi-ai as
* supporting the single level `off`. Passing that through would offer a control
* that cannot do what it says: `off` is translated to *omitting* the reasoning
* option, which for such a model is byte-for-byte the same request as naming no
* effort — so a provider whose own default is to think would keep thinking with
* `off` selected. Omitting `reasoning` entirely is the seam's way of saying the
* capability is unavailable, which leaves the surface offering only the
* provider's default.
* @param model - the resolved model descriptor.
* @param defaultLevel - the profile's configured effort, already validated.
* @returns the `reasoning` field, or an empty object when none can be offered.
*/
function reasoningInfo(model, defaultLevel) {
	if (!model.reasoning) return {};
	return { reasoning: {
		efforts: getSupportedThinkingLevels(model).map((level) => ({
			id: ReasoningEffortId(level),
			name: `${level.charAt(0).toUpperCase()}${level.slice(1)}`
		})),
		...defaultLevel === void 0 ? {} : { defaultEffort: ReasoningEffortId(defaultLevel) }
	} };
}
/** Merge deployment headers while removing case-insensitive attribution collisions. */
function requestHeaders(headers) {
	const attribution = attributionHeaders();
	const reserved = new Set(Object.keys(attribution).map((name) => name.toLowerCase()));
	return {
		...Object.fromEntries(Object.entries(headers ?? {}).filter(([name]) => !reserved.has(name.toLowerCase()))),
		...attribution
	};
}
/**
* pi-ai-backed multi-provider adapter. Each operation reads the current
* profiles, so a configuration change reaches the next request without a
* restart; model descriptors come from the collection those profiles built.
*/
var PiAiAdapter = class extends LlmAdapter {
	config;
	snapshot;
	constructor(config) {
		super();
		this.config = config;
	}
	/**
	* The snapshot for the current profiles. Resolution memoizes its result, so
	* an unchanged configuration is recognized by identity; a changed one gets a
	* brand-new collection, leaving any snapshot an operation already captured
	* untouched for as long as that operation holds it.
	*/
	current() {
		const profiles = this.config.profiles();
		if (this.snapshot?.profiles === profiles) return this.snapshot;
		const models = createModels();
		for (const profile of profiles.values()) models.setProvider(profile.piProvider);
		this.snapshot = {
			profiles,
			models
		};
		return this.snapshot;
	}
	/** The profile for one route within one snapshot, or the not-owned failure. */
	profileOf(snapshot, provider) {
		const profile = snapshot.profiles.get(provider);
		if (profile === void 0) throw new LlmError(`pi-ai adapter does not own provider "${provider}"`, "NO_ADAPTER");
		return profile;
	}
	/** The configured descriptor for one exact route/model pair within one snapshot. */
	modelOf(snapshot, provider, model) {
		this.profileOf(snapshot, provider);
		const resolved = snapshot.models.getModel(provider, model);
		if (resolved === void 0) throw new LlmError(`pi-ai provider "${provider}" has no configured model "${model}"`, "UNKNOWN_MODEL");
		return resolved;
	}
	providerInfo(provider) {
		return {
			id: provider,
			name: this.current().profiles.get(provider)?.displayName ?? provider
		};
	}
	providerRetryPolicy(provider) {
		return this.current().profiles.get(provider)?.retryPolicy;
	}
	listModels(provider) {
		return Promise.resolve().then(() => {
			const snapshot = this.current();
			this.profileOf(snapshot, provider);
			return snapshot.models.getModels(provider).map((model) => ({
				provider,
				id: model.id,
				name: model.name,
				inputModalities: [...model.input]
			}));
		});
	}
	resolveModel(provider, model, _signal) {
		return Promise.resolve().then(() => {
			const snapshot = this.current();
			const profile = this.profileOf(snapshot, provider);
			const resolvedModel = this.modelOf(snapshot, provider, model);
			const defaultLevel = describableReasoningLevel(resolvedModel, profile.reasoning);
			const configuredMaxTokens = profile.configuredMaxTokens.get(model);
			return {
				provider,
				id: model,
				name: resolvedModel.name,
				inputModalities: [...resolvedModel.input],
				context: { contextWindow: resolvedModel.contextWindow },
				...configuredMaxTokens === void 0 ? {} : { defaultMaxTokens: configuredMaxTokens },
				...reasoningInfo(resolvedModel, defaultLevel)
			};
		});
	}
	async *stream(options) {
		try {
			var _usingCtx$1 = _usingCtx();
			if (options.stop !== void 0) throw new LlmError("llm-pi-ai does not support GenerateOptions.stop", "UNSUPPORTED_OPTION");
			const snapshot = this.current();
			const profile = this.profileOf(snapshot, options.provider);
			const model = this.modelOf(snapshot, options.provider, options.model);
			const reasoning = resolveReasoningLevel(model, options.reasoningEffort ?? profile.reasoning);
			const apiKey = await this.config.resolveApiKey(options.provider, profile);
			const consumer = new AbortController();
			const upstream = options.signal === void 0 ? consumer.signal : AbortSignal.any([options.signal, consumer.signal]);
			const streamIdleTimeoutMs = profile.streamIdleTimeoutMs;
			const watchdog = _usingCtx$1.u(idleWatchdog(upstream, streamIdleTimeoutMs, "LLM_STREAM_IDLE_TIMEOUT"));
			try {
				const containsImage = options.messages.some((message) => contentHasImage(message.content));
				if (containsImage && !model.input.includes("image")) throw new LlmError(`pi-ai model "${model.id}" does not support image input`, "UNSUPPORTED_CONTENT");
				const attachments = containsImage ? this.config.resolveAttachments?.() : void 0;
				if (containsImage && attachments === void 0) throw new LlmError("pi-ai image input requires the durable attachment service", "UNSUPPORTED_CONTENT");
				const context = attachments === void 0 ? toPiContext(options) : await toPiContext(options, attachments);
				const iterator = toStreamChunks(snapshot.models.streamSimple(model, context, {
					...profileOptions(profile, reasoning, apiKey),
					...options.temperature === void 0 ? {} : { temperature: options.temperature },
					...options.maxTokens === void 0 ? {} : { maxTokens: options.maxTokens },
					...options.sessionId === void 0 ? {} : { sessionId: String(options.sessionId) },
					signal: watchdog.signal,
					headers: requestHeaders(profile.headers)
				}), model.contextWindow)[Symbol.asyncIterator]();
				let exhausted = false;
				try {
					while (true) {
						const result = await watchdog.next(iterator);
						const timeout = timeoutOf(watchdog.signal, "LLM_STREAM_IDLE_TIMEOUT");
						if (timeout !== void 0) throw timeout;
						if (result.done) {
							exhausted = true;
							return;
						}
						yield result.value;
					}
				} finally {
					if (!exhausted) {
						consumer.abort("pi-ai stream consumer stopped");
						try {
							await iterator.return(void 0);
						} catch (_abortedSdkTeardown) {}
					}
				}
			} catch (error) {
				if (timeoutOf(watchdog.signal, "LLM_STREAM_IDLE_TIMEOUT") !== void 0) throw new LlmError(`pi-ai stream idle timeout after ${streamIdleTimeoutMs}ms`, "TIMEOUT", { cause: error });
				if (options.signal?.aborted) throw new LlmError("pi-ai request aborted by caller", "ABORTED", { cause: error });
				throw error;
			} finally {
				consumer.abort("pi-ai stream consumer stopped");
			}
		} catch (_) {
			_usingCtx$1.e = _;
		} finally {
			_usingCtx$1.d();
		}
	}
};
//#endregion
//#region src/catalog.ts
/**
* Materialization of one provider route's model catalog. The installed pi-ai
* catalog supplies defaults keyed by model id, and a profile's own model
* entries override them field by field, so a route naming a catalog provider
* stays configuration-free while a route pi-ai has never heard of is fully
* describable from `settings.yaml`.
*
* Every pi-ai `Model` field the harness cannot default is required here rather
* than at request time: an unserviceable route fails while its configuration is
* being resolved, which is the earliest point that can name the offending key.
*
* @module dsh-llm-pi-ai/catalog
*/
/**
* Pricing for a model the installed catalog does not describe. The harness
* never reads pi-ai's cost metadata — `replay.ts` zeroes it and no consumer
* reports spend — so this is the absence of a fact, not a configurable rate.
*/
const NO_COST = {
	input: 0,
	output: 0,
	cacheRead: 0,
	cacheWrite: 0
};
/** Every request modality a profile may declare. */
const MODALITIES = Object.keys({
	text: true,
	image: true
});
/**
* One entry's modality list, or `undefined` when it states no answer. Absent
* and empty mean the same thing — `[]` describes a model that accepts nothing
* and could serve no request — which is what makes an entry naming a catalog
* model without declaring modalities keep the catalog's, since the config
* schema materializes `[]` for an absent array.
* @param configured - the list a `models` or `modelOverrides` entry supplied.
* @returns the declared modalities, or `undefined` to ask the next level.
*/
function declaredInput(configured) {
	return configured === void 0 || configured.length === 0 ? void 0 : [...configured];
}
/** Every pi-ai thinking level a profile may declare, in escalation order. */
const THINKING_LEVELS = Object.keys({
	off: true,
	minimal: true,
	low: true,
	medium: true,
	high: true,
	xhigh: true,
	max: true
});
/** Reasoning-dispatch wire formats a profile may name, most-reached first. */
const SUPPORTED_THINKING_FORMATS = Object.keys({
	"openai": true,
	"deepseek": true,
	"openrouter": true,
	"together": true,
	"zai": true,
	"qwen": true,
	"string-thinking": true,
	"ant-ling": true
});
let providerIndex;
/**
* Installed catalog providers by id, constructed once. Each entry owns the API
* implementations for its own models, which is why a catalog route reuses this
* provider instead of being rebuilt from parts.
* @returns the catalog provider index.
*/
function catalogProviders() {
	providerIndex ??= new Map(builtinProviders().map((provider) => [provider.id, provider]));
	return providerIndex;
}
/**
* The installed catalog provider for one route, when pi-ai ships one.
* @param provider - provider route key.
* @returns the catalog provider, or `undefined` for a route pi-ai does not ship.
*/
function catalogProvider(provider) {
	return catalogProviders().get(provider);
}
/**
* Every provider route the installed pi-ai catalog ships.
* @returns the catalog provider ids.
*/
function catalogProviderIds() {
	return getBuiltinProviders();
}
/**
* Whether the installed catalog provider for one route declares an api-key
* method — the only authentication this adapter obtains on its own.
*
* A key is what the harness resolves through its own credential seam and hands
* pi-ai per request. pi-ai's other method, OAuth, resolves from a *stored*
* OAuth credential alone: `resolveProviderAuth` has no ambient path for it,
* this adapter builds its `Models` collection with no credential store, and
* nothing here runs a login flow. So a provider offering OAuth by itself
* leaves nothing for this adapter to authenticate with, and the posture such a
* provider invites — no key configured, credentials discovered by the provider
* — fails every request with `Provider is not configured`.
* @param provider - provider route key.
* @returns whether the catalog provider takes an api key; false for a route
*   pi-ai does not ship, which the caller answers for separately.
*/
function catalogProviderTakesApiKey(provider) {
	return catalogProvider(provider)?.auth.apiKey !== void 0;
}
/**
* The installed catalog models for one route, indexed by model id.
* @param provider - provider route key.
* @returns catalog models by id; empty for a route pi-ai does not ship.
*/
function catalogModels(provider) {
	if (!catalogProviders().has(provider)) return /* @__PURE__ */ new Map();
	const models = getBuiltinModels(provider);
	return new Map(models.map((model) => [model.id, model]));
}
/** Report a route the deployment cannot serve, naming the settings key at fault. */
function invalid(provider, detail) {
	throw new Error(`llm-pi-ai: provider "${provider}" ${detail}`);
}
/**
* The one wire protocol a catalog route's shipped models agree on. This is what
* lets a deployment add a model the installed catalog has not caught up with —
* a provider's newest release — without restating the protocol its siblings
* already use. A route whose shipped models disagree (an OpenAI-style catalog
* spanning Responses and Chat Completions) has no such answer, so a model it
* does not describe must name its protocol at the route.
*/
function sharedCatalogApi(defaults) {
	const apis = /* @__PURE__ */ new Set();
	for (const model of defaults.values()) apis.add(model.api);
	return apis.size === 1 ? [...apis][0] : void 0;
}
/**
* Resolve one model's reasoning capability from its declared efforts.
*
* A declared dict translates to pi-ai's `thinkingLevelMap` with every level
* decided explicitly: declared levels carry their wire spelling, undeclared
* levels are pinned to `null` (unsupported). Pinning matters because pi-ai's
* own defaulting is asymmetric — an absent key means "supported" for the five
* base levels but "unsupported" for `xhigh`/`max` — and a profile author
* should not need to know that. A declared `off` with no value is the one
* exception: it stays absent from the map, which pi-ai reads as "supported,
* send nothing" — the correct dispatch where not thinking is the parameter's
* absence — while `off` with a value sends that value.
* @param provider - provider route key, for diagnostics.
* @param entry - the configured model entry.
* @param base - the installed catalog entry of the same id, when one exists.
* @returns the reasoning fields the materialized model carries.
*/
function resolveModelReasoning(provider, entry, base) {
	const efforts = entry.reasoningEfforts;
	if (efforts === void 0) return { reasoning: base?.reasoning ?? false };
	if (efforts === false) return { reasoning: false };
	if (efforts === null || Object.keys(efforts).length === 0) invalid(provider, `model "${entry.id}" has an empty reasoningEfforts; declare the offered levels, set false for a non-reasoning model, or omit the field to keep the installed catalog's capability`);
	const declared = THINKING_LEVELS.flatMap((level) => {
		const wire = efforts[level];
		return wire === void 0 ? [] : [[level, wire]];
	});
	for (const [level, wire] of declared) if (wire === null) {
		if (level !== "off") invalid(provider, `model "${entry.id}" reasoningEfforts.${level} needs the wire value dispatch should send; only "off" may leave it empty`);
	} else if (wire.length === 0) invalid(provider, `model "${entry.id}" reasoningEfforts.${level} must not be an empty string`);
	if (!declared.some(([level]) => level !== "off")) invalid(provider, `model "${entry.id}" reasoningEfforts offers no level beyond "off"; declare a thinking level, or set reasoningEfforts to false for a non-reasoning model`);
	const map = {};
	for (const level of THINKING_LEVELS) {
		const wire = efforts[level];
		if (wire === void 0) map[level] = null;
		else if (wire !== null) map[level] = wire;
	}
	return {
		reasoning: true,
		thinkingLevelMap: map
	};
}
/**
* Resolve one model's compat block from the profile's reasoning switches.
*
* A model switch wins over the route switch; whatever neither sets keeps the
* installed entry's value, and a field no layer decides falls through to
* pi-ai's baseURL-derived detection. Only an `openai-completions` model takes
* the switches at all: a model-level switch on any other protocol fails
* resolution, while a route-level default skips past such models — the same
* posture as the route-level `reasoning` default, which also must not fail
* models it does not fit.
* @param provider - provider route key, for diagnostics.
* @param entry - the configured model entry.
* @param route - the route-level switches, when any.
* @param base - the installed catalog entry of the same id, when one exists.
* @param api - the model's resolved wire protocol.
* @returns a `compat` field to spread into the model, or nothing.
*/
function resolveModelCompat(provider, entry, route, base, api) {
	const thinkingFormat = entry.compat?.thinkingFormat ?? route?.thinkingFormat;
	const supportsReasoningEffort = entry.compat?.supportsReasoningEffort ?? route?.supportsReasoningEffort;
	if (thinkingFormat === void 0 && supportsReasoningEffort === void 0) return {};
	if (api !== "openai-completions") {
		if (entry.compat?.thinkingFormat !== void 0 || entry.compat?.supportsReasoningEffort !== void 0) invalid(provider, `model "${entry.id}" sets compat reasoning switches, but its api is "${api}"; thinkingFormat and supportsReasoningEffort exist only on openai-completions`);
		return {};
	}
	return { compat: {
		...base?.api === api ? base.compat : void 0,
		...thinkingFormat === void 0 ? {} : { thinkingFormat },
		...supportsReasoningEffort === void 0 ? {} : { supportsReasoningEffort }
	} };
}
/**
* Materialize one route's catalog by merging the installed catalog defaults
* under the configured entries. A route with no configured `models` serves the
* installed catalog unchanged, which is what keeps an existing
* `providers: { deepseek: { apiKeyEnv: … } }` profile working untouched.
* @param request - the route-level catalog facts.
* @returns the materialized models and the explicitly configured request caps.
*/
function resolveRouteModels(request) {
	const { provider } = request;
	const defaults = catalogModels(provider);
	const providerBaseUrl = catalogProvider(provider)?.baseUrl;
	const configured = request.models ?? [];
	const overrides = request.modelOverrides ?? {};
	for (const [id, override] of Object.entries(overrides)) {
		if (id.length === 0) invalid(provider, "has a modelOverrides entry with an empty model id");
		if (defaults.size === 0) invalid(provider, `sets modelOverrides for "${id}", but the installed catalog does not describe this route; a declared route spells every model out in its models list`);
		if (configured.length > 0) invalid(provider, `sets modelOverrides for "${id}" beside a models list; models already replaces the served catalog, so declare the fields on its entries`);
		if (!defaults.has(id)) invalid(provider, `modelOverrides names "${id}", which the installed catalog does not describe`);
		if ("id" in override) invalid(provider, `modelOverrides entry "${id}" sets "id", which is the dict key`);
	}
	const entries = configured.length > 0 ? configured : [...defaults.values()].map((model) => ({
		id: model.id,
		...overrides[model.id]
	}));
	if (entries.length === 0) invalid(provider, "resolves no models; the installed catalog does not describe this route, so its models must be listed in configuration");
	const routeApi = sharedCatalogApi(defaults);
	const routeCompatDefined = request.compat?.thinkingFormat !== void 0 || request.compat?.supportsReasoningEffort !== void 0;
	const seen = /* @__PURE__ */ new Set();
	const configuredMaxTokens = /* @__PURE__ */ new Map();
	const models = entries.map((entry) => {
		if (entry.id.length === 0) invalid(provider, "has a model with an empty id");
		if (seen.has(entry.id)) invalid(provider, `lists model "${entry.id}" more than once`);
		seen.add(entry.id);
		const base = defaults.get(entry.id);
		const api = request.api ?? base?.api ?? routeApi;
		if (api === void 0) invalid(provider, `model "${entry.id}" needs an api; the installed catalog does not describe it, so set the route's api to the wire protocol its endpoint speaks`);
		const baseUrl = request.baseURL ?? base?.baseUrl ?? providerBaseUrl;
		if (baseUrl === void 0) invalid(provider, `model "${entry.id}" needs a baseURL; the installed catalog does not describe this route`);
		const contextWindow = entry.contextWindow ?? base?.contextWindow ?? request.defaultContextWindow;
		if (!Number.isInteger(contextWindow) || contextWindow <= 0) invalid(provider, `model "${entry.id}" contextWindow must be a positive integer`);
		const maxTokens = entry.maxTokens ?? base?.maxTokens ?? request.defaultMaxTokens;
		if (!Number.isInteger(maxTokens) || maxTokens <= 0) invalid(provider, `model "${entry.id}" maxTokens must be a positive integer`);
		if (entry.maxTokens !== void 0) configuredMaxTokens.set(entry.id, entry.maxTokens);
		return {
			...base,
			id: entry.id,
			name: entry.name ?? base?.name ?? entry.id,
			api,
			provider,
			baseUrl,
			input: declaredInput(entry.input) ?? base?.input ?? [...request.defaultInput],
			cost: base?.cost ?? NO_COST,
			contextWindow,
			maxTokens,
			...resolveModelReasoning(provider, entry, base),
			...resolveModelCompat(provider, entry, request.compat, base, api)
		};
	});
	if (routeCompatDefined && !models.some((model) => model.api === "openai-completions")) invalid(provider, "sets compat reasoning switches, but no model on the route speaks openai-completions; thinkingFormat and supportsReasoningEffort exist only on that protocol");
	return {
		models,
		configuredMaxTokens
	};
}
//#endregion
//#region src/provider.ts
/**
* Construction of the pi-ai `Provider` that one configured route registers into
* the adapter's `Models` collection.
*
* Two constructions, one decision: a route the installed catalog ships, whose
* profile does not override the wire protocol, **reuses that catalog provider**
* with its models replaced — the catalog provider owns API implementations this
* package cannot reconstruct (Bedrock loads its Smithy module through a
* separate entry point), so rebuilding it from parts would silently narrow
* which providers work. Every other route — one pi-ai has never heard of, or a
* catalog route pointed at a different protocol — is built by `createProvider`
* over the protocol table below.
*
* Credentials never reach this module's storage: the harness resolves a route's
* key through `ctx.credentials` before the request enters pi-ai and hands it
* over as a stream option, which `Models` presents to `resolve()` as the
* credential key.
*
* @module dsh-llm-pi-ai/provider
*/
/**
* Wire protocols a configured route may name, mapped to pi-ai's lazily loaded
* implementations. Each entry is the factory that pi-ai's matching provider
* factory uses, so a hand-declared route reaches exactly the implementation a
* catalog route would.
*
* The table is deliberately narrow: the protocols a hand-declared route
* actually reaches for today, each completely describable with a key, an
* endpoint, and headers. Bedrock signs with SigV4 over AWS credentials and a
* region, Vertex needs a project, a location, and application-default
* credentials, Azure needs provider environment plus an api-version, and Codex
* authenticates through OAuth — none of which this configuration shape can
* express, so offering them would hand back a provider that cannot
* authenticate. The remainder are absent for want of a consumer rather than a
* blocker: each is one line here once a deployment needs it. Catalog routes
* still reach every protocol through their own provider; only an explicit
* override is refused.
*/
const PROTOCOLS = {
	"openai-completions": openAICompletionsApi,
	"openai-responses": openAIResponsesApi,
	"anthropic-messages": anthropicMessagesApi
};
/**
* Every wire protocol a configured route may name, most-reached first. The
* order is the table's and therefore stable; a configuration surface offering
* a choice presents the first as its default, which is why the protocol a
* hand-declared gateway most often speaks — and the one endpoint interrogation
* can read — leads.
* @returns the supported protocol identifiers.
*/
function supportedProtocols() {
	return Object.keys(PROTOCOLS);
}
/**
* Api-key auth for a route the harness authenticates itself. `Models` calls
* this after the adapter has already resolved the route's credential, so a
* missing key here is not this layer's failure: a named-but-unresolvable
* reference has already failed the request with `MISSING_CREDENTIAL`, and a
* route naming no credential at all is deliberately unauthenticated. Reporting
* it as configured hands the decision to the protocol, which is where the
* requirement actually lives — pi-ai's OpenAI-compatible implementation, for
* one, still insists on a key or an `Authorization` header of its own.
* @param name - display name used as the resolution's status label.
* @returns the api-key auth for a harness-authenticated route.
*/
function harnessApiKeyAuth(name) {
	return {
		name,
		resolve: ({ credential }) => Promise.resolve({
			auth: credential?.key === void 0 ? {} : { apiKey: credential.key },
			source: name
		})
	};
}
/**
* The auth one route resolves its credential through.
*
* A catalog route keeps the installed provider's own auth, which is what
* preserves provider-native ambient discovery for a profile naming no
* credential. That holds even when the profile repoints the protocol: which
* environment a provider reads is a property of the provider, not of the wire
* format its models speak.
*
* The single addition covers a catalog provider that offers no api-key method
* at all. pi-ai resolves a request's `apiKey` override only when the provider
* declares one (`resolveProviderAuth` checks `provider.auth.apiKey` before
* honouring the override), so an OAuth-only provider — `openai-codex` is the
* one the installed catalog ships — would refuse a profile's explicit key with
* `Provider is not configured` before any request went out. Adding the harness
* method beside the provider's own restores that route. A keyless profile adds
* nothing and still reports the honest refusal, because this adapter resolves
* credentials through its own seam and holds no OAuth store to fall back on.
* @param spec - the resolved route facts.
* @param catalog - the installed catalog provider, when pi-ai ships one.
* @returns the auth to construct this route's provider with.
*/
function routeAuth(spec, catalog) {
	if (catalog === void 0) return { apiKey: harnessApiKeyAuth(spec.displayName) };
	if (catalog.auth.apiKey !== void 0 || !spec.namesCredential) return catalog.auth;
	return {
		...catalog.auth,
		apiKey: harnessApiKeyAuth(spec.displayName)
	};
}
/**
* Reuse an installed catalog provider with this route's models and identity.
* Model dispatch stays with the catalog provider, so its API implementations,
* compatibility quirks, and ambient credential discovery are preserved exactly.
* Catalog-owned dynamic refresh is dropped: this route's catalog is the
* settings document, and a background refresh would contradict it.
*/
function reuseCatalogProvider(base, spec) {
	const baseUrl = spec.baseURL ?? base.baseUrl;
	return {
		id: spec.provider,
		name: spec.displayName,
		...baseUrl === void 0 ? {} : { baseUrl },
		auth: routeAuth(spec, base),
		getModels: () => spec.models,
		stream: (model, context, options) => base.stream(model, context, options),
		streamSimple: (model, context, options) => base.streamSimple(model, context, options)
	};
}
/**
* Build the pi-ai provider for one resolved route.
* @param spec - the resolved route facts.
* @returns the provider to register in the adapter's `Models` collection.
* @throws Error when the route names a wire protocol this build cannot serve.
*/
function buildProvider(spec) {
	const catalog = catalogProvider(spec.provider);
	if (catalog !== void 0 && spec.api === void 0) return reuseCatalogProvider(catalog, spec);
	const factory = spec.api === void 0 ? void 0 : PROTOCOLS[spec.api];
	if (factory === void 0) throw new Error(`llm-pi-ai: provider "${spec.provider}" names api "${spec.api}", which this build cannot serve; supported protocols are ${supportedProtocols().join(", ")}`);
	return createProvider({
		id: spec.provider,
		name: spec.displayName,
		...spec.baseURL === void 0 ? {} : { baseUrl: spec.baseURL },
		auth: routeAuth(spec, catalog),
		models: spec.models,
		api: factory()
	});
}
//#endregion
//#region src/config.ts
/** Default maximum idle interval while an adapter stream read is outstanding. */
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 3e5;
/** Context capacity assumed for a model neither configuration nor the catalog sizes. */
const DEFAULT_CONTEXT_WINDOW = 262144;
/** Output capability assumed for a model neither configuration nor the catalog sizes. */
const DEFAULT_MAX_TOKENS = 32768;
/**
* Modalities assumed for a model neither configuration nor the catalog
* declares. Text is the floor every supported protocol certainly carries, so
* this is the absence of a declaration rather than a guess at the endpoint:
* nothing can interrogate a gateway for its modalities, and the two wrong
* answers do not cost the same. Under-claiming refuses the image before it is
* attached, naming the model. Over-claiming admits one the provider then
* rejects mid-turn, after the message is durable, leaving the session
* repeating a request that cannot succeed.
*/
const DEFAULT_INPUT = ["text"];
/** Default local proxy port when none has been selected yet. */
const DEFAULT_LOCAL_ROUTE_PORT = 8317;
const thinkingBudgets = z.object({
	minimal: z.number(),
	low: z.number(),
	medium: z.number(),
	high: z.number()
});
const compatProfile = z.object({
	thinkingFormat: z.union(SUPPORTED_THINKING_FORMATS),
	supportsReasoningEffort: z.boolean()
});
/**
* Keys are the offered levels, values their wire spellings. A valueless key
* (`off:`) survives validation because schemastery passes nullable data
* through before any member schema runs — `z.const(null)` only controls the
* error for non-null wrong values and what a configuration UI renders.
* Only resolution decides which levels may leave the value empty, so the
* diagnostic can name the route and model. The assertion narrows
* schemastery's `Dict`, which types every literal key as required; dict
* validation checks only present keys, so the runtime value is a partial record.
*/
const reasoningEfforts = z.dict(z.union([z.string(), z.const(null)]), z.union(THINKING_LEVELS));
/** The fields a `models` entry and a `modelOverrides` value share; only the id's home differs. */
const modelFields = {
	name: z.string(),
	contextWindow: z.number().step(1).min(1),
	maxTokens: z.number().step(1).min(1),
	input: z.array(z.union(MODALITIES)),
	reasoningEfforts: z.union([z.const(false), reasoningEfforts]),
	compat: compatProfile
};
const modelProfile = z.object({
	id: z.string().required(),
	...modelFields
});
/** A {@link modelProfile} whose id lives in the `modelOverrides` dict key. */
const modelOverride = z.object(modelFields);
const profile = z.object({
	apiKeyEnv: z.string().role("credential-ref"),
	displayName: z.string(),
	api: z.union(supportedProtocols()),
	inboundApi: z.union(supportedProtocols()),
	baseURL: z.string(),
	models: z.array(modelProfile),
	modelOverrides: z.dict(modelOverride),
	compat: compatProfile,
	defaultContextWindow: z.number().step(1).min(1).default(DEFAULT_CONTEXT_WINDOW),
	defaultMaxTokens: z.number().step(1).min(1).default(DEFAULT_MAX_TOKENS),
	defaultInput: z.array(z.union(MODALITIES)).default([...DEFAULT_INPUT]),
	headers: z.dict(z.string()),
	bodyOverrides: z.dict(z.any()),
	reasoning: z.union(THINKING_LEVELS),
	thinkingBudgets,
	cacheRetention: z.union([
		"none",
		"short",
		"long"
	]),
	transport: z.union([
		"sse",
		"websocket",
		"websocket-cached",
		"auto"
	]),
	timeoutMs: z.natural(),
	websocketConnectTimeoutMs: z.natural(),
	streamIdleTimeoutMs: z.number().min(Number.MIN_VALUE).max(MAX_TIMER_DELAY_MS).default(DEFAULT_STREAM_IDLE_TIMEOUT_MS),
	retryPolicy: RetryPolicySchema
});
/** Runtime schema for {@link Config}. */
const Config = z.object({
	providers: z.dict(profile).default({}),
	localRoute: z.object({
		enabled: z.boolean().default(false),
		port: z.number().step(1).min(1024).max(65535).default(DEFAULT_LOCAL_ROUTE_PORT)
	}).default({
		enabled: false,
		port: DEFAULT_LOCAL_ROUTE_PORT
	})
});
/**
* Reject a section this adapter could not serve. Registered as the settings
* namespace's validator, so an unserviceable profile is refused where it is
* *written* — `settings.mutate` answers `settings-rejected` with the offending
* route and model named — instead of being stored and then quietly disabling
* every route in the namespace. It stays a validator rather than a schema
* transform because the schema is also the shape a configuration surface
* renders and the value an absent section resolves to; wrapping it would break
* both.
* @param config - the resolved section to check.
* @throws Error naming the route and model that cannot be served.
*/
function assertServiceable(config) {
	resolveProfiles(config.providers);
}
/** Reject removed pre-release profile fields and name their replacements. */
function rejectRemovedFields(provider, source) {
	const legacy = source;
	if ("provider" in legacy) throw new Error(`llm-pi-ai: provider "${provider}" sets "provider", which moved to the providers dict key`);
	if ("maxRetries" in legacy || "maxRetryDelayMs" in legacy) throw new Error(`llm-pi-ai: provider "${provider}" sets maxRetries or maxRetryDelayMs, which were removed; compose agent recovery with dsh-llm-retry`);
}
/**
* Validate profiles and return a detached route-keyed map suitable for
* per-request reads. This is the one explicit resolve step, so an omitted dict
* resolves to the empty (dormant) route set here rather than through a hidden
* fallback, and each route's models and pi-ai provider are materialized once.
* @param providers - configured provider profiles keyed by route.
* @returns validated profiles in configuration order.
*/
function resolveProfiles(providers) {
	if (Array.isArray(providers)) throw new Error("llm-pi-ai: providers is now a dict keyed by provider route, not an array of profiles");
	const entries = Object.entries(providers ?? {});
	const resolved = /* @__PURE__ */ new Map();
	for (const [provider, source] of entries) {
		rejectRemovedFields(provider, source);
		if (provider.length === 0) throw new Error("llm-pi-ai: provider names must be non-empty");
		if (source.baseURL !== void 0 && source.baseURL.length === 0) throw new Error(`llm-pi-ai: provider "${provider}" has an empty baseURL`);
		if (source.displayName !== void 0 && source.displayName.length === 0) throw new Error(`llm-pi-ai: provider "${provider}" has an empty displayName`);
		const streamIdleTimeoutMs = source.streamIdleTimeoutMs ?? 3e5;
		if (!Number.isFinite(streamIdleTimeoutMs) || streamIdleTimeoutMs <= 0 || streamIdleTimeoutMs > MAX_TIMER_DELAY_MS) throw new Error(`llm-pi-ai: provider "${provider}" streamIdleTimeoutMs must be a positive finite number no greater than ${MAX_TIMER_DELAY_MS}`);
		const defaultInput = [...source.defaultInput ?? DEFAULT_INPUT];
		if (defaultInput.length === 0) throw new Error(`llm-pi-ai: provider "${provider}" defaultInput must name at least one modality`);
		const displayName = source.displayName ?? provider;
		const catalog = resolveRouteModels({
			provider,
			...source.api === void 0 ? {} : { api: source.api },
			...source.baseURL === void 0 ? {} : { baseURL: source.baseURL },
			...source.models === void 0 ? {} : { models: source.models },
			...source.modelOverrides === void 0 ? {} : { modelOverrides: source.modelOverrides },
			...source.compat === void 0 ? {} : { compat: source.compat },
			defaultInput,
			defaultContextWindow: source.defaultContextWindow ?? 262144,
			defaultMaxTokens: source.defaultMaxTokens ?? 32768
		});
		const { apiKeyEnv, retryPolicy, models: _models, displayName: _displayName, ...rest } = source;
		resolved.set(provider, {
			...rest,
			provider,
			displayName,
			...apiKeyEnv === void 0 ? {} : { apiKeyEnv: credentialRef(apiKeyEnv) },
			streamIdleTimeoutMs,
			retryPolicy: resolveRetryPolicy(retryPolicy, `llm-pi-ai: provider "${provider}" retryPolicy`),
			...rest.headers === void 0 ? {} : { headers: { ...rest.headers } },
			...rest.thinkingBudgets === void 0 ? {} : { thinkingBudgets: { ...rest.thinkingBudgets } },
			configuredMaxTokens: catalog.configuredMaxTokens,
			piProvider: buildProvider({
				provider,
				displayName,
				...source.api === void 0 ? {} : { api: source.api },
				...source.baseURL === void 0 ? {} : { baseURL: source.baseURL },
				models: catalog.models,
				namesCredential: apiKeyEnv !== void 0
			})
		});
	}
	return resolved;
}
//#endregion
//#region src/discovery.ts
/**
* Answering "which models can this provider serve?" for the configuration
* surface's "fetch available models" action.
*
* A route the installed pi-ai catalog ships is answered **from that catalog**,
* with no network call at all: pi-ai's registry is the authoritative list for
* its own providers, and it carries the capacities a listing endpoint would
* not disclose. Only a route the catalog does not describe — a gateway, a
* self-hosted server — is interrogated over the wire.
*
* Neither path is a catalog refresh. Nothing here is stored: the request
* carries a draft the user is still editing, and the reply is candidate
* metadata the surface offers for adoption. `settings.yaml` remains the only
* thing that decides what a route serves.
*
* Only OpenAI-compatible protocols are interrogated. Their listing is the one
* shape a gateway, a self-hosted server, and the official endpoints all agree
* on, which is the case this action exists for; every other protocol reports
* that it cannot be interrogated so the surface falls back to hand-entry
* rather than guessing a response shape.
*
* @module dsh-llm-pi-ai/discovery
*/
/**
* Protocols whose model listing this module can read: the two that speak
* OpenAI's `GET /models` shape with bearer auth. Azure is absent despite its
* OpenAI lineage — it authenticates with an `api-key` header and requires an
* `api-version` query — and Codex authenticates through OAuth; guessing at
* either would report an authentication failure as a provider with no models.
* pi-ai's remaining protocols are absent for the same reason.
*/
const LISTABLE_PROTOCOLS = /* @__PURE__ */ new Set(["openai-completions", "openai-responses"]);
/**
* Endpoint replies larger than this are refused. The endpoint is whatever URL
* the user typed, so the ceiling holds on the bytes actually read rather than
* on the length the server claims — the same two-stage shape `dsh-web-fetch`
* uses for its own caller-supplied URLs, except that a truncated model listing
* is not parseable, so overflow rejects instead of truncating.
*/
const MAX_RESPONSE_BYTES = 4194304;
/** A positive integer field of a listing entry, or `undefined` when absent or unusable. */
function capacity(...candidates) {
	for (const candidate of candidates) if (typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0) return candidate;
}
/** A non-empty string field of a listing entry, or `undefined`. */
function label(...candidates) {
	for (const candidate of candidates) if (typeof candidate === "string" && candidate.length > 0) return candidate;
}
/**
* Join the endpoint base with the listing path. The base is treated as a
* prefix rather than a URL to resolve against, so a deployment path such as
* `https://gateway.example/openai/v1` keeps its segments instead of losing
* them to `URL` resolution.
*/
function listingUrl(baseURL) {
	return `${baseURL.replace(/\/+$/, "")}/models`;
}
/**
* Read a reply body, refusing one that outgrows the ceiling. A declared length
* is checked first so an honest server is turned away without transferring
* anything; the accumulated total is what actually enforces the bound, because
* a server that under-declares (or streams) tells us nothing up front.
*/
async function readBounded(response, url) {
	const oversized = () => new LlmError(`${url} answered with more than ${MAX_RESPONSE_BYTES} bytes`, "DISCOVERY_FAILED");
	const declared = Number(response.headers.get("content-length") ?? NaN);
	if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
		await response.body?.cancel();
		throw oversized();
	}
	/* v8 ignore next -- fetch always exposes a body stream on a 2xx Response; the null guard is defensive. */
	if (response.body === null) return "";
	const reader = response.body.getReader();
	const chunks = [];
	let total = 0;
	try {
		for (;;) {
			const { done, value } = await reader.read();
			if (done) break;
			total += value.byteLength;
			if (total > MAX_RESPONSE_BYTES) throw oversized();
			chunks.push(value);
		}
	} finally {
		/* v8 ignore next 4 -- cancel() after a completed or abandoned read settles without rejecting; unobserved best-effort cleanup. */
		await reader.cancel().catch(() => {});
	}
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(body);
}
/**
* Read one OpenAI-compatible listing reply. Entries without a usable id are
* skipped rather than failing the whole interrogation: a single malformed row
* should not deny the user the rest of a working endpoint's catalog.
*/
function readListing(body) {
	const data = body?.data;
	if (!Array.isArray(data)) throw new LlmError("the endpoint's model listing has no \"data\" array; enter this provider's models by hand", "DISCOVERY_FAILED");
	const models = [];
	for (const raw of data) {
		const entry = raw;
		const id = label(entry?.id);
		if (id === void 0) continue;
		const name = label(entry?.name, entry?.display_name);
		const contextWindow = capacity(entry?.context_window, entry?.context_length);
		const maxTokens = capacity(entry?.max_output_tokens, entry?.max_tokens);
		models.push({
			id,
			...name === void 0 ? {} : { name },
			...contextWindow === void 0 ? {} : { contextWindow },
			...maxTokens === void 0 ? {} : { maxTokens }
		});
	}
	return models;
}
/**
* Accept one probe key, or refuse it before the header is built. Without this
* the `fetch` below would throw a ByteString `TypeError` that this function's
* catch reports as `could not reach <url>` — blaming the network for a local,
* deterministic fault.
* @param raw - the key typed into the form or read from storage.
* @returns the trimmed, usable key.
*/
function usableProbeKey(raw) {
	const checked = normalizeApiKey(raw);
	if (checked.ok) return checked.value;
	throw new LlmError(checked.reason === "empty" ? "this provider's API key is blank; enter it on the Models page, or clear it to probe unauthenticated" : "this provider's API key contains characters no HTTP header can carry; paste the raw key only", INVALID_CREDENTIAL_CODE);
}
/**
* Interrogate one draft provider endpoint for the models it advertises.
* @param request - the endpoint, protocol, and one-shot credential to use.
* @param storedApiKey - the credential the named route already stored, asked
*   for only when the draft carries none and only on the path that reaches the
*   network. A configuration surface never holds a stored secret — it edits a
*   redacted descriptor — so without this an already-configured route would be
*   interrogated unauthenticated and answer 401.
* @returns the advertised models in endpoint order.
* @throws LlmError when the protocol has no readable listing, the endpoint
*   refuses or fails the request, or the reply is not a model listing.
*/
async function discoverModels(request, storedApiKey) {
	if (request.provider !== void 0) {
		const installed = catalogModels(request.provider);
		if (installed.size > 0) return [...installed.values()].map((model) => ({
			id: model.id,
			name: model.name,
			contextWindow: model.contextWindow,
			maxTokens: model.maxTokens
		}));
	}
	if (request.baseURL === void 0 || request.baseURL.length === 0) throw new LlmError(`pi-ai ships no catalog for provider "${request.provider ?? ""}", so its models can only come from its endpoint; set a baseURL, or enter this provider's models by hand`, "DISCOVERY_FAILED");
	const api = request.api ?? "openai-completions";
	if (!LISTABLE_PROTOCOLS.has(api)) throw new LlmError(`pi-ai protocol "${api}" has no model listing this build can read; enter this provider's models by hand`, "DISCOVERY_UNSUPPORTED");
	const url = listingUrl(request.baseURL);
	const supplied = request.apiKey ?? await storedApiKey?.();
	const apiKey = supplied === void 0 ? void 0 : usableProbeKey(supplied);
	let response;
	try {
		response = await fetch(url, {
			method: "GET",
			headers: {
				accept: "application/json",
				...apiKey === void 0 ? {} : { authorization: `Bearer ${apiKey}` },
				...attributionHeaders()
			},
			...request.signal === void 0 ? {} : { signal: request.signal }
		});
	} catch (error) {
		if (request.signal?.aborted) throw new LlmError("model discovery aborted by caller", "ABORTED", { cause: error });
		throw new LlmError(`could not reach ${url}`, "DISCOVERY_FAILED", { cause: error });
	}
	if (!response.ok) throw new LlmError(`${url} answered ${response.status}${response.status === 401 || response.status === 403 ? "; check the API key" : ""}`, "DISCOVERY_FAILED");
	let text;
	try {
		text = await readBounded(response, url);
	} catch (error) {
		if (request.signal?.aborted) throw new LlmError("model discovery aborted by caller", "ABORTED", { cause: error });
		throw error;
	}
	let body;
	try {
		body = JSON.parse(text);
	} catch (error) {
		throw new LlmError(`${url} did not answer with JSON`, "DISCOVERY_FAILED", { cause: error });
	}
	return readListing(body);
}
//#endregion
//#region src/local-route.ts
/** Loopback HTTP proxy and protocol conversion for configured pi-ai routes. */
const HOST = "127.0.0.1";
const MAX_BODY_BYTES = 10485760;
const SELECTOR_HEADER = "x-dsh-provider";
const PROTOCOL_PATHS = {
	"openai-completions": "/v1/chat/completions",
	"openai-responses": "/v1/responses",
	"anthropic-messages": "/v1/messages"
};
/**
* A request this route refuses before any upstream call.
*
* Carries the status the caller sees, so a request naming a model no route
* serves is not reported as an upstream failure: the two demand opposite
* responses — fix the request, or retry against a recovered upstream. Every
* other throw on the request path reaches the caller as `502`.
*/
var LocalRouteRequestError = class extends Error {
	status;
	constructor(message, status) {
		super(message);
		this.status = status;
		this.name = "LocalRouteRequestError";
	}
};
function isRecord(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function protocolOfPath(pathname) {
	return Object.entries(PROTOCOL_PATHS).find(([, path]) => path === pathname)?.[0];
}
function isLocalRouteProtocol(value) {
	return value === "openai-completions" || value === "openai-responses" || value === "anthropic-messages";
}
function scalarText(value, fallback = "") {
	if (typeof value === "string") return value;
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	return fallback;
}
function jsonText(value, fallback = "{}") {
	if (typeof value === "string") return value;
	if (value === void 0) return fallback;
	const encoded = JSON.stringify(value);
	return typeof encoded === "string" ? encoded : fallback;
}
function textOf(value) {
	if (typeof value === "string") return value;
	if (!Array.isArray(value)) return "";
	return value.flatMap((part) => {
		if (!isRecord(part)) return [];
		const text = part["text"] ?? part["input_text"] ?? part["output_text"];
		return typeof text === "string" ? [text] : [];
	}).join("");
}
function openAIContent(value) {
	if (typeof value === "string") return value;
	if (!Array.isArray(value)) return value;
	return value.map((part) => {
		if (!isRecord(part)) return part;
		if (part["type"] === "text" && typeof part["text"] === "string") return {
			type: "text",
			text: part["text"]
		};
		if (part["type"] === "image" && isRecord(part["source"])) {
			const source = part["source"];
			return {
				type: "image_url",
				image_url: { url: source["type"] === "base64" ? `data:${scalarText(source["media_type"], "application/octet-stream")};base64,${scalarText(source["data"])}` : source["url"] }
			};
		}
		if (part["type"] === "input_text" || part["type"] === "output_text") return {
			type: "text",
			text: part["text"]
		};
		if (part["type"] === "input_image") return {
			type: "image_url",
			image_url: { url: part["image_url"] }
		};
		return part;
	});
}
function anthropicContent(value) {
	if (typeof value === "string") return [{
		type: "text",
		text: value
	}];
	if (!Array.isArray(value)) return [{
		type: "text",
		text: scalarText(value)
	}];
	return value.map((part) => {
		if (!isRecord(part)) return {
			type: "text",
			text: scalarText(part)
		};
		if (part["type"] === "text" || part["type"] === "tool_use" || part["type"] === "tool_result") return part;
		if (part["type"] === "image_url" && isRecord(part["image_url"])) {
			const url = part["image_url"]["url"];
			if (typeof url === "string" && url.startsWith("data:")) {
				const match = /^data:([^;,]+);base64,(.*)$/.exec(url);
				if (match !== null) return {
					type: "image",
					source: {
						type: "base64",
						media_type: match[1],
						data: match[2]
					}
				};
			}
			return {
				type: "image",
				source: {
					type: "url",
					url
				}
			};
		}
		return {
			type: "text",
			text: textOf([part])
		};
	});
}
function responsesContent(value) {
	if (typeof value === "string") return [{
		type: "input_text",
		text: value
	}];
	if (!Array.isArray(value)) return [{
		type: "input_text",
		text: scalarText(value)
	}];
	return value.map((part) => {
		if (!isRecord(part)) return {
			type: "input_text",
			text: scalarText(part)
		};
		if (part["type"] === "text") return {
			type: "input_text",
			text: part["text"]
		};
		if (part["type"] === "image_url" && isRecord(part["image_url"])) return {
			type: "input_image",
			image_url: part["image_url"]["url"]
		};
		return part;
	});
}
/** Convert one supported request into OpenAI Chat Completions as an intermediate form. */
function requestToChat(protocol, body) {
	if (protocol === "openai-completions") return { ...body };
	if (protocol === "anthropic-messages") {
		const messages = [];
		if (body["system"] !== void 0) messages.push({
			role: "system",
			content: openAIContent(body["system"])
		});
		for (const item of Array.isArray(body["messages"]) ? body["messages"] : []) {
			if (!isRecord(item)) continue;
			const blocks = Array.isArray(item["content"]) ? item["content"] : [item["content"]];
			const toolResults = blocks.filter((block) => isRecord(block) && block["type"] === "tool_result");
			for (const result of toolResults) {
				if (!isRecord(result)) continue;
				messages.push({
					role: "tool",
					tool_call_id: result["tool_use_id"],
					content: textOf(result["content"])
				});
			}
			const normal = blocks.filter((block) => !(isRecord(block) && block["type"] === "tool_result"));
			if (normal.length === 0) continue;
			const toolCalls = normal.flatMap((block) => {
				if (!isRecord(block) || block["type"] !== "tool_use") return [];
				return [{
					id: block["id"],
					type: "function",
					function: {
						name: block["name"],
						arguments: JSON.stringify(block["input"] ?? {})
					}
				}];
			});
			const contentBlocks = normal.filter((block) => !(isRecord(block) && block["type"] === "tool_use"));
			messages.push({
				role: item["role"],
				content: openAIContent(contentBlocks),
				...toolCalls.length === 0 ? {} : { tool_calls: toolCalls }
			});
		}
		const tools = Array.isArray(body["tools"]) ? body["tools"].filter(isRecord).map((tool) => ({
			type: "function",
			function: {
				name: tool["name"],
				description: tool["description"],
				parameters: tool["input_schema"]
			}
		})) : void 0;
		return {
			model: body["model"],
			messages,
			...body["max_tokens"] === void 0 ? {} : { max_tokens: body["max_tokens"] },
			...body["temperature"] === void 0 ? {} : { temperature: body["temperature"] },
			...body["top_p"] === void 0 ? {} : { top_p: body["top_p"] },
			...body["stop_sequences"] === void 0 ? {} : { stop: body["stop_sequences"] },
			...body["stream"] === void 0 ? {} : { stream: body["stream"] },
			...tools === void 0 ? {} : { tools },
			...body["tool_choice"] === void 0 ? {} : { tool_choice: body["tool_choice"] },
			...body["metadata"] === void 0 ? {} : { metadata: body["metadata"] }
		};
	}
	const messages = [];
	if (body["instructions"] !== void 0) messages.push({
		role: "system",
		content: body["instructions"]
	});
	const input = body["input"];
	if (typeof input === "string") messages.push({
		role: "user",
		content: input
	});
	for (const item of Array.isArray(input) ? input : []) {
		if (!isRecord(item)) continue;
		if (item["type"] === "function_call_output") messages.push({
			role: "tool",
			tool_call_id: item["call_id"],
			content: item["output"]
		});
		else if (item["type"] === "function_call") messages.push({
			role: "assistant",
			content: null,
			tool_calls: [{
				id: item["call_id"],
				type: "function",
				function: {
					name: item["name"],
					arguments: item["arguments"]
				}
			}]
		});
		else messages.push({
			role: item["role"] ?? "user",
			content: openAIContent(item["content"])
		});
	}
	const tools = Array.isArray(body["tools"]) ? body["tools"].filter(isRecord).map((tool) => tool["type"] === "function" ? {
		type: "function",
		function: {
			name: tool["name"],
			description: tool["description"],
			parameters: tool["parameters"]
		}
	} : tool) : void 0;
	return {
		model: body["model"],
		messages,
		...body["max_output_tokens"] === void 0 ? {} : { max_tokens: body["max_output_tokens"] },
		...body["temperature"] === void 0 ? {} : { temperature: body["temperature"] },
		...body["top_p"] === void 0 ? {} : { top_p: body["top_p"] },
		...body["stream"] === void 0 ? {} : { stream: body["stream"] },
		...tools === void 0 ? {} : { tools },
		...body["tool_choice"] === void 0 ? {} : { tool_choice: body["tool_choice"] },
		...body["metadata"] === void 0 ? {} : { metadata: body["metadata"] }
	};
}
/** Convert the intermediate Chat request to the selected upstream protocol. */
function requestFromChat(protocol, chat, defaultMaxTokens) {
	if (protocol === "openai-completions") return { ...chat };
	const sourceMessages = Array.isArray(chat["messages"]) ? chat["messages"].filter(isRecord) : [];
	const system = sourceMessages.filter((message) => message["role"] === "system").map((message) => textOf(message["content"])).join("\n\n");
	const messages = sourceMessages.filter((message) => message["role"] !== "system");
	if (protocol === "anthropic-messages") {
		const converted = messages.map((message) => {
			if (message["role"] === "tool") return {
				role: "user",
				content: [{
					type: "tool_result",
					tool_use_id: message["tool_call_id"],
					content: message["content"]
				}]
			};
			const content = anthropicContent(message["content"]);
			const toolCalls = Array.isArray(message["tool_calls"]) ? message["tool_calls"].filter(isRecord) : [];
			for (const call of toolCalls) {
				const fn = isRecord(call["function"]) ? call["function"] : {};
				let input = {};
				try {
					input = JSON.parse(jsonText(fn["arguments"]));
				} catch {
					input = { raw: fn["arguments"] };
				}
				content.push({
					type: "tool_use",
					id: call["id"],
					name: fn["name"],
					input
				});
			}
			return {
				role: message["role"] === "assistant" ? "assistant" : "user",
				content
			};
		});
		const tools = Array.isArray(chat["tools"]) ? chat["tools"].filter(isRecord).map((tool) => {
			const fn = isRecord(tool["function"]) ? tool["function"] : {};
			return {
				name: fn["name"],
				description: fn["description"],
				input_schema: fn["parameters"]
			};
		}) : void 0;
		return {
			model: chat["model"],
			messages: converted,
			max_tokens: chat["max_completion_tokens"] ?? chat["max_tokens"] ?? defaultMaxTokens,
			...system.length === 0 ? {} : { system },
			...chat["temperature"] === void 0 ? {} : { temperature: chat["temperature"] },
			...chat["top_p"] === void 0 ? {} : { top_p: chat["top_p"] },
			...chat["stop"] === void 0 ? {} : { stop_sequences: chat["stop"] },
			...chat["stream"] === void 0 ? {} : { stream: chat["stream"] },
			...tools === void 0 ? {} : { tools },
			...chat["tool_choice"] === void 0 ? {} : { tool_choice: chat["tool_choice"] },
			...chat["metadata"] === void 0 ? {} : { metadata: chat["metadata"] }
		};
	}
	const input = messages.flatMap((message) => {
		if (message["role"] === "tool") return [{
			type: "function_call_output",
			call_id: message["tool_call_id"],
			output: message["content"]
		}];
		const toolCalls = Array.isArray(message["tool_calls"]) ? message["tool_calls"].filter(isRecord) : [];
		const entries = [];
		if (message["content"] !== void 0 && message["content"] !== null) entries.push({
			role: message["role"],
			content: responsesContent(message["content"])
		});
		for (const call of toolCalls) {
			const fn = isRecord(call["function"]) ? call["function"] : {};
			entries.push({
				type: "function_call",
				call_id: call["id"],
				name: fn["name"],
				arguments: fn["arguments"]
			});
		}
		return entries;
	});
	const tools = Array.isArray(chat["tools"]) ? chat["tools"].filter(isRecord).map((tool) => {
		const fn = isRecord(tool["function"]) ? tool["function"] : {};
		return {
			type: "function",
			name: fn["name"],
			description: fn["description"],
			parameters: fn["parameters"]
		};
	}) : void 0;
	return {
		model: chat["model"],
		input,
		...system.length === 0 ? {} : { instructions: system },
		...chat["max_completion_tokens"] === void 0 && chat["max_tokens"] === void 0 ? {} : { max_output_tokens: chat["max_completion_tokens"] ?? chat["max_tokens"] },
		...chat["temperature"] === void 0 ? {} : { temperature: chat["temperature"] },
		...chat["top_p"] === void 0 ? {} : { top_p: chat["top_p"] },
		...chat["stream"] === void 0 ? {} : { stream: chat["stream"] },
		...tools === void 0 ? {} : { tools },
		...chat["tool_choice"] === void 0 ? {} : { tool_choice: chat["tool_choice"] },
		...chat["metadata"] === void 0 ? {} : { metadata: chat["metadata"] }
	};
}
function usageNumber(value) {
	return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function responseToCanonical(protocol, body) {
	if (protocol === "openai-completions") {
		const choice = (Array.isArray(body["choices"]) ? body["choices"].filter(isRecord) : [])[0] ?? {};
		const message = isRecord(choice["message"]) ? choice["message"] : {};
		const usage = isRecord(body["usage"]) ? body["usage"] : {};
		const inputTokens = usageNumber(usage["prompt_tokens"]);
		const outputTokens = usageNumber(usage["completion_tokens"]);
		return {
			id: scalarText(body["id"], `chatcmpl-${Date.now()}`),
			model: scalarText(body["model"]),
			text: textOf(message["content"]),
			finishReason: typeof choice["finish_reason"] === "string" ? choice["finish_reason"] : null,
			toolCalls: (Array.isArray(message["tool_calls"]) ? message["tool_calls"].filter(isRecord) : []).map((call) => {
				const fn = isRecord(call["function"]) ? call["function"] : {};
				return {
					id: scalarText(call["id"]),
					name: scalarText(fn["name"]),
					arguments: jsonText(fn["arguments"])
				};
			}),
			...inputTokens === void 0 ? {} : { inputTokens },
			...outputTokens === void 0 ? {} : { outputTokens }
		};
	}
	if (protocol === "anthropic-messages") {
		const content = Array.isArray(body["content"]) ? body["content"].filter(isRecord) : [];
		const usage = isRecord(body["usage"]) ? body["usage"] : {};
		const inputTokens = usageNumber(usage["input_tokens"]);
		const outputTokens = usageNumber(usage["output_tokens"]);
		return {
			id: scalarText(body["id"], `msg_${Date.now()}`),
			model: scalarText(body["model"]),
			text: textOf(content),
			finishReason: body["stop_reason"] === "max_tokens" ? "length" : body["stop_reason"] === "tool_use" ? "tool_calls" : typeof body["stop_reason"] === "string" ? "stop" : null,
			toolCalls: content.filter((block) => block["type"] === "tool_use").map((block) => ({
				id: scalarText(block["id"]),
				name: scalarText(block["name"]),
				arguments: jsonText(block["input"])
			})),
			...inputTokens === void 0 ? {} : { inputTokens },
			...outputTokens === void 0 ? {} : { outputTokens }
		};
	}
	const output = Array.isArray(body["output"]) ? body["output"].filter(isRecord) : [];
	const usage = isRecord(body["usage"]) ? body["usage"] : {};
	const inputTokens = usageNumber(usage["input_tokens"]);
	const outputTokens = usageNumber(usage["output_tokens"]);
	const text = typeof body["output_text"] === "string" ? body["output_text"] : output.flatMap((item) => {
		const content = item["content"];
		return Array.isArray(content) ? content : [];
	}).map(textOf).join("");
	return {
		id: scalarText(body["id"], `resp_${Date.now()}`),
		model: scalarText(body["model"]),
		text,
		finishReason: body["status"] === "completed" ? "stop" : null,
		toolCalls: output.filter((item) => item["type"] === "function_call").map((item) => ({
			id: scalarText(item["call_id"] ?? item["id"]),
			name: scalarText(item["name"]),
			arguments: jsonText(item["arguments"])
		})),
		...inputTokens === void 0 ? {} : { inputTokens },
		...outputTokens === void 0 ? {} : { outputTokens }
	};
}
function canonicalToResponse(protocol, value) {
	if (protocol === "openai-completions") {
		const toolCalls = value.toolCalls.map((call) => ({
			id: call.id,
			type: "function",
			function: {
				name: call.name,
				arguments: call.arguments
			}
		}));
		return {
			id: value.id,
			object: "chat.completion",
			created: Math.floor(Date.now() / 1e3),
			model: value.model,
			choices: [{
				index: 0,
				message: {
					role: "assistant",
					content: value.text,
					...toolCalls.length === 0 ? {} : { tool_calls: toolCalls }
				},
				finish_reason: toolCalls.length > 0 ? "tool_calls" : value.finishReason
			}],
			usage: {
				prompt_tokens: value.inputTokens ?? 0,
				completion_tokens: value.outputTokens ?? 0,
				total_tokens: (value.inputTokens ?? 0) + (value.outputTokens ?? 0)
			}
		};
	}
	if (protocol === "anthropic-messages") {
		const content = value.text.length === 0 ? [] : [{
			type: "text",
			text: value.text
		}];
		for (const call of value.toolCalls) {
			let input = {};
			try {
				input = JSON.parse(call.arguments);
			} catch {
				input = { raw: call.arguments };
			}
			content.push({
				type: "tool_use",
				id: call.id,
				name: call.name,
				input
			});
		}
		return {
			id: value.id,
			type: "message",
			role: "assistant",
			model: value.model,
			content,
			stop_reason: value.toolCalls.length > 0 ? "tool_use" : value.finishReason === "length" ? "max_tokens" : "end_turn",
			stop_sequence: null,
			usage: {
				input_tokens: value.inputTokens ?? 0,
				output_tokens: value.outputTokens ?? 0
			}
		};
	}
	const messageId = `msg_${value.id}`;
	const output = value.text.length === 0 ? [] : [{
		id: messageId,
		type: "message",
		status: "completed",
		role: "assistant",
		content: [{
			type: "output_text",
			text: value.text,
			annotations: []
		}]
	}];
	output.push(...value.toolCalls.map((call) => ({
		id: `fc_${call.id}`,
		type: "function_call",
		status: "completed",
		call_id: call.id,
		name: call.name,
		arguments: call.arguments
	})));
	return {
		id: value.id,
		object: "response",
		created_at: Math.floor(Date.now() / 1e3),
		status: "completed",
		model: value.model,
		output,
		output_text: value.text,
		usage: {
			input_tokens: value.inputTokens ?? 0,
			output_tokens: value.outputTokens ?? 0,
			total_tokens: (value.inputTokens ?? 0) + (value.outputTokens ?? 0)
		}
	};
}
function endpoint(baseURL, protocol) {
	const target = PROTOCOL_PATHS[protocol];
	const base = new URL(baseURL);
	const normalized = base.pathname.replace(/\/+$/, "");
	if (normalized.endsWith(target) || target.startsWith("/v1/") && normalized.endsWith(target.slice(3))) return base.toString();
	base.pathname = `${normalized}${normalized.endsWith("/v1") ? target.slice(3) : target}`.replace(/\/+/g, "/");
	return base.toString();
}
function selectRoute(profiles, inbound, body, headers) {
	const headerSelector = headers[SELECTOR_HEADER];
	const selector = typeof headerSelector === "string" ? headerSelector : typeof body["provider"] === "string" ? body["provider"] : void 0;
	const modelId = typeof body["model"] === "string" ? body["model"] : void 0;
	if (modelId === void 0 || modelId.length === 0) throw new LocalRouteRequestError("Request body must contain a non-empty model.", 400);
	const candidates = [...profiles.entries()].flatMap(([provider, profile]) => {
		if (profile.inboundApi !== inbound) return [];
		const model = profile.piProvider.getModels().find((candidate) => candidate.id === modelId);
		if (model === void 0 || !isLocalRouteProtocol(model.api)) return [];
		return [{
			provider,
			profile,
			model,
			inbound,
			outbound: model.api
		}];
	});
	if (selector !== void 0) {
		const selected = candidates.find((candidate) => candidate.provider === selector);
		if (selected === void 0) throw new LocalRouteRequestError(`Provider "${selector}" does not expose model "${modelId}" through ${inbound}.`, 404);
		return selected;
	}
	if (candidates.length === 0) throw new LocalRouteRequestError(`No local route exposes model "${modelId}" through ${inbound}.`, 404);
	if (candidates.length > 1) throw new LocalRouteRequestError(`Model "${modelId}" is ambiguous; send the ${SELECTOR_HEADER} header with one of: ${candidates.map((c) => c.provider).join(", ")}.`, 400);
	return candidates[0];
}
async function readBody(request) {
	let size = 0;
	const chunks = [];
	for await (const chunk of request) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.byteLength;
		if (size > MAX_BODY_BYTES) throw new Error("Request body exceeds the 10 MiB local-route limit.");
		chunks.push(buffer);
	}
	let parsed;
	try {
		parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
	} catch {
		throw new Error("Request body must be valid JSON.");
	}
	if (!isRecord(parsed)) throw new Error("Request body must be a JSON object.");
	return parsed;
}
const OMITTED_REQUEST_HEADERS = /* @__PURE__ */ new Set([
	"connection",
	"content-length",
	"host",
	"keep-alive",
	"proxy-authenticate",
	"proxy-authorization",
	"te",
	"trailer",
	"transfer-encoding",
	"upgrade",
	SELECTOR_HEADER
]);
function upstreamHeaders(request, route, apiKey) {
	const headers = new Headers();
	for (const [name, raw] of Object.entries(request.headers)) {
		if (OMITTED_REQUEST_HEADERS.has(name.toLowerCase()) || raw === void 0) continue;
		headers.set(name, Array.isArray(raw) ? raw.join(", ") : raw);
	}
	headers.set("content-type", "application/json");
	for (const [name, value] of Object.entries(route.model.headers ?? {})) headers.set(name, value);
	if (apiKey !== void 0) {
		if (route.outbound === "anthropic-messages") headers.set("x-api-key", apiKey);
		else headers.set("authorization", `Bearer ${apiKey}`);
	}
	if (route.outbound === "anthropic-messages" && !headers.has("anthropic-version")) headers.set("anthropic-version", "2023-06-01");
	for (const [name, value] of Object.entries(route.profile.headers ?? {})) headers.set(name, value);
	return headers;
}
function writeJson(response, status, body) {
	response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	response.end(JSON.stringify(body));
}
function writeError(response, protocol, status, error) {
	const message = error instanceof Error ? error.message : String(error);
	if (protocol === "anthropic-messages") writeJson(response, status, {
		type: "error",
		error: {
			type: "invalid_request_error",
			message
		}
	});
	else writeJson(response, status, { error: {
		type: "invalid_request_error",
		message
	} });
}
async function pipeResponse(upstream, response) {
	const headers = {};
	for (const [name, value] of upstream.headers) if (name.toLowerCase() !== "content-length" && name.toLowerCase() !== "content-encoding") headers[name] = value;
	response.writeHead(upstream.status, headers);
	if (upstream.body === null) {
		response.end();
		return;
	}
	const reader = upstream.body.getReader();
	try {
		while (true) {
			const result = await reader.read();
			if (result.done) break;
			response.write(result.value);
		}
	} finally {
		reader.releaseLock();
		response.end();
	}
}
function sse(response, event, data) {
	if (event !== void 0) response.write(`event: ${event}\n`);
	response.write(`data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
}
function writeSyntheticStream(response, protocol, body) {
	response.writeHead(200, {
		"content-type": "text/event-stream; charset=utf-8",
		"cache-control": "no-cache",
		connection: "keep-alive"
	});
	if (protocol === "openai-completions") {
		const choice = Array.isArray(body["choices"]) && isRecord(body["choices"][0]) ? body["choices"][0] : {};
		const message = isRecord(choice["message"]) ? choice["message"] : {};
		const rawCalls = message["tool_calls"];
		const calls = Array.isArray(rawCalls) ? rawCalls : void 0;
		const delta = calls === void 0 ? message : {
			...message,
			tool_calls: calls.map((call, index) => isRecord(call) ? {
				index,
				...call
			} : call)
		};
		sse(response, void 0, {
			id: body["id"],
			object: "chat.completion.chunk",
			created: body["created"],
			model: body["model"],
			choices: [{
				index: 0,
				delta,
				finish_reason: null
			}]
		});
		sse(response, void 0, {
			id: body["id"],
			object: "chat.completion.chunk",
			created: body["created"],
			model: body["model"],
			choices: [{
				index: 0,
				delta: {},
				finish_reason: choice["finish_reason"] ?? "stop"
			}]
		});
		sse(response, void 0, "[DONE]");
	} else if (protocol === "anthropic-messages") {
		sse(response, "message_start", {
			type: "message_start",
			message: {
				...body,
				content: [],
				stop_reason: null,
				stop_sequence: null
			}
		});
		(Array.isArray(body["content"]) ? body["content"] : []).forEach((block, index) => {
			const record = isRecord(block) ? block : {
				type: "text",
				text: String(block)
			};
			sse(response, "content_block_start", {
				type: "content_block_start",
				index,
				content_block: {
					...record,
					...record["type"] === "text" ? { text: "" } : {}
				}
			});
			if (record["type"] === "text") sse(response, "content_block_delta", {
				type: "content_block_delta",
				index,
				delta: {
					type: "text_delta",
					text: record["text"]
				}
			});
			sse(response, "content_block_stop", {
				type: "content_block_stop",
				index
			});
		});
		sse(response, "message_delta", {
			type: "message_delta",
			delta: {
				stop_reason: body["stop_reason"],
				stop_sequence: null
			},
			usage: body["usage"]
		});
		sse(response, "message_stop", { type: "message_stop" });
	} else {
		sse(response, "response.created", {
			type: "response.created",
			response: {
				...body,
				status: "in_progress",
				output: []
			}
		});
		const text = typeof body["output_text"] === "string" ? body["output_text"] : "";
		if (text.length > 0) sse(response, "response.output_text.delta", {
			type: "response.output_text.delta",
			delta: text
		});
		sse(response, "response.completed", {
			type: "response.completed",
			response: body
		});
	}
	response.end();
}
async function handleProxy(request, response, options) {
	const url = new URL(request.url ?? "/", `http://${HOST}`);
	if (request.method === "GET" && url.pathname === "/health") {
		writeJson(response, 200, {
			status: "ok",
			host: HOST,
			routes: [...options.profiles().keys()]
		});
		return;
	}
	const inbound = protocolOfPath(url.pathname);
	if (request.method !== "POST" || inbound === void 0) {
		writeError(response, inbound, 404, /* @__PURE__ */ new Error(`Use POST ${Object.values(PROTOCOL_PATHS).join(", ")} or GET /health.`));
		return;
	}
	let body;
	try {
		body = await readBody(request);
	} catch (error) {
		writeError(response, inbound, 400, error);
		return;
	}
	try {
		const route = selectRoute(options.profiles(), inbound, body, request.headers);
		const apiKey = await options.resolveApiKey(route.provider, route.profile);
		const inboundStream = body["stream"] === true;
		const cleanBody = { ...body };
		delete cleanBody["provider"];
		let outboundBody = route.inbound === route.outbound ? cleanBody : requestFromChat(route.outbound, requestToChat(inbound, cleanBody), route.model.maxTokens);
		outboundBody = {
			...outboundBody,
			...route.profile.bodyOverrides
		};
		outboundBody["stream"] = route.inbound === route.outbound && inboundStream ? outboundBody["stream"] !== false : false;
		const upstream = await fetch(endpoint(route.model.baseUrl, route.outbound), {
			method: "POST",
			headers: upstreamHeaders(request, route, apiKey),
			body: JSON.stringify(outboundBody)
		});
		if (!upstream.ok) {
			await pipeResponse(upstream, response);
			return;
		}
		if (route.inbound === route.outbound && outboundBody["stream"] === true) {
			await pipeResponse(upstream, response);
			return;
		}
		const raw = await upstream.json();
		if (!isRecord(raw)) throw new Error("Upstream response must be a JSON object.");
		const canonical = route.inbound === route.outbound ? void 0 : responseToCanonical(route.outbound, raw);
		if (canonical !== void 0 && canonical.model.length === 0) canonical.model = route.model.id;
		const converted = canonical === void 0 ? raw : canonicalToResponse(route.inbound, canonical);
		if (inboundStream) writeSyntheticStream(response, route.inbound, converted);
		else writeJson(response, upstream.status, converted);
	} catch (error) {
		writeError(response, inbound, error instanceof LocalRouteRequestError ? error.status : 502, error);
	}
}
/** Owns the atomic start/stop/rebind lifecycle for one plugin instance. */
var LocalRouteServer = class {
	options;
	server;
	activePort;
	transition = Promise.resolve();
	constructor(options) {
		this.options = options;
	}
	/** Actual listening port; useful for diagnostics and port-zero tests. */
	get port() {
		return this.activePort;
	}
	/** Apply desired settings in order; changing ports keeps the old listener if the new bind fails. */
	configure(config) {
		const enabled = config?.enabled === true;
		const port = config?.port ?? 8317;
		const run = async () => {
			if (!enabled) {
				await this.stop(true);
				return;
			}
			if (this.server !== void 0 && this.activePort === port) return;
			const candidate = createServer((request, response) => {
				handleProxy(request, response, this.options).catch((error) => {
					if (!response.headersSent) writeError(response, void 0, 500, error);
					else response.destroy(error instanceof Error ? error : new Error(String(error)));
				});
			});
			await new Promise((resolve, reject) => {
				const onError = (error) => {
					candidate.off("listening", onListening);
					reject(error);
				};
				const onListening = () => {
					candidate.off("error", onError);
					resolve();
				};
				candidate.once("error", onError);
				candidate.once("listening", onListening);
				candidate.listen(port, HOST);
			});
			const address = candidate.address();
			const actualPort = typeof address === "object" && address !== null ? address.port : port;
			const previous = this.server;
			this.server = candidate;
			this.activePort = actualPort;
			if (previous !== void 0) {
				previous.closeAllConnections();
				await new Promise((resolve) => previous.close(() => {
					resolve();
				}));
			}
			this.options.logger?.info(`llm-pi-ai: local route listening at http://${HOST}:${String(actualPort)}`);
		};
		this.transition = this.transition.then(run, run).catch((error) => {
			this.options.logger?.error(`llm-pi-ai: failed to apply local route on ${HOST}:${String(port)}`, error);
			throw error;
		});
		return this.transition;
	}
	/** Stop accepting requests and close active connections. */
	async close() {
		await this.transition.catch(() => {});
		await this.stop(true);
	}
	async stop(force = false) {
		const server = this.server;
		if (server === void 0) return;
		this.server = void 0;
		this.activePort = void 0;
		if (force) server.closeAllConnections();
		await new Promise((resolve) => server.close(() => {
			resolve();
		}));
		this.options.logger?.info("llm-pi-ai: local route stopped");
	}
};
//#endregion
//#region src/index.ts
const name = "llm-pi-ai";
const inject = ["llm"];
const NS = "llm-pi-ai";
function deepEqualJson(a, b) {
	if (a === b) return true;
	if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) return false;
	return JSON.stringify(a) === JSON.stringify(b);
}
/**
* The registry captures these per route; a change here must re-register.
* Sorted by provider so a settings document that merely reorders its keys is
* not mistaken for a route change.
*/
function registrationFacts(profiles) {
	return [...profiles.entries()].map(([provider, profile]) => ({
		provider,
		displayName: profile.displayName,
		retryPolicy: profile.retryPolicy
	})).sort((left, right) => left.provider.localeCompare(right.provider));
}
/**
* The configurable-provider directory: every installed catalog route this
* adapter can authenticate, plus every route the current profiles declare. A
* hand-declared route has no catalog entry, so without this union it would
* have no settings address and configuration surfaces could neither show nor
* edit it.
*
* The profile half is unconditional, which is what keeps a route already
* stored against a withheld provider editable and deletable rather than
* stranded in the settings document with nothing on the page to remove it.
* @param profiles - the currently resolved provider profiles.
* @returns the directory entries in catalog order, declared routes last.
*/
function directoryEntries(profiles) {
	const catalog = new Set(catalogProviderIds());
	const entries = /* @__PURE__ */ new Map();
	const declare = (provider, displayName) => {
		entries.set(provider, {
			provider,
			displayName,
			settingsNs: NS,
			settingsPath: ["providers", provider],
			declared: !catalog.has(provider)
		});
	};
	for (const provider of catalog) if (catalogProviderTakesApiKey(provider)) declare(provider, provider);
	for (const [provider, profile] of profiles) declare(provider, profile.displayName);
	return [...entries.values()];
}
/** Register one generic pi-ai adapter for all configured provider routes. */
function apply(ctx, config) {
	let current = () => config;
	let lastRaw;
	let memoized;
	/**
	* The resolved profiles for the current configuration, memoized by the raw
	* snapshot's identity — which is also what makes the adapter's own snapshot
	* stable across operations that observe no change.
	*
	* No fallback for an unserviceable snapshot lives here: the section schema
	* resolves the whole profile set, so a write that could not be served is
	* refused where it is written, and the settings seam keeps a namespace's
	* last good value for a stored section that fails. Anything reaching this
	* point has already resolved once.
	*/
	const profiles = () => {
		const raw = current();
		if (raw === lastRaw && memoized !== void 0) return memoized;
		const next = resolveProfiles(raw.providers);
		lastRaw = raw;
		memoized = next;
		return next;
	};
	profiles();
	const resolveApiKey = async (provider, profile) => {
		const ref = profile.apiKeyEnv;
		if (ref === void 0) return void 0;
		const credentials = ctx.get("credentials");
		const hit = credentials !== void 0 ? (await credentials.resolve(ref))?.value : launchEnvironmentOf(ctx).get(ref)?.value;
		if (hit !== void 0 && hit.length > 0) return assertUsableApiKey(hit, "llm-pi-ai", ref);
		throw new LlmError(`llm-pi-ai: no credential for provider route "${provider}"; its profile resolves ${ref}, which is not set — store ${ref} through the credentials service (the web Models page writes it) or export it, and remove apiKeyEnv only if this provider should authenticate from pi-ai's own environment discovery`, "MISSING_CREDENTIAL");
	};
	const adapter = new PiAiAdapter({
		profiles,
		resolveApiKey,
		resolveAttachments: () => ctx.get("attachments")
	});
	const localRoute = new LocalRouteServer({
		profiles,
		resolveApiKey,
		logger: {
			info: (message) => {
				ctx.logger.info(message);
			},
			error: (message, error) => {
				ctx.logger.error(message);
				ctx.logger.error(error);
			}
		}
	});
	const ensureLocalRoute = () => {
		localRoute.configure(current().localRoute).catch(() => {});
	};
	ensureLocalRoute();
	ctx.effect(() => async () => {
		await localRoute.close();
	});
	let directory;
	let directoryFacts;
	const ensureDirectory = () => {
		const entries = directoryEntries(profiles());
		if (deepEqualJson(entries, directoryFacts)) return;
		if (directory === void 0) directory = ctx.llm.registerConfigurableProviders(entries);
		else directory.replace(entries);
		directoryFacts = entries;
	};
	ensureDirectory();
	/**
	* The credential a named route already resolves, for an interrogation whose
	* draft carries none. A route being declared for the first time names no
	* profile yet, and a profile that names no credential defers to pi-ai's own
	* discovery, so both answer `undefined` and the endpoint is asked
	* unauthenticated — the same posture a request to that route would take.
	*/
	const storedApiKey = async (provider) => {
		if (provider === void 0) return void 0;
		const profile = profiles().get(provider);
		if (profile === void 0) return void 0;
		return resolveApiKey(provider, profile);
	};
	ctx.llm.registerModelDiscovery(NS, (request) => discoverModels(request, () => storedApiKey(request.provider)));
	let registration;
	let registeredFacts;
	const ensureRegistrationFacts = () => {
		const facts = registrationFacts(profiles());
		if (deepEqualJson(facts, registeredFacts)) return;
		const routes = [...profiles().keys()];
		if (registration === void 0) {
			if (routes.length === 0) {
				registeredFacts = facts;
				return;
			}
			registration = ctx.llm.registerAdapter(routes, adapter);
		} else registration.replace(routes);
		registeredFacts = facts;
	};
	ensureRegistrationFacts();
	ctx.inject(["settings"], (settingsCtx) => {
		settingsCtx.settings.installSection(ctx, NS, Config, config, {
			validate: assertServiceable,
			setSource: (source) => {
				current = source;
			},
			onChange: () => {
				ensureLocalRoute();
				try {
					ensureRegistrationFacts();
				} catch (error) {
					ctx.logger.error("llm-pi-ai: keeping the previously registered routes after a refused update");
					ctx.logger.error(error);
				}
				try {
					ensureDirectory();
				} catch (error) {
					ctx.logger.error("llm-pi-ai: keeping the previous configurable-provider directory after a refused update");
					ctx.logger.error(error);
				}
			}
		});
	});
}
//#endregion
export { Config, LocalRouteServer, PiAiAdapter, apply, inject, name, supportedProtocols };

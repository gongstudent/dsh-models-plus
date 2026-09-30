import z from "@deepseek-ai/schemastery";
import { createServer } from "node:http";
import { credentialRef } from "@deepseek-ai/dsh-credentials";
import { MAX_TIMER_DELAY_MS } from "@deepseek-ai/dsh-timeout";
import { RetryPolicySchema, resolveRetryPolicy } from "@deepseek-ai/dsh-llm";
import { builtinProviders, getBuiltinModels } from "@earendil-works/pi-ai/providers/all";
import { createProvider } from "@earendil-works/pi-ai";
import { anthropicMessagesApi } from "@earendil-works/pi-ai/api/anthropic-messages.lazy";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { openAIResponsesApi } from "@earendil-works/pi-ai/api/openai-responses.lazy";
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
z.object({
	providers: z.dict(profile).default({}),
	localRoute: z.object({
		enabled: z.boolean().default(false),
		port: z.number().step(1).min(1024).max(65535).default(DEFAULT_LOCAL_ROUTE_PORT)
	}).default({
		enabled: false,
		port: DEFAULT_LOCAL_ROUTE_PORT
	})
});
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
		if (profile.inboundApi !== void 0 && profile.inboundApi.length > 0 && profile.inboundApi !== inbound) return [];
		const model = profile.piProvider.getModels().find((candidate) => candidate.id === modelId);
		const outbound = model?.api ?? profile.api;
		if (model === void 0 || !isLocalRouteProtocol(outbound)) return [];
		return [{
			provider,
			profile,
			model,
			inbound,
			outbound
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
const Config = z.object({
	enabled: z.boolean().default(false).volatile(),
	port: z.number().step(1).min(1024).max(65535).default(DEFAULT_LOCAL_ROUTE_PORT).volatile()
});
const name = "dsh-local-route";
const inject = ["credentials"];
/**
* Extract active provider profiles configured in DSH.
* Inspects ctx.configEditor, ctx.loader, and ctx.settings.
*/
function extractProviders(ctx) {
	try {
		const configEditor = ctx.get("configEditor");
		if (configEditor?.configuration) {
			const piAi = configEditor.configuration().find((c) => c.entry.options.id === "llm-pi-ai");
			if (piAi?.override?.providers || piAi?.inherited?.providers) return {
				...piAi.inherited?.providers ?? {},
				...piAi.override?.providers ?? {}
			};
		}
	} catch {}
	try {
		const loader = ctx.loader;
		if (loader?.entries) {
			for (const entry of loader.entries()) if (entry.options?.id === "llm-pi-ai" && entry.options?.config?.providers) return entry.options.config.providers;
		}
	} catch {}
	try {
		const settings = ctx.get("settings");
		if (settings?.describe) {
			const piAi = settings.describe().find((d) => d.ns === "llm-pi-ai");
			if (piAi?.value?.providers) return piAi.value.providers;
		}
	} catch {}
	return {};
}
function apply(ctx, config) {
	const getProfiles = () => {
		return resolveProfiles(extractProviders(ctx));
	};
	const resolveApiKey = async (provider, profile) => {
		const ref = profile.apiKeyEnv;
		if (!ref) return void 0;
		try {
			const credentials = ctx.get("credentials");
			if (credentials?.resolve) {
				const hit = await credentials.resolve(ref);
				if (hit?.value && hit.value.length > 0) return hit.value;
			}
		} catch {}
		return process.env[ref];
	};
	const server = new LocalRouteServer({
		profiles: getProfiles,
		resolveApiKey,
		logger: {
			info: (msg) => ctx.logger.info(msg),
			error: (msg, err) => {
				ctx.logger.error(msg);
				ctx.logger.error(err);
			}
		}
	});
	const sync = () => {
		const isEnabled = typeof config.enabled?.get === "function" ? config.enabled.get() : config.enabled === true;
		const currentPort = typeof config.port?.get === "function" ? config.port.get() : typeof config.port === "number" ? config.port : DEFAULT_LOCAL_ROUTE_PORT;
		server.configure({
			enabled: isEnabled,
			port: currentPort
		}).catch((err) => {
			ctx.logger.warn("Failed to configure local route server: %s", err instanceof Error ? err.message : String(err));
		});
	};
	sync();
	ctx.on("loader/volatile-update", sync);
	ctx.on("settings/document-updated", sync);
	ctx.on("app-boot/config-reload", sync);
	ctx.effect(() => async () => {
		await server.close();
	});
}
//#endregion
export { Config, LocalRouteServer, apply, inject, name };

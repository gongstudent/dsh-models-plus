window.__ModuleLoader__.load({
	id: "dsh-models-plus",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let react_dom = require("react-dom");
		//#region \0dsh-css:/home/glh/dsh-models-plus/src/client/LocalRouteCard.module.css.mjs
		const css$1 = ".wcBALa_localRouteControl{border:1px solid var(--dsw-alias-border-l2,#ffffff1f);background:var(--dsw-alias-bg-layer-2,#ffffff0a);border-radius:12px;flex-direction:column;gap:12px;margin-top:16px;padding:16px;display:flex}.wcBALa_localRouteHead{justify-content:space-between;align-items:center;gap:16px;display:flex}.wcBALa_localRouteTitle{color:var(--dsw-alias-label-primary,#fff);margin:0;font-size:14px;font-weight:600;line-height:22px}.wcBALa_localRouteAddress{font-family:var(--ds-font-family-code,monospace);color:var(--dsw-alias-label-tertiary,#ffffff80);overflow-wrap:anywhere;margin:2px 0 0;font-size:12px;line-height:18px}.wcBALa_routeSwitch{box-sizing:border-box;cursor:pointer;background:0 0;border:0;justify-content:center;align-items:center;width:40px;height:28px;padding:0;transition:opacity .16s ease-in-out;display:inline-flex}.wcBALa_routeSwitch:disabled{opacity:.4;cursor:default}.wcBALa_routeSwitch:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3,#ffffff4d);outline:none}.wcBALa_routeSwitchTrack{background:var(--dsw-alias-border-l2,#fff3);border-radius:9px;width:34px;height:18px;transition:background-color .2s cubic-bezier(.4,0,.2,1);display:block;position:relative}.wcBALa_routeSwitchTrack[data-on=true]{background:var(--dsw-alias-label-primary,#fff)}.wcBALa_routeSwitchThumb{background:#fff;border-radius:50%;width:12px;height:12px;transition:transform .2s cubic-bezier(.4,0,.2,1);position:absolute;top:3px;left:3px}.wcBALa_routeSwitchTrack[data-on=true] .wcBALa_routeSwitchThumb{background:var(--dsw-alias-bg-layer-1,#1e1e1e);transform:translate(16px)}.wcBALa_controlsRow{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:16px;display:flex}.wcBALa_routePortField{align-items:center;gap:10px;display:flex}.wcBALa_fieldLabel{color:var(--dsw-alias-label-secondary,#ffffffb3);font-size:13px}.wcBALa_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#ffffff26);background:var(--dsw-alias-bg-layer-1,#0003);height:28px;color:var(--dsw-alias-label-primary,#fff);border-radius:6px;outline:none;padding:0 8px;font-size:13px;transition:border-color .15s}.wcBALa_input:focus{border-color:var(--dsw-alias-border-l3,#fff6)}.wcBALa_input:disabled{opacity:.5;cursor:not-allowed}.wcBALa_routePortInput{width:90px}.wcBALa_routeRunning,.wcBALa_routeStopped{margin:0;font-size:12px;line-height:18px}.wcBALa_routeRunning{color:var(--dsw-alias-state-success-primary,#30a46c)}.wcBALa_routeStopped{color:var(--dsw-alias-label-tertiary,#ffffff80)}.wcBALa_error{color:var(--dsw-alias-state-danger-primary,#e54d2e);margin:0;font-size:12px;line-height:18px}";
		const tagId$1 = "dsh-models-plus/LocalRouteCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId$1) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-models-plus";
			tag.dataset.pluginCss = tagId$1;
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var LocalRouteCard_module_css_default = {
			"controlsRow": "wcBALa_controlsRow",
			"input": "wcBALa_input",
			"localRouteTitle": "wcBALa_localRouteTitle",
			"routeSwitch": "wcBALa_routeSwitch",
			"routeStopped": "wcBALa_routeStopped",
			"localRouteAddress": "wcBALa_localRouteAddress",
			"localRouteHead": "wcBALa_localRouteHead",
			"routePortInput": "wcBALa_routePortInput",
			"routeSwitchThumb": "wcBALa_routeSwitchThumb",
			"routeSwitchTrack": "wcBALa_routeSwitchTrack",
			"routePortField": "wcBALa_routePortField",
			"fieldLabel": "wcBALa_fieldLabel",
			"error": "wcBALa_error",
			"localRouteControl": "wcBALa_localRouteControl",
			"routeRunning": "wcBALa_routeRunning"
		};
		//#endregion
		//#region src/client/locales.ts
		const en = {
			localRoute: "Local Route Proxy",
			localRouteDesc: "Proxies external OpenAI/Anthropic requests to models configured in Harness.",
			localRouteEnabled: "Enable local route",
			localRoutePort: "Port",
			localRouteAddress: "http://127.0.0.1:{port}",
			localRouteStart: "Start local route",
			localRouteStop: "Stop local route",
			localRouteRunning: "Running",
			localRouteStopped: "Stopped",
			localRouteApplying: "Applying…",
			localRoutePortInvalid: "Enter a port from 1024 to 65535.",
			customParamsHeading: "Protocol, Header & Body Overrides (Advanced)",
			providerConfigHeading: "Provider Protocol & Request Overrides",
			selectProviderLabel: "Target Provider:",
			noProvidersHint: "No providers configured yet. Please add a provider above.",
			inboundApi: "Inbound protocol",
			inboundApiHint: "Protocol format accepted from external clients via local route.",
			inboundApiAuto: "Auto / Accept all (Recommended)",
			outboundApi: "Outbound protocol (Upstream API)",
			outboundApiHint: "Protocol format expected by the upstream provider endpoint.",
			protocolOpenAiCompletions: "OpenAI Chat Completions (/v1/chat/completions)",
			protocolOpenAiResponses: "OpenAI Responses (/v1/responses)",
			protocolAnthropicMessages: "Anthropic Messages (/v1/messages)",
			headers: "Header overrides",
			headersPlaceholder: "JSON object, e.g. {\"X-Custom\":\"value\"}",
			headersInvalid: "Must be a valid JSON object.",
			bodyOverrides: "Body overrides",
			bodyOverridesPlaceholder: "JSON object merged into upstream request body",
			bodyOverridesInvalid: "Must be a valid JSON object.",
			saveParams: "Save Overrides",
			saving: "Saving…",
			saved: "Saved successfully"
		};
		const zh = {
			localRoute: "本地路由代理",
			localRouteDesc: "将外部 OpenAI / Anthropic 协议请求代理转发至当前已配置的模型。",
			localRouteEnabled: "启用本地路由",
			localRoutePort: "监听端口",
			localRouteAddress: "http://127.0.0.1:{port}",
			localRouteStart: "启动本地路由",
			localRouteStop: "停止本地路由",
			localRouteRunning: "已启用",
			localRouteStopped: "已停止",
			localRouteApplying: "应用中…",
			localRoutePortInvalid: "请输入 1024 到 65535 之间的有效端口。",
			customParamsHeading: "协议转换与请求定制 (入站/出站协议、请求头、请求体)",
			providerConfigHeading: "渠道协议转换与请求定制 (入站/出站协议、请求头、请求体)",
			selectProviderLabel: "选择要配置的渠道：",
			noProvidersHint: "暂未配置任何渠道，请先在上方添加渠道或自定义模型 API。",
			inboundApi: "入站协议 (本地路由接收格式)",
			inboundApiHint: "外部客户端（如 Cline/Cursor）通过本地路由访问此渠道时的协议格式。",
			inboundApiAuto: "自动兼容 / 全部支持 (推荐)",
			outboundApi: "出站协议 (上游模型实际格式)",
			outboundApiHint: "该自定义渠道上游服务器实际使用的 API 格式。",
			protocolOpenAiCompletions: "OpenAI Chat Completions (/v1/chat/completions)",
			protocolOpenAiResponses: "OpenAI Responses (/v1/responses)",
			protocolAnthropicMessages: "Anthropic Messages (/v1/messages)",
			headers: "Header 覆盖 (自定义请求头)",
			headersPlaceholder: "JSON 对象，例如 {\"X-Custom-Header\":\"value\"}",
			headersInvalid: "必须是合法的 JSON 对象",
			bodyOverrides: "Body 覆盖 (自定义请求体)",
			bodyOverridesPlaceholder: "合并到上游请求体的 JSON 对象，例如 {\"temperature\":0.7}",
			bodyOverridesInvalid: "必须是合法的 JSON 对象",
			saveParams: "保存设置",
			saving: "保存中…",
			saved: "保存成功"
		};
		//#endregion
		//#region \0dsh-css:/home/glh/dsh-models-plus/src/client/ProviderExtrasCard.module.css.mjs
		const css = "._2s8bpq_container{border-top:1px solid var(--dsw-alias-border-l2,#ffffff1a);margin-top:12px;padding-top:12px}._2s8bpq_toggleBtn{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#ffffff26);height:28px;color:var(--dsw-alias-label-secondary,#ffffffb3);cursor:pointer;background:0 0;border-radius:6px;align-items:center;gap:6px;padding:0 10px;font-size:12px;transition:background-color .15s,color .15s;display:inline-flex}._2s8bpq_toggleBtn:hover{background:var(--dsw-alias-interactive-bg-hover,#ffffff14);color:var(--dsw-alias-label-primary,#fff)}._2s8bpq_content{flex-direction:column;gap:12px;margin-top:10px;display:flex}._2s8bpq_field{flex-direction:column;gap:6px;display:flex}._2s8bpq_fieldLabelRow{justify-content:space-between;align-items:center;display:flex}._2s8bpq_fieldLabel{color:var(--dsw-alias-label-secondary,#ffffffb3);font-size:12px;font-weight:500}._2s8bpq_select{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#ffffff26);background:var(--dsw-alias-bg-layer-1,#0003);width:100%;height:30px;color:var(--dsw-alias-label-primary,#fff);cursor:pointer;border-radius:6px;outline:none;padding:0 8px;font-size:12px}._2s8bpq_select:focus{border-color:var(--dsw-alias-border-l3,#fff6)}._2s8bpq_textarea{box-sizing:border-box;width:100%;font-family:var(--ds-font-family-code,monospace);border:1px solid var(--dsw-alias-border-l2,#ffffff26);background:var(--dsw-alias-bg-layer-1,#0003);color:var(--dsw-alias-label-primary,#fff);resize:vertical;border-radius:6px;outline:none;padding:8px 10px;font-size:12px;line-height:18px;transition:border-color .15s}._2s8bpq_textarea:focus{border-color:var(--dsw-alias-border-l3,#fff6)}._2s8bpq_textareaInvalid{border-color:var(--dsw-alias-state-danger-primary,#e54d2e)}._2s8bpq_actions{align-items:center;gap:10px;margin-top:4px;display:flex}._2s8bpq_saveBtn{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#fff3);background:var(--dsw-alias-bg-layer-2,#ffffff14);height:28px;color:var(--dsw-alias-label-primary,#fff);cursor:pointer;border-radius:6px;padding:0 14px;font-size:12px;transition:background-color .15s,opacity .15s}._2s8bpq_saveBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover,#ffffff26)}._2s8bpq_saveBtn:disabled{opacity:.5;cursor:not-allowed}._2s8bpq_error{color:var(--dsw-alias-state-danger-primary,#e54d2e);margin:0;font-size:11px}._2s8bpq_success{color:var(--dsw-alias-state-success-primary,#30a46c);margin:0;font-size:12px}";
		const tagId = "dsh-models-plus/ProviderExtrasCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-models-plus";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var ProviderExtrasCard_module_css_default = {
			"container": "_2s8bpq_container",
			"textareaInvalid": "_2s8bpq_textareaInvalid",
			"content": "_2s8bpq_content",
			"fieldLabel": "_2s8bpq_fieldLabel",
			"select": "_2s8bpq_select",
			"toggleBtn": "_2s8bpq_toggleBtn",
			"textarea": "_2s8bpq_textarea",
			"actions": "_2s8bpq_actions",
			"field": "_2s8bpq_field",
			"fieldLabelRow": "_2s8bpq_fieldLabelRow",
			"saveBtn": "_2s8bpq_saveBtn",
			"error": "_2s8bpq_error",
			"success": "_2s8bpq_success"
		};
		//#endregion
		//#region src/client/CustomApiDraftPortal.tsx
		function parseJsonObject$2(text) {
			const trimmed = text.trim();
			if (trimmed.length === 0) return {
				ok: true,
				value: void 0
			};
			try {
				const parsed = JSON.parse(trimmed);
				if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return {
					ok: true,
					value: parsed
				};
				return { ok: false };
			} catch {
				return { ok: false };
			}
		}
		function CustomApiDraftPortal({ ctx }) {
			const [container, setContainer] = (0, react.useState)(null);
			const [open, setOpen] = (0, react.useState)(true);
			const [inboundApi, setInboundApi] = (0, react.useState)("");
			const [outboundApi, setOutboundApi] = (0, react.useState)("openai-completions");
			const [headersText, setHeadersText] = (0, react.useState)("");
			const [bodyText, setBodyText] = (0, react.useState)("");
			const [saveStatus, setSaveStatus] = (0, react.useState)(null);
			const currentValues = (0, react.useRef)({
				inboundApi,
				outboundApi,
				headersText,
				bodyText
			});
			(0, react.useEffect)(() => {
				currentValues.current = {
					inboundApi,
					outboundApi,
					headersText,
					bodyText
				};
			}, [
				inboundApi,
				outboundApi,
				headersText,
				bodyText
			]);
			const lang = ctx?.locale?.getSnapshot?.()?.active ?? "zh";
			const t = (0, react.useCallback)((key) => {
				return (lang === "zh" ? zh : en)[key] ?? en[key] ?? key;
			}, [lang]);
			(0, react.useEffect)(() => {
				let div = null;
				const check = () => {
					const panel = document.querySelector("[id$=\"-custom-panel\"]");
					if (!panel || panel.hidden) {
						if (div && div.parentNode) {
							div.parentNode.removeChild(div);
							div = null;
							setContainer(null);
						}
						return;
					}
					const editor = panel.querySelector("[class*=\"editor\"]") ?? panel;
					if (!div || !editor.contains(div)) {
						div = document.createElement("div");
						div.className = "dsh-custom-api-draft-extras";
						const footer = editor.querySelector("[class*=\"editorFooter\"]");
						if (footer) editor.insertBefore(div, footer);
						else editor.appendChild(div);
						setContainer(div);
					}
				};
				check();
				const observer = new MutationObserver(check);
				observer.observe(document.body, {
					childList: true,
					subtree: true,
					attributes: true
				});
				return () => {
					observer.disconnect();
					if (div && div.parentNode) div.parentNode.removeChild(div);
				};
			}, []);
			(0, react.useEffect)(() => {
				const remote = ctx?.remote;
				const off = remote?.$on?.("settings/document-updated", async (ns) => {
					if (ns !== "llm-pi-ai") return;
					const panel = document.querySelector("[id$=\"-custom-panel\"]");
					const routeId = (panel?.querySelector("input[placeholder=\"acme-gateway\"]") ?? panel?.querySelector("input[aria-label*=\"Provider ID\"]") ?? panel?.querySelector("input"))?.value?.trim()?.toLowerCase();
					if (!routeId) return;
					const { inboundApi: inApi, outboundApi: outApi, headersText: hText, bodyText: bText } = currentValues.current;
					const hParse = parseJsonObject$2(hText);
					const bParse = parseJsonObject$2(bText);
					const ops = [];
					const basePath = ["providers", routeId];
					if (inApi) ops.push({
						op: "set",
						path: [...basePath, "inboundApi"],
						value: inApi
					});
					if (outApi) ops.push({
						op: "set",
						path: [...basePath, "api"],
						value: outApi
					});
					if (hParse.ok && hParse.value !== void 0) ops.push({
						op: "set",
						path: [...basePath, "headers"],
						value: hParse.value
					});
					if (bParse.ok && bParse.value !== void 0) ops.push({
						op: "set",
						path: [...basePath, "bodyOverrides"],
						value: bParse.value
					});
					if (ops.length > 0) try {
						await remote?.settings?.mutate("llm-pi-ai", ops);
					} catch {}
				});
				return () => {
					off?.();
				};
			}, [ctx]);
			if (!container) return null;
			const headerParse = parseJsonObject$2(headersText);
			const bodyParse = parseJsonObject$2(bodyText);
			const headersValid = headerParse.ok;
			const bodyValid = bodyParse.ok;
			return (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ProviderExtrasCard_module_css_default.container,
				style: { marginBottom: "12px" },
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: ProviderExtrasCard_module_css_default.toggleBtn,
					onClick: () => setOpen(!open),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: open ? "▾" : "▸" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("customParamsHeading") })]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: ProviderExtrasCard_module_css_default.content,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: ProviderExtrasCard_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: ProviderExtrasCard_module_css_default.fieldLabelRow,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ProviderExtrasCard_module_css_default.fieldLabel,
									children: t("inboundApi")
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: ProviderExtrasCard_module_css_default.select,
								value: inboundApi,
								onChange: (e) => setInboundApi(e.target.value),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: t("inboundApiAuto")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "openai-completions",
										children: t("protocolOpenAiCompletions")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "anthropic-messages",
										children: t("protocolAnthropicMessages")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "openai-responses",
										children: t("protocolOpenAiResponses")
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: ProviderExtrasCard_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: ProviderExtrasCard_module_css_default.fieldLabelRow,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ProviderExtrasCard_module_css_default.fieldLabel,
									children: t("outboundApi")
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: ProviderExtrasCard_module_css_default.select,
								value: outboundApi,
								onChange: (e) => setOutboundApi(e.target.value),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "openai-completions",
										children: t("protocolOpenAiCompletions")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "anthropic-messages",
										children: t("protocolAnthropicMessages")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "openai-responses",
										children: t("protocolOpenAiResponses")
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: ProviderExtrasCard_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: ProviderExtrasCard_module_css_default.fieldLabelRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ProviderExtrasCard_module_css_default.fieldLabel,
									children: t("headers")
								}), !headersValid && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ProviderExtrasCard_module_css_default.error,
									children: t("headersInvalid")
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								rows: 2,
								className: `${ProviderExtrasCard_module_css_default.textarea} ${!headersValid ? ProviderExtrasCard_module_css_default.textareaInvalid : ""}`,
								value: headersText,
								placeholder: t("headersPlaceholder"),
								onChange: (e) => setHeadersText(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: ProviderExtrasCard_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: ProviderExtrasCard_module_css_default.fieldLabelRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ProviderExtrasCard_module_css_default.fieldLabel,
									children: t("bodyOverrides")
								}), !bodyValid && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ProviderExtrasCard_module_css_default.error,
									children: t("bodyOverridesInvalid")
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								rows: 2,
								className: `${ProviderExtrasCard_module_css_default.textarea} ${!bodyValid ? ProviderExtrasCard_module_css_default.textareaInvalid : ""}`,
								value: bodyText,
								placeholder: t("bodyOverridesPlaceholder"),
								onChange: (e) => setBodyText(e.target.value)
							})]
						})
					]
				})]
			}), container);
		}
		//#endregion
		//#region src/client/LocalRouteCard.tsx
		function resolveLocalRouteSettings(namespaces) {
			const own = namespaces?.find((n) => n.ns === "dsh-local-route");
			if (own) {
				const val = own.value;
				return {
					ns: "dsh-local-route",
					enabled: val?.enabled === true,
					port: typeof val?.port === "number" ? val.port : 8317,
					pathPrefix: [],
					revision: own.revision ?? 0
				};
			}
			const piAi = namespaces?.find((n) => n.ns === "llm-pi-ai");
			if (piAi) {
				const val = piAi.value;
				return {
					ns: "llm-pi-ai",
					enabled: val?.localRoute?.enabled === true,
					port: typeof val?.localRoute?.port === "number" ? val.localRoute.port : 8317,
					pathPrefix: ["localRoute"],
					revision: piAi.revision ?? 0
				};
			}
			return {
				ns: "dsh-local-route",
				enabled: false,
				port: 8317,
				pathPrefix: [],
				revision: 0
			};
		}
		function parseJsonObject$1(text) {
			const trimmed = text.trim();
			if (trimmed.length === 0) return {
				ok: true,
				value: void 0
			};
			try {
				const parsed = JSON.parse(trimmed);
				if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return {
					ok: true,
					value: parsed
				};
				return { ok: false };
			} catch {
				return { ok: false };
			}
		}
		function LocalRouteCard({ ctx, t: propsT }) {
			const [enabled, setEnabled] = (0, react.useState)(false);
			const [portDraft, setPortDraft] = (0, react.useState)("8317");
			const [activePort, setActivePort] = (0, react.useState)(8317);
			const [pending, setPending] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)(void 0);
			const [nsInfo, setNsInfo] = (0, react.useState)(null);
			const [providerList, setProviderList] = (0, react.useState)([]);
			const [selectedProvider, setSelectedProvider] = (0, react.useState)("");
			const [inboundApi, setInboundApi] = (0, react.useState)("");
			const [outboundApi, setOutboundApi] = (0, react.useState)("openai-completions");
			const [headersText, setHeadersText] = (0, react.useState)("");
			const [bodyText, setBodyText] = (0, react.useState)("");
			const [savingProvider, setSavingProvider] = (0, react.useState)(false);
			const [providerSaveSuccess, setProviderSaveSuccess] = (0, react.useState)(false);
			const [providerError, setProviderError] = (0, react.useState)(null);
			const [piAiRevision, setPiAiRevision] = (0, react.useState)(void 0);
			const [rawProviders, setRawProviders] = (0, react.useState)({});
			const lang = ctx?.locale?.getSnapshot?.()?.active ?? "zh";
			const t = (0, react.useCallback)((key) => {
				if (typeof propsT === "function") try {
					const val = propsT(key);
					if (val) return val;
				} catch {}
				return (lang === "zh" ? zh : en)[key] ?? en[key] ?? key;
			}, [lang, propsT]);
			const refresh = (0, react.useCallback)(async () => {
				try {
					const remote = ctx?.remote;
					if (!remote?.settings?.describe) return;
					const res = await remote.settings.describe();
					if (res?.ok && res.value?.namespaces) {
						const info = resolveLocalRouteSettings(res.value.namespaces);
						setNsInfo(info);
						setEnabled(info.enabled);
						setActivePort(info.port);
						setPortDraft(String(info.port));
						const piAi = res.value.namespaces.find((n) => n.ns === "llm-pi-ai");
						if (piAi?.value?.providers) {
							setPiAiRevision(piAi.revision);
							const provs = piAi.value.providers;
							setRawProviders(provs);
							const list = Object.entries(provs).map(([id, item]) => ({
								id,
								name: item.displayName ? `${item.displayName} (${id})` : id
							}));
							setProviderList(list);
							if (!selectedProvider && list.length > 0) setSelectedProvider(list[0].id);
						}
					}
				} catch {}
			}, [ctx, selectedProvider]);
			(0, react.useEffect)(() => {
				refresh();
				const off = (ctx?.remote)?.$on?.("settings/document-updated", (ns) => {
					if (ns === "dsh-local-route" || ns === "llm-pi-ai") refresh();
				});
				return () => {
					off?.();
				};
			}, [ctx, refresh]);
			(0, react.useEffect)(() => {
				if (!selectedProvider || !rawProviders[selectedProvider]) return;
				const cur = rawProviders[selectedProvider];
				setInboundApi(cur.inboundApi ?? "");
				setOutboundApi(cur.api ?? "openai-completions");
				setHeadersText(cur.headers ? JSON.stringify(cur.headers, null, 2) : "");
				setBodyText(cur.bodyOverrides ? JSON.stringify(cur.bodyOverrides, null, 2) : "");
				setProviderError(null);
				setProviderSaveSuccess(false);
			}, [selectedProvider, rawProviders]);
			const parsedPort = /^\d+$/.test(portDraft) ? Number(portDraft) : NaN;
			const portValid = Number.isInteger(parsedPort) && parsedPort >= 1024 && parsedPort <= 65535;
			const write = async (nextEnabled, targetPort) => {
				if (pending) return;
				setPending(true);
				setFailure(void 0);
				try {
					const remote = ctx?.remote;
					const targetNs = nsInfo?.ns ?? "dsh-local-route";
					const ops = (nsInfo?.pathPrefix.length ?? 0) === 0 ? [{
						op: "set",
						path: ["enabled"],
						value: nextEnabled
					}, {
						op: "set",
						path: ["port"],
						value: targetPort
					}] : [{
						op: "set",
						path: [...nsInfo.pathPrefix],
						value: {
							enabled: nextEnabled,
							port: targetPort
						}
					}];
					const res = await remote?.settings?.mutate(targetNs, ops, nsInfo?.revision);
					if (res?.ok) {
						setEnabled(nextEnabled);
						setActivePort(targetPort);
						setPortDraft(String(targetPort));
					} else setFailure(res?.error?.message ?? "Failed to apply configuration");
				} catch (err) {
					setFailure(err instanceof Error ? err.message : String(err));
				} finally {
					setPending(false);
					refresh();
				}
			};
			const handleToggle = () => {
				if (!portValid) {
					setFailure(t("localRoutePortInvalid"));
					return;
				}
				write(!enabled, parsedPort);
			};
			const handlePortBlur = () => {
				if (!portValid) {
					setFailure(t("localRoutePortInvalid"));
					return;
				}
				if (parsedPort !== activePort) write(enabled, parsedPort);
			};
			const headerParse = parseJsonObject$1(headersText);
			const bodyParse = parseJsonObject$1(bodyText);
			const headersValid = headerParse.ok;
			const bodyValid = bodyParse.ok;
			const handleSaveProvider = async () => {
				if (!selectedProvider || !headersValid || !bodyValid || savingProvider) return;
				setSavingProvider(true);
				setProviderError(null);
				setProviderSaveSuccess(false);
				try {
					const remote = ctx?.remote;
					const ops = [];
					const basePath = ["providers", selectedProvider];
					if (inboundApi.length > 0) ops.push({
						op: "set",
						path: [...basePath, "inboundApi"],
						value: inboundApi
					});
					else ops.push({
						op: "unset",
						path: [...basePath, "inboundApi"]
					});
					if (outboundApi.length > 0) ops.push({
						op: "set",
						path: [...basePath, "api"],
						value: outboundApi
					});
					if (headerParse.value !== void 0) ops.push({
						op: "set",
						path: [...basePath, "headers"],
						value: headerParse.value
					});
					else ops.push({
						op: "unset",
						path: [...basePath, "headers"]
					});
					if (bodyParse.value !== void 0) ops.push({
						op: "set",
						path: [...basePath, "bodyOverrides"],
						value: bodyParse.value
					});
					else ops.push({
						op: "unset",
						path: [...basePath, "bodyOverrides"]
					});
					const res = await remote?.settings?.mutate("llm-pi-ai", ops, piAiRevision);
					if (res?.ok) {
						setProviderSaveSuccess(true);
						setTimeout(() => setProviderSaveSuccess(false), 2e3);
					} else setProviderError(res?.error?.message ?? "保存失败");
				} catch (e) {
					setProviderError(e.message || String(e));
				} finally {
					setSavingProvider(false);
					refresh();
				}
			};
			const address = t("localRouteAddress").replace("{port}", String(portValid ? parsedPort : activePort));
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: LocalRouteCard_module_css_default.localRouteControl,
				"aria-labelledby": "local-route-title",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: LocalRouteCard_module_css_default.localRouteHead,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h3", {
							id: "local-route-title",
							className: LocalRouteCard_module_css_default.localRouteTitle,
							children: t("localRoute")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: LocalRouteCard_module_css_default.localRouteAddress,
							children: address
						})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							role: "switch",
							"aria-checked": enabled,
							"aria-label": t("localRouteEnabled"),
							title: enabled ? t("localRouteStop") : t("localRouteStart"),
							className: LocalRouteCard_module_css_default.routeSwitch,
							disabled: pending,
							onClick: handleToggle,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: LocalRouteCard_module_css_default.routeSwitchTrack,
								"data-on": enabled || void 0,
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { className: LocalRouteCard_module_css_default.routeSwitchThumb })
							})
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: LocalRouteCard_module_css_default.controlsRow,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("label", {
							className: LocalRouteCard_module_css_default.routePortField,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: LocalRouteCard_module_css_default.fieldLabel,
								children: t("localRoutePort")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
								type: "number",
								min: 1024,
								max: 65535,
								step: 1,
								className: `${LocalRouteCard_module_css_default.input} ${LocalRouteCard_module_css_default.routePortInput}`,
								value: portDraft,
								disabled: pending || enabled,
								onChange: (e) => {
									setPortDraft(e.target.value);
									setFailure(void 0);
								},
								onBlur: handlePortBlur,
								onKeyDown: (e) => {
									if (e.key === "Enter") e.currentTarget.blur();
								}
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: enabled ? LocalRouteCard_module_css_default.routeRunning : LocalRouteCard_module_css_default.routeStopped,
							children: pending ? t("localRouteApplying") : enabled ? `● ${t("localRouteRunning")}` : `○ ${t("localRouteStopped")}`
						})]
					}),
					failure !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: LocalRouteCard_module_css_default.error,
						children: failure
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						style: {
							marginTop: "16px",
							paddingTop: "16px",
							borderTop: "1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.1))"
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("h4", {
							style: {
								margin: "0 0 10px",
								fontSize: "13px",
								fontWeight: 600,
								color: "var(--dsw-alias-label-primary, #fff)"
							},
							children: t("providerConfigHeading")
						}), providerList.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							style: {
								margin: 0,
								fontSize: "12px",
								color: "var(--dsw-alias-label-tertiary, rgba(255, 255, 255, 0.5))"
							},
							children: t("noProvidersHint")
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								flexDirection: "column",
								gap: "12px"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									alignItems: "center",
									gap: "10px"
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: LocalRouteCard_module_css_default.fieldLabel,
									children: t("selectProviderLabel")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("select", {
									style: {
										height: "28px",
										padding: "0 8px",
										fontSize: "12px",
										borderRadius: "6px",
										border: "1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15))",
										background: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.2))",
										color: "var(--dsw-alias-label-primary, #fff)",
										outline: "none",
										cursor: "pointer"
									},
									value: selectedProvider,
									onChange: (e) => setSelectedProvider(e.target.value),
									children: providerList.map((p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: p.id,
										children: p.name
									}, p.id))
								})]
							}), selectedProvider && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								style: {
									display: "flex",
									flexDirection: "column",
									gap: "10px",
									background: "var(--dsw-alias-bg-layer-1, rgba(0, 0, 0, 0.1))",
									padding: "12px",
									borderRadius: "8px",
									border: "1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.08))"
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "grid",
											gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
											gap: "12px"
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											style: { marginBottom: "4px" },
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: LocalRouteCard_module_css_default.fieldLabel,
												children: t("inboundApi")
											})
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											style: {
												width: "100%",
												height: "28px",
												padding: "0 8px",
												fontSize: "12px",
												borderRadius: "6px",
												border: "1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15))",
												background: "var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04))",
												color: "var(--dsw-alias-label-primary, #fff)",
												outline: "none",
												cursor: "pointer"
											},
											value: inboundApi,
											onChange: (e) => setInboundApi(e.target.value),
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "",
													children: t("inboundApiAuto")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "openai-completions",
													children: t("protocolOpenAiCompletions")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "anthropic-messages",
													children: t("protocolAnthropicMessages")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "openai-responses",
													children: t("protocolOpenAiResponses")
												})
											]
										})] }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
											style: { marginBottom: "4px" },
											children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: LocalRouteCard_module_css_default.fieldLabel,
												children: t("outboundApi")
											})
										}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
											style: {
												width: "100%",
												height: "28px",
												padding: "0 8px",
												fontSize: "12px",
												borderRadius: "6px",
												border: "1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15))",
												background: "var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04))",
												color: "var(--dsw-alias-label-primary, #fff)",
												outline: "none",
												cursor: "pointer"
											},
											value: outboundApi,
											onChange: (e) => setOutboundApi(e.target.value),
											children: [
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "openai-completions",
													children: t("protocolOpenAiCompletions")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "anthropic-messages",
													children: t("protocolAnthropicMessages")
												}),
												/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
													value: "openai-responses",
													children: t("protocolOpenAiResponses")
												})
											]
										})] })]
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "flex",
											justifyContent: "space-between",
											marginBottom: "4px"
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: LocalRouteCard_module_css_default.fieldLabel,
											children: t("headers")
										}), !headersValid && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: LocalRouteCard_module_css_default.error,
											children: t("headersInvalid")
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										rows: 2,
										style: {
											width: "100%",
											boxSizing: "border-box",
											padding: "6px 8px",
											fontSize: "12px",
											fontFamily: "monospace",
											borderRadius: "6px",
											border: `1px solid ${headersValid ? "var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15))" : "var(--dsw-alias-state-danger-primary, #e54d2e)"}`,
											background: "var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04))",
											color: "var(--dsw-alias-label-primary, #fff)",
											outline: "none",
											resize: "vertical"
										},
										value: headersText,
										placeholder: t("headersPlaceholder"),
										onChange: (e) => setHeadersText(e.target.value)
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "flex",
											justifyContent: "space-between",
											marginBottom: "4px"
										},
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: LocalRouteCard_module_css_default.fieldLabel,
											children: t("bodyOverrides")
										}), !bodyValid && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: LocalRouteCard_module_css_default.error,
											children: t("bodyOverridesInvalid")
										})]
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
										rows: 2,
										style: {
											width: "100%",
											boxSizing: "border-box",
											padding: "6px 8px",
											fontSize: "12px",
											fontFamily: "monospace",
											borderRadius: "6px",
											border: `1px solid ${bodyValid ? "var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.15))" : "var(--dsw-alias-state-danger-primary, #e54d2e)"}`,
											background: "var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.04))",
											color: "var(--dsw-alias-label-primary, #fff)",
											outline: "none",
											resize: "vertical"
										},
										value: bodyText,
										placeholder: t("bodyOverridesPlaceholder"),
										onChange: (e) => setBodyText(e.target.value)
									})] }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
										style: {
											display: "flex",
											alignItems: "center",
											gap: "10px",
											marginTop: "4px"
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
												type: "button",
												style: {
													height: "28px",
													padding: "0 14px",
													fontSize: "12px",
													borderRadius: "6px",
													border: "1px solid var(--dsw-alias-border-l2, rgba(255, 255, 255, 0.2))",
													background: "var(--dsw-alias-bg-layer-2, rgba(255, 255, 255, 0.08))",
													color: "var(--dsw-alias-label-primary, #fff)",
													cursor: !headersValid || !bodyValid || savingProvider ? "not-allowed" : "pointer",
													opacity: !headersValid || !bodyValid || savingProvider ? .5 : 1
												},
												disabled: !headersValid || !bodyValid || savingProvider,
												onClick: handleSaveProvider,
												children: savingProvider ? t("saving") : t("saveParams")
											}),
											providerSaveSuccess && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												style: {
													fontSize: "12px",
													color: "var(--dsw-alias-state-success-primary, #30a46c)"
												},
												children: ["✓ ", t("saved")]
											}),
											providerError && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: LocalRouteCard_module_css_default.error,
												children: providerError
											})
										]
									})
								]
							})]
						})]
					})
				]
			});
		}
		function LocalRouteFooterSection({ ctx }) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [ctx && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(CustomApiDraftPortal, { ctx }), ctx && /* @__PURE__ */ (0, react_jsx_runtime.jsx)(LocalRouteCard, { ctx })] });
		}
		//#endregion
		//#region src/client/ProviderExtrasCard.tsx
		function parseJsonObject(text) {
			const trimmed = text.trim();
			if (trimmed.length === 0) return {
				ok: true,
				value: void 0
			};
			try {
				const parsed = JSON.parse(trimmed);
				if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) return {
					ok: true,
					value: parsed
				};
				return { ok: false };
			} catch {
				return { ok: false };
			}
		}
		function ProviderExtrasCard(props) {
			const { ctx, provider } = props;
			if (provider?.declared !== true) return null;
			const [open, setOpen] = (0, react.useState)(false);
			const [inboundApi, setInboundApi] = (0, react.useState)("");
			const [outboundApi, setOutboundApi] = (0, react.useState)("openai-completions");
			const [headersText, setHeadersText] = (0, react.useState)("");
			const [bodyText, setBodyText] = (0, react.useState)("");
			const [saving, setSaving] = (0, react.useState)(false);
			const [saveSuccess, setSaveSuccess] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const [revision, setRevision] = (0, react.useState)(void 0);
			const lang = ctx?.locale?.getSnapshot?.()?.active ?? "zh";
			const t = (0, react.useCallback)((key) => {
				if (typeof props.t === "function") try {
					const val = props.t(key);
					if (val) return val;
				} catch {}
				return (lang === "zh" ? zh : en)[key] ?? en[key] ?? key;
			}, [lang, props.t]);
			const providerId = provider?.provider;
			const loadData = (0, react.useCallback)(async () => {
				if (!providerId) return;
				try {
					const remote = ctx?.remote;
					if (!remote?.settings?.describe) return;
					const res = await remote.settings.describe();
					if (res?.ok && res.value?.namespaces) {
						const ns = res.value.namespaces.find((n) => n.ns === "llm-pi-ai");
						if (ns?.value) {
							setRevision(ns.revision);
							const profile = ns.value.providers?.[providerId];
							if (profile) {
								setInboundApi(profile.inboundApi ?? "");
								setOutboundApi(profile.api ?? "openai-completions");
								setHeadersText(profile.headers ? JSON.stringify(profile.headers, null, 2) : "");
								setBodyText(profile.bodyOverrides ? JSON.stringify(profile.bodyOverrides, null, 2) : "");
							}
						}
					}
				} catch {}
			}, [ctx, providerId]);
			(0, react.useEffect)(() => {
				loadData();
				const off = (ctx?.remote)?.$on?.("settings/document-updated", (ns) => {
					if (ns === "llm-pi-ai") loadData();
				});
				return () => {
					off?.();
				};
			}, [ctx, loadData]);
			const headerParse = parseJsonObject(headersText);
			const bodyParse = parseJsonObject(bodyText);
			const headersValid = headerParse.ok;
			const bodyValid = bodyParse.ok;
			const handleSave = async () => {
				if (!headersValid || !bodyValid || saving || !providerId) return;
				setSaving(true);
				setError(null);
				setSaveSuccess(false);
				try {
					const remote = ctx?.remote;
					const ops = [];
					const basePath = ["providers", providerId];
					if (inboundApi.length > 0) ops.push({
						op: "set",
						path: [...basePath, "inboundApi"],
						value: inboundApi
					});
					else ops.push({
						op: "unset",
						path: [...basePath, "inboundApi"]
					});
					if (outboundApi.length > 0) ops.push({
						op: "set",
						path: [...basePath, "api"],
						value: outboundApi
					});
					if (headerParse.value !== void 0) ops.push({
						op: "set",
						path: [...basePath, "headers"],
						value: headerParse.value
					});
					else ops.push({
						op: "unset",
						path: [...basePath, "headers"]
					});
					if (bodyParse.value !== void 0) ops.push({
						op: "set",
						path: [...basePath, "bodyOverrides"],
						value: bodyParse.value
					});
					else ops.push({
						op: "unset",
						path: [...basePath, "bodyOverrides"]
					});
					const res = await remote?.settings?.mutate("llm-pi-ai", ops, revision);
					if (res?.ok) {
						setSaveSuccess(true);
						setTimeout(() => setSaveSuccess(false), 2e3);
					} else setError(res?.error?.message ?? "保存失败");
				} catch (e) {
					setError(e.message || String(e));
				} finally {
					setSaving(false);
					loadData();
				}
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: ProviderExtrasCard_module_css_default.container,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: ProviderExtrasCard_module_css_default.toggleBtn,
					onClick: () => setOpen(!open),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: open ? "▾" : "▸" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("customParamsHeading") })]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: ProviderExtrasCard_module_css_default.content,
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: ProviderExtrasCard_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: ProviderExtrasCard_module_css_default.fieldLabelRow,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ProviderExtrasCard_module_css_default.fieldLabel,
									children: t("inboundApi")
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: ProviderExtrasCard_module_css_default.select,
								value: inboundApi,
								onChange: (e) => setInboundApi(e.target.value),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "",
										children: t("inboundApiAuto")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "openai-completions",
										children: t("protocolOpenAiCompletions")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "anthropic-messages",
										children: t("protocolAnthropicMessages")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "openai-responses",
										children: t("protocolOpenAiResponses")
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: ProviderExtrasCard_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: ProviderExtrasCard_module_css_default.fieldLabelRow,
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ProviderExtrasCard_module_css_default.fieldLabel,
									children: t("outboundApi")
								})
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
								className: ProviderExtrasCard_module_css_default.select,
								value: outboundApi,
								onChange: (e) => setOutboundApi(e.target.value),
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "openai-completions",
										children: t("protocolOpenAiCompletions")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "anthropic-messages",
										children: t("protocolAnthropicMessages")
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
										value: "openai-responses",
										children: t("protocolOpenAiResponses")
									})
								]
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: ProviderExtrasCard_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: ProviderExtrasCard_module_css_default.fieldLabelRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ProviderExtrasCard_module_css_default.fieldLabel,
									children: t("headers")
								}), !headersValid && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ProviderExtrasCard_module_css_default.error,
									children: t("headersInvalid")
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								rows: 3,
								className: `${ProviderExtrasCard_module_css_default.textarea} ${!headersValid ? ProviderExtrasCard_module_css_default.textareaInvalid : ""}`,
								value: headersText,
								placeholder: t("headersPlaceholder"),
								onChange: (e) => setHeadersText(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: ProviderExtrasCard_module_css_default.field,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: ProviderExtrasCard_module_css_default.fieldLabelRow,
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ProviderExtrasCard_module_css_default.fieldLabel,
									children: t("bodyOverrides")
								}), !bodyValid && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ProviderExtrasCard_module_css_default.error,
									children: t("bodyOverridesInvalid")
								})]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								rows: 3,
								className: `${ProviderExtrasCard_module_css_default.textarea} ${!bodyValid ? ProviderExtrasCard_module_css_default.textareaInvalid : ""}`,
								value: bodyText,
								placeholder: t("bodyOverridesPlaceholder"),
								onChange: (e) => setBodyText(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: ProviderExtrasCard_module_css_default.actions,
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: ProviderExtrasCard_module_css_default.saveBtn,
									disabled: !headersValid || !bodyValid || saving,
									onClick: handleSave,
									children: saving ? t("saving") : t("saveParams")
								}),
								saveSuccess && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									className: ProviderExtrasCard_module_css_default.success,
									children: ["✓ ", t("saved")]
								}),
								error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: ProviderExtrasCard_module_css_default.error,
									children: error
								})
							]
						})
					]
				})]
			});
		}
		//#endregion
		//#region src/client/index.ts
		const NS = "dsh-models-plus";
		/**
		* Required services (cordis fiber inject).
		* Injects into slots after ui-settings-models declared extension seats.
		*/
		const inject = [
			"slots",
			"locale",
			"remote",
			"remote.settings"
		];
		/**
		* Register extensions into official Models section slots.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-models-plus: local route copy");
			ctx.slots.inject("settings.models.footer", () => ctx.slots.register({
				name: "settings.models.footer",
				id: "dsh-local-route-footer",
				locale: NS,
				order: 100,
				inject: () => ({ ctx })
			}, LocalRouteFooterSection));
			ctx.slots.inject("settings.models.provider-card", () => ctx.slots.register({
				name: "settings.models.provider-card",
				key: "llm-pi-ai",
				locale: NS,
				order: 50,
				inject: () => ({ ctx })
			}, ProviderExtrasCard));
		}
		//#endregion
		exports.CustomApiDraftPortal = CustomApiDraftPortal;
		exports.LocalRouteCard = LocalRouteCard;
		exports.LocalRouteFooterSection = LocalRouteFooterSection;
		exports.ProviderExtrasCard = ProviderExtrasCard;
		exports.apply = apply;
		exports.en = en;
		exports.inject = inject;
		exports.zh = zh;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
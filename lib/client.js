window.__ModuleLoader__.load({
	id: "dsh-models-plus",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region \0dsh-css:/home/glh/dsh-models-plus/src/client/LocalRouteCard.module.css.mjs
		const css = ".wcBALa_localRouteControl{border:1px solid var(--dsw-alias-border-l2,#ffffff1f);background:var(--dsw-alias-bg-layer-2,#ffffff0a);border-radius:12px;flex-direction:column;gap:12px;margin-top:16px;padding:16px;display:flex}.wcBALa_localRouteHead{justify-content:space-between;align-items:center;gap:16px;display:flex}.wcBALa_localRouteTitle{color:var(--dsw-alias-label-primary,#fff);margin:0;font-size:14px;font-weight:600;line-height:22px}.wcBALa_localRouteAddress{font-family:var(--ds-font-family-code,monospace);color:var(--dsw-alias-label-tertiary,#ffffff80);overflow-wrap:anywhere;margin:2px 0 0;font-size:12px;line-height:18px}.wcBALa_routeSwitch{box-sizing:border-box;cursor:pointer;background:0 0;border:0;justify-content:center;align-items:center;width:40px;height:28px;padding:0;transition:opacity .16s ease-in-out;display:inline-flex}.wcBALa_routeSwitch:disabled{opacity:.4;cursor:default}.wcBALa_routeSwitch:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3,#ffffff4d);outline:none}.wcBALa_routeSwitchTrack{background:var(--dsw-alias-border-l2,#fff3);border-radius:9px;width:34px;height:18px;transition:background-color .2s cubic-bezier(.4,0,.2,1);display:block;position:relative}.wcBALa_routeSwitchTrack[data-on=true]{background:var(--dsw-alias-state-business-primary,#4d6bfe)}.wcBALa_routeSwitchThumb{background:#fff;border-radius:50%;width:12px;height:12px;transition:transform .2s cubic-bezier(.4,0,.2,1);position:absolute;top:3px;left:3px}.wcBALa_routeSwitchTrack[data-on=true] .wcBALa_routeSwitchThumb{transform:translate(16px)}.wcBALa_controlsRow{flex-wrap:wrap;justify-content:space-between;align-items:center;gap:16px;display:flex}.wcBALa_routePortField{align-items:center;gap:10px;display:flex}.wcBALa_fieldLabel{color:var(--dsw-alias-label-secondary,#ffffffb3);font-size:13px}.wcBALa_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2,#ffffff26);background:var(--dsw-alias-bg-layer-1,#0003);height:28px;color:var(--dsw-alias-label-primary,#fff);border-radius:6px;outline:none;padding:0 8px;font-size:13px;transition:border-color .15s}.wcBALa_input:focus{border-color:var(--dsw-alias-state-business-primary,#4d6bfe)}.wcBALa_input:disabled{opacity:.5;cursor:not-allowed}.wcBALa_routePortInput{width:90px}.wcBALa_routeRunning,.wcBALa_routeStopped{margin:0;font-size:12px;line-height:18px}.wcBALa_routeRunning{color:var(--dsw-alias-state-success-primary,#30a46c)}.wcBALa_routeStopped{color:var(--dsw-alias-label-tertiary,#ffffff80)}.wcBALa_error{color:var(--dsw-alias-state-danger-primary,#e54d2e);margin:0;font-size:12px;line-height:18px}";
		const tagId = "dsh-models-plus/LocalRouteCard.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-models-plus";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var LocalRouteCard_module_css_default = {
			"fieldLabel": "wcBALa_fieldLabel",
			"input": "wcBALa_input",
			"routePortInput": "wcBALa_routePortInput",
			"localRouteTitle": "wcBALa_localRouteTitle",
			"localRouteHead": "wcBALa_localRouteHead",
			"routeSwitch": "wcBALa_routeSwitch",
			"controlsRow": "wcBALa_controlsRow",
			"routePortField": "wcBALa_routePortField",
			"localRouteAddress": "wcBALa_localRouteAddress",
			"routeRunning": "wcBALa_routeRunning",
			"routeSwitchThumb": "wcBALa_routeSwitchThumb",
			"routeStopped": "wcBALa_routeStopped",
			"routeSwitchTrack": "wcBALa_routeSwitchTrack",
			"error": "wcBALa_error",
			"localRouteControl": "wcBALa_localRouteControl"
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
			customParamsHeading: "Header & Body Overrides (Advanced)",
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
			customParamsHeading: "自定义请求头与请求体 (高级定制)",
			headers: "Header 覆盖 (请求头)",
			headersPlaceholder: "JSON 对象，例如 {\"X-Custom-Header\":\"value\"}",
			headersInvalid: "必须是合法的 JSON 对象",
			bodyOverrides: "Body 覆盖 (请求体)",
			bodyOverridesPlaceholder: "合并到上游请求体的 JSON 对象，例如 {\"temperature\":0.7}",
			bodyOverridesInvalid: "必须是合法的 JSON 对象",
			saveParams: "保存覆盖设置",
			saving: "保存中…",
			saved: "保存成功"
		};
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
		function LocalRouteCard({ ctx, t: propsT }) {
			const [enabled, setEnabled] = (0, react.useState)(false);
			const [portDraft, setPortDraft] = (0, react.useState)("8317");
			const [activePort, setActivePort] = (0, react.useState)(8317);
			const [pending, setPending] = (0, react.useState)(false);
			const [failure, setFailure] = (0, react.useState)(void 0);
			const [nsInfo, setNsInfo] = (0, react.useState)(null);
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
					}
				} catch {}
			}, [ctx]);
			(0, react.useEffect)(() => {
				refresh();
				const off = (ctx?.remote)?.$on?.("settings/document-updated", (ns) => {
					if (ns === "dsh-local-route" || ns === "llm-pi-ai") refresh();
				});
				return () => {
					off?.();
				};
			}, [ctx, refresh]);
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
					}) : null
				]
			});
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
			const [open, setOpen] = (0, react.useState)(false);
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
			if (!providerId) return null;
			const headerParse = parseJsonObject(headersText);
			const bodyParse = parseJsonObject(bodyText);
			const headersValid = headerParse.ok;
			const bodyValid = bodyParse.ok;
			const handleSave = async () => {
				if (!headersValid || !bodyValid || saving) return;
				setSaving(true);
				setError(null);
				setSaveSuccess(false);
				try {
					const remote = ctx?.remote;
					const ops = [];
					const basePath = ["providers", providerId];
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
				style: {
					marginTop: "10px",
					paddingTop: "10px",
					borderTop: "1px dashed var(--dsw-alias-border-l2, rgba(255,255,255,0.12))"
				},
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					style: {
						background: "none",
						border: "none",
						padding: "4px 0",
						cursor: "pointer",
						fontSize: "12px",
						color: "var(--dsw-alias-state-business-primary, #4d6bfe)",
						display: "flex",
						alignItems: "center",
						gap: "6px"
					},
					onClick: () => setOpen(!open),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: open ? "▼" : "▶" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("customParamsHeading") })]
				}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					style: {
						display: "flex",
						flexDirection: "column",
						gap: "10px",
						marginTop: "8px"
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							style: {
								display: "flex",
								justifyContent: "space-between",
								marginBottom: "4px"
							},
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: "12px",
									color: "var(--dsw-alias-label-secondary, rgba(255,255,255,0.7))"
								},
								children: t("headers")
							}), !headersValid && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: "11px",
									color: "var(--dsw-alias-state-danger-primary, #e54d2e)"
								},
								children: t("headersInvalid")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							rows: 3,
							style: {
								width: "100%",
								boxSizing: "border-box",
								padding: "6px 8px",
								fontSize: "12px",
								fontFamily: "monospace",
								background: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.2))",
								border: `1px solid ${headersValid ? "var(--dsw-alias-border-l2, rgba(255,255,255,0.15))" : "var(--dsw-alias-state-danger-primary, #e54d2e)"}`,
								borderRadius: "6px",
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
								style: {
									fontSize: "12px",
									color: "var(--dsw-alias-label-secondary, rgba(255,255,255,0.7))"
								},
								children: t("bodyOverrides")
							}), !bodyValid && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								style: {
									fontSize: "11px",
									color: "var(--dsw-alias-state-danger-primary, #e54d2e)"
								},
								children: t("bodyOverridesInvalid")
							})]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
							rows: 3,
							style: {
								width: "100%",
								boxSizing: "border-box",
								padding: "6px 8px",
								fontSize: "12px",
								fontFamily: "monospace",
								background: "var(--dsw-alias-bg-layer-1, rgba(0,0,0,0.2))",
								border: `1px solid ${bodyValid ? "var(--dsw-alias-border-l2, rgba(255,255,255,0.15))" : "var(--dsw-alias-state-danger-primary, #e54d2e)"}`,
								borderRadius: "6px",
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
									disabled: !headersValid || !bodyValid || saving,
									onClick: handleSave,
									style: {
										padding: "4px 12px",
										fontSize: "12px",
										cursor: !headersValid || !bodyValid || saving ? "not-allowed" : "pointer",
										borderRadius: "6px",
										border: "1px solid var(--dsw-alias-border-l2, rgba(255,255,255,0.2))",
										background: "var(--dsw-alias-bg-layer-2, rgba(255,255,255,0.1))",
										color: "var(--dsw-alias-label-primary, #fff)",
										opacity: !headersValid || !bodyValid || saving ? .5 : 1
									},
									children: saving ? t("saving") : t("saveParams")
								}),
								saveSuccess && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
									style: {
										fontSize: "12px",
										color: "var(--dsw-alias-state-success-primary, #30a46c)"
									},
									children: ["✓ ", t("saved")]
								}),
								error && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									style: {
										fontSize: "12px",
										color: "var(--dsw-alias-state-danger-primary, #e54d2e)"
									},
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
			}, LocalRouteCard));
			ctx.slots.inject("settings.models.provider-card", () => ctx.slots.register({
				name: "settings.models.provider-card",
				key: "llm-pi-ai",
				locale: NS,
				order: 50,
				inject: () => ({ ctx })
			}, ProviderExtrasCard));
		}
		//#endregion
		exports.LocalRouteCard = LocalRouteCard;
		exports.ProviderExtrasCard = ProviderExtrasCard;
		exports.apply = apply;
		exports.en = en;
		exports.inject = inject;
		exports.zh = zh;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map
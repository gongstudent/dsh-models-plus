# dsh-models-plus

[English](README.md) | 中文

[![Listed on dsh-plugin.org](https://dsh-plugin.org/badges/listed.svg)](https://dsh-plugin.org/plugins/gongstudent/dsh-models-plus)

DeepSeek Harness 的本地路由代理与模型高级扩展插件包（Loopback Local Route & Provider Extras）：
1. **本地路由代理（Loopback Local Route）**：提供端口可配置的本地代理服务（默认 `8317`），将 OpenAI 与 Anthropic 协议双向桥接到配置的模型服务，供 Cline、Claude Dev、Cursor、LibreChat 等外部客户端直接调用。
2. **请求头与请求体覆盖（Headers & Body Overrides）**：通过官方标准的 `settings.models.provider-card` 插槽，在各 Provider 卡片内无缝嵌入请求头与请求体 JSON 自定义配置，满足特殊中转网关、代理鉴权或参数微调需求。
3. **零冲突纯外挂架构**：完整保留官方原生界面（原生模型选择、最新版本内置的模型搜索过滤、一键全选/取消、DeepSeek 官方账号登录等），**彻底避免版本更新冲突与白屏问题**。

---

## 功能亮点

### 1. 本地路由代理服务（支持端口自定义，默认 `8317`）
- **双向协议转换**：支持将外部传入的 OpenAI（`/v1/chat/completions`, `/v1/responses`）和 Anthropic（`/v1/messages`）请求转发给 DSH 内配置的各家 provider。
- **健康检查与路由发现**：通过 `GET /health` 查看当前就绪的路由列表与工作状态。
- **端口自由配置**：支持在模型设置页底部的「本地路由」卡片中实时修改端口（`1024`~`65535`，默认 `8317`），后台自动热重载生效，无需重启服务。

### 2. 自定义请求头与请求体（Headers & Body Overrides）
- **按渠道个性化定制**：在「设置」->「模型」的每个 Provider 卡片中，展开「自定义请求头与请求体 (高级定制)」面板。
- **Header 覆盖**：输入 JSON 对象（如 `{"X-Custom-Header": "value"}`），在上游调用时自动注入请求头。
- **Body 覆盖**：输入 JSON 对象（如 `{"temperature": 0.7}`），合并到上游请求体中。

### 3. 模型列表与选择体验
- **原生保留**：所有 Provider 的模型添加、自定义模型、模型列表维护完全交由 DSH 原生处理。
- **搜索与批量选择**：在「发现模型」弹窗中，直接使用 DSH 0.2.x 原生内置的模型 ID / 名称搜索过滤框，以及一键全选/全部取消勾选按钮。

---

## 安装指南（Windows / macOS / Linux 通用）

### 环境要求
- Node.js >= 22
- Git
- pnpm

### 一键安装本插件包
在终端执行：

```sh
# 如果全局安装了 dsh（适用于 Web 版）：
dsh plugin --profile web add -w github:gongstudent/dsh-models-plus

# 如果安装到桌面版（Desktop）：
dsh plugin --profile desktop add -w github:gongstudent/dsh-models-plus

# 如果是通过 npx 启动的用户：
npx @deepseek-ai/dsh plugin --profile web add -w github:gongstudent/dsh-models-plus
```

启动 Web 界面或桌面客户端：
```sh
dsh web
```

打开「设置」->「模型」，即可在页面底部看到「本地路由代理」控制卡片，展开各 Provider 即可配置自定义 Headers 与 Body Overrides！

---

## 验证与使用

### 验证本地路由服务
当设置中启用了本地路由时，在终端执行测试：

```sh
# 将 <端口> 替换为你配置的端口（默认为 8317）
curl http://127.0.0.1:<端口>/health
```

成功返回示例：
```json
{"status":"ok","host":"127.0.0.1","routes":["deepseek","openai","anthropic"],"endpoints":["/v1/chat/completions","/v1/responses","/v1/messages"]}
```

---

## 权限与风险

- **仅监听回环**：代理只绑定 `127.0.0.1`，其他机器无法访问。
- **上游与密钥**：请求只发往你配置的渠道，使用 Harness 为该路由解析出的凭据（上游收到 `Authorization: Bearer …` 或 `x-api-key`）。本插件不存储任何密钥，也不访问其他服务。
- **无遥测**：除转发你自己的请求、在回环地址应答 `GET /health` 外，不发起任何其他网络请求。
- **仅占用一个本地端口**：启用后打开一个 TCP 端口（默认 `8317`，范围 `1024`–`65535`），不改动系统其他设置。
- **兼容性**：支持 DeepSeek Harness 的 Web 与 Desktop profile（v0.1.x / v0.2.x 及以后），通过官方 `settings.models.footer` 插槽注册，不替换任何官方包。

---

## 开发

```sh
pnpm install            # 仅安装构建工具链；@deepseek-ai/* 宿主包保持外部依赖
pnpm typecheck          # 对 src/ 与 build/ 执行 tsc --noEmit
pnpm smoke              # 对本地路由代理执行行为冒烟测试（上游为桩服务）
pnpm build              # 重新构建 lib/（宿主部分 + 客户端 bundle）
```

- **`lib/` 是刻意提交的**：树外客户端插件直接由它提供文件，因此改动源码后必须执行
  `pnpm build`，并把重建后的 `lib/` 一并提交。
- **构建结果可复现**：CSS Module 类名与 bundle 内记录的模块路径都是仓库相对路径，
  同一份源码在不同目录构建出的产物逐字节一致。
- `pnpm prepare-src [checkout] [--dry-run]` 用于从 harness 检出目录重新同步
  内置的适配器模块；它不会触碰 `src/index.ts` 与 `src/client/**`（属于本插件自身）。

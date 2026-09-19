# dsh-models-plus

[English](README.md) | 中文

DeepSeek Harness 的一体化插件包（Profile Bundle），提供两大核心能力：
1. **本地路由代理（Loopback Local Route）**：提供端口可配置的本地代理服务（默认 `8317`），将 OpenAI 与 Anthropic 协议双向桥接到配置的模型服务，供 Cline、Claude Dev、Cursor 等外部客户端直接调用。
2. **模型设置页增强（Models Settings UI）**：提供模型发现结果实时搜索、一键批量取消勾选，并彻底解决本地路由开关切换时的页面卡顿问题。

二合一开箱即用包：一次安装，宿主端网络路由与浏览器端界面增强同时生效。

---

## 功能亮点

### 1. 本地路由代理服务（支持端口自定义，默认 `8317`）
- **双向协议转换**：支持将外部传入的 OpenAI（`/v1/chat/completions`, `/v1/responses`）和 Anthropic（`/v1/messages`）请求转发给 DSH 内配置的各家 provider。
- **健康检查与路由发现**：通过 `GET /health` 查看当前就绪的路由列表与工作状态。
- **端口自由配置**：支持在 Web 界面「设置」->「模型」->「本地路由」端口输入框中实时修改，或在 `settings.yaml` 中配置（支持 `1024`~`65535`，默认 `8317`）。修改后后台自动热重载生效，无需重启服务。

### 2. 模型设置页界面增强
| 功能 | 原版表现 | dsh-models-plus 表现 |
|---|---|---|
| 模型发现搜索 | 候选列表很长，无法过滤 | 实时输入过滤，按 ID 秒搜候选模型 |
| 批量反选 | 只能一个个手动点击取消 | 提供「全部取消勾选」按钮，连同被过滤隐藏的一并清空 |
| 本地路由开关 | 每次配置版本变化就重新挂载导致卡顿闪烁 | 乐观状态更新，毫秒级响应，平滑不卡顿 |
| 空结果提示 | 空白列表 | 友好的「无匹配模型」提示 |

---

## 安装指南（Windows / macOS / Linux 通用）

### 环境要求
- Node.js >= 22
- Git
- pnpm

### 第一步：安装 DeepSeek Harness（指定稳定版本）
对于直接通过 npm 安装的用户，推荐安装 `@deepseek-ai/dsh@0.1.1-rc.2`（此版本与本插件的底层服务接口完全对齐）：

```sh
npm install -g @deepseek-ai/dsh@0.1.1-rc.2
```

*(注：如果你使用的是本地源码构建的 DeepSeek Harness，直接使用即可，无需指定版本号)*。

### 第二步：一键安装本插件包
在终端执行：

```sh
# 如果全局安装了 dsh：
dsh plugin --profile web add -w github:gongstudent/dsh-models-plus

# 如果是通过 npx 启动的用户：
npx @deepseek-ai/dsh plugin --profile web add -w github:gongstudent/dsh-models-plus
```

也可以使用完整 git 仓库地址或指定版本 tag：

```sh
dsh plugin --profile web add -w https://github.com/gongstudent/dsh-models-plus.git
dsh plugin --profile web add -w github:gongstudent/dsh-models-plus#v1.0.0
```

> **首次安装放行提示（如遇拦截）**：pnpm 对带有安装脚本的依赖（如 `@google/genai`, `protobufjs`）有安全审查策略。如果安装时提示：
> ```
> [ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @google/genai, protobufjs
> ```
> 只需打开该 profile 的工作区配置（位于 `~/.dsh/profiles/web/pnpm-workspace.yaml`，Windows 上位于 `%USERPROFILE%\.dsh\profiles\web\pnpm-workspace.yaml`），加入放行声明：
> ```yaml
> allowBuilds:
>   '@google/genai': true
>   protobufjs: true
> ```
> 然后重新运行 `dsh plugin --profile web add ...` 即可。

### 第三步：启动使用
启动 Web 界面：

```sh
dsh web
```

本地路由代理与增强后的模型设置页将同时启用！

---

## 验证与使用

### 1. 验证本地路由服务
当 `dsh web` 运行且设置中启用了本地路由时，执行测试：

```sh
# 将 <端口> 替换为你配置的端口（默认为 8317）
curl http://127.0.0.1:<端口>/health
```

成功返回示例：
```json
{"status":"ok","host":"127.0.0.1","routes":["cline","gemini"]}
```

### 2. 验证前端模型设置页
1. 浏览器打开 Web 界面（默认 `http://127.0.0.1:3080`）。
2. 点击左下角 **设置** -> **模型**。
3. 在任意 Provider 点击 **发现模型**，即可体验搜索框与一键反选。

### 3. 不启动服务查看插件树组合
```sh
dsh --profile web --dump-config
```
会显示 `ui-settings-models` 和 `llm-pi-ai` 已被置为 `disabled: true`，并成功挂载了 `dsh-models-plus`。

---

## 卸载

如果需要卸载本插件并完全恢复官方原生组件：

```sh
dsh plugin --profile web remove dsh-models-plus
```

由于本插件是通过配置层禁用官方插件而非物理覆写，卸载后官方组件立即自动恢复。

---

## 架构原理

本包采用**宿主 + 浏览器双面同构设计（Dual-Face Bundle）**：
- **宿主侧（`lib/index.js`）**：替换原 `llm-pi-ai` 适配器，拉起可配置端口（默认 `8317`）的 HTTP 路由代理服务，负责跨协议流式转发与认证解析。
- **浏览器侧（`lib/client.js`）**：通过 `package.json` 中的 `dsh.client` 自动接入前端运行时，作为无状态模块由 Cordis Web 动态加载并挂载到设置槽位。
- **补丁声明（`cordis.patch.yml`）**：声明式管理插件拓扑，插拔无痕。

---

## 开源协议

MIT

# dsh-models-plus

English | [中文](README.zh.md)

A DeepSeek Harness profile bundle that provides:
1. **Loopback Local Route** (configurable proxy server, default port `8317`) — seamlessly bridges DeepSeek Harness models with OpenAI- and Anthropic-compatible clients (e.g. Cline, Claude Dev, cursor, etc.).
2. **Models Settings Page Enhancements** — search box for model discovery, one-click bulk deselect, and an optimistic toggle for the local route that eliminates UI stutter.

Packaged as a 2-in-1 drop-in bundle: install once, and both host-side local route proxy and frontend UI enhancements are fully activated.

---

## Features

### 1. Loopback Local Route Proxy (Configurable Port, default: `8317`)
- **Protocol Translation**: Converts OpenAI (`/v1/chat/completions`, `/v1/responses`) and Anthropic (`/v1/messages`) requests to configured DSH provider profiles.
- **Health Check & Route Discovery**: `GET /health` lists active provider routes and status.
- **Port Customization**: Freely configurable via Web UI Settings -> Models -> Local Route port input or in `settings.yaml` (ports `1024`–`65535`, defaults to `8317`). Changes take effect dynamically without restarting the server.

### 2. Models Settings Page Enhancements
| Feature | Upstream Behaviour | dsh-models-plus |
|---|---|---|
| Model Search | Long candidate list without filtering | Real-time search box filters candidate models by id |
| Bulk Deselect | Click checkboxes one by one | **Deselect all** clears all picks, including those filtered out |
| Local Route Switch | Stutters and remounts on settings revision | Optimistic on/off toggle with instant feedback and zero stutter |
| Empty Results | Blank space | Clear "No matching models" indicator |

---

## Installation (Windows / macOS / Linux)

### Prerequisites
- Node.js >= 22
- Git
- pnpm

### Step 1: Install DeepSeek Harness (Pinned Version)
For npm-based installations, install `@deepseek-ai/dsh@0.1.1-rc.2` (the stable base matching this host adapter):

```sh
npm install -g @deepseek-ai/dsh@0.1.1-rc.2
```

*(Note: If you build DeepSeek Harness from source checkout, no version pin is needed).*

### Step 2: Install this Plugin Bundle
In your terminal, run:

```sh
dsh plugin --profile web add github:gongstudent/dsh-models-plus
```

Or via HTTPS / pinned tag:

```sh
dsh plugin --profile web add https://github.com/gongstudent/dsh-models-plus.git
dsh plugin --profile web add github:gongstudent/dsh-models-plus#v1.0.0
```

> **Note for first-time install**: pnpm enforces a supply-chain check on packages with install scripts (`@google/genai`, `protobufjs`). If pnpm prompts:
> ```
> [ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: @google/genai, protobufjs
> ```
> Simply open your profile's workspace file (located at `~/.dsh/profiles/web/pnpm-workspace.yaml`, or `%USERPROFILE%\.dsh\profiles\web\pnpm-workspace.yaml` on Windows) and add:
> ```yaml
> allowBuilds:
>   '@google/genai': true
>   protobufjs: true
> ```
> Then re-run the `dsh plugin --profile web add ...` command.

### Step 3: Launch
Start the Web UI:

```sh
dsh web
```

Both the Local Route proxy and the customized Models settings page will be active!

---

## Verifying the Installation

### 1. Verify Local Route Proxy
With `dsh web` running and Local Route enabled in settings:

```sh
# Replace <port> with your configured port (default is 8317)
curl http://127.0.0.1:<port>/health
```

Response:
```json
{"status":"ok","host":"127.0.0.1","routes":["..."]}
```

### 2. Verify Models Page UI
1. Open the Web GUI in your browser (default: `http://127.0.0.1:3080`).
2. Navigate to **Settings** -> **Models**.
3. Under any provider (e.g. DeepSeek or Custom), click **Discover Models** to see the search bar and batch selection buttons.

### 3. Verify Composition without Booting
```sh
dsh --profile web --dump-config | grep -B1 -A2 'llm-pi-ai\|ui-settings-models'
```

---

## Uninstallation

To remove the bundle and restore the original shipped components:

```sh
dsh plugin --profile web remove dsh-models-plus
```

The shipped `llm-pi-ai` and `ui-settings-models` were only *disabled* by the bundle patch, so removing the bundle immediately restores both.

---

## Architecture

This package is a dual-face bundle:
- **Host half** (`lib/index.js`): Replaces `llm-pi-ai` to provide the configurable loopback proxy HTTP server (default `8317`), route dispatcher, and multi-provider protocol conversion.
- **Browser half** (`lib/client.js`): Discovered automatically via `dsh.client` in `package.json`, compiled as a standalone CJS module loaded by Cordis Web module loader at runtime.
- **Bundle patch** (`cordis.patch.yml`): Disables the upstream rows and mounts this unified plugin seamlessly.

---

## License

MIT

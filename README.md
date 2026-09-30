# dsh-models-plus

English | [中文](README.zh.md)

DeepSeek Harness loopback local route extension plugin, integrated via the official `settings.models.footer` extension slot:
1. **Loopback Local Route Proxy**: Provides a configurable local proxy service (default `8317`), bridging OpenAI and Anthropic protocols to models configured in Harness, allowing external clients like Cline, Claude Dev, Cursor, and LibreChat to connect seamlessly.
2. **Zero-Conflict UI Extension**: Seamlessly attaches to the bottom of Settings -> Models using DSH's official slot extension contract, preserving all official features (built-in model search, bulk select/deselect, DeepSeek Account login, etc.), **completely eliminating version update breakages and blank screen issues**.

---

## Highlights

### 1. Local Route Proxy (Configurable port, default `8317`)
- **Bidirectional protocol bridge**: Translates incoming OpenAI (`/v1/chat/completions`, `/v1/responses`) and Anthropic (`/v1/messages`) requests to active DSH providers.
- **Health check & route discovery**: `GET /health` inspects available routes and server status.
- **Dynamic port configuration**: Easily toggle on/off and customize port (`1024`–`65535`) directly from the Models settings page with instant hot reload.

### 2. Long-term Slot-based Architecture
- **Zero intrusive replacement**: Does not disable or replace core DSH packages (`ui-settings-models` or `llm-pi-ai`), ensuring upstream updates and improvements work out of the box.
- **Cross-platform & version resilient**: Works reliably on both DSH Web and Desktop (v0.1.x, v0.2.x, and future releases).

---

## Installation Guide (Windows / macOS / Linux)

### Requirements
- Node.js >= 22
- Git
- pnpm

### One-line Installation
Run in terminal:

```sh
# For Web profile:
dsh plugin --profile web add -w github:gongstudent/dsh-models-plus

# For Desktop profile:
dsh plugin --profile desktop add -w github:gongstudent/dsh-models-plus
```

Start Harness:
```sh
dsh web
```

Navigate to Settings -> Models; the Local Route Proxy card is ready at the bottom of the page!

---

## Verification

```sh
curl http://127.0.0.1:8317/health
```

Response example:
```json
{"status":"ok","host":"127.0.0.1","routes":["deepseek","openai","anthropic"],"endpoints":["/v1/chat/completions","/v1/responses","/v1/messages"]}
```

---

## Development

```sh
pnpm install            # toolchain only; the @deepseek-ai/* host packages are external
pnpm typecheck          # tsc --noEmit over src/ and build/
pnpm smoke              # behavioural checks for the proxy against a stubbed upstream
pnpm build              # rebuilds lib/ (host half + client bundle)
```

- **`lib/` is committed on purpose**: an out-of-tree client plugin is served
  straight from it, so a source change must be followed by `pnpm build` and the
  rebuilt `lib/` committed alongside it.
- **The build is deterministic**: CSS Module class names and the module paths
  the bundle records are repository-relative, so the same sources build to
  byte-identical artifacts in any checkout directory.
- `pnpm prepare-src [checkout] [--dry-run]` re-syncs the vendored adapter
  modules from a harness checkout. It never touches `src/index.ts` or
  `src/client/**`, which are this plugin's own.

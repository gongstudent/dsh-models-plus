/**
 * Re-sync sources from a DeepSeek Harness checkout into ./src.
 *
 * Copies:
 * 1. packages/llm/llm-pi-ai/src/* -> ./src/ (host adapter + local route)
 * 2. packages/client/ui-settings-models/src/* -> ./src/client/ (Models UI)
 * 3. Rewrites package identifiers in invariant.ts
 *
 * Usage: node scripts/prepare-src.mjs [path-to-dsh-checkout]
 * @module dsh-models-plus/prepare-src
 */
import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checkout = resolve(process.argv[2] ?? process.env.DSH_CHECKOUT ?? join(root, '..', 'deepseek-harness-fork'))
const hostSource = join(checkout, 'packages', 'llm', 'llm-pi-ai', 'src')
const clientSource = join(checkout, 'packages', 'client', 'ui-settings-models', 'src')

if (!existsSync(hostSource) || !existsSync(clientSource)) {
  process.stderr.write('prepare-src: sources not found in checkout\n')
  process.exit(1)
}

const target = join(root, 'src')

// Copy host files
for (const f of ['adapter.ts', 'catalog.ts', 'config.ts', 'context.ts', 'discovery.ts', 'index.ts', 'invariant.ts', 'local-route.ts', 'provider.ts', 'replay.ts', 'stream.ts']) {
  await cp(join(hostSource, f), join(target, f))
}

// Copy client files
await cp(join(clientSource, 'client'), join(target, 'client'), { recursive: true })
await cp(join(clientSource, 'onboarding-copy.ts'), join(target, 'onboarding-copy.ts'))
await cp(join(clientSource, 'css-modules.d.ts'), join(target, 'css-modules.d.ts'))

// Rename invariant identifiers
const invPath = join(target, 'invariant.ts')
const invContent = await readFile(invPath, 'utf8')
await writeFile(
  invPath,
  invContent
    .replace('@deepseek-ai/dsh-llm-pi-ai', 'dsh-models-plus')
    .replace('llm-pi-ai-invariant', 'models-plus-invariant'),
)

console.log('prepare-src: completed successfully')

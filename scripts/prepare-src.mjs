/**
 * Re-sync the upstream pi-ai adapter sources this package vendors into ./src.
 *
 * Copies the host adapter modules from a DeepSeek Harness checkout into ./src,
 * so a harness upgrade can be picked up without hand-merging each file.
 *
 * ## What is plugin-owned and must never be synced
 *
 * - `src/index.ts` — this package's own plugin entry (Config/apply). The
 *   checkout's `index.ts` is the upstream *adapter* entry, which registers a
 *   completely different plugin; copying it silently replaces this package.
 * - `src/client/**` — the Local Route settings card, its locales and its
 *   stylesheet are written here, not derived from the checkout. The checkout's
 *   `ui-settings-models` client is the official Models page, not this card.
 *
 * An earlier revision copied both, which would have destroyed the plugin.
 * Anything added to the lists below must be a file this package merely vendors.
 *
 * Usage: node scripts/prepare-src.mjs [path-to-dsh-checkout] [--dry-run]
 *   Checkout defaults to $DSH_CHECKOUT, then ../deepseek-harness-fork.
 * @module dsh-models-plus/prepare-src
 */
import { cp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const argv = process.argv.slice(2)
const dryRun = argv.includes('--dry-run')
const checkoutArg = argv.find(argument => !argument.startsWith('-'))
const checkout = resolve(checkoutArg ?? process.env.DSH_CHECKOUT ?? join(root, '..', 'deepseek-harness-fork'))
const hostSource = join(checkout, 'packages', 'llm', 'llm-pi-ai', 'src')
const target = join(root, 'src')

/**
 * Vendored host modules, in the order the adapter imports them. A file absent
 * from the checkout is reported rather than fatal: the upstream set changes
 * between releases, and a missing optional module must not stop the sync of the
 * ones that are there.
 */
const HOST_FILES = [
  'catalog.ts',
  'config.ts',
  'discovery.ts',
  'invariant.ts',
  'local-route.ts',
  'provider.ts',
]

if (!existsSync(hostSource)) {
  process.stderr.write(`prepare-src: host sources not found at ${hostSource}\n`)
  process.exit(1)
}

let copied = 0
let changed = 0

for (const file of HOST_FILES) {
  const from = join(hostSource, file)
  const to = join(target, file)
  if (!existsSync(from)) {
    process.stdout.write(`prepare-src: skip ${file} (not in this checkout)\n`)
    continue
  }
  const incoming = await readFile(from)
  const current = existsSync(to) ? await readFile(to) : undefined
  if (current?.equals(incoming) === true) {
    process.stdout.write(`prepare-src: unchanged ${file}\n`)
    continue
  }
  // A file that differs is either upstream moving on or a local fix that this
  // sync is about to drop; the report names it so the diff can be reviewed
  // before it is committed.
  process.stdout.write(`prepare-src: ${current === undefined ? 'add' : 'OVERWRITE'} ${file}\n`)
  copied += 1
  if (current !== undefined) changed += 1
  if (!dryRun) await cp(from, to)
}

// The invariant companion names the package it reserves ownership of, and the
// checkout spells it as the upstream package.
const invariantPath = join(target, 'invariant.ts')
if (existsSync(invariantPath)) {
  const before = await readFile(invariantPath, 'utf8')
  const after = before
    .replace('@deepseek-ai/dsh-llm-pi-ai', 'dsh-models-plus')
    .replace('llm-pi-ai-invariant', 'models-plus-invariant')
  if (after === before) {
    process.stdout.write('prepare-src: invariant.ts already carries this package name\n')
  } else {
    process.stdout.write('prepare-src: rewrote invariant.ts package identifiers\n')
    if (!dryRun) await writeFile(invariantPath, after)
  }
}

process.stdout.write(`prepare-src: ${dryRun ? 'dry run, ' : ''}${copied} file(s) to write, ${changed} overwriting local content\n`)
if (dryRun) process.stdout.write('prepare-src: nothing was written (--dry-run)\n')

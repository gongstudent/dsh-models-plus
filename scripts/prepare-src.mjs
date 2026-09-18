/**
 * Copy the Models settings page out of a DeepSeek Harness checkout into
 * ./src and rename it to this package.
 *
 * The page is a fork of `packages/client/ui-settings-models`: the upstream
 * package cannot be extended in place, because the two local changes live
 * inside its dialog and its local-route control rather than on a seam. Keeping
 * the copy mechanical is what makes re-syncing against a newer checkout a
 * `prepare-src` run plus a review of the diff.
 *
 * Usage: node scripts/prepare-src.mjs [path-to-dsh-checkout]
 * @module dsh-models-plus/prepare-src
 */
import { cp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const UPSTREAM_PACKAGE = '@deepseek-ai/dsh-client-ui-settings-models'
const UPSTREAM_PLUGIN = 'client-ui-settings-models-invariant'
const PACKAGE = 'dsh-models-plus'
const PLUGIN = 'models-plus-invariant'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checkout = resolve(process.argv[2] ?? process.env.DSH_CHECKOUT ?? join(root, '..', 'deepseek-harness-fork'))
const source = join(checkout, 'packages', 'client', 'ui-settings-models', 'src')

if (!existsSync(source)) {
  process.stderr.write(`prepare-src: no upstream sources at ${source}\n`)
  process.stderr.write('prepare-src: pass a DeepSeek Harness checkout path as the first argument\n')
  process.exit(1)
}

const target = join(root, 'src')
await rm(target, { recursive: true, force: true })
await cp(source, target, { recursive: true })

// Only identity strings are rewritten: the locale namespace, the slot id, and
// every component name stay upstream's, because the shipped rows this package
// shadows are disabled rather than co-mounted.
const renamed = []
for (const file of ['index.ts', 'invariant.ts']) {
  const path = join(target, file)
  const before = await readFile(path, 'utf8')
  const after = before.split(UPSTREAM_PACKAGE).join(PACKAGE).split(UPSTREAM_PLUGIN).join(PLUGIN)
  if (after !== before) {
    await writeFile(path, after)
    renamed.push(file)
  }
}

process.stdout.write(`prepare-src: copied ${source} -> src (renamed: ${renamed.join(', ') || 'none'})\n`)

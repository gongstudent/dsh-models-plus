import { clientBundle } from './build/tsdown.client.ts'

// Entries are the TypeScript sources rather than the repository preset's
// `lib/types/*.js`: this package ships no tsc pass, so tsdown strips the
// type-only imports itself and emits lib/index.js and lib/invariant.js.
export default clientBundle('dsh-models-plus', ['src/index.ts', 'src/invariant.ts'])

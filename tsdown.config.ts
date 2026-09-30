import { clientBundle } from './build/tsdown.client.ts'

export default clientBundle(
  'dsh-models-plus',
  ['src/index.ts', 'src/invariant.ts'],
  {
    // The @deepseek-ai/* host packages are supplied by the harness at runtime
    // (see .npmrc), so the node half must import them by name rather than
    // inline a second copy of a service the harness already owns.
    deps: {
      neverBundle: [/^@deepseek-ai\//],
    },
  },
)

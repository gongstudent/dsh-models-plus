import { clientBundle } from './build/tsdown.client.ts'

export default clientBundle(
  'dsh-models-plus',
  ['src/index.ts', 'src/invariant.ts'],
  {
    lib: {
      fixedExtension: false,
      deps: {
        neverBundle: [/^@deepseek-ai\//],
      },
    },
  },
)

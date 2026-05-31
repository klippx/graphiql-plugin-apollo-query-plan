import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  // CSS files are bundled into dist/index.css
  // Consumers must import 'graphiql-plugin-apollo-query-plan/style.css'
  // in addition to the JS entry point.
  external: [
    'react',
    'react-dom',
    'graphql',
    '@graphiql/react',
    '@graphiql/toolkit',
  ],
})

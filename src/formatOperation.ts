let prettierMissingWarned = false

/**
 * Formats a raw GraphQL operation string using Prettier.
 *
 * Prettier is an optional peer dependency. If it is not installed this
 * function emits a one-time console warning and returns the original string
 * unchanged. Install `prettier` (>=3) to enable formatted output inside
 * Fetch nodes.
 */
export async function formatOperation(val: string): Promise<string> {
  try {
    const [{ format }, { default: prettierPluginGraphql }] = await Promise.all([
      import('prettier/standalone'),
      import('prettier/plugins/graphql'),
    ])
    return await format(val, {
      parser: 'graphql',
      plugins: [prettierPluginGraphql],
    })
  } catch (error) {
    // If the import itself failed, prettier is not installed — warn once.
    if (
      error instanceof Error &&
      (error.message.includes('Cannot find') ||
        error.message.includes('Failed to resolve') ||
        error.message.includes('Cannot resolve') ||
        error.message.includes('MODULE_NOT_FOUND'))
    ) {
      if (!prettierMissingWarned) {
        prettierMissingWarned = true
        console.warn(
          '[graphiql-plugin-apollo-query-plan] Install the optional peer dependency ' +
            '`prettier` (>=3) to enable formatted GraphQL operations inside Fetch nodes. ' +
            'Pass `formatOperation={async (op) => op}` to suppress this warning.',
        )
      }
    }
    return val
  }
}

import { useGraphiQL } from '@graphiql/react'
import type { SyncExecutionResult } from '@graphiql/toolkit'
import React from 'react'
import { convertExperimentalToApolloPlan } from './convertExperimentalToApolloPlan'
import type {
  ApolloQueryPlan,
  GraphQLResponseWithQueryPlan,
} from './queryPlanTypes'

/** Unwraps a Fetcher result into a plain ExecutionResult.
 *  createGraphiQLFetcher returns AsyncIterable when incremental delivery is enabled. */
async function unwrapFetcherResult(
  result: SyncExecutionResult,
): Promise<GraphQLResponseWithQueryPlan> {
  if (Symbol.asyncIterator in Object(result)) {
    for await (const chunk of result as AsyncIterable<GraphQLResponseWithQueryPlan>) {
      return chunk
    }
    throw new Error('Empty response from fetcher')
  }
  return result as GraphQLResponseWithQueryPlan
}

export type UseQueryPlanOptions = {
  /**
   * Called whenever an error occurs; receives a short label and a descriptive message.
   * Should be a stable reference (e.g. wrapped in `useCallback`).
   */
  onError: (label: string, message: string) => void
}

type UseQueryPlanReturn = {
  /** Fires the dry-run fetch and returns the plan, or null if none was returned. */
  fetchPlan: () => Promise<ApolloQueryPlan | null>
  isLoading: boolean
}

/**
 * Hook for query plan visualiser buttons.
 *
 * Reads the current editor query, calls `fetcherAction` with the
 * `apollo-expose-query-plan: dry-run` header, and extracts
 * `extensions.apolloQueryPlan` from the response.
 *
 * `onError` should be a stable reference (e.g. wrapped in `useCallback`).
 */
export const useQueryPlan = ({
  onError,
}: UseQueryPlanOptions): UseQueryPlanReturn => {
  const { queryEditor, variableEditor, fetcher } = useGraphiQL((state) => ({
    queryEditor: state.queryEditor,
    variableEditor: state.variableEditor,
    fetcher: state.fetcher,
  }))
  const [isLoading, setIsLoading] = React.useState(false)

  const fetchPlan =
    React.useCallback(async (): Promise<ApolloQueryPlan | null> => {
      const query = queryEditor?.getValue()
      if (!query?.trim()) {
        onError('No query to plan', 'Write a query first.')
        return null
      }

      const rawVariables = variableEditor?.getValue()?.trim()
      let variables: Record<string, unknown> | undefined
      if (rawVariables) {
        try {
          variables = JSON.parse(rawVariables) as Record<string, unknown>
        } catch {
          onError('Invalid variables', 'Variables must be valid JSON.')
          return null
        }
      }

      setIsLoading(true)
      try {
        const raw = await fetcher(
          { query, variables },
          {
            headers: {
              // Router:
              'apollo-expose-query-plan': 'dry-run',
              // JS Gateway:
              'apollo-query-plan-experimental': 'true',
              'apollo-query-plan-experimental-format': 'internal',
            },
          },
        )
        const result = await unwrapFetcherResult(raw)
        let plan = result?.extensions?.apolloQueryPlan
        if (!plan) {
          const experimentalPlan = result?.extensions?.__queryPlanExperimental
          if (experimentalPlan) {
            plan = convertExperimentalToApolloPlan(experimentalPlan)
          } else {
            onError(
              'No query plan returned',
              'This endpoint does not expose query plans. Try staging or stagingPreview.',
            )
            return null
          }
        }
        return plan
      } catch (error: unknown) {
        onError(
          'Failed to fetch query plan',
          error instanceof Error ? error.message : 'Unknown error',
        )
        return null
      } finally {
        setIsLoading(false)
      }
    }, [fetcher, onError, queryEditor, variableEditor])

  return { fetchPlan, isLoading }
}

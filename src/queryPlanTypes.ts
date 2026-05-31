/**
 * TypeScript types for the Apollo Federation query plan response.
 *
 * The `apollo-expose-query-plan: dry-run` header causes the router to include
 * `extensions.apolloQueryPlan` in the response — a structured AST plus a compact
 * text representation.
 */

// ---------------------------------------------------------------------------
// Node kinds
// ---------------------------------------------------------------------------

export type QueryPlanRootNode = {
  kind: 'QueryPlan'
  node: QueryPlanNode
}

export type SequenceNode = {
  kind: 'Sequence'
  nodes: QueryPlanNode[]
}

export type ParallelNode = {
  kind: 'Parallel'
  nodes: QueryPlanNode[]
}

export type FetchNode = {
  kind: 'Fetch'
  serviceName: string
  /** The sub-operation sent to this service */
  operation: string
  operationName: string | null
  operationKind: 'query' | 'mutation' | 'subscription'
  variableUsages: string[]
  requires?: SelectionNode[]
  id: string | null
  inputRewrites: unknown[] | null
  outputRewrites: unknown[] | null
  contextRewrites: unknown[] | null
  schemaAwareHash: string
  authorization: {
    is_authenticated: boolean
    scopes: string[]
    policies: string[]
  }
}

export type FlattenNode = {
  kind: 'Flatten'
  path: string[]
  node: QueryPlanNode
}

export type DeferNode = {
  kind: 'Defer'
  primary: {
    node?: QueryPlanNode
    path: string[]
  }
  deferred: Array<{
    depends: Array<{ id: string }>
    label?: string
    queryPath: string
    node?: QueryPlanNode
  }>
}

export type ConditionNode = {
  kind: 'Condition'
  condition: string
  ifClause?: QueryPlanNode
  elseClause?: QueryPlanNode
}

export type SubscriptionNode = {
  kind: 'Subscription'
  primary: FetchNode
  rest?: QueryPlanNode
}

/** Union of all node types that can appear inside a query plan. */
export type QueryPlanNode =
  | SequenceNode
  | ParallelNode
  | FetchNode
  | FlattenNode
  | DeferNode
  | ConditionNode
  | SubscriptionNode

// ---------------------------------------------------------------------------
// Selection set types (used in FetchNode.requires)
// ---------------------------------------------------------------------------

export type FieldSelection = {
  kind: 'Field'
  name: string
  selections?: SelectionNode[]
}

export type InlineFragmentSelection = {
  kind: 'InlineFragment'
  typeCondition: string
  selections: SelectionNode[]
}

export type SelectionNode = FieldSelection | InlineFragmentSelection

// ---------------------------------------------------------------------------
// Top-level response shape
// ---------------------------------------------------------------------------

/** Structured representation of a query plan, as returned in extensions. */
export type ApolloQueryPlan = {
  /** Structured AST representation */
  object: QueryPlanRootNode
  /** Apollo's compact text representation (e.g. "QueryPlan { Sequence { ... } }") */
  text: string
}

/** Shape of a GraphQL response that may include a query plan in extensions. */
export type GraphQLResponseWithQueryPlan = {
  data?: unknown
  errors?: Array<{ message: string; locations?: unknown; path?: unknown }>
  extensions?: {
    apolloQueryPlan?: ApolloQueryPlan
    [key: string]: unknown
  }
}

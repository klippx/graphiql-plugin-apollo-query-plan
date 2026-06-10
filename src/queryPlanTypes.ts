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
// Apollo JS-gateway experimental query plan types
// (these are simpler than the router's format and lack router-specific fields)
// ---------------------------------------------------------------------------

/**
 * Simpler Fetch node used by the JS gateway experimental query plan.
 * Omits router-specific fields (id, rewrites, schemaAwareHash, authorization).
 */
export type ExperimentalFetchNode = {
  kind: 'Fetch'
  serviceName: string
  /** The sub-operation sent to this service */
  operation: string
  operationName: string
  operationKind: 'query' | 'mutation' | 'subscription'
  variableUsages: string[]
  requires?: SelectionNode[]
}

/** Union of node types that can appear in a JS gateway experimental query plan. */
export type ExperimentalQueryPlanNode =
  | { kind: 'Sequence'; nodes: ExperimentalQueryPlanNode[] }
  | { kind: 'Parallel'; nodes: ExperimentalQueryPlanNode[] }
  | ExperimentalFetchNode
  | { kind: 'Flatten'; path: string[]; node: ExperimentalQueryPlanNode }

/**
 * JS gateway experimental query plan (`extensions.__queryPlanExperimental`).
 * Unlike the router format, the root object is the plan node itself — there is
 * no `{ object, text }` wrapper.
 */
export type ApolloQueryPlanExperimental = {
  kind: 'QueryPlan'
  node: ExperimentalQueryPlanNode
}

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
    // Router
    apolloQueryPlan?: ApolloQueryPlan
    // JS Gateway (experimental)
    __queryPlanExperimental?: ApolloQueryPlanExperimental
    [key: string]: unknown
  }
}

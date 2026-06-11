import type {
  ApolloQueryPlan,
  ApolloQueryPlanExperimental,
  ExperimentalQueryPlanNode,
  QueryPlanNode,
} from './queryPlanTypes'

/**
 * Recursively converts an ExperimentalQueryPlanNode to a QueryPlanNode,
 * filling router-specific fields that the JS gateway omits with null/empty defaults.
 */
function convertExperimentalNode(
  node: ExperimentalQueryPlanNode,
): QueryPlanNode {
  switch (node.kind) {
    case 'Fetch':
      return {
        ...node,
        id: null,
        inputRewrites: null,
        outputRewrites: null,
        contextRewrites: null,
        schemaAwareHash: '',
        authorization: { is_authenticated: false, scopes: [], policies: [] },
      }
    case 'Sequence':
      return {
        kind: 'Sequence',
        nodes: node.nodes.map(convertExperimentalNode),
      }
    case 'Parallel':
      return {
        kind: 'Parallel',
        nodes: node.nodes.map(convertExperimentalNode),
      }
    case 'Flatten':
      return {
        kind: 'Flatten',
        path: node.path,
        node: convertExperimentalNode(node.node),
      }
    default: {
      const _exhaustive: never = node
      throw new Error(
        `Unhandled experimental node kind: ${(_exhaustive as QueryPlanNode).kind}`,
      )
    }
  }
}

/**
 * Serialises a QueryPlanNode to Apollo's compact text format.
 */
function serializePlanNode(node: QueryPlanNode, depth: number): string {
  const pad = '  '.repeat(depth)
  const inner = '  '.repeat(depth + 1)
  switch (node.kind) {
    case 'Fetch':
      return `${pad}Fetch(service: "${node.serviceName}") {\n${inner}{ ${node.operationName ?? node.operationKind} }\n${pad}}`
    case 'Sequence':
      return `${pad}Sequence {\n${node.nodes.map((n) => serializePlanNode(n, depth + 1)).join('\n')}\n${pad}}`
    case 'Parallel':
      return `${pad}Parallel {\n${node.nodes.map((n) => serializePlanNode(n, depth + 1)).join('\n')}\n${pad}}`
    case 'Flatten':
      return `${pad}Flatten(path: "${node.path.join('.')}") {\n${serializePlanNode(node.node, depth + 1)}\n${pad}}`
    case 'Defer':
      return `${pad}Defer { ... }`
    case 'Condition':
      return `${pad}Condition(if: ${node.condition}) { ... }`
    case 'Subscription':
      return `${pad}Subscription { ... }`
    default: {
      const _exhaustive: never = node
      throw new Error(
        `Unhandled plan node kind: ${(_exhaustive as QueryPlanNode).kind}`,
      )
    }
  }
}

/**
 * Converts a JS gateway experimental query plan to the ApolloQueryPlan shape
 * expected by the rest of the app. Router-specific fields are filled with
 * neutral defaults since the gateway does not emit them.
 */
export function convertExperimentalToApolloPlan(
  experimental: ApolloQueryPlanExperimental,
): ApolloQueryPlan {
  const rootNode = convertExperimentalNode(experimental.node)
  const object = { kind: 'QueryPlan' as const, node: rootNode }
  const text = `QueryPlan {\n${serializePlanNode(rootNode, 1)}\n}`
  return { object, text }
}

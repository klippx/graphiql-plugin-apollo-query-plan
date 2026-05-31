import type { Edge, Node } from '@xyflow/react'
import { parse, visit } from 'graphql'
import type {
  ApolloQueryPlan,
  QueryPlanNode,
  SelectionNode,
} from './queryPlanTypes'

/** A field in a Fetch node's `requires` selection set.
 *  When the field is an object type, `subFields` lists its direct child field names. */
export type RequiresField = {
  name: string
  /** Direct child field names, present when the field is an object (not a scalar). */
  subFields?: string[]
}

/** Extracts the fields from a `requires` selection set as a flat list of `RequiresField`s.
 *  InlineFragments are unwrapped transparently; `__typename` is omitted. */
const extractRequiredFields = (args: {
  /** Selection nodes from the `requires` clause of a Fetch node. */
  selections: SelectionNode[]
}): RequiresField[] =>
  args.selections.flatMap((s) => {
    if (s.kind === 'InlineFragment')
      return extractRequiredFields({ selections: s.selections })
    if (s.name === '__typename') return []
    const childFields = s.selections?.flatMap((c) =>
      c.kind === 'Field' && c.name !== '__typename' ? [c.name] : [],
    )
    return [
      {
        name: s.name,
        ...(childFields?.length ? { subFields: childFields } : {}),
      },
    ]
  })

export const NODE_WIDTH = 220
const NODE_HEIGHT = 80
const NODE_X_GAP = 40
const NODE_Y_GAP = 60

type BuildState = {
  nextNodeIndex: number
  nodes: QueryPlanReactFlowNode[]
  edges: Edge[]
}

export type QueryPlanReactFlowNodeType =
  | 'fetch'
  | 'flatten'
  | 'sequence'
  | 'parallel'
  | 'defer'
  | 'condition'
  | 'generic'

export type QueryPlanReactFlowNodeData = {
  label: string
  serviceName?: string
  path?: string
  pathSegments?: string[]
  /** Plan-wide alias→fieldName map collected from all Fetch operations. */
  planAliases?: Record<string, string>
  condition?: string
  kind: QueryPlanNode['kind']
  operationKind?: 'query' | 'mutation' | 'subscription'
  variableUsages?: string[]
  requiresFields?: RequiresField[]
  providesFields?: RequiresField[]
  isRoot?: boolean
  /** True when this Fetch is a child of a Flatten whose path contains `@`,
   *  meaning the router sends one batched `_entities` call for all list items. */
  isBatchFetch?: boolean
  /** Raw operation string for this Fetch node (GraphQL query/mutation/subscription). */
  operation?: string
}

export type QueryPlanReactFlowNode = Node<
  QueryPlanReactFlowNodeData,
  QueryPlanReactFlowNodeType
>

/** Throws when an unsupported query plan node reaches an exhaustive switch. */
const assertUnreachableQueryPlanNode = (args: {
  /** Query plan node that should have been handled earlier in the switch. */
  queryPlanNode: never
}): never => {
  throw new Error(`Unsupported query plan node: ${String(args.queryPlanNode)}`)
}

/** Creates a React Flow node definition for a query plan AST node. */
const createReactFlowNode = (args: {
  /** The query plan AST node to convert. */
  queryPlanNode: QueryPlanNode
  /** Zero-based node index used to build a stable id. */
  nodeIndex: number
}): QueryPlanReactFlowNode => {
  const { nodeIndex, queryPlanNode } = args
  const id = `node-${nodeIndex}`

  switch (queryPlanNode.kind) {
    case 'Fetch': {
      const requiresFields = queryPlanNode.requires
        ? extractRequiredFields({ selections: queryPlanNode.requires })
        : undefined
      return {
        id,
        type: 'fetch',
        data: {
          label: queryPlanNode.serviceName,
          kind: queryPlanNode.kind,
          serviceName: queryPlanNode.serviceName,
          operationKind: queryPlanNode.operationKind,
          variableUsages: queryPlanNode.variableUsages,
          requiresFields,
          operation: queryPlanNode.operation,
        },
        position: { x: 0, y: 0 },
      }
    }
    case 'Flatten': {
      return {
        id,
        type: 'flatten',
        data: {
          label: 'Flatten',
          kind: queryPlanNode.kind,
          path: queryPlanNode.path.join(' → '),
          pathSegments: queryPlanNode.path,
        },
        position: { x: 0, y: 0 },
      }
    }
    case 'Sequence': {
      return {
        id,
        type: 'sequence',
        data: { label: 'Sequence', kind: queryPlanNode.kind },
        position: { x: 0, y: 0 },
      }
    }
    case 'Parallel': {
      return {
        id,
        type: 'parallel',
        data: { label: 'Parallel ∥', kind: queryPlanNode.kind },
        position: { x: 0, y: 0 },
      }
    }
    case 'Defer': {
      return {
        id,
        type: 'defer',
        data: { label: 'Defer', kind: queryPlanNode.kind },
        position: { x: 0, y: 0 },
      }
    }
    case 'Condition': {
      return {
        id,
        type: 'condition',
        data: {
          label: `Condition: ${queryPlanNode.condition}`,
          kind: queryPlanNode.kind,
          condition: queryPlanNode.condition,
        },
        position: { x: 0, y: 0 },
      }
    }
    case 'Subscription': {
      return {
        id,
        type: 'generic',
        data: { label: 'Subscription', kind: queryPlanNode.kind },
        position: { x: 0, y: 0 },
      }
    }
    default: {
      return assertUnreachableQueryPlanNode({ queryPlanNode })
    }
  }
}

/** Returns the direct child AST nodes for the given query plan node. */
const getChildNodes = (args: {
  /** The query plan node whose children should be collected. */
  queryPlanNode: QueryPlanNode
}): QueryPlanNode[] => {
  const { queryPlanNode } = args

  switch (queryPlanNode.kind) {
    case 'Sequence':
    case 'Parallel': {
      return queryPlanNode.nodes
    }
    case 'Flatten': {
      return [queryPlanNode.node]
    }
    case 'Defer': {
      return [
        ...(queryPlanNode.primary.node ? [queryPlanNode.primary.node] : []),
        ...queryPlanNode.deferred.flatMap((deferredNode) =>
          deferredNode.node ? [deferredNode.node] : [],
        ),
      ]
    }
    case 'Condition': {
      return [
        ...(queryPlanNode.ifClause ? [queryPlanNode.ifClause] : []),
        ...(queryPlanNode.elseClause ? [queryPlanNode.elseClause] : []),
      ]
    }
    case 'Subscription': {
      return [
        queryPlanNode.primary,
        ...(queryPlanNode.rest ? [queryPlanNode.rest] : []),
      ]
    }
    case 'Fetch': {
      return []
    }
    default: {
      return assertUnreachableQueryPlanNode({ queryPlanNode })
    }
  }
}

/** Walks the query plan AST and accumulates React Flow nodes and edges. */
const visitQueryPlanNode = (args: {
  /** Parent node id, if the current node has one. */
  parentId?: string
  /** Mutable accumulator for generated flow elements. */
  state: BuildState
  /** The query plan node currently being visited. */
  queryPlanNode: QueryPlanNode
  /** True when this node is the direct child of a Flatten with `@` in its path. */
  isBatchFetch?: boolean
}): string => {
  const { parentId, queryPlanNode, state, isBatchFetch } = args
  const currentNode = createReactFlowNode({
    queryPlanNode,
    nodeIndex: state.nextNodeIndex,
  })

  if (!parentId) {
    currentNode.data.isRoot = true
  }

  if (isBatchFetch && queryPlanNode.kind === 'Fetch') {
    currentNode.data.isBatchFetch = true
  }

  state.nextNodeIndex += 1
  state.nodes.push(currentNode)

  if (parentId) {
    state.edges.push({
      id: `edge-${parentId}-${currentNode.id}`,
      source: parentId,
      target: currentNode.id,
    })
  }

  const isBatch =
    queryPlanNode.kind === 'Flatten' && queryPlanNode.path.includes('@')

  getChildNodes({ queryPlanNode }).forEach((childNode) => {
    visitQueryPlanNode({
      parentId: currentNode.id,
      queryPlanNode: childNode,
      state,
      isBatchFetch: isBatch,
    })
  })

  return currentNode.id
}

/**
 * Positions nodes using a bottom-up tree layout.
 *
 * Leaves get sequential integer slots (in DFS/array order). Each internal
 * node centers over the span of its descendants' slots. This guarantees
 * every parent is centered above its children's column group.
 */
const applyTreeLayout = (args: {
  nodes: QueryPlanReactFlowNode[]
  edges: Edge[]
  nodeWidth: number
}): { nodes: QueryPlanReactFlowNode[]; edges: Edge[] } => {
  const { nodes, edges, nodeWidth } = args

  const root = nodes[0]
  if (!root) return { nodes, edges }

  // Build parent→children map, preserving edge insertion order (= array order).
  const childrenMap = new Map<string, string[]>(nodes.map((n) => [n.id, []]))
  for (const edge of edges) {
    childrenMap.get(edge.source)?.push(edge.target)
  }

  // BFS to assign rank (vertical depth) from the root.
  const rank = new Map<string, number>([[root.id, 0]])
  const queue = [root.id]
  while (queue.length > 0) {
    const id = queue.shift() ?? ''
    const r = rank.get(id) ?? 0
    for (const childId of childrenMap.get(id) ?? []) {
      if (!rank.has(childId)) {
        rank.set(childId, r + 1)
        queue.push(childId)
      }
    }
  }

  // Bottom-up DFS: assign each leaf a unique integer slot (in DFS = array order).
  // Internal nodes get the average of their leftmost and rightmost descendant slots.
  const slot = new Map<string, number>()
  let nextLeafSlot = 0

  const assignSlots = (id: string): void => {
    const children = childrenMap.get(id) ?? []
    if (children.length === 0) {
      slot.set(id, nextLeafSlot++)
      return
    }
    for (const childId of children) assignSlots(childId)
    const childSlots = children.map((c) => slot.get(c) ?? 0)
    slot.set(id, (Math.min(...childSlots) + Math.max(...childSlots)) / 2)
  }
  assignSlots(root.id)

  return {
    nodes: nodes.map((node) => ({
      ...node,
      position: {
        x: (slot.get(node.id) ?? 0) * (nodeWidth + NODE_X_GAP),
        y: (rank.get(node.id) ?? 0) * (NODE_HEIGHT + NODE_Y_GAP),
      },
    })),
    edges,
  }
}

/** Recursively collects all alias→fieldName mappings from every Fetch operation in the plan. */
const collectPlanAliases = (args: {
  /** The query plan node to traverse. */
  node: QueryPlanNode
  /** Accumulator map populated in-place; defaults to a new empty object. */
  acc?: Record<string, string>
}): Record<string, string> => {
  const { node, acc = {} } = args
  if (node.kind === 'Fetch') {
    try {
      visit(parse(node.operation), {
        Field(n) {
          if (n.alias) acc[n.alias.value] = n.name.value
        },
      })
    } catch {
      // ignore parse errors
    }
    return acc
  }
  // Use the same child-extraction logic as getChildNodes so every node kind is covered.
  for (const child of getChildNodes({ queryPlanNode: node })) {
    collectPlanAliases({ node: child, acc })
  }
  return acc
}

/** Converts an Apollo query plan AST into React Flow nodes and edges. */
export const queryPlanToReactFlow = (args: {
  /** Apollo query plan response containing the root AST node. */
  plan: ApolloQueryPlan
  /** Override node width used for layout position calculations. Defaults to NODE_WIDTH. */
  nodeWidth?: number
}): { nodes: Node[]; edges: Edge[] } => {
  const layoutWidth = args.nodeWidth ?? NODE_WIDTH
  const state: BuildState = {
    nextNodeIndex: 0,
    nodes: [],
    edges: [],
  }

  visitQueryPlanNode({
    queryPlanNode: args.plan.object.node,
    state,
  })

  // Collect all aliases from all Fetch operations in the plan for Flatten path resolution.
  const planAliases = collectPlanAliases({ node: args.plan.object.node })
  for (const node of state.nodes) {
    if (node.data.kind === 'Flatten') {
      node.data.planAliases = planAliases
    }
  }

  // Second pass: direct pairing — each Fetch's providesFields = its immediate
  // downstream consumer's requiresFields. This avoids false positives from
  // the same field name appearing at multiple levels of the response tree.
  const nodeById = new Map(state.nodes.map((n) => [n.id, n]))
  const parentMap = new Map<string, string>()
  const childrenMap = new Map<string, string[]>()
  for (const node of state.nodes) childrenMap.set(node.id, [])
  for (const edge of state.edges) {
    parentMap.set(edge.target, edge.source)
    childrenMap.get(edge.source)?.push(edge.target)
  }

  /** Returns the id of the first Fetch node with requiresFields in the subtree rooted at nodeId. */
  const firstFetchWithRequires = (nodeId: string): string | undefined => {
    const node = nodeById.get(nodeId)
    if (!node) return undefined
    if (
      node.data.kind === 'Fetch' &&
      (node.data.requiresFields?.length ?? 0) > 0
    ) {
      return nodeId
    }
    for (const childId of childrenMap.get(nodeId) ?? []) {
      const found = firstFetchWithRequires(childId)
      if (found) return found
    }
    return undefined
  }

  for (const node of state.nodes) {
    if (node.data.kind !== 'Fetch') continue

    const directParentId = parentMap.get(node.id)
    const directParent = directParentId
      ? nodeById.get(directParentId)
      : undefined

    // Determine which Sequence node contains this Fetch and which child of that
    // Sequence represents this Fetch (either the Fetch itself or its Flatten wrapper).
    let sequenceParentId: string | undefined
    let siblingNodeId: string

    if (directParent?.data.kind === 'Flatten') {
      sequenceParentId = parentMap.get(directParentId!)
      siblingNodeId = directParentId!
    } else if (directParent?.data.kind === 'Sequence') {
      sequenceParentId = directParentId
      siblingNodeId = node.id
    } else {
      continue // root Fetch or inside Parallel — no sequential consumer to pair with
    }

    if (!sequenceParentId) continue

    const siblings = childrenMap.get(sequenceParentId) ?? []
    const siblingIndex = siblings.indexOf(siblingNodeId)

    // Walk forward through siblings until we find one that contains a Fetch with requires.
    for (let i = siblingIndex + 1; i < siblings.length; i++) {
      const sibling = siblings[i]
      if (!sibling) continue
      const consumerId = firstFetchWithRequires(sibling)
      if (consumerId) {
        const consumer = nodeById.get(consumerId)
        if (consumer?.data.requiresFields?.length) {
          node.data.providesFields = consumer.data.requiresFields
        }
        break
      }
    }
  }

  return applyTreeLayout({
    nodes: state.nodes,
    edges: state.edges,
    nodeWidth: layoutWidth,
  })
}

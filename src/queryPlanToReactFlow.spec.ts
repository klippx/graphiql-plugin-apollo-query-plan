import { describe, expect, it } from 'vitest'
import { queryPlanToReactFlow } from './queryPlanToReactFlow'
import type {
  ApolloQueryPlan,
  FetchNode,
  QueryPlanNode,
} from './queryPlanTypes'

const createFetchNode = (args: {
  serviceName: string
  operationKind?: 'query' | 'mutation' | 'subscription'
  variableUsages?: string[]
  requiresCount?: number
}): FetchNode => ({
  kind: 'Fetch',
  serviceName: args.serviceName,
  operation: `query ${args.serviceName.replaceAll('-', '_')} { __typename }`,
  operationName: `${args.serviceName.replaceAll('-', '_')}_operation`,
  operationKind: args.operationKind ?? 'query',
  variableUsages: args.variableUsages ?? [],
  requires: Array.from({ length: args.requiresCount ?? 0 }, (_, index) => ({
    kind: 'Field',
    name: `field${index}`,
  })),
  id: null,
  inputRewrites: null,
  outputRewrites: null,
  contextRewrites: null,
  schemaAwareHash: `${args.serviceName}-hash`,
  authorization: {
    is_authenticated: false,
    scopes: [],
    policies: [],
  },
})

const examplePlan = {
  object: {
    kind: 'QueryPlan',
    node: {
      kind: 'Sequence',
      nodes: [
        createFetchNode({ serviceName: 'vehicle-dgs' }),
        {
          kind: 'Flatten',
          path: ['carByVin', 'car'],
          node: createFetchNode({
            serviceName: 'product-enrichment-dgs',
            variableUsages: ['locale'],
            requiresCount: 1,
          }),
        },
        {
          kind: 'Flatten',
          path: ['carByVin', 'car'],
          node: createFetchNode({
            serviceName: 'car-configuration-dgs',
            requiresCount: 1,
          }),
        },
        {
          kind: 'Flatten',
          path: ['carByVin', 'car'],
          node: createFetchNode({
            serviceName: 'product-enrichment-dgs',
            variableUsages: ['locale'],
            requiresCount: 1,
          }),
        },
      ],
    },
  },
  text: 'QueryPlan { Sequence { ... } }',
} satisfies ApolloQueryPlan

const nestedParallelPlan = {
  object: {
    kind: 'QueryPlan',
    node: {
      kind: 'Sequence',
      nodes: [
        createFetchNode({ serviceName: 'vehicle-dgs' }),
        {
          kind: 'Parallel',
          nodes: [
            createFetchNode({ serviceName: 'inventory-dgs' }),
            {
              kind: 'Flatten',
              path: ['carByVin', 'car'],
              node: createFetchNode({ serviceName: 'pricing-dgs' }),
            },
          ],
        },
      ],
    },
  },
  text: 'QueryPlan { Sequence { Fetch Parallel } }',
} satisfies ApolloQueryPlan

const singleFetchPlan = {
  object: {
    kind: 'QueryPlan',
    node: createFetchNode({ serviceName: 'vehicle-dgs' }),
  },
  text: 'QueryPlan { Fetch(service: "vehicle-dgs") { ... } }',
} satisfies ApolloQueryPlan

const getKinds = (args: {
  nodes: Array<{ data: { kind?: string } }>
}): string[] => args.nodes.map((node) => node.data.kind ?? 'unknown')

const getFetchServiceNames = (args: {
  nodes: Array<{ data: { kind?: string; serviceName?: string } }>
}) =>
  args.nodes
    .filter((node) => node.data.kind === 'Fetch')
    .map((node) => node.data.serviceName)

const hasKind = (args: {
  kind: QueryPlanNode['kind']
  nodes: Array<{ data: { kind?: string } }>
}): boolean => getKinds({ nodes: args.nodes }).includes(args.kind)

describe('queryPlanToReactFlow', () => {
  it('converts the example issue plan into the expected number of nodes and edges', () => {
    const { edges, nodes } = queryPlanToReactFlow({ plan: examplePlan })

    expect(nodes).toHaveLength(8)
    expect(edges).toHaveLength(7)
    expect(getKinds({ nodes })).toEqual([
      'Sequence',
      'Fetch',
      'Flatten',
      'Fetch',
      'Flatten',
      'Fetch',
      'Flatten',
      'Fetch',
    ])
  })

  it('keeps service names on each fetch node', () => {
    const { nodes } = queryPlanToReactFlow({ plan: examplePlan })

    expect(getFetchServiceNames({ nodes })).toEqual([
      'vehicle-dgs',
      'product-enrichment-dgs',
      'car-configuration-dgs',
      'product-enrichment-dgs',
    ])
  })

  it('returns one node and no edges for a single fetch plan', () => {
    const { edges, nodes } = queryPlanToReactFlow({ plan: singleFetchPlan })

    expect(nodes).toHaveLength(1)
    expect(edges).toHaveLength(0)
    expect(nodes[0]?.data.kind).toBe('Fetch')
    expect(nodes[0]?.data.serviceName).toBe('vehicle-dgs')
  })

  it('includes nested parallel nodes inside a sequence', () => {
    const { edges, nodes } = queryPlanToReactFlow({ plan: nestedParallelPlan })

    expect(nodes).toHaveLength(6)
    expect(edges).toHaveLength(5)
    expect(hasKind({ kind: 'Sequence', nodes })).toBe(true)
    expect(hasKind({ kind: 'Parallel', nodes })).toBe(true)
    expect(hasKind({ kind: 'Flatten', nodes })).toBe(true)
    expect(getFetchServiceNames({ nodes })).toEqual([
      'vehicle-dgs',
      'inventory-dgs',
      'pricing-dgs',
    ])
  })
})

// ---------------------------------------------------------------------------
// Fetch node data
// ---------------------------------------------------------------------------

describe('Fetch node data', () => {
  it('stores the raw operation string on each Fetch node', () => {
    const operation =
      'query MyOp($id: ID!) { carByVin(vin: $id) { __typename } }'
    const plan: ApolloQueryPlan = {
      object: {
        kind: 'QueryPlan',
        node: { ...createFetchNode({ serviceName: 'vehicle-dgs' }), operation },
      },
      text: '',
    }
    const { nodes } = queryPlanToReactFlow({ plan })
    expect(nodes[0]?.data.operation).toBe(operation)
  })

  it('extracts requiresFields from a plain Field selection, excluding __typename', () => {
    const plan: ApolloQueryPlan = {
      object: {
        kind: 'QueryPlan',
        node: {
          ...createFetchNode({ serviceName: 'pricing-dgs' }),
          requires: [
            { kind: 'Field', name: '__typename' },
            { kind: 'Field', name: 'carKey' },
            { kind: 'Field', name: 'market' },
          ],
        },
      },
      text: '',
    }
    const { nodes } = queryPlanToReactFlow({ plan })
    expect(nodes[0]?.data.requiresFields).toEqual([
      { name: 'carKey' },
      { name: 'market' },
    ])
  })

  it('unwraps InlineFragment selections when extracting requiresFields', () => {
    const plan: ApolloQueryPlan = {
      object: {
        kind: 'QueryPlan',
        node: {
          ...createFetchNode({ serviceName: 'pricing-dgs' }),
          requires: [
            {
              kind: 'InlineFragment',
              typeCondition: 'Car',
              selections: [
                { kind: 'Field', name: '__typename' },
                { kind: 'Field', name: 'carKey' },
              ],
            },
          ],
        },
      },
      text: '',
    }
    const { nodes } = queryPlanToReactFlow({ plan })
    expect(nodes[0]?.data.requiresFields).toEqual([{ name: 'carKey' }])
  })
})

// ---------------------------------------------------------------------------
// isBatchFetch — Flatten path containing `@`
// ---------------------------------------------------------------------------

describe('isBatchFetch', () => {
  it('marks the child Fetch as a batch fetch when Flatten path contains @', () => {
    const plan: ApolloQueryPlan = {
      object: {
        kind: 'QueryPlan',
        node: {
          kind: 'Sequence',
          nodes: [
            createFetchNode({ serviceName: 'vehicle-dgs' }),
            {
              kind: 'Flatten',
              path: ['cars', '@'],
              node: createFetchNode({ serviceName: 'pricing-dgs' }),
            },
          ],
        },
      },
      text: '',
    }
    const { nodes } = queryPlanToReactFlow({ plan })
    const pricingFetch = nodes.find((n) => n.data.serviceName === 'pricing-dgs')
    expect(pricingFetch?.data.isBatchFetch).toBe(true)
  })

  it('does NOT mark the child Fetch as batch when Flatten path has no @', () => {
    const plan: ApolloQueryPlan = {
      object: {
        kind: 'QueryPlan',
        node: {
          kind: 'Sequence',
          nodes: [
            createFetchNode({ serviceName: 'vehicle-dgs' }),
            {
              kind: 'Flatten',
              path: ['carByVin', 'car'],
              node: createFetchNode({ serviceName: 'pricing-dgs' }),
            },
          ],
        },
      },
      text: '',
    }
    const { nodes } = queryPlanToReactFlow({ plan })
    const pricingFetch = nodes.find((n) => n.data.serviceName === 'pricing-dgs')
    expect(pricingFetch?.data.isBatchFetch).toBeFalsy()
  })
})

// ---------------------------------------------------------------------------
// providesFields pairing (second pass)
// ---------------------------------------------------------------------------

describe('providesFields pairing', () => {
  it('assigns providesFields to a Fetch whose downstream sibling requires fields', () => {
    // Sequence: Fetch-A → Flatten[Fetch-B(requires: carKey)]
    // Fetch-A should get providesFields = [{name:'carKey'}]
    const plan: ApolloQueryPlan = {
      object: {
        kind: 'QueryPlan',
        node: {
          kind: 'Sequence',
          nodes: [
            createFetchNode({ serviceName: 'vehicle-dgs' }),
            {
              kind: 'Flatten',
              path: ['carByVin', 'car'],
              node: {
                ...createFetchNode({ serviceName: 'pricing-dgs' }),
                requires: [{ kind: 'Field', name: 'carKey' }],
              },
            },
          ],
        },
      },
      text: '',
    }
    const { nodes } = queryPlanToReactFlow({ plan })
    const vehicleFetch = nodes.find((n) => n.data.serviceName === 'vehicle-dgs')
    expect(vehicleFetch?.data.providesFields).toEqual([{ name: 'carKey' }])
  })

  it('does not assign providesFields when the downstream Fetch has no requires', () => {
    const plan: ApolloQueryPlan = {
      object: {
        kind: 'QueryPlan',
        node: {
          kind: 'Sequence',
          nodes: [
            createFetchNode({ serviceName: 'vehicle-dgs' }),
            {
              kind: 'Flatten',
              path: ['carByVin', 'car'],
              node: createFetchNode({ serviceName: 'pricing-dgs' }),
            },
          ],
        },
      },
      text: '',
    }
    const { nodes } = queryPlanToReactFlow({ plan })
    const vehicleFetch = nodes.find((n) => n.data.serviceName === 'vehicle-dgs')
    expect(vehicleFetch?.data.providesFields).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// planAliases — collected from Fetch operations and stamped on Flatten nodes
// ---------------------------------------------------------------------------

describe('planAliases on Flatten nodes', () => {
  it('collects aliases from all Fetch operations and stamps them on Flatten nodes', () => {
    // The Fetch operation uses alias `sortedCars: cars`
    const plan: ApolloQueryPlan = {
      object: {
        kind: 'QueryPlan',
        node: {
          kind: 'Sequence',
          nodes: [
            createFetchNode({ serviceName: 'vehicle-dgs' }),
            {
              kind: 'Flatten',
              path: ['carsByMarket', 'groupBy', '@'],
              node: {
                ...createFetchNode({ serviceName: 'pricing-dgs' }),
                operation:
                  'query { _entities { ... on GroupedCarList { sortedCars: cars { carKey } } } }',
              },
            },
          ],
        },
      },
      text: '',
    }
    const { nodes } = queryPlanToReactFlow({ plan })
    const flattenNode = nodes.find((n) => n.data.kind === 'Flatten')
    expect(flattenNode?.data.planAliases).toMatchObject({ sortedCars: 'cars' })
  })

  it('collects aliases from Fetch nodes nested inside a Defer subtree', () => {
    const fetchWithAlias = {
      ...createFetchNode({ serviceName: 'reviews-dgs' }),
      operation:
        'query { _entities { ... on Product { reviewAlias: reviews { id } } } }',
    }
    const plan: ApolloQueryPlan = {
      object: {
        kind: 'QueryPlan',
        node: {
          kind: 'Sequence',
          nodes: [
            createFetchNode({ serviceName: 'vehicle-dgs' }),
            {
              kind: 'Defer',
              primary: { path: [] },
              deferred: [
                {
                  depends: [],
                  queryPath: 'product',
                  node: {
                    kind: 'Flatten',
                    path: ['product', '@'],
                    node: fetchWithAlias,
                  },
                },
              ],
            },
          ],
        },
      },
      text: '',
    }
    const { nodes } = queryPlanToReactFlow({ plan })
    const flattenNode = nodes.find((n) => n.data.kind === 'Flatten')
    expect(flattenNode?.data.planAliases).toMatchObject({
      reviewAlias: 'reviews',
    })
  })
})

// ---------------------------------------------------------------------------
// Layout — nodeWidth scales column positions
// ---------------------------------------------------------------------------

describe('layout positions', () => {
  const simplePlan: ApolloQueryPlan = {
    object: {
      kind: 'QueryPlan',
      node: {
        kind: 'Parallel',
        nodes: [
          createFetchNode({ serviceName: 'svc-a' }),
          createFetchNode({ serviceName: 'svc-b' }),
        ],
      },
    },
    text: '',
  }

  it('places sibling leaves in distinct columns', () => {
    const { nodes } = queryPlanToReactFlow({ plan: simplePlan })
    const [a, b] = nodes
      .filter((n) => n.data.kind === 'Fetch')
      .map((n) => n.position.x)
    expect(a).not.toBe(b)
  })

  it('scales column gap proportionally with nodeWidth', () => {
    const base = queryPlanToReactFlow({ plan: simplePlan })
    const wide = queryPlanToReactFlow({ plan: simplePlan, nodeWidth: 440 })

    const fetchesBase = base.nodes.filter((n) => n.data.kind === 'Fetch')
    const fetchesWide = wide.nodes.filter((n) => n.data.kind === 'Fetch')

    const gapBase = Math.abs(
      fetchesBase[1]!.position.x - fetchesBase[0]!.position.x,
    )
    const gapWide = Math.abs(
      fetchesWide[1]!.position.x - fetchesWide[0]!.position.x,
    )

    expect(gapWide).toBeGreaterThan(gapBase)
  })
})

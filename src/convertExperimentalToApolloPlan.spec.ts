import { describe, expect, it } from 'vitest'
import { convertExperimentalToApolloPlan } from './convertExperimentalToApolloPlan'
import type { ApolloQueryPlanExperimental } from './queryPlanTypes'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Minimal single-Fetch plan */
const singleFetchPlan: ApolloQueryPlanExperimental = {
  kind: 'QueryPlan',
  node: {
    kind: 'Fetch',
    serviceName: 'car-configuration-dgs',
    variableUsages: ['token', 'policy'],
    operation:
      'query CarByTokenForTokenValidation__car_configuration_dgs__0($token:String!$policy:String!){carByToken(token:$token){configuration{changePolicy(policy:$policy){token{short long}}}}}',
    operationKind: 'query',
    operationName: 'CarByTokenForTokenValidation__car_configuration_dgs__0',
  },
}

/**
 * Full sample from the JS gateway:
 * QueryPlan { Sequence { Fetch, Parallel { Flatten { Fetch }, Flatten { Fetch } } } }
 */
const fullSamplePlan: ApolloQueryPlanExperimental = {
  kind: 'QueryPlan',
  node: {
    kind: 'Sequence',
    nodes: [
      {
        kind: 'Fetch',
        serviceName: 'car-configuration-dgs',
        variableUsages: ['token', 'policy'],
        operation:
          'query CarByTokenForTokenValidation__car_configuration_dgs__0($token:String!$policy:String!){carByToken(token:$token){configuration{changePolicy(policy:$policy){token{short long}appliedChange{componentsAdded{__typename carKey previousCarKey code type state rootState configurationStates configurationWindow inConfiguration{active included}partOf{type}componentBehavior}componentsRemoved{__typename carKey previousCarKey code type state rootState configurationStates configurationWindow inConfiguration{active included}partOf{type}componentBehavior}}}}}}',
        operationKind: 'query',
        operationName: 'CarByTokenForTokenValidation__car_configuration_dgs__0',
      },
      {
        kind: 'Parallel',
        nodes: [
          {
            kind: 'Flatten',
            path: [
              'carByToken',
              'configuration',
              'changePolicy',
              'appliedChange',
              'componentsAdded',
              '@',
            ],
            node: {
              kind: 'Fetch',
              serviceName: 'product-enrichment-dgs',
              requires: [
                {
                  kind: 'InlineFragment',
                  typeCondition: 'CarComponent',
                  selections: [
                    { kind: 'Field', name: '__typename' },
                    { kind: 'Field', name: 'carKey' },
                    { kind: 'Field', name: 'previousCarKey' },
                    { kind: 'Field', name: 'code' },
                    { kind: 'Field', name: 'type' },
                    { kind: 'Field', name: 'state' },
                    { kind: 'Field', name: 'rootState' },
                    { kind: 'Field', name: 'configurationStates' },
                    { kind: 'Field', name: 'configurationWindow' },
                    {
                      kind: 'Field',
                      name: 'inConfiguration',
                      selections: [
                        { kind: 'Field', name: 'active' },
                        { kind: 'Field', name: 'included' },
                      ],
                    },
                    {
                      kind: 'Field',
                      name: 'partOf',
                      selections: [{ kind: 'Field', name: 'type' }],
                    },
                    { kind: 'Field', name: 'componentBehavior' },
                  ],
                },
              ],
              variableUsages: ['locale'],
              operation:
                'query CarByTokenForTokenValidation__product_enrichment_dgs__1($representations:[_Any!]!$locale:String!){_entities(representations:$representations){...on CarComponent{content(locale:$locale){__typename displayName{value}}tags}}}',
              operationKind: 'query',
              operationName:
                'CarByTokenForTokenValidation__product_enrichment_dgs__1',
            },
          },
          {
            kind: 'Flatten',
            path: [
              'carByToken',
              'configuration',
              'changePolicy',
              'appliedChange',
              'componentsRemoved',
              '@',
            ],
            node: {
              kind: 'Fetch',
              serviceName: 'product-enrichment-dgs',
              requires: [
                {
                  kind: 'InlineFragment',
                  typeCondition: 'CarComponent',
                  selections: [
                    { kind: 'Field', name: '__typename' },
                    { kind: 'Field', name: 'carKey' },
                  ],
                },
              ],
              variableUsages: ['locale'],
              operation:
                'query CarByTokenForTokenValidation__product_enrichment_dgs__2($representations:[_Any!]!$locale:String!){_entities(representations:$representations){...on CarComponent{content(locale:$locale){__typename displayName{value}}tags}}}',
              operationKind: 'query',
              operationName:
                'CarByTokenForTokenValidation__product_enrichment_dgs__2',
            },
          },
        ],
      },
    ],
  },
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('convertExperimentalToApolloPlan', () => {
  describe('return shape', () => {
    it('returns an object with `object` and `text` fields', () => {
      const result = convertExperimentalToApolloPlan(singleFetchPlan)
      expect(result).toHaveProperty('object')
      expect(result).toHaveProperty('text')
    })

    it('wraps the plan in a QueryPlanRootNode', () => {
      const { object } = convertExperimentalToApolloPlan(singleFetchPlan)
      expect(object.kind).toBe('QueryPlan')
      expect(object).toHaveProperty('node')
    })
  })

  describe('Fetch node conversion', () => {
    it('fills router-only fields with neutral defaults', () => {
      const { object } = convertExperimentalToApolloPlan(singleFetchPlan)
      const fetchNode = object.node
      expect(fetchNode.kind).toBe('Fetch')
      if (fetchNode.kind !== 'Fetch') return

      expect(fetchNode.id).toBeNull()
      expect(fetchNode.inputRewrites).toBeNull()
      expect(fetchNode.outputRewrites).toBeNull()
      expect(fetchNode.contextRewrites).toBeNull()
      expect(fetchNode.schemaAwareHash).toBe('')
      expect(fetchNode.authorization).toEqual({
        is_authenticated: false,
        scopes: [],
        policies: [],
      })
    })

    it('preserves the original Fetch fields', () => {
      const { object } = convertExperimentalToApolloPlan(singleFetchPlan)
      const fetchNode = object.node
      if (fetchNode.kind !== 'Fetch') return

      expect(fetchNode.serviceName).toBe('car-configuration-dgs')
      expect(fetchNode.operationKind).toBe('query')
      expect(fetchNode.operationName).toBe(
        'CarByTokenForTokenValidation__car_configuration_dgs__0',
      )
      expect(fetchNode.variableUsages).toEqual(['token', 'policy'])
    })
  })

  describe('nested node conversion', () => {
    it('converts Sequence nodes recursively', () => {
      const { object } = convertExperimentalToApolloPlan(fullSamplePlan)
      expect(object.node.kind).toBe('Sequence')
      if (object.node.kind !== 'Sequence') return
      expect(object.node.nodes).toHaveLength(2)
    })

    it('converts Parallel nodes recursively', () => {
      const { object } = convertExperimentalToApolloPlan(fullSamplePlan)
      if (object.node.kind !== 'Sequence') return
      const parallel = object.node.nodes[1]
      expect(parallel?.kind).toBe('Parallel')
      if (parallel?.kind !== 'Parallel') return
      expect(parallel.nodes).toHaveLength(2)
    })

    it('converts Flatten nodes and their nested Fetch nodes', () => {
      const { object } = convertExperimentalToApolloPlan(fullSamplePlan)
      if (object.node.kind !== 'Sequence') return
      const parallel = object.node.nodes[1]
      if (parallel?.kind !== 'Parallel') return

      const flatten = parallel.nodes[0]
      expect(flatten?.kind).toBe('Flatten')
      if (flatten?.kind !== 'Flatten') return

      expect(flatten.path).toEqual([
        'carByToken',
        'configuration',
        'changePolicy',
        'appliedChange',
        'componentsAdded',
        '@',
      ])
      expect(flatten.node.kind).toBe('Fetch')
    })

    it('fills router-only defaults on deeply nested Fetch nodes', () => {
      const { object } = convertExperimentalToApolloPlan(fullSamplePlan)
      if (object.node.kind !== 'Sequence') return
      const parallel = object.node.nodes[1]
      if (parallel?.kind !== 'Parallel') return
      const flatten = parallel.nodes[0]
      if (flatten?.kind !== 'Flatten') return
      const fetch = flatten.node
      if (fetch?.kind !== 'Fetch') return

      expect(fetch.id).toBeNull()
      expect(fetch.authorization).toEqual({
        is_authenticated: false,
        scopes: [],
        policies: [],
      })
    })

    it('preserves `requires` selections on nested Fetch nodes', () => {
      const { object } = convertExperimentalToApolloPlan(fullSamplePlan)
      if (object.node.kind !== 'Sequence') return
      const parallel = object.node.nodes[1]
      if (parallel?.kind !== 'Parallel') return
      const flatten = parallel.nodes[0]
      if (flatten?.kind !== 'Flatten') return
      const fetch = flatten.node
      if (fetch?.kind !== 'Fetch') return

      expect(fetch.requires).toHaveLength(1)
      const fragment = fetch.requires![0]
      expect(fragment?.kind).toBe('InlineFragment')
      if (fragment?.kind !== 'InlineFragment') return
      expect(fragment.typeCondition).toBe('CarComponent')
      expect(fragment.selections.length).toBeGreaterThan(0)
    })
  })

  describe('text serialisation', () => {
    it('wraps the output in QueryPlan { ... }', () => {
      const { text } = convertExperimentalToApolloPlan(singleFetchPlan)
      expect(text).toMatch(/^QueryPlan \{/)
      expect(text).toMatch(/\}$/)
    })

    it('includes the service name in the text for a Fetch node', () => {
      const { text } = convertExperimentalToApolloPlan(singleFetchPlan)
      expect(text).toContain('Fetch(service: "car-configuration-dgs")')
    })

    it('includes Sequence, Parallel, and Flatten keywords for the full sample', () => {
      const { text } = convertExperimentalToApolloPlan(fullSamplePlan)
      expect(text).toContain('Sequence')
      expect(text).toContain('Parallel')
      expect(text).toContain('Flatten')
    })

    it('serialises the Flatten path as a dot-joined string', () => {
      const { text } = convertExperimentalToApolloPlan(fullSamplePlan)
      expect(text).toContain(
        'Flatten(path: "carByToken.configuration.changePolicy.appliedChange.componentsAdded.@")',
      )
    })
  })
})

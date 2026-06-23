import { useGraphiQL } from '@graphiql/react'
import { Handle, type NodeProps, Position } from '@xyflow/react'
import type { GraphQLField, GraphQLNamedType, GraphQLSchema } from 'graphql'
import { getNamedType, isInterfaceType, isObjectType } from 'graphql'
import {
  type CSSProperties,
  createContext,
  type JSX,
  type ReactNode,
  useContext,
  useEffect,
  useState,
} from 'react'
import { codeToHtml } from 'shiki'
import { formatOperation as defaultFormatOperation } from './formatOperation'
import './QueryPlanNodes.css'
import {
  NODE_WIDTH,
  type QueryPlanReactFlowNode,
  type RequiresField,
} from './queryPlanToReactFlow'

/**
 * Walks the schema along the path segments, collecting the resolved item type
 * name for each `@` marker in order. Returns `'item'` for any `@` whose type
 * cannot be resolved (e.g. when a response alias is used instead of field name).
 */
const resolvePathItemTypes = (args: {
  /** GraphQL schema used for type resolution. */
  schema: GraphQLSchema
  /** Path segments from the Flatten node (e.g. `['carsByMarket', '@', 'cars', '@']`). */
  segments: string[]
  /** Optional alias→fieldName map for resolving response aliases. */
  aliases?: Map<string, string>
}): string[] => {
  const { schema, segments, aliases = new Map() } = args
  const itemTypes: string[] = []
  try {
    let type: GraphQLNamedType | null | undefined = schema.getQueryType()
    if (!type) return []

    for (const seg of segments) {
      if (seg === '@') {
        itemTypes.push(type.name)
        continue
      }
      if (!isObjectType(type) && !isInterfaceType(type)) break
      // Resolve alias → actual field name if needed
      const fieldName = aliases.get(seg) ?? seg
      const field: GraphQLField<unknown, unknown, unknown> | undefined =
        type.getFields()[fieldName]
      if (!field) break
      type = getNamedType(field.type)
    }
  } catch {
    // Swallow — fall back to 'item' for remaining '@'s below
  }
  return itemTypes
}

/** 0 = None, 1 = Brief (field names only), 2 = Detailed (nested sub-pills) */
export type QueryPlanDetailLevel = 0 | 1 | 2 | 3

/** Canvas-wide settings shared with all React Flow nodes via context. */
export type QueryPlanCanvasSettings = {
  detailLevel: QueryPlanDetailLevel
  /** When true, each Fetch node renders its prettified GraphQL operation. */
  showQuery: boolean
  /** CSS width of every node card, kept in sync with the layout width. */
  nodeWidth: number
  /**
   * Formats a raw GraphQL operation string for display inside Fetch nodes.
   * Defaults to a Prettier-based formatter; consumers can inject a no-op or
   * their own formatter if they don't want Prettier as a dependency.
   */
  formatOperation: (op: string) => Promise<string>
}

export const QueryPlanCanvasContext = createContext<QueryPlanCanvasSettings>({
  detailLevel: 1,
  showQuery: false,
  nodeWidth: NODE_WIDTH,
  formatOperation: defaultFormatOperation,
})

/** Returns the dynamic part of card style (only width — structure comes from .card CSS class). */
const useCardWidth = (): CSSProperties => {
  const { nodeWidth } = useContext(QueryPlanCanvasContext)
  return { width: nodeWidth }
}

/** Accent colours per node kind — communicates semantics at a glance. */
const NODE_ACCENTS = {
  /** Blue — a discrete remote subgraph call. */
  fetch: '#3b82f6',
  /** Slate — steps run one after the other (serial). */
  sequence: '#64748b',
  /** Violet — steps run at the same time (concurrent). */
  parallel: '#7c3aed',
  /** Amber — a response-path transformation. */
  flatten: '#d97706',
  /** Teal — generic / defer / condition / subscription. */
  generic: '#0d9488',
} as const

type QueryPlanNodeProps = NodeProps<QueryPlanReactFlowNode>

/** Returns a deterministic hue (0–359) for any string using the classic djb2 algorithm. */
const stringToHue = (value: string): number => {
  let hash = 0
  for (const character of value) {
    // classic djb2 algorithm
    hash =
      (hash << 5) -
      hash + // same as hash * 31, fast via bit-shift
      character.charCodeAt(0) // add the ASCII/Unicode value of each char
    hash |= 0 // truncate to a 32-bit integer (prevents float drift)
  }
  return Math.abs(hash) % 360
}

/** Returns a deterministic hue for a service name. */
const getServiceHue = (args: {
  /** Service name used to derive a consistent color. */
  serviceName: string
}): number => stringToHue(args.serviceName)

/** Renders a single requires/provides field pill.
 *  Scalar:  `[carKey]`
 *  Object (detailed):  `[cars  [carKey]  [state]]` — sub-pills wrap inside the parent pill
 *  Object (brief):     `[cars]` — sub-pills suppressed */
const FieldPill = ({ field }: { field: RequiresField }) => {
  const { detailLevel } = useContext(QueryPlanCanvasContext)
  const hue = stringToHue(field.name)
  if (!field.subFields?.length || detailLevel < 3)
    return (
      <span
        className={`${'qp-badge'} ${'qp-field-pill'}`}
        style={{ '--field-hue': hue } as CSSProperties}
      >
        {field.name}
      </span>
    )

  return (
    <span
      className={`${'qp-badge'} ${'qp-field-pill'} ${'qp-field-pill-expanded'}`}
      style={{ '--field-hue': hue } as CSSProperties}
    >
      <span style={{ fontWeight: 700 }}>{field.name}</span>
      <div style={{ height: 3 }} />
      <span className={'qp-sub-pill-row'}>
        {field.subFields.map((sub) => (
          <span key={sub} className={'qp-sub-pill'}>
            {sub}
          </span>
        ))}
      </span>
    </span>
  )
}

/** Renders the top (target) handle for nodes that receive edges from a parent. */
const TargetHandle = () => (
  <Handle
    type="target"
    position={Position.Top}
    className={'qp-handle'}
    isConnectable={false}
  />
)

/** Renders the bottom (source) handle for nodes that have children. */
const SourceHandle = () => (
  <Handle
    type="source"
    position={Position.Bottom}
    className={'qp-handle'}
    isConnectable={false}
  />
)

/** Renders the shared card shell for query plan nodes. */
const NodeCard = ({
  accentColor,
  serviceHue,
  handles,
  deck,
  children,
}: {
  /** Accent strip colour at the top of the card. */
  accentColor: string
  /** Optional service hue (0–359) for tinting the card body. Only Fetch nodes provide this. */
  serviceHue?: number
  /** Which connection handles to render. */
  handles: 'both' | 'target-only' | 'source-only' | 'none'
  /** When true, renders two ghost cards behind to suggest a batch/collection. */
  deck?: boolean
  /** Main content of the node card. */
  children: ReactNode
}): JSX.Element => {
  const cardWidth = useCardWidth()
  const hueStyle =
    serviceHue !== undefined
      ? ({ '--service-hue': serviceHue } as CSSProperties)
      : undefined
  return (
    <div style={{ position: 'relative' }}>
      {deck && (
        <>
          <div className={`${'qp-ghost-card'} ${'qp-ghost-card-back'}`} />
          <div className={`${'qp-ghost-card'} ${'qp-ghost-card-mid'}`} />
        </>
      )}
      <div className={'qp-card'} style={{ ...cardWidth, ...hueStyle }}>
        {(handles === 'both' || handles === 'target-only') && <TargetHandle />}
        {(handles === 'both' || handles === 'source-only') && <SourceHandle />}
        <div
          className={'qp-accent-strip'}
          style={{ background: accentColor }}
        />
        <div
          className={
            serviceHue !== undefined
              ? `${'qp-card-body'} ${'qp-tinted'}`
              : 'qp-card-body'
          }
        >
          {children}
        </div>
      </div>
    </div>
  )
}

const parentHandles = (isRoot: boolean | undefined): 'both' | 'source-only' =>
  isRoot ? 'source-only' : 'both'

/**
 * Renders a syntax-highlighted GraphQL operation block inside a Fetch node.
 * Formats the raw operation string with Prettier, then highlights it with Shiki.
 * Falls back to a plain `<pre>` while loading or if formatting fails.
 */
const OperationBlock = ({
  operation,
  accentColor,
}: {
  operation: string
  accentColor: string
}) => {
  const [html, setHtml] = useState<string | null>(null)
  const { formatOperation } = useContext(QueryPlanCanvasContext)

  useEffect(() => {
    let cancelled = false
    const format = async () => {
      const pretty = await formatOperation(operation)
      if (cancelled) return
      const anonymous = pretty.replace(
        /^(query|mutation|subscription)\s+\w+/m,
        '$1',
      )
      const highlighted = await codeToHtml(anonymous, {
        lang: 'graphql',
        themes: { light: 'github-light', dark: 'github-dark' },
        defaultColor: false,
      })
      if (!cancelled) setHtml(highlighted)
    }
    void format()
    return () => {
      cancelled = true
    }
  }, [operation, formatOperation])

  // Only the borderTop is dynamic (accentColor); all other wrapper styles are in CSS.
  const dynamicBorderTop: CSSProperties = {
    borderTop: `2px solid ${accentColor}33`,
  }

  if (!html) {
    return (
      <div className={'qp-operation-wrapper'} style={dynamicBorderTop}>
        <pre className={'qp-operation-fallback'}>{operation}</pre>
      </div>
    )
  }

  return (
    <div
      // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted shiki output
      dangerouslySetInnerHTML={{ __html: html }}
      className={'qp-operation-wrapper'}
      style={dynamicBorderTop}
    />
  )
}

/** Renders a fetch node card with service and operation metadata. */
export const FetchNodeComponent = ({ data }: QueryPlanNodeProps) => {
  const { detailLevel, showQuery } = useContext(QueryPlanCanvasContext)
  const serviceName = data.serviceName ?? 'Unknown service'
  const hue = getServiceHue({ serviceName })
  const accentColor = `hsl(${hue} 60% 55%)`

  const hasVariables =
    detailLevel >= 1 && (data.variableUsages?.length ?? 0) > 0
  const hasRequires = detailLevel >= 2 && (data.requiresFields?.length ?? 0) > 0
  const hasProvides = detailLevel >= 2 && (data.providesFields?.length ?? 0) > 0
  const hasSections = hasRequires || hasProvides

  return (
    <NodeCard
      handles={data.isRoot ? 'none' : 'target-only'}
      accentColor={accentColor}
      serviceHue={hue}
      deck={data.isBatchFetch}
    >
      <div
        className={`${'qp-section'}${hasSections ? ` ${'qp-section-bordered'}` : ''}`}
      >
        <div className={'qp-header-row'}>
          <strong style={{ fontSize: 12 }}>{serviceName}</strong>
          <span className={'qp-badge'}>{data.operationKind ?? 'query'}</span>
        </div>
        {hasVariables && (
          <div
            style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}
          >
            {(data.variableUsages ?? []).map((v) => (
              <span key={v} className={`${'qp-badge'} ${'qp-var-badge'}`}>
                ${v}
              </span>
            ))}
          </div>
        )}
      </div>

      {hasRequires && (
        <div className={'qp-section'}>
          <span className={'qp-section-label'}>
            <svg
              aria-hidden="true"
              width={12}
              height={12}
              viewBox="0 0 12 12"
              fill="currentColor"
              style={{ verticalAlign: 'middle', marginRight: 4 }}
            >
              <path
                d="M6 1v8M3 6l3 3 3-3"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
            Requires
          </span>
          <div className={'qp-chip-row'}>
            {(data.requiresFields ?? []).map((field) => (
              <FieldPill key={field.name} field={field} />
            ))}
          </div>
        </div>
      )}

      {hasRequires && hasProvides && <div className={'qp-section-divider'} />}

      {hasProvides && (
        <div className={'qp-section'}>
          <span className={'qp-section-label'}>
            <svg
              aria-hidden="true"
              width={12}
              height={12}
              viewBox="0 0 12 12"
              fill="currentColor"
              style={{ verticalAlign: 'middle', marginRight: 4 }}
            >
              <path
                d="M6 11V3M3 6l3-3 3 3"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </svg>
            Provides
          </span>
          <div className={'qp-chip-row'}>
            {(data.providesFields ?? []).map((field) => (
              <FieldPill key={field.name} field={field} />
            ))}
          </div>
        </div>
      )}

      {showQuery && data.operation && (
        <OperationBlock operation={data.operation} accentColor={accentColor} />
      )}
    </NodeCard>
  )
}

/** Renders a flatten node card with the target response path. */
export const FlattenNodeComponent = ({ data }: QueryPlanNodeProps) => {
  const schema = useGraphiQL((state) => state.schema)
  const { detailLevel } = useContext(QueryPlanCanvasContext)

  const segments = data.pathSegments ?? data.path?.split(' → ') ?? []
  const aliases = new Map(Object.entries(data.planAliases ?? {}))
  const itemTypes = schema
    ? resolvePathItemTypes({ schema, segments, aliases })
    : []

  let atIndex = 0
  const displaySegments = segments.map((seg) =>
    seg === '@' ? `[${itemTypes[atIndex++] ?? 'item'}]` : seg,
  )

  const pathLabel =
    detailLevel === 0
      ? null
      : detailLevel < 3
        ? displaySegments.at(-1)
        : displaySegments.join(' → ')

  return (
    <NodeCard
      handles={parentHandles(data.isRoot)}
      accentColor={NODE_ACCENTS.flatten}
    >
      <strong>Flatten</strong>
      {pathLabel && (
        <>
          {detailLevel >= 1 && detailLevel < 3 ? (
            <span className={'qp-detail-text'}>
              Merge result of child step into
            </span>
          ) : null}
          <span className={'qp-detail-text'}>
            <code style={{ fontSize: 11 }}>{pathLabel}</code>
          </span>
        </>
      )}
    </NodeCard>
  )
}

/** Renders a sequence group node card. */
export const SequenceNodeComponent = ({ data }: QueryPlanNodeProps) => (
  <NodeCard
    handles={parentHandles(data.isRoot)}
    accentColor={NODE_ACCENTS.sequence}
  >
    <strong>Sequence</strong>
    <span className={'qp-detail-text'}>Runs child steps in order.</span>
  </NodeCard>
)

/** Renders a parallel group node card. */
export const ParallelNodeComponent = ({ data }: QueryPlanNodeProps) => (
  <NodeCard
    handles={parentHandles(data.isRoot)}
    accentColor={NODE_ACCENTS.parallel}
  >
    <strong>Parallel ∥</strong>
    <span className={'qp-detail-text'}>Runs child steps concurrently.</span>
  </NodeCard>
)

/** Renders a fallback card for generic query plan nodes. */
export const GenericNodeComponent = ({ data }: QueryPlanNodeProps) => (
  <NodeCard
    handles={parentHandles(data.isRoot)}
    accentColor={NODE_ACCENTS.generic}
  >
    <strong>{data.label}</strong>
    {data.condition ? (
      <span className={'qp-detail-text'}>{data.condition}</span>
    ) : null}
    {data.path ? <span className={'qp-detail-text'}>{data.path}</span> : null}
    <span className={'qp-detail-text'}>{data.kind}</span>
  </NodeCard>
)

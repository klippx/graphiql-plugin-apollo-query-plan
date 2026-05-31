import '@xyflow/react/dist/style.css'
import './query-plan-tokens.css'
import type { Edge, Node } from '@xyflow/react'
import React from 'react'
import { formatOperation as defaultFormatOperation } from './formatOperation'
import {
  QueryPlanCanvasContext,
  type QueryPlanDetailLevel,
} from './QueryPlanNodes'
import './QueryPlanViews.css'
import { NODE_WIDTH, queryPlanToReactFlow } from './queryPlanToReactFlow'
import type { ApolloQueryPlan } from './queryPlanTypes'
import { useColorMode } from './useColorMode'

type Props = {
  plan: ApolloQueryPlan | null
  /**
   * When `false`, shows the loading spinner instead of mounting the React Flow
   * canvas. Useful when the parent container is animating in — React Flow
   * measures handle positions using `getBoundingClientRect()` which is wrong
   * while a CSS translate/transform is in progress.
   * Defaults to `true`.
   */
  isReady?: boolean
  /**
   * Formats a raw GraphQL operation string for display inside Fetch nodes.
   * Defaults to a Prettier-based formatter.
   */
  formatOperation?: (op: string) => Promise<string>
}

type QueryPlanFlowCanvasProps = {
  edges: Edge[]
  nodes: Node[]
  detailLevel: QueryPlanDetailLevel
  onDetailChange: (level: QueryPlanDetailLevel) => void
  showQuery: boolean
  onShowQueryChange: (v: boolean) => void
  widthMultiplier: number
  onWidthMultiplierChange: (v: number) => void
  nodeWidth: number
}

const QueryPlanFlowCanvas = React.lazy(async () => {
  const [reactFlowModule, queryPlanNodesModule] = await Promise.all([
    import('@xyflow/react'),
    import('./QueryPlanNodes'),
  ])

  const {
    Background,
    Controls,
    MiniMap,
    Panel,
    ReactFlow,
    useNodesState,
    useEdgesState,
    useReactFlow,
  } = reactFlowModule
  const {
    FetchNodeComponent,
    FlattenNodeComponent,
    SequenceNodeComponent,
    ParallelNodeComponent,
    GenericNodeComponent,
    QueryPlanCanvasContext: CanvasContext,
  } = queryPlanNodesModule

  const nodeTypes = {
    fetch: FetchNodeComponent,
    flatten: FlattenNodeComponent,
    sequence: SequenceNodeComponent,
    parallel: ParallelNodeComponent,
    defer: GenericNodeComponent,
    condition: GenericNodeComponent,
    generic: GenericNodeComponent,
    subscription: GenericNodeComponent,
  }

  const DETAIL_LABELS_CANVAS: Record<QueryPlanDetailLevel, string> = {
    0: 'None',
    1: 'Brief',
    2: 'Expanded',
    3: 'Full',
  }

  const DetailLevelPanel = ({
    detailLevel,
    onDetailChange,
    showQuery,
    onShowQueryChange,
    widthMultiplier,
    onWidthMultiplierChange,
  }: Pick<
    QueryPlanFlowCanvasProps,
    | 'detailLevel'
    | 'onDetailChange'
    | 'showQuery'
    | 'onShowQueryChange'
    | 'widthMultiplier'
    | 'onWidthMultiplierChange'
  >) => {
    const [draft, setDraft] = React.useState(widthMultiplier)

    React.useEffect(() => {
      setDraft(widthMultiplier)
    }, [widthMultiplier])

    return (
      <Panel position="top-left">
        <div className={'qp-panel'}>
          <span className={'qp-panel-label'}>Detail</span>
          {([0, 1, 2, 3] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => onDetailChange(level)}
              className={`${'qp-panel-button'}${detailLevel === level ? ` ${'qp-panel-button-active'}` : ''}`}
            >
              {DETAIL_LABELS_CANVAS[level]}
            </button>
          ))}

          <div className={'qp-panel-divider'} />

          <button
            type="button"
            onClick={() => onShowQueryChange(!showQuery)}
            title={
              showQuery ? 'Hide subgraph queries' : 'Show subgraph queries'
            }
            className={`${'qp-panel-button'}${showQuery ? ` ${'qp-panel-button-query-active'}` : ''}`}
          >
            Query
          </button>

          <div className={'qp-panel-divider'} />

          <span className={'qp-panel-label'}>Width</span>
          <input
            type="range"
            min={1}
            max={3}
            step={0.5}
            value={draft}
            onChange={(e) => setDraft(Number(e.currentTarget.value))}
            onMouseUp={(e) =>
              onWidthMultiplierChange(Number(e.currentTarget.value))
            }
            onTouchEnd={(e) =>
              onWidthMultiplierChange(Number(e.currentTarget.value))
            }
            title={`Node width: ${draft}×`}
            className={'qp-slider'}
          />
          <span className={'qp-slider-label'}>{draft}×</span>
        </div>
      </Panel>
    )
  }

  /** Inner component — lives inside <ReactFlow> so useReactFlow() is in scope. */
  const CustomControls = ({
    detailLevel,
    onDetailChange,
    showQuery,
    onShowQueryChange,
    widthMultiplier,
    onWidthMultiplierChange,
  }: Pick<
    QueryPlanFlowCanvasProps,
    | 'detailLevel'
    | 'onDetailChange'
    | 'showQuery'
    | 'onShowQueryChange'
    | 'widthMultiplier'
    | 'onWidthMultiplierChange'
  >) => {
    const { fitView } = useReactFlow()
    const prevKey = React.useRef<string | null>(null)

    React.useEffect(() => {
      const key = `${detailLevel}-${showQuery}`
      if (prevKey.current === key) return
      prevKey.current = key
      // Defer until ResizeObserver has measured the newly-expanded/collapsed nodes.
      const id = setTimeout(
        () => fitView({ duration: 400, ease: (t) => 1 - (1 - t) ** 3 }),
        50,
      )
      return () => clearTimeout(id)
    }, [detailLevel, showQuery, fitView])

    return (
      <DetailLevelPanel
        detailLevel={detailLevel}
        onDetailChange={onDetailChange}
        showQuery={showQuery}
        onShowQueryChange={onShowQueryChange}
        widthMultiplier={widthMultiplier}
        onWidthMultiplierChange={onWidthMultiplierChange}
      />
    )
  }

  const LoadedQueryPlanFlowCanvas = ({
    edges: initialEdges,
    nodes: initialNodes,
    detailLevel,
    onDetailChange,
    showQuery,
    onShowQueryChange,
    widthMultiplier,
    onWidthMultiplierChange,
    nodeWidth,
  }: QueryPlanFlowCanvasProps): React.JSX.Element => {
    const [nodes, , onNodesChange] = useNodesState(initialNodes)
    const [edges, , onEdgesChange] = useEdgesState(initialEdges)
    const colorMode = useColorMode()

    return (
      <CanvasContext.Consumer>
        {(ctx) => (
          <CanvasContext.Provider
            value={{ ...ctx, detailLevel, showQuery, nodeWidth }}
          >
            <div className={'qp-canvas'}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                colorMode={colorMode}
                fitView
                minZoom={0.2}
              >
                <Background />
                <Controls />
                <MiniMap />

                <CustomControls
                  detailLevel={detailLevel}
                  onDetailChange={onDetailChange}
                  showQuery={showQuery}
                  onShowQueryChange={onShowQueryChange}
                  widthMultiplier={widthMultiplier}
                  onWidthMultiplierChange={onWidthMultiplierChange}
                />
              </ReactFlow>
            </div>
          </CanvasContext.Provider>
        )}
      </CanvasContext.Consumer>
    )
  }

  return { default: LoadedQueryPlanFlowCanvas }
})

/** Renders a lightweight loading state while React Flow is being imported. */
const QueryPlanDiagramFallback = () => (
  <div className={'qp-diagram-loading'}>
    <svg
      aria-label="Loading"
      fill="none"
      height={32}
      role="status"
      viewBox="0 0 32 32"
      width={32}
      xmlns="http://www.w3.org/2000/svg"
    >
      <circle
        cx="16"
        cy="16"
        r="13"
        stroke="var(--qp-border-color)"
        strokeWidth="3"
      />
      <path
        d="M16 3 A13 13 0 0 1 29 16"
        stroke="#1c6bff"
        strokeLinecap="round"
        strokeWidth="3"
      >
        <animateTransform
          attributeName="transform"
          dur="0.75s"
          from="0 16 16"
          repeatCount="indefinite"
          to="360 16 16"
          type="rotate"
        />
      </path>
    </svg>
  </div>
)

/**
 * Renders the React Flow query plan diagram with built-in controls for detail
 * level, query visibility, and node width.
 *
 * All diagram state (detail level, width multiplier, etc.) is managed
 * internally. Provide `isReady={false}` while a parent dialog/drawer is
 * animating to prevent React Flow from measuring positions on a transformed
 * element — flip to `true` once the animation settles.
 */
export const QueryPlanDiagram = ({
  plan,
  isReady = true,
  formatOperation = defaultFormatOperation,
}: Props) => {
  const [federationDetail, setFederationDetail] =
    React.useState<QueryPlanDetailLevel>(1)
  const [showQuery, setShowQuery] = React.useState(false)
  const [widthMultiplier, setWidthMultiplier] = React.useState(1)

  const handleShowQueryChange = React.useCallback((v: boolean) => {
    setShowQuery(v)
    if (v) setWidthMultiplier((m) => Math.max(m, 2))
  }, [])

  React.useEffect(() => {
    if (plan) {
      setFederationDetail(1)
      setShowQuery(false)
      setWidthMultiplier(1)
    }
  }, [plan])

  const nodeWidth = Math.round(NODE_WIDTH * widthMultiplier)

  const flow = React.useMemo(
    () =>
      plan
        ? queryPlanToReactFlow({ plan, nodeWidth })
        : { nodes: [], edges: [] },
    [plan, nodeWidth],
  )

  if (!plan) {
    return null
  }

  if (!isReady) {
    return <QueryPlanDiagramFallback />
  }

  return (
    <QueryPlanCanvasContext.Provider
      value={{
        detailLevel: federationDetail,
        showQuery,
        nodeWidth,
        formatOperation,
      }}
    >
      <React.Suspense fallback={<QueryPlanDiagramFallback />}>
        {/*
         * key={nodeWidth} intentionally remounts the entire React Flow canvas
         * whenever the node width changes. This forces React Flow to re-measure
         * all node dimensions from scratch so cards never bleed into each other
         * after a width adjustment. The trade-off (lost zoom/pan state) is
         * acceptable since the user explicitly changed the layout.
         */}
        <QueryPlanFlowCanvas
          key={nodeWidth}
          nodes={flow.nodes}
          edges={flow.edges}
          detailLevel={federationDetail}
          onDetailChange={setFederationDetail}
          showQuery={showQuery}
          onShowQueryChange={handleShowQueryChange}
          widthMultiplier={widthMultiplier}
          onWidthMultiplierChange={setWidthMultiplier}
          nodeWidth={nodeWidth}
        />
      </React.Suspense>
    </QueryPlanCanvasContext.Provider>
  )
}

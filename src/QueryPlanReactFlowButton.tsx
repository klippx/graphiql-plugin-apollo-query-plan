import { ToolbarButton } from '@graphiql/react'
import React from 'react'
import { QueryPlanCompact } from './QueryPlanCompact'
import { QueryPlanDiagram } from './QueryPlanDiagram'
import { QueryPlanRaw } from './QueryPlanRaw'
import './query-plan-tokens.css'
import './QueryPlanViews.css'
import type { ApolloQueryPlan } from './queryPlanTypes'
import { type UseQueryPlanOptions, useQueryPlan } from './useQueryPlan'

export type { UseQueryPlanOptions }

/** Default toolbar icon — a simple node-graph glyph. */
const DefaultIcon = () => (
  <svg
    aria-hidden="true"
    width={24}
    height={24}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <circle cx="5" cy="12" r="2" />
    <circle cx="19" cy="5" r="2" />
    <circle cx="19" cy="19" r="2" />
    <line x1="7" y1="12" x2="17" y2="6" />
    <line x1="7" y1="12" x2="17" y2="18" />
  </svg>
)

type ActiveTab = 'diagram' | 'compact' | 'raw'

/** Built-in fallback dialog used when no `renderPanel` prop is provided. */
const FallbackDialog = ({
  plan,
  onClose,
}: {
  plan: ApolloQueryPlan | null
  onClose: () => void
}) => {
  const [activeTab, setActiveTab] = React.useState<ActiveTab>('diagram')
  const [isReady, setIsReady] = React.useState(false)
  const dialogRef = React.useRef<HTMLDialogElement>(null)

  /**
   * Opens the native <dialog> via showModal() — the only way to get correct
   * modal behaviour (backdrop, focus trap, Escape key).
   *
   * Also detects when the open animation has settled before mounting React
   * Flow: getBoundingClientRect() returns wrong positions while a CSS
   * translate/opacity transition is in progress. The 300ms fallback covers
   * reduced-motion users where no transitionend fires.
   */
  React.useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    dialog.showModal()

    const onTransitionEnd = (e: TransitionEvent) => {
      if (e.propertyName === 'translate' || e.propertyName === 'opacity') {
        setIsReady(true)
      }
    }
    const fallback = setTimeout(() => setIsReady(true), 300)

    dialog.addEventListener('transitionend', onTransitionEnd)
    return () => {
      dialog.removeEventListener('transitionend', onTransitionEnd)
      clearTimeout(fallback)
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
      className={'qp-fallback-dialog'}
    >
      <div className={'qp-fallback-header'}>
        <h2 className={'qp-fallback-title'}>Query plan</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={'qp-fallback-close-button'}
        >
          ×
        </button>
      </div>

      <div className={'qp-fallback-tab-row'}>
        {(['diagram', 'compact', 'raw'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`${'qp-fallback-tab-button'}${activeTab === tab ? ` ${'qp-fallback-tab-button-active'}` : ''}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === 'diagram' && (
        <QueryPlanDiagram plan={plan} isReady={isReady} />
      )}
      {activeTab === 'compact' && <QueryPlanCompact plan={plan} />}
      {activeTab === 'raw' && <QueryPlanRaw plan={plan} />}
    </dialog>
  )
}

type Props = {
  /** Called whenever an error occurs; receives a short label and a descriptive message. */
  onError: UseQueryPlanOptions['onError']
  /**
   * Renders the query plan panel content. Receives the fetched plan and a
   * close callback. Use this to wrap the plan views in your own dialog,
   * drawer, or layout.
   *
   * When omitted, a built-in native `<dialog>` fallback is used.
   *
   * @example
   * ```tsx
   * renderPanel={(plan, close) => (
   *   <MyDialog onClose={close}>
   *     <MyTabs>
   *       <MyTab label="Diagram"><QueryPlanDiagram plan={plan} /></MyTab>
   *       <MyTab label="Compact"><QueryPlanCompact plan={plan} /></MyTab>
   *       <MyTab label="Raw"><QueryPlanRaw plan={plan} /></MyTab>
   *     </MyTabs>
   *   </MyDialog>
   * )}
   * ```
   */
  renderPanel?: (
    plan: ApolloQueryPlan | null,
    close: () => void,
  ) => React.ReactNode
  /**
   * Custom icon rendered inside the toolbar button.
   * Defaults to a simple node-graph SVG glyph.
   */
  icon?: React.ReactNode
}

/** Renders the toolbar button that fetches and opens the React Flow query plan view. */
export const QueryPlanReactFlowButton = ({
  onError,
  renderPanel,
  icon,
}: Props) => {
  const { fetchPlan, isLoading } = useQueryPlan({ onError })
  const [plan, setPlan] = React.useState<ApolloQueryPlan | null>(null)
  const [isOpen, setIsOpen] = React.useState(false)

  const handleClose = React.useCallback(() => {
    setIsOpen(false)
  }, [])

  const handleClick = React.useCallback(async () => {
    const nextPlan = await fetchPlan()

    if (nextPlan) {
      setPlan(nextPlan)
      setIsOpen(true)
    }
  }, [fetchPlan])

  return (
    <>
      <ToolbarButton
        onClick={handleClick}
        label="Show query plan"
        disabled={isLoading}
      >
        <div className="graphiql-toolbar-icon" aria-hidden="true">
          {icon ?? <DefaultIcon />}
        </div>
      </ToolbarButton>
      {isOpen &&
        (renderPanel ? (
          renderPanel(plan, handleClose)
        ) : (
          <FallbackDialog plan={plan} onClose={handleClose} />
        ))}
    </>
  )
}

import './query-plan-tokens.css'
import { useMonaco } from '@graphiql/react'
import React from 'react'
import './QueryPlanViews.css'
import type { ApolloQueryPlan } from './queryPlanTypes'

type Props = {
  plan: ApolloQueryPlan | null
}

/**
 * Read-only Monaco editor showing the raw query plan JSON.
 * Reuses the Monaco instance already loaded by GraphiQL — no extra bundle cost.
 * Falls back to a plain `<pre>` while Monaco initialises.
 */
export const QueryPlanRaw = ({ plan }: Props) => {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const { monaco, actions } = useMonaco()

  React.useEffect(() => {
    void actions.initialize()
  }, [actions])

  const value = plan ? JSON.stringify(plan.object, null, 2) : ''

  React.useEffect(() => {
    if (!monaco || !containerRef.current) return
    const editor = monaco.editor.create(containerRef.current, {
      value,
      language: 'json',
      readOnly: true,
      minimap: { enabled: false },
      folding: true,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      automaticLayout: true,
      fontSize: 12,
      wordWrap: 'on',
      stickyScroll: { enabled: false },
    })
    return () => editor.dispose()
  }, [monaco, value])

  if (!plan) {
    return null
  }

  if (!monaco) {
    return <pre className={'qp-code-fallback'}>{value}</pre>
  }

  return <div ref={containerRef} className={'qp-monaco-container'} />
}

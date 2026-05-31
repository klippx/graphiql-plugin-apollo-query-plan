import './query-plan-tokens.css'
import React from 'react'
import { codeToHtml } from 'shiki'
import './QueryPlanViews.css'
import type { ApolloQueryPlan } from './queryPlanTypes'

type Props = {
  plan: ApolloQueryPlan | null
}

/**
 * Renders a syntax-highlighted compact representation of the query plan text.
 * Uses Shiki for highlighting with light/dark theme support.
 * Falls back to a plain `<pre>` while highlighting is in progress.
 */
export const QueryPlanCompact = ({ plan }: Props) => {
  const [highlightedPlan, setHighlightedPlan] = React.useState<string | null>(
    null,
  )

  React.useEffect(() => {
    if (!plan?.text) {
      setHighlightedPlan(null)
      return
    }
    codeToHtml(plan.text, {
      lang: 'graphql',
      themes: { light: 'github-light', dark: 'github-dark' },
      defaultColor: false,
    })
      .then(setHighlightedPlan)
      .catch(() => setHighlightedPlan(null))
  }, [plan?.text])

  if (!plan) {
    return null
  }

  return (
    <div className={'qp-compact'}>
      {highlightedPlan ? (
        /* biome-ignore lint/security/noDangerouslySetInnerHtml: trusted shiki output */
        <div dangerouslySetInnerHTML={{ __html: highlightedPlan }} />
      ) : (
        <pre className={'qp-code-fallback'}>{plan.text}</pre>
      )}
    </div>
  )
}

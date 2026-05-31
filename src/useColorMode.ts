import React from 'react'

const getColorMode = (): 'light' | 'dark' =>
  typeof document !== 'undefined' &&
  document.documentElement.dataset.colorMode === 'dark'
    ? 'dark'
    : 'light'

/**
 * Reads the app-level color mode from the `data-color-mode` attribute set on
 * `<html>` by the inline script in `layout.tsx` before first paint.
 * Subscribes to changes via MutationObserver so consumers update live
 * when the user switches system preference.
 *
 * Must be called in a client-side context — returns `'light'` during SSR.
 */
export const useColorMode = (): 'light' | 'dark' => {
  const [colorMode, setColorMode] = React.useState<'light' | 'dark'>(
    getColorMode,
  )

  React.useEffect(() => {
    setColorMode(getColorMode())
    const observer = new MutationObserver(() => setColorMode(getColorMode()))
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-color-mode'],
    })
    return () => observer.disconnect()
  }, [])

  return colorMode
}

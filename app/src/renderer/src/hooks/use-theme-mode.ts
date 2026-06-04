import { useEffect, useState } from 'react'

// Reads the current theme by observing the `dark` class on <html>. AppShell
// already toggles that class; this hook lets leaf components react to it
// without prop-drilling.
export function useThemeMode(): 'light' | 'dark' {
  const [mode, setMode] = useState<'light' | 'dark'>(() =>
    typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
      ? 'dark'
      : 'light'
  )
  useEffect(() => {
    if (typeof document === 'undefined') return
    const el = document.documentElement
    const observer = new MutationObserver(() => {
      setMode(el.classList.contains('dark') ? 'dark' : 'light')
    })
    observer.observe(el, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return mode
}

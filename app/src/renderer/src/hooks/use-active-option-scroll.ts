import { useEffect, useRef } from 'react'

/**
 * Keeps the keyboard-active option of a scrollable picker list visible.
 * Attach the returned ref to the active option's element; the list scrolls
 * whenever ArrowUp/ArrowDown moves the index.
 */
export function useActiveOptionScroll<T extends HTMLElement>(
  activeIndex: number
): React.RefObject<T | null> {
  const activeOptionRef = useRef<T | null>(null)

  useEffect(() => {
    activeOptionRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  return activeOptionRef
}

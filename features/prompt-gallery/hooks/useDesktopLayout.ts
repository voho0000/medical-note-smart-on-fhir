import { useCallback, useSyncExternalStore } from 'react'

/** Matches the app's md split: table layout at 768px and up, cards below. */
const DESKTOP_QUERY = '(min-width: 768px)'

const readMatch = () =>
  typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? true : window.matchMedia(DESKTOP_QUERY).matches

export function useDesktopLayout(): boolean {
  const subscribe = useCallback((onChange: () => void) => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {}
    const media = window.matchMedia(DESKTOP_QUERY)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])
  return useSyncExternalStore(subscribe, readMatch, () => true)
}

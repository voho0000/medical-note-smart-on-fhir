// Favorites + recently-used calculators — mirrors MDCalc's Favorites/Recent
// nav (https://www.mdcalc.com/), persisted per-browser via the shared
// localStorage hook. With 50+ calculators, re-searching for the same few a
// clinician checks every round (MELD, CURB-65…) doesn't scale without this.

import { useCallback } from 'react'
import { useLocalStorage } from '@/src/shared/hooks/storage/use-local-storage.hook'

const FAVORITES_KEY = 'medical-calculator-favorites'
const RECENT_KEY = 'medical-calculator-recent'
const MAX_RECENT = 8

export function useCalcFavorites() {
  const { value: favorites, setValue: setFavorites } = useLocalStorage<string[]>({
    key: FAVORITES_KEY,
    defaultValue: [],
  })

  const toggleFavorite = useCallback((id: string) => {
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [setFavorites])

  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites])

  return { favorites, toggleFavorite, isFavorite }
}

export function useCalcRecent() {
  const { value: recent, setValue: setRecent } = useLocalStorage<string[]>({
    key: RECENT_KEY,
    defaultValue: [],
  })

  const markUsed = useCallback((id: string) => {
    setRecent((prev) => [id, ...prev.filter((x) => x !== id)].slice(0, MAX_RECENT))
  }, [setRecent])

  return { recent, markUsed }
}

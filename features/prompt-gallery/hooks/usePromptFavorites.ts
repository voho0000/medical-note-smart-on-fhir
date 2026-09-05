/**
 * Prompt favorites state for the gallery: a live, account-bound list with
 * optimistic toggling and the short confirmation toasts the spec asks for.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useLanguage } from '@/src/application/providers/language.provider'
import type { PromptFavorite, SharedPrompt } from '../types/prompt.types'
import { loadSharedPromptContent } from '../services/prompt-gallery.service'
import { removePromptFavorite, savePromptFavorite, subscribePromptFavorites } from '../services/prompt-favorites.service'
import { toPromptFavorite } from '../utils/prompt-favorite.utils'

interface UsePromptFavoritesOptions {
  /** Favorites belong to a signed-in account; omit for anonymous sessions. */
  userId?: string
  enabled?: boolean
}

export function usePromptFavorites({ userId, enabled = true }: UsePromptFavoritesOptions) {
  const { t } = useLanguage()
  const [stored, setStored] = useState<{ userId: string; favorites: PromptFavorite[]; loading: boolean }>()
  const pending = useRef(new Set<string>())
  const active = !!userId && enabled

  useEffect(() => {
    if (!active) return
    // The subscription owns the loading state until the first snapshot arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStored(previous => previous?.userId === userId ? { ...previous, loading: true } : { userId, favorites: [], loading: true })
    const unsubscribe = subscribePromptFavorites(userId, favorites => setStored({ userId, favorites, loading: false }))
    return unsubscribe
  }, [active, userId])

  const favorites = useMemo<PromptFavorite[]>(
    () => active && stored?.userId === userId ? stored.favorites : [],
    [active, stored, userId],
  )
  const loading = active && stored?.userId === userId ? stored.loading : false
  const ids = useMemo(() => new Set(favorites.map(favorite => favorite.id)), [favorites])
  const isFavorite = useCallback((promptId: string) => ids.has(promptId), [ids])

  const setFavorites = useCallback((update: (favorites: PromptFavorite[]) => PromptFavorite[]) => {
    setStored(previous => previous ? { ...previous, favorites: update(previous.favorites) } : previous)
  }, [])

  /** Add or remove; resolves to the new favorite state, or the old one when the write failed. */
  const toggle = useCallback(async (prompt: SharedPrompt): Promise<boolean> => {
    const wasFavorite = ids.has(prompt.id)
    if (!userId || pending.current.has(prompt.id)) return wasFavorite
    pending.current.add(prompt.id)
    try {
      if (wasFavorite) {
        let removed: PromptFavorite | undefined
        setFavorites(list => list.filter(favorite => favorite.id !== prompt.id || ((removed = favorite), false)))
        if (!(await removePromptFavorite(userId, prompt.id))) {
          setFavorites(list => removed && !list.some(favorite => favorite.id === removed!.id) ? [removed, ...list] : list)
          toast.error(t.promptGallery.favoriteError)
          return true
        }
        toast.success(t.promptGallery.removedFromFavorites)
        return false
      }
      const favorite = toPromptFavorite(await loadSharedPromptContent(prompt))
      setFavorites(list => [favorite, ...list.filter(item => item.id !== favorite.id)])
      if (!(await savePromptFavorite(userId, favorite))) {
        setFavorites(list => list.filter(item => item.id !== favorite.id))
        toast.error(t.promptGallery.favoriteError)
        return false
      }
      toast.success(t.promptGallery.addedToFavorites)
      return true
    } catch {
      toast.error(t.promptGallery.favoriteError)
      return wasFavorite
    } finally {
      pending.current.delete(prompt.id)
    }
  }, [ids, userId, setFavorites, t])

  return { favorites, loading, isFavorite, toggle }
}

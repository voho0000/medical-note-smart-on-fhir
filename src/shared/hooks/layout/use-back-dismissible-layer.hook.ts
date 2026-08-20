/**
 * Back-dismissible layer
 *
 * On phones the workspace stacks temporary layers (the 「功能」 panel, the
 * shared detail pane) on top of the clinical browser. Nothing in the app was
 * wired to session history, so Android's hardware back and iOS' edge swipe
 * left the app entirely — and because every piece of clinical state lives in
 * memory, that discarded the whole session: loaded bundle, AI output, chat.
 *
 * This hook lends one such layer a history entry. Opening pushes an entry;
 * the platform back gesture pops it and calls `onDismiss` instead of leaving
 * the app; closing from inside the app rewinds the entry it pushed so the
 * stack does not grow a dead step per open/close cycle.
 *
 * The URL is deliberately untouched — `pushState(state, '')` keeps the same
 * address, which matters for the static GitHub Pages build and for SMART
 * launches whose query string must survive.
 *
 * Nesting works because each layer tags its own entry and a listener only
 * dismisses when its tag is no longer the current one. An inner layer
 * rewinding its entry therefore lands on the outer layer's entry, which the
 * outer listener recognises as still its own and ignores.
 */
import { useEffect, useRef } from 'react'

const LAYER_STATE_KEY = '__mpLayer'

let layerCounter = 0

export function useBackDismissibleLayer(
  active: boolean,
  onDismiss: () => void,
  enabled = true,
) {
  // Kept in a ref so a fresh `onDismiss` identity does not tear down and
  // re-push the history entry on every parent render.
  const onDismissRef = useRef(onDismiss)
  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    if (!enabled || !active) return
    if (typeof window === 'undefined' || !window.history) return

    const token = `layer-${++layerCounter}`
    // Popped by the platform rather than by the app: the cleanup below must
    // not rewind an entry that history has already discarded.
    let poppedByPlatform = false

    const currentToken = () =>
      (window.history.state as Record<string, unknown> | null)?.[LAYER_STATE_KEY]

    window.history.pushState(
      { ...(window.history.state as object | null), [LAYER_STATE_KEY]: token },
      '',
    )

    const handlePopState = () => {
      // Still our entry — this pop belongs to a layer stacked above us.
      if (currentToken() === token) return
      poppedByPlatform = true
      onDismissRef.current()
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
      if (!poppedByPlatform && currentToken() === token) {
        window.history.back()
      }
    }
  }, [active, enabled])
}

// Anchor side of resource navigation: attach to the card that renders one
// FHIR resource. When a pending navigation matches, the element scrolls
// itself into view, flashes (`.resource-flash`, defined in globals.css) and
// consumes the request so the fallback toast knows it was claimed.
//
// Usage: const anchorRef = useResourceAnchor('Encounter', encounter.id)
//        <div ref={anchorRef}>…</div>
'use client'

import { useEffect, useRef } from 'react'
import { useResourceNavigationStore } from '@/src/application/stores/resource-navigation.store'

export function useResourceAnchor<T extends HTMLElement = HTMLDivElement>(
  resourceType: string | string[],
  resourceId?: string | string[],
  onMatch?: (sequence: number) => void,
) {
  const ref = useRef<T | null>(null)
  const pending = useResourceNavigationStore((s) => s.pending)
  const seq = useResourceNavigationStore((s) => s.seq)
  const consume = useResourceNavigationStore((s) => s.consume)
  // Meds render both MedicationRequest and MedicationStatement rows, so an
  // anchor may answer to several types. Joined string keeps deps stable.
  const typesKey = Array.isArray(resourceType) ? resourceType.join('|') : resourceType
  // Grouped history rows represent several refill resource ids. Let one visible
  // drug row claim any refill in that group, then its own effect can expand the
  // exact prescription details without waiting for a deeply nested anchor.
  const idsKey = Array.isArray(resourceId) ? resourceId.join('|') : resourceId

  useEffect(() => {
    if (!pending || !idsKey || !ref.current) return
    if (!typesKey.split('|').includes(pending.resourceType) || !idsKey.split('|').includes(pending.resourceId))
      return
    const el = ref.current
    // consume FIRST — scrolling can unmount virtualised siblings and re-run
    // effects; claiming up-front keeps exactly one anchor reacting.
    consume()
    // Let containers open any collapsed parent/body before the scroll. This is
    // scheduled rather than called synchronously inside the effect, and is not
    // tied to `pending` after consumption, so the callback cannot be cancelled
    // by the store update that clears the navigation request.
    if (onMatch) setTimeout(() => onMatch(seq), 0)
    // A short timeout (NOT requestAnimationFrame — rAF is frozen in
    // backgrounded tabs) lets a just-switched tab paint before we scroll.
    setTimeout(() => {
      el.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el.classList.add('resource-flash')
      setTimeout(() => el.classList.remove('resource-flash'), 2000)
    }, 50)
  }, [pending, seq, typesKey, idsKey, consume, onMatch])

  return ref
}

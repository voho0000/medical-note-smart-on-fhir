import { useCallback, useMemo, useState } from 'react'
import {
  detectSlashToken,
  matchTemplates,
  applyTemplate,
  type SlashTemplate,
} from '../utils/slash-trigger'

const MAX_ITEMS = 8

/**
 * Wires the slash-template autocomplete to a textarea. Tracks the caret,
 * detects the active "/keyword" token, matches templates, and handles the
 * keyboard (↑/↓/Enter/Tab/Esc). The component renders the menu from `matches`
 * and calls `choose` on click; `onKeyDown` returns true when it consumed the
 * key so the caller skips its own handler (e.g. Enter-to-send).
 */
export function useSlashMenu(
  value: string,
  setValue: (v: string | ((prev: string) => string)) => void,
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  templates: SlashTemplate[],
) {
  const [caret, setCaret] = useState(0)
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)

  const token = useMemo(() => detectSlashToken(value, caret), [value, caret])
  const matches = useMemo(
    () => (token ? matchTemplates(templates, token.query).slice(0, MAX_ITEMS) : []),
    [token, templates],
  )
  const open = !!token && matches.length > 0 && !dismissed

  // Reset highlight + un-dismiss whenever the active token changes — done as a
  // render-time adjustment (React's recommended pattern) rather than an effect.
  const tokenKey = token ? `${token.start}:${token.query}` : ''
  const [prevTokenKey, setPrevTokenKey] = useState(tokenKey)
  if (tokenKey !== prevTokenKey) {
    setPrevTokenKey(tokenKey)
    setActive(0)
    setDismissed(false)
  }

  const syncCaret = useCallback(() => {
    const el = textareaRef.current
    if (el) setCaret(el.selectionStart ?? 0)
  }, [textareaRef])

  const choose = useCallback(
    (item: SlashTemplate) => {
      if (!token) return
      const { text, caret: next } = applyTemplate(value, token, item.body)
      setValue(text)
      setDismissed(true)
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (el) {
          el.focus()
          el.setSelectionRange(next, next)
          setCaret(next)
        }
      })
    },
    [token, value, setValue, textareaRef],
  )

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!open) return false
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setActive((i) => (i + 1) % matches.length)
          return true
        case 'ArrowUp':
          e.preventDefault()
          setActive((i) => (i - 1 + matches.length) % matches.length)
          return true
        case 'Enter':
        case 'Tab':
          e.preventDefault()
          choose(matches[active])
          return true
        case 'Escape':
          e.preventDefault()
          setDismissed(true)
          return true
        default:
          return false
      }
    },
    [open, matches, active, choose],
  )

  return { open, matches, active, setActive, choose, onKeyDown, syncCaret }
}

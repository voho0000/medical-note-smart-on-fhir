import { cn } from '@/src/shared/utils/cn.utils'
import type { SlashTemplate } from '../utils/slash-trigger'

interface SlashTemplateMenuProps {
  items: SlashTemplate[]
  active: number
  onSelect: (item: SlashTemplate) => void
  onHover: (index: number) => void
}

/** Autocomplete list for the "/shortcut" template trigger. Positioned above the
 *  chat input (its container must be `relative`). Uses onMouseDown so picking an
 *  item doesn't blur the textarea before the selection is applied. */
export function SlashTemplateMenu({ items, active, onSelect, onHover }: SlashTemplateMenuProps) {
  if (items.length === 0) return null
  return (
    <div
      className="absolute bottom-full left-0 right-0 z-50 mb-2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg"
      role="listbox"
    >
      <ul className="max-h-64 overflow-y-auto py-1 text-sm">
        {items.map((item, i) => (
          <li
            key={item.id}
            role="option"
            aria-selected={i === active}
            onMouseDown={(e) => {
              e.preventDefault()
              onSelect(item)
            }}
            onMouseEnter={() => onHover(i)}
            className={cn(
              'flex cursor-pointer items-center justify-between gap-3 px-3 py-1.5',
              i === active ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50',
            )}
          >
            <span className="min-w-0 truncate">{item.label}</span>
            {item.shortcut && (
              <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                /{item.shortcut}
              </code>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

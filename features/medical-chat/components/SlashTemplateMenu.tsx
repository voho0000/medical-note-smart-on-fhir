import { cn } from '@/src/shared/utils/cn.utils'
import { PopoverContent } from '@/components/ui/popover'
import type { SlashTemplate } from '../utils/slash-trigger'

interface SlashTemplateMenuProps {
  id: string
  items: SlashTemplate[]
  active: number
  onSelect: (item: SlashTemplate) => void
  onHover: (index: number) => void
}

/** Autocomplete list for the "/shortcut" template trigger. The popover portal
 *  keeps it outside the composer's scroll container so a tall list cannot be
 *  clipped by the footer. Uses onMouseDown so selecting an item does not blur
 *  the textarea before its contents are applied. */
export function SlashTemplateMenu({ id, items, active, onSelect, onHover }: SlashTemplateMenuProps) {
  if (items.length === 0) return null
  return (
    <PopoverContent
      id={id}
      side="top"
      align="start"
      sideOffset={8}
      collisionPadding={8}
      onOpenAutoFocus={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => event.preventDefault()}
      className="z-[70] w-80 min-w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1rem)] overflow-hidden rounded-xl p-0 shadow-lg"
      role="listbox"
    >
      <ul
        className="overflow-y-auto py-1 text-sm"
        style={{ maxHeight: 'min(16rem, var(--radix-popover-content-available-height))' }}
      >
        {items.map((item, i) => (
          <li
            id={`${id}-option-${i}`}
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
    </PopoverContent>
  )
}

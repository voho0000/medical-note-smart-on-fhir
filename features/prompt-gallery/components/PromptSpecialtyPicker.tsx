import { useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLanguage } from '@/src/application/providers/language.provider'
import { cn } from '@/src/shared/utils/cn.utils'
import { PROMPT_SPECIALTY_GROUPS } from '../constants/prompt-specialties'
import type { PromptSpecialty } from '../types/prompt.types'

type SpecialtyGroupId = (typeof PROMPT_SPECIALTY_GROUPS)[number]['id']

type PromptSpecialtyPickerProps = {
  id: string
  describedBy?: string
  className?: string
} & (
  | { multiple?: false; value?: PromptSpecialty; onChange: (value?: PromptSpecialty) => void }
  | { multiple: true; value: PromptSpecialty[]; onChange: (value: PromptSpecialty[]) => void }
)

/** Two levels in one overlay keep every specialty reachable on narrow screens. */
export function PromptSpecialtyPicker(props: PromptSpecialtyPickerProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [activeGroupId, setActiveGroupId] = useState<SpecialtyGroupId | null>(null)
  const backRef = useRef<HTMLDivElement>(null)
  const groupRefs = useRef<Partial<Record<SpecialtyGroupId, HTMLDivElement | null>>>({})
  const pendingFocus = useRef<SpecialtyGroupId | 'back' | null>(null)
  const selected = props.multiple ? props.value : props.value ? [props.value] : []
  const activeGroup = PROMPT_SPECIALTY_GROUPS.find((group) => group.id === activeGroupId)

  // Replacing the menu's level removes the focused row; move focus to the
  // back action or the group the user just left, including for keyboard users.
  useEffect(() => {
    const target = pendingFocus.current
    if (target) {
      const element = target === 'back' ? backRef.current : groupRefs.current[target]
      element?.focus()
      pendingFocus.current = null
    }
  }, [activeGroupId])

  const enterGroup = (id: SpecialtyGroupId) => {
    pendingFocus.current = 'back'
    setActiveGroupId(id)
  }

  const returnToGroups = () => {
    pendingFocus.current = activeGroupId
    setActiveGroupId(null)
  }

  const getLabel = (specialty: PromptSpecialty) => {
    if (!props.multiple && (specialty === 'internal' || specialty === 'pathology')) {
      return t.promptGallery.specialtyFilterLabels[specialty]
    }
    return t.promptGallery.specialties[specialty]
  }

  const triggerLabel = props.multiple
    ? selected.length
      ? t.promptGallery.selectedSpecialties.replace('{count}', String(selected.length))
      : t.promptGallery.selectSpecialty
    : props.value ? getLabel(props.value) : t.promptGallery.allSpecialties

  return (
    <DropdownMenu open={open} onOpenChange={(nextOpen) => {
      setOpen(nextOpen)
      if (nextOpen) {
        pendingFocus.current = null
        setActiveGroupId(null)
      }
    }}>
      <DropdownMenuTrigger asChild>
        <Button id={props.id} type="button" variant="outline"
          aria-describedby={[`${props.id}-value`, props.describedBy].filter(Boolean).join(' ')}
          className={cn('w-full min-w-0 justify-between font-normal shadow-none max-md:min-h-11', props.className)}>
          <span id={`${props.id}-value`} className="truncate">{triggerLabel}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" collisionPadding={8}
        className="flex max-h-[min(24rem,var(--radix-dropdown-menu-content-available-height))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden p-0"
        onKeyDown={(event) => {
          if (activeGroup && event.key === 'ArrowLeft') {
            event.preventDefault()
            returnToGroups()
          }
        }}>
        <div className="shrink-0 p-1 pb-0">
          {activeGroup && (
            <DropdownMenuItem ref={backRef} className="max-md:min-h-11"
              onSelect={(event) => { event.preventDefault(); returnToGroups() }}>
              <ChevronLeft aria-hidden="true" />
              {t.promptGallery.backToSpecialtyGroups}
            </DropdownMenuItem>
          )}
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {activeGroup ? t.promptGallery.specialtyGroups[activeGroup.id] : t.promptGallery.selectSpecialtyGroup}
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="mb-0" />
        </div>
        <div className="min-h-0 overflow-y-auto p-1">
          {!activeGroup ? (
            <>
              {!props.multiple && (
                <DropdownMenuRadioGroup value={props.value ?? 'all'} onValueChange={() => props.onChange(undefined)}>
                  <DropdownMenuRadioItem value="all" className="max-md:min-h-11">
                    {t.promptGallery.allSpecialties}
                  </DropdownMenuRadioItem>
                  <DropdownMenuSeparator />
                </DropdownMenuRadioGroup>
              )}
              <DropdownMenuGroup aria-label={t.promptGallery.selectSpecialtyGroup}>
                {PROMPT_SPECIALTY_GROUPS.map((group) => {
                  const count = group.specialties.filter((specialty) => selected.includes(specialty)).length
                  return (
                    <DropdownMenuItem key={group.id} ref={(node) => { groupRefs.current[group.id] = node }}
                      className="max-md:min-h-11"
                      onSelect={(event) => { event.preventDefault(); enterGroup(group.id) }}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowRight') { event.preventDefault(); enterGroup(group.id) }
                      }}>
                      <span className="flex-1">{t.promptGallery.specialtyGroups[group.id]}</span>
                      {count > 0 && <span className="shrink-0 text-xs text-muted-foreground">
                        {t.promptGallery.specialtiesSelectedInGroup.replace('{count}', String(count))}
                      </span>}
                      <ChevronRight aria-hidden="true" />
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuGroup>
            </>
          ) : props.multiple ? (
            <DropdownMenuGroup aria-label={t.promptGallery.specialtyGroups[activeGroup.id]}>
              {activeGroup.specialties.map((specialty) => (
                <DropdownMenuCheckboxItem key={specialty} checked={selected.includes(specialty)}
                  onCheckedChange={(checked) => props.onChange(checked
                    ? [...props.value, specialty]
                    : props.value.filter((value) => value !== specialty))}
                  onSelect={(event) => event.preventDefault()} className="max-md:min-h-11">
                  {getLabel(specialty)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuGroup>
          ) : (
            <DropdownMenuRadioGroup aria-label={t.promptGallery.specialtyGroups[activeGroup.id]}
              value={props.value ?? 'all'} onValueChange={(value) => props.onChange(value as PromptSpecialty)}>
              {activeGroup.specialties.map((specialty) => (
                <DropdownMenuRadioItem key={specialty} value={specialty} className="max-md:min-h-11">
                  {getLabel(specialty)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

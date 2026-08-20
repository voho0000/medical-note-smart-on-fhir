// Improved Medication List Component with Collapsible Sections
"use client"

import { useEffect, useId, useState } from 'react'
import { ChevronDown, ChevronRight, History } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useResourceNavigationStore } from "@/src/application/stores/resource-navigation.store"
import { cn } from "@/src/shared/utils/cn.utils"
import type { MedicationNameMode, MedicationRow } from '../types'
import { MedicationItem } from './MedicationItem'
import { MedicationHistoryList } from './MedicationHistoryList'
import { useGroupedMedications } from '../hooks/useGroupedMedications'

interface MedicationListProps {
  medications: MedicationRow[]
  isLoading: boolean
  error: Error | null
  /** When true, MedicationItem renders a "目前服用" chip on rows that came
   *  from a FHIR MedicationStatement (rather than a MedicationRequest).
   *  Set by MedListCard only when the list is mixed-source; pure single-source
   *  lists are signalled via a card-level banner instead. */
  showSourceChip?: boolean
  sourceChipStatementLabel?: string
  sourceChipStatementTooltip?: string
  nameMode?: MedicationNameMode
  showNameModeSwitch?: boolean
  onNameModeChange?: (mode: MedicationNameMode) => void
}

export function MedicationList({
  medications,
  isLoading,
  error,
  showSourceChip = false,
  sourceChipStatementLabel,
  sourceChipStatementTooltip,
  nameMode = 'ingredient',
  showNameModeSwitch = false,
  onNameModeChange,
}: MedicationListProps) {
  const { t } = useLanguage()
  const mt = (t.medications as any)
  const [showActive, setShowActive] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const activeListId = useId()
  const nameModeSwitchId = useId()
  const { activeMedications, inactiveMedicationGroups } = useGroupedMedications(medications)
  const pending = useResourceNavigationStore((s) => s.pending)
  const navSeq = useResourceNavigationStore((s) => s.seq)

  useEffect(() => {
    if (!pending || !['MedicationRequest', 'MedicationStatement'].includes(pending.resourceType)) return
    const targetInActive = activeMedications.some((medication) =>
      medication.id === pending.resourceId,
    )
    const targetInHistory = inactiveMedicationGroups.some((group) =>
      group.medications.some((medication) => medication.id === pending.resourceId),
    )
    if (!targetInActive && !targetInHistory) return
    const timer = window.setTimeout(() => {
      if (targetInActive) setShowActive(true)
      if (targetInHistory) setShowInactive(true)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [pending, navSeq, activeMedications, inactiveMedicationGroups])

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">{t.common.loading}</div>
  }

  if (error) {
    return (
      <div className="text-sm text-destructive">
        {error instanceof Error ? error.message : String(error)}
      </div>
    )
  }

  if (medications.length === 0) {
    return <div className="text-sm text-muted-foreground">{mt.noData}</div>
  }

  const totalInactive = inactiveMedicationGroups.reduce((sum, group) => sum + group.count, 0)
  const nameDisplay = mt.nameDisplay ?? {
    label: '藥名顯示方式',
    ingredient: '成分名',
    product: '商品名',
  }

  return (
    <div className="space-y-4">
      {/* Currently in use Medications */}
      {activeMedications.length > 0 && (
        <div className="space-y-1 md:space-y-1.5">
          <div className="flex min-h-[32px] items-center justify-between gap-2 md:min-h-8">
            <h3 className="min-w-0 text-sm font-semibold text-foreground">
              <button
                type="button"
                aria-expanded={showActive}
                aria-controls={activeListId}
                onClick={() => setShowActive((visible) => !visible)}
                className="-ml-2 inline-flex min-h-[32px] min-w-0 items-center gap-1.5 rounded-md px-2 text-left transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 md:min-h-8"
              >
                {showActive
                  ? <ChevronDown className="h-4 w-4 shrink-0" aria-hidden />
                  : <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />}
                <span className="truncate">
                  {mt.currentlyInUse} ({activeMedications.length})
                </span>
              </button>
            </h3>
            {showNameModeSwitch && onNameModeChange && (
              <div
                role="group"
                aria-label={nameDisplay.label}
                className="inline-flex min-h-[32px] shrink-0 items-center gap-1 whitespace-nowrap text-xs text-muted-foreground md:min-h-8"
              >
                <button
                  type="button"
                  onClick={() => onNameModeChange('ingredient')}
                  aria-pressed={nameMode === 'ingredient'}
                  className={cn(
                    'rounded-sm px-1 py-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    nameMode === 'ingredient' && 'font-medium text-foreground',
                  )}
                >
                  {nameDisplay.ingredient}
                </button>
                <label
                  htmlFor={nameModeSwitchId}
                  className="inline-flex h-[32px] w-9 cursor-pointer items-center justify-center md:h-8"
                >
                  <Switch
                    id={nameModeSwitchId}
                    checked={nameMode === 'product'}
                    onCheckedChange={(checked) => onNameModeChange(checked ? 'product' : 'ingredient')}
                    aria-label={nameDisplay.label}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onNameModeChange('product')}
                  aria-pressed={nameMode === 'product'}
                  className={cn(
                    'rounded-sm px-1 py-1 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                    nameMode === 'product' && 'font-medium text-foreground',
                  )}
                >
                  {nameDisplay.product}
                </button>
              </div>
            )}
          </div>
          {showActive && (
            <ul
              id={activeListId}
              data-medication-list-surface="grouped"
              className="@container divide-y divide-border/70 overflow-hidden rounded-lg border border-border/80 bg-muted/40 dark:bg-muted/30"
            >
              {activeMedications.map((medication) => (
                <li key={medication.id} className="min-w-0">
                  <MedicationItem
                    medication={medication}
                    showSourceChip={showSourceChip}
                    sourceChipStatementLabel={sourceChipStatementLabel}
                    sourceChipStatementTooltip={sourceChipStatementTooltip}
                    nameMode={nameMode}
                    grouped
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Inactive Medications - Collapsible */}
      {totalInactive > 0 && (
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowInactive(!showInactive)}
            className="w-full justify-between px-0 hover:bg-transparent"
          >
            <div className="flex items-center gap-2">
              {showInactive ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <History className="h-4 w-4" />
              <span className="text-sm font-semibold">
                {mt.history} ({totalInactive} {mt.historyStopped})
              </span>
            </div>
          </Button>

          {showInactive && (
            <MedicationHistoryList groups={inactiveMedicationGroups} nameMode={nameMode} />
          )}
        </div>
      )}
    </div>
  )
}

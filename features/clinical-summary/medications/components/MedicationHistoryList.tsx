// MedicationHistoryList — 已停用（用藥歷史）的統一列表。
//
// 取代舊設計「單筆處方=完整卡片、多筆處方=摺疊 accordion」的混雜排版：現在
// 每一種藥都是一條等高的細列，右側直接標示重複開立次數與最近日期，點開才展開
// 各次處方明細。等高、可掃視、重複次數一眼可見，不再被 toggle 藏起來。
//
// 注射劑分流：靜脈／肌肉／皮下注射（多為住院或急性期給藥）依「給藥途徑」抓出，
// 收進獨立、預設收合的子區塊，避免把口服常規用藥淹沒。注意：這是依 route 判斷，
// 不等於「住院」——真正的門診/住院情境需要 Encounter 連結（bridge 資料層），此處
// 不臆測。
"use client"

import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Syringe } from 'lucide-react'
import { useAudience } from "@/src/application/providers/audience.provider"
import { useLanguage } from "@/src/application/providers/language.provider"
import { useResourceAnchor } from "@/src/application/hooks/use-resource-anchor.hook"
import { useResourceNavigationStore } from "@/src/application/stores/resource-navigation.store"
import { cn } from "@/src/shared/utils/cn.utils"
import type { MedicationRow } from '../types'
import { medicationHistoryCategoryChipClass } from './medication-chip-styles'

export interface MedicationHistoryGroup {
  name: string
  count: number
  /** Newest-first (sorted upstream in useGroupedMedications). */
  medications: MedicationRow[]
}

/** SNOMED-mapped injection route abbreviations (see route-display.ts). */
const INJECTION_ABBR = new Set(['IV', 'IM', 'SC'])
// Injection keywords across the route display string (source free text or the
// patient-locale label) AND the drug name — TW product names spell it out
// (注射液 / 注射劑 / 針), which is the most reliable signal when route is blank.
const INJECTION_RE = /注射|點滴|靜脈|肌肉|皮下|針劑|inject|intraven|intramus|subcut|infusion/i

/** Route- and name-based heuristic for an injectable / infusion medication.
 *  NOT an inpatient detector — route only. */
function isInjectable(m: MedicationRow): boolean {
  const route = (m.route || '').trim()
  if (route) {
    if (INJECTION_ABBR.has(route.toUpperCase())) return true
    if (INJECTION_RE.test(route)) return true
  }
  return INJECTION_RE.test(m.title || '')
}

/** Most recent activity date for a prescription (end → stopped → start). */
function latestDateOf(m?: MedicationRow): string {
  return m?.endDate || m?.stoppedOn || m?.startedOn || ''
}

/** "start – end" when both known, else whichever single date exists. */
function dateRangeOf(m: MedicationRow): string {
  if (m.startedOn && m.endDate) return `${m.startedOn} – ${m.endDate}`
  return m.endDate || m.stoppedOn || m.startedOn || ''
}

interface MedicationHistoryListProps {
  groups: MedicationHistoryGroup[]
}

export function MedicationHistoryList({ groups }: MedicationHistoryListProps) {
  const { t } = useLanguage()
  const mt = (t.medications as any)
  const [showInjectables, setShowInjectables] = useState(false)
  const pending = useResourceNavigationStore((s) => s.pending)
  const navSeq = useResourceNavigationStore((s) => s.seq)

  // Sort drugs by most-recently-stopped first — the clinically relevant end of
  // a long history. localeCompare on the formatted date string sorts correctly
  // for the year-first zh-TW format (the primary audience).
  const { regular, injectable } = useMemo(() => {
    const sorted = [...groups].sort((a, b) =>
      latestDateOf(b.medications[0]).localeCompare(latestDateOf(a.medications[0])),
    )
    const reg: MedicationHistoryGroup[] = []
    const inj: MedicationHistoryGroup[] = []
    for (const g of sorted) {
      // Same drug name across refills → consistent classification; `.some`
      // still catches a group whose route was only recorded on some refills.
      ;(g.medications.some(isInjectable) ? inj : reg).push(g)
    }
    return { regular: reg, injectable: inj }
  }, [groups])

  useEffect(() => {
    if (!pending || !['MedicationRequest', 'MedicationStatement'].includes(pending.resourceType)) return
    const targetInInjectables = injectable.some((group) =>
      group.medications.some((medication) => medication.id === pending.resourceId),
    )
    if (!targetInInjectables) return
    const timer = window.setTimeout(() => setShowInjectables(true), 0)
    return () => window.clearTimeout(timer)
  }, [pending, navSeq, injectable])

  return (
    <div className="max-h-[28rem] space-y-2 overflow-y-auto scrollbar-thin-persistent pr-1">
      <ul className="space-y-0">
        {regular.map((group) => (
          <HistoryRow key={group.name} group={group} mt={mt} />
        ))}
      </ul>

      {injectable.length > 0 && (
        <div className="rounded-md border border-dashed border-border/70">
          <button
            type="button"
            onClick={() => setShowInjectables((o) => !o)}
            aria-expanded={showInjectables}
            title={mt.injectablesTooltip}
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40"
          >
            <ChevronRight
              className={cn("h-3.5 w-3.5 shrink-0 transition-transform", showInjectables && "rotate-90")}
              aria-hidden
            />
            <Syringe className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>{mt.injectablesHeader ?? '注射／點滴用藥'}</span>
            <span className="rounded-full bg-muted px-1.5 py-0 tabular-nums text-foreground/70">
              {injectable.length}
            </span>
          </button>
          {showInjectables && (
            <ul className="space-y-0 px-1.5 pb-1.5">
              {injectable.map((group) => (
                <HistoryRow key={group.name} group={group} mt={mt} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function HistoryRow({ group, mt }: { group: MedicationHistoryGroup; mt: any }) {
  const { audience } = useAudience()
  const isMedical = audience === 'medical'
  const [open, setOpen] = useState(false)
  const pending = useResourceNavigationStore((s) => s.pending)
  const navSeq = useResourceNavigationStore((s) => s.seq)
  const latest = group.medications[0]
  const latestDate = latestDateOf(latest)
  const timesUnit = mt.refillTimes ?? '次'
  const groupAnchorRef = useResourceAnchor<HTMLLIElement>(
    ['MedicationRequest', 'MedicationStatement'],
    group.medications.map((medication) => medication.id),
  )

  useEffect(() => {
    if (!pending || !['MedicationRequest', 'MedicationStatement'].includes(pending.resourceType)) return
    if (!group.medications.some((medication) => medication.id === pending.resourceId)) return
    const timer = window.setTimeout(() => setOpen(true), 0)
    return () => window.clearTimeout(timer)
  }, [pending, navSeq, group.medications])

  return (
    <li ref={groupAnchorRef} className="rounded-md border border-border/60">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors hover:bg-muted/40"
      >
        <ChevronRight
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-90",
          )}
          aria-hidden
        />
        <span className="truncate text-[0.8125rem] font-medium" title={group.name}>
          {group.name}
        </span>
        {latest?.category && (
          <span
            title={latest.category}
            className={medicationHistoryCategoryChipClass}
          >
            {latest.category}
          </span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
          {group.count > 1 && (
            <span className="rounded-full bg-muted px-1.5 py-0 font-medium tabular-nums text-foreground/70">
              {group.count} {timesUnit}
            </span>
          )}
          {latestDate && <span className="tabular-nums">{latestDate}</span>}
        </span>
      </button>

      {open && (
        <div className="space-y-1 border-t border-border/40 px-2.5 py-1.5 pl-7">
          {group.medications.map((m, i) => {
            const parts: string[] = []
            const range = dateRangeOf(m)
            if (range) parts.push(range)
            if (m.dose) parts.push(m.dose)
            if (m.route) parts.push(m.route)
            if (m.frequency) parts.push(m.frequency)
            if (m.durationDays) parts.push(`${m.durationDays} ${mt.durationDaysUnit ?? 'days'}`)
            if (m.pharmacy) parts.push(m.pharmacy)
            if (isMedical && m.icdCode) parts.push(`${m.icdCode}${m.icdText ? ` ${m.icdText}` : ''}`)
            return (
              <MedicationHistoryDetail
                key={m.id || i}
                medication={m}
                text={parts.length > 0 ? parts.join('  ·  ') : (mt.noDetail ?? '')}
              />
            )
          })}
        </div>
      )}
    </li>
  )
}

function MedicationHistoryDetail({ medication, text }: { medication: MedicationRow; text: string }) {
  const anchorRef = useResourceAnchor<HTMLDivElement>(
    ['MedicationRequest', 'MedicationStatement'],
    medication.id,
  )

  return (
    <div ref={anchorRef} className="rounded-sm px-1 py-0.5 text-[0.6875rem] leading-relaxed text-muted-foreground">
      {text}
    </div>
  )
}

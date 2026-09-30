"use client"

import { useId } from 'react'
import type { DecisionPointView } from '../../types'
import { profileGridOf, questionGroupsOf, type ProfileGridView } from './VisitBookLayout'

type Answer = (answers: string, id: string, value: boolean | undefined, terms?: readonly string[]) => void

interface Group {
  title: string
  answers: string
  rows: { id: string; label: string; answer?: boolean; record?: boolean; terms?: string[] }[]
  bulkNone?: boolean
  note?: string
}

/** The answer sets this panel writes; AF's own checklists keep their surfaces on the map. */
const PANEL_ANSWERS = new Set(['visit', 'clinic-exam'])

function groupsOf(point: DecisionPointView): Group[] {
  const own = (point as { questions?: Group }).questions
  return [...(own ? [own] : []), ...questionGroupsOf(point)].filter((group) => PANEL_ANSWERS.has(group.answers))
}

/** Whether the decision map should draw this panel under an opened point. */
export function hasPointAsks(point: DecisionPointView): boolean {
  return groupsOf(point).length > 0 || Boolean(profileGridOf(point))
}

/**
 * What a point asks in place, on the decision map (HF DP-06's signs, perfusion
 * and triggers, owner request 2026-09-30): the same questions the pocket
 * handbook draws, so the map is never left waiting on an answer it cannot
 * take, and the profile they place the patient in.
 */
export function PointAsksPanel({ point, isEnglish, onAnswer }: { point: DecisionPointView; isEnglish: boolean; onAnswer?: Answer }) {
  const idBase = useId()
  const groups = groupsOf(point)
  const grid = profileGridOf(point)
  if (!groups.length && !grid) return null
  const yes = isEnglish ? 'Yes' : '有'
  const no = isEnglish ? 'No' : '無'
  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/20 p-3" data-testid="cdss-visit-point-asks">
      {groups.map((group, groupIndex) => {
        const open = group.rows.filter((row) => (row.answer ?? row.record) !== true)
        const pressed = open.length > 0 && open.every((row) => row.answer === false)
        const anyYes = group.rows.some((row) => (row.answer ?? row.record) === true)
        return (
          <div key={group.title} className="space-y-1" data-visit-point-asks-group={group.title}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{group.title}</span>
              {group.bulkNone && onAnswer && open.length ? (
                <button
                  type="button"
                  aria-pressed={pressed}
                  className="inline-flex min-h-9 items-center rounded-full border border-border px-3 text-xs hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:font-semibold"
                  onClick={() => {
                    for (const row of open) {
                      if (pressed) onAnswer(group.answers, row.id, undefined, row.terms)
                      else if (row.answer === undefined) onAnswer(group.answers, row.id, false, row.terms)
                    }
                  }}
                >
                  {anyYes ? (isEnglish ? 'None of the rest' : '其餘皆無') : (isEnglish ? 'None of these' : '全部皆無')}
                </button>
              ) : null}
            </div>
            {group.rows.map((row) => (
              <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 py-1 text-sm">
                <span id={`${idBase}-${groupIndex}-${row.id}`}>{row.label}</span>
                <div role="group" aria-labelledby={`${idBase}-${groupIndex}-${row.id}`} className="inline-flex overflow-hidden rounded-md border border-border">
                  {[true, false].map((value) => {
                    const prefilled = row.answer === undefined && row.record === value
                    const selected = row.answer === value || prefilled
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        aria-pressed={selected}
                        disabled={!onAnswer}
                        className="min-h-9 min-w-12 border-r border-border px-3 last:border-r-0 hover:bg-muted aria-pressed:bg-primary/10 aria-pressed:font-semibold aria-pressed:text-primary disabled:opacity-60"
                        onClick={() => onAnswer?.(group.answers, row.id, row.answer === value ? undefined : value, row.terms)}
                      >
                        {value ? yes : no}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
            {group.note ? <p className="text-xs text-muted-foreground">{group.note}</p> : null}
          </div>
        )
      })}
      {grid ? <MapProfileGrid grid={grid} /> : null}
    </div>
  )
}

function MapProfileGrid({ grid }: { grid: ProfileGridView }) {
  return (
    <div className="space-y-1" data-testid="cdss-visit-profile-grid">
      <p className="text-sm font-semibold">{grid.title}</p>
      <div className="grid grid-cols-[2.5rem_1fr_1fr] gap-1.5 text-xs">
        <span />
        {grid.columns.map((column) => <span key={column.id} className="text-center text-muted-foreground">{column.label}</span>)}
        {grid.rows.map((row) => (
          <div key={row.id} className="contents">
            <span className="self-center text-muted-foreground">{row.label}</span>
            {grid.columns.map((column) => {
              const cell = grid.cells.find((item) => item.row === row.id && item.column === column.id)
              const here = grid.current?.row === row.id && grid.current?.column === column.id
              return (
                <div key={column.id} data-current={here || undefined} className="rounded-md border border-border bg-background px-2 py-1.5 text-muted-foreground data-[current]:border-2 data-[current]:border-primary data-[current]:bg-primary/10 data-[current]:text-primary">
                  {cell ? <><b>{cell.label}</b><br />{cell.action}</> : null}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <p className="text-sm font-semibold text-primary">{grid.reading}</p>
      {grid.note ? <p className="text-xs text-muted-foreground">{grid.note}</p> : null}
    </div>
  )
}

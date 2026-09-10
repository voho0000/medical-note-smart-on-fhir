/**
 * One line for the whole course: what the ejection fraction did, when heart
 * failure was coded, and what the patient was on while that happened.
 *
 * The three are already on the screen, each in its own place — the LVEF as a
 * phenotype, the code inside a rationale, the classes as prescription tiles —
 * and read separately none of them answers the question a clinician actually
 * asks: 「這個病人是先掉下去才開藥，還是開了藥才回來的？」 Putting them on one
 * dated line answers it without any of them being interpreted.
 *
 * Nothing here is a clinical rule. Every date and value is the adapter's, read
 * off the facts the pack was given; this file only decides what sits where on
 * the line. The one reading it makes — that a therapy fact beginning
 * 「目前用藥中」 means the class is still being taken — is the adapter's fixed
 * wording for that state, the same reading the pillar tiles already make.
 */
import type { CdssFact, CdssFactSource, CdssPatientProfile } from '../types'

/**
 * The foundational classes the line carries, with the adapter's fact key.
 *
 * All four, whichever pathway the pack opened: an HFpEF patient's β-blocker
 * years are still part of this patient's course, and a line that dropped them
 * because today's checklist does not ask for them would be telling a different
 * story from the record.
 */
const TIMELINE_THERAPY_CLASSES: readonly {
  factKeys: readonly string[]
  zh: string
  en: string
}[] = [
  { factKeys: ['arniTherapy', 'aceArbTherapy'], zh: 'ARNI／ACEI／ARB', en: 'ARNI / ACEI / ARB' },
  { factKeys: ['hfEvidenceBetaBlockerTherapy'], zh: '實證 β 阻斷劑', en: 'Evidence-based β-blocker' },
  { factKeys: ['mraTherapy'], zh: 'MRA', en: 'MRA' },
  { factKeys: ['sglt2Therapy'], zh: 'SGLT2i', en: 'SGLT2i' },
]

/** The adapter's fixed wording for a class the patient is still taking. */
const TAKING_PATTERN = /^(?:目前用藥中|Currently taking)/

export type CareTimelineEntryKind = 'lvef' | 'diagnosis' | 'medication'

export interface CareTimelineEntry {
  id: string
  kind: CareTimelineEntryKind
  /** The day the entry sits on, as YYYY-MM-DD. */
  date: string
  /**
   * The last dated record for a span. Absent on a point event, and absent on a
   * span the record dates only once — one prescription is a day, not a period.
   */
  endDate?: string
  label: string
  /** The value or names, as the adapter wrote them. */
  detail?: string
  /** LVEF only: the reading itself, for the trajectory. */
  value?: number
  /** Medication only: the class is still being taken. */
  ongoing?: boolean
}

export interface CareTimelineModel {
  entries: readonly CareTimelineEntry[]
  /** The first and last day on the line, for positioning. */
  from: string
  to: string
}

function isIsoDate(value: string | undefined): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)
}

function datedSources(fact: CdssFact | undefined): readonly CdssFactSource[] {
  return (fact?.sources ?? []).filter((source) => isIsoDate(source.date))
}

function factText(fact: CdssFact, isEnglish: boolean): string {
  return (isEnglish ? fact.en : fact.zh) ?? ''
}

/**
 * The ejection-fraction trajectory, one point per study.
 *
 * `LVEFTrend` carries the last six readings the adapter merged from echo
 * reports and Observations; a patient with a single reading has no trend fact
 * at all, so `LVEF` is read for that one point rather than leaving the line
 * without the value the phenotype was decided on.
 */
function lvefEntries(
  facts: CdssPatientProfile['facts'],
  isEnglish: boolean,
): CareTimelineEntry[] {
  const trend = facts.LVEFTrend as CdssFact | undefined
  const single = facts.LVEF as CdssFact | undefined
  const sources = datedSources(trend).length > 0 ? datedSources(trend) : datedSources(single)
  const label = isEnglish ? 'LVEF' : 'LVEF'
  const byDate = new Map<string, CareTimelineEntry>()
  for (const source of sources) {
    const value = typeof source.value === 'number' ? source.value : undefined
    if (value === undefined) continue
    byDate.set(source.date!, {
      id: `lvef-${source.date}`,
      kind: 'lvef',
      date: source.date!,
      label,
      detail: `${value}%`,
      value,
    })
  }
  return [...byDate.values()]
}

/**
 * When heart failure was coded, one point per dated Condition.
 *
 * The code's own display text travels with the point where the source carries
 * one, because 「I50.9 慢性心衰竭」 and 「I50.22」 are not the same statement and
 * a line that showed only 「診斷」 would flatten them.
 */
function diagnosisEntries(
  facts: CdssPatientProfile['facts'],
  isEnglish: boolean,
): CareTimelineEntry[] {
  const fact = facts.heartFailureDiagnosis as CdssFact | undefined
  if (!fact) return []
  const label = isEnglish ? 'HF diagnosis' : '心衰竭診斷'
  const sources = datedSources(fact)
  const byDate = new Map<string, CareTimelineEntry>()
  for (const source of sources) {
    const detail = typeof source.value === 'string' && source.value.trim()
      ? source.value.trim()
      : undefined
    byDate.set(source.date!, {
      id: `diagnosis-${source.date}`,
      kind: 'diagnosis',
      date: source.date!,
      label,
      detail,
    })
  }
  // A fact dated on its own, with no dated source behind it, is still the day
  // the record says the diagnosis was made.
  if (byDate.size === 0 && isIsoDate(fact.date)) {
    byDate.set(fact.date, {
      id: `diagnosis-${fact.date}`,
      kind: 'diagnosis',
      date: fact.date,
      label,
      detail: factText(fact, isEnglish) || undefined,
    })
  }
  return [...byDate.values()]
}

/**
 * What each class was prescribed across, as the record dates it.
 *
 * The span is the first to the last dated prescription the adapter kept for the
 * class — a supply record, not an administration record, which is why the view
 * says 「處方紀錄」 rather than 「用藥期間」. A class the record dates once is a
 * point: one prescription does not describe a period.
 */
function medicationEntries(
  facts: CdssPatientProfile['facts'],
  isEnglish: boolean,
): CareTimelineEntry[] {
  const entries: CareTimelineEntry[] = []
  for (const config of TIMELINE_THERAPY_CLASSES) {
    const candidates = config.factKeys
      .map((key) => ({ key, fact: facts[key] as CdssFact | undefined }))
      .filter((entry): entry is { key: string; fact: CdssFact } => Boolean(entry.fact))
    if (candidates.length === 0) continue
    // For a class the guideline names two ways round (ARNI or ACEI/ARB), the
    // one being taken describes the patient; otherwise the first on record.
    const chosen = candidates.find(
      (entry) => TAKING_PATTERN.test(factText(entry.fact, isEnglish)),
    ) ?? candidates[0]
    const dates = datedSources(chosen.fact)
      .map((source) => source.date!)
      .sort()
    if (dates.length === 0) continue
    const text = factText(chosen.fact, isEnglish)
    const ongoing = TAKING_PATTERN.test(text)
    const first = dates[0]
    const last = dates[dates.length - 1]
    entries.push({
      id: `medication-${chosen.key}`,
      kind: 'medication',
      date: first,
      ...(last !== first ? { endDate: last } : {}),
      label: isEnglish ? config.en : config.zh,
      detail: text || undefined,
      ongoing,
    })
  }
  return entries
}

/**
 * Reads the course out of the facts the pack was given.
 *
 * `undefined` when the record dates nothing worth a line — a timeline with one
 * point on it is a label, not a trajectory, so two dated entries are the floor.
 */
export function buildCareTimeline(
  profileFacts: CdssPatientProfile['facts'] | undefined,
  isEnglish: boolean,
): CareTimelineModel | undefined {
  if (!profileFacts) return undefined
  const entries = [
    ...lvefEntries(profileFacts, isEnglish),
    ...diagnosisEntries(profileFacts, isEnglish),
    ...medicationEntries(profileFacts, isEnglish),
  ].sort((a, b) => (
    a.date.localeCompare(b.date)
    // Same day: the reading, then the code, then what was prescribed — the
    // order the visit itself happened in.
    || a.kind.localeCompare(b.kind)
    || a.id.localeCompare(b.id)
  ))
  if (entries.length < 2) return undefined
  const days = entries.flatMap((entry) => (
    entry.endDate ? [entry.date, entry.endDate] : [entry.date]
  )).sort()
  return { entries, from: days[0], to: days[days.length - 1] }
}

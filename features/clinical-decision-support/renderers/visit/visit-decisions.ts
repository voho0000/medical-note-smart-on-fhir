/**
 * Placement arithmetic for the visit decision map: which decision a point
 * holds today, how the queue rows advance along a chain, what the plan lists
 * and what the summary copies. Every clinical word comes from the model; the
 * only words written here are the host's own chrome.
 */
import type {
  PhysicianDecision,
  PhysicianDecisionInput,
  PhysicianDecisionMap,
} from '../../stores/physician-decisions.store'
import type {
  DecisionPointState,
  DecisionPointView,
  VisitAction,
  VisitAnswers,
  VisitBlock,
  VisitDecisionModel,
} from '../../types'

/**
 * The store key a decision point's decision lives under. The queue row and the
 * map cell for one point compute the same key, which is what makes them one
 * decision rather than two.
 *
 * The key is the pack's `decisionId` — the clinical question, named by the
 * pack that owns it — so a question two pages show (AF anticoagulation on the
 * HF page's DP-14 and on the AF page's DP-07) is one decision wherever it was
 * taken. The host holds no table of which DP matches which; a pack that folds
 * another's question says so. A point without one (an older pack) keeps its
 * page-local key.
 */
export function visitDecisionKey(point: Pick<DecisionPointView, 'source' | 'dp' | 'decisionId'>): string {
  return point.decisionId ? `visit:${point.decisionId}` : `visit:${point.source}:${point.dp}`
}

/** The key of the step a point reveals once its first action is recorded. */
export function nextStepDecisionKey(point: Pick<DecisionPointView, 'source' | 'dp' | 'decisionId'>): string {
  return `${visitDecisionKey(point)}:next`
}

/**
 * The step a point's `next` describes, as a point of its own: same decision
 * point, the pack's next question, reason and actions.
 */
export function nextStepPoint(point: DecisionPointView): DecisionPointView | undefined {
  if (!point.next) return undefined
  const { next } = point
  return {
    ...point,
    headline: next.headline,
    why: next.why,
    chain: next.chain,
    actions: next.actions,
    next: undefined,
  }
}

/** The states that carry decision buttons. */
export const DECISION_STATES: ReadonlySet<DecisionPointState> = new Set(['safety', 'act', 'confirm'])

/** The states folded to the foot of a column until 「顯示全部」. */
export const ABSENT_STATES: ReadonlySet<DecisionPointState> = new Set(['not-applicable', 'not-included'])

/**
 * Decisions that carry the chain on to its next step. 「開始抗凝」 opens the
 * question of which drug; 「暫緩」 does not.
 */
const PROCEEDING_KINDS: ReadonlySet<PhysicianDecision['decision']> = new Set([
  'prescribed',
  'dose-adjusted',
  'ordered',
])

function localDay(value: Date): string {
  return `${value.getFullYear()}-${value.getMonth() + 1}-${value.getDate()}`
}

export function isSameLocalDay(iso: string, now: Date): boolean {
  const at = new Date(iso)
  return !Number.isNaN(at.getTime()) && localDay(at) === localDay(now)
}

/** What was decided today about one point, and which of its actions it was. */
export interface PointDecision {
  key: string
  record: PhysicianDecision
  action: VisitAction
}

/**
 * Today's decision on a point, when it still answers one of the point's
 * actions. A record from another day is last visit's, and a record whose
 * action the pack no longer offers answered a recommendation that has since
 * changed — neither is today's decision on today's question.
 *
 * Nor is one whose action kept its id but changed what it says: 「apixaban 5 mg
 * bid」 recorded, then a weight of 58 kg and a Cr of 1.6 turn the same action
 * into 「apixaban 2.5 mg bid」 (#166 review). What changes there is a number —
 * a dose, a strength, a ratio — so the numbers the recorded label states are
 * compared with the action's, and a different set asks again. The words around
 * them are not compared: they change with the language, and 「開始抗凝」 read
 * back as 「Start anticoagulation」 is the same decision (#166 re-review). A
 * record from before labels were kept has none, and stands on its id.
 */
export function decisionFor(
  point: DecisionPointView,
  decisions: PhysicianDecisionMap | undefined,
  now: Date,
  key: string = visitDecisionKey(point),
): PointDecision | undefined {
  const record = decisions?.[key]
  if (!record || !record.actionId || !isSameLocalDay(record.recordedAt, now)) return undefined
  const action = point.actions.find((candidate) => candidate.id === record.actionId)
  if (!action) return undefined
  if (record.actionLabel !== undefined && labelNumbers(record.actionLabel) !== labelNumbers(action.label)) return undefined
  return { key, record, action }
}

/** The numbers a label states, in order — 「sacubitril/valsartan 49/51 mg」 → `49/51`. */
function labelNumbers(label: string): string {
  return (label.match(/\d+(?:\.\d+)?(?:\/\d+(?:\.\d+)?)*/g) ?? []).join(' ')
}

/**
 * The decisions that followed from the one under `key`: the later steps of any
 * queue row it heads or walks through (「開始抗凝」 → 「apixaban 5 mg bid」), and
 * the steps a point reveals under `key:next`. Clearing or re-taking a step
 * leaves them without the decision they answered, so they go with it — else
 * re-pressing 「開始抗凝」 would bring the old dose back as decided (#166 review).
 */
export function dependentDecisionKeys(
  key: string,
  rows: readonly QueueRow[],
  decisions: PhysicianDecisionMap | undefined,
): string[] {
  const dependents = new Set<string>()
  for (const row of rows) {
    const index = row.steps.findIndex((step) => step.key === key)
    if (index < 0) continue
    for (const step of row.steps.slice(index + 1)) dependents.add(step.key)
  }
  for (const stored of Object.keys(decisions ?? {})) {
    if (stored.startsWith(`${key}:`)) dependents.add(stored)
  }
  dependents.delete(key)
  return [...dependents].filter((dependent) => decisions?.[dependent])
}

/** What recording `action` on `point` writes to the decisions store. */
export function decisionInputFor(
  point: DecisionPointView,
  action: VisitAction,
  packVersion: string,
): PhysicianDecisionInput {
  return {
    decision: action.decisionKind,
    packVersion,
    dp: point.dp,
    actionId: action.id,
    actionLabel: action.label,
    ...(action.responseCheck ? { responseCheck: { ...action.responseCheck } } : {}),
    ...(action.reopenWhen ? { reopenWhen: action.reopenWhen } : {}),
  }
}

export interface QueueStep {
  /** The store key this step's decision lives under. */
  key: string
  point: DecisionPointView
  decision?: PointDecision
}

/**
 * A point's steps as far as today's decisions reach: the point itself, then —
 * when the pack described one and the action that reveals it was recorded —
 * its next step.
 */
export function pointSteps(
  point: DecisionPointView,
  decisions: PhysicianDecisionMap | undefined,
  now: Date,
): QueueStep[] {
  const first: QueueStep = { key: visitDecisionKey(point), point, decision: decisionFor(point, decisions, now) }
  const next = nextStepPoint(point)
  if (!next || first.decision?.action.id !== point.next?.afterActionId) return [first]
  const key = nextStepDecisionKey(point)
  return [first, { key, point: next, decision: decisionFor(next, decisions, now, key) }]
}

/** The decision a map cell shows: the furthest step decided today. */
export function latestDecisionFor(
  point: DecisionPointView,
  decisions: PhysicianDecisionMap | undefined,
  now: Date,
): PointDecision | undefined {
  const steps = pointSteps(point, decisions, now)
  return [...steps].reverse().find((step) => step.decision)?.decision
}

export interface QueueRow {
  /** The row's identity: its first point's decision key. */
  key: string
  /** The chain this row walks, decided steps first. */
  steps: QueueStep[]
  /** The first undecided step, or undefined when the row is decided. */
  current?: QueueStep
  safety: boolean
}

/**
 * The next step of a chain: the first point after `after`, in the pack's own
 * order, that waits in the same group, from the same pack, with actions to
 * offer.
 */
function nextWaitingPoint(
  points: readonly DecisionPointView[],
  after: DecisionPointView,
  used: ReadonlySet<string>,
): DecisionPointView | undefined {
  const index = points.indexOf(after)
  return points.slice(index + 1).find((point) => (
    point.state === 'waiting'
    && point.group === after.group
    && point.source === after.source
    && point.actions.length > 0
    && !used.has(point.dp)
  ))
}

/**
 * Today's queue, one row per queued point. A row whose step was decided in a
 * way that carries the chain on takes the chain's next waiting step in the same
 * row (「開始抗凝」 → 「apixaban 5 mg bid」), so a chain costs one row, never
 * three.
 */
export function buildQueueRows(
  model: VisitDecisionModel,
  decisions: PhysicianDecisionMap | undefined,
  now: Date,
): QueueRow[] {
  const byDp = new Map(model.points.map((point) => [point.dp, point]))
  const used = new Set<string>(model.queue)
  const rows: QueueRow[] = []
  for (const dp of model.queue) {
    const head = byDp.get(dp)
    if (!head) continue
    // A pack that describes the chain's next step on the point itself is
    // followed exactly; otherwise the row walks on to the chain's next waiting
    // point in the same group.
    const steps: QueueStep[] = pointSteps(head, decisions, now)
    let last = steps[steps.length - 1]
    while (!head.next && last.decision && PROCEEDING_KINDS.has(last.decision.record.decision)) {
      const next = nextWaitingPoint(model.points, last.point, used)
      if (!next) break
      used.add(next.dp)
      last = { key: visitDecisionKey(next), point: next, decision: decisionFor(next, decisions, now) }
      steps.push(last)
    }
    rows.push({
      key: visitDecisionKey(head),
      steps,
      current: steps.find((step) => !step.decision),
      safety: head.state === 'safety',
    })
  }
  return rows
}

/** The decision points each queue row currently covers, by dp. */
export function queuedPointDps(rows: readonly QueueRow[]): ReadonlySet<string> {
  return new Set(rows.flatMap((row) => row.steps.map((step) => step.point.dp)))
}

export interface PlanItem {
  key: string
  point: DecisionPointView
  actionLabel: string
  check: { text: string; interval?: string; withinDays?: number }
  reopenWhen?: string
}

export interface VisitPlanModel {
  items: PlanItem[]
  /** Plan lines the pack gives without a decision (「6 週內密集回診」). */
  notes: { text: string }[]
}

/**
 * Every decision recorded today that asked for a response check, those with
 * an interval first. The text is the pack's; the host only orders and counts.
 * A recheck is not a return visit, so no return date is derived from one
 * (clinician decision 2026-09-28: 「只說複驗，沒有說要回診」).
 */
export function buildVisitPlan(
  model: VisitDecisionModel,
  decisions: PhysicianDecisionMap | undefined,
  now: Date,
): VisitPlanModel {
  const items: PlanItem[] = []
  for (const point of model.points) {
    for (const step of pointSteps(point, decisions, now)) {
      const decision = step.decision
      const check = decision?.record.responseCheck
      if (!decision || !check) continue
      items.push({
        key: decision.key,
        point: step.point,
        actionLabel: decision.record.actionLabel ?? decision.action.label,
        check,
        ...(decision.record.reopenWhen ? { reopenWhen: decision.record.reopenWhen } : {}),
      })
    }
  }
  // A check with no interval (ESC gives none) sorts after those with one.
  const timed = (item: PlanItem) => (item.check.interval || typeof item.check.withinDays === 'number' ? 0 : 1)
  items.sort((a, b) => timed(a) - timed(b))
  return { items, notes: (model.planNotes ?? []).map((note) => ({ text: note.text })) }
}

/** The answer each ask shows, and whether the record, not the clinician, gave it. */
export function effectiveAnswer(
  ask: VisitDecisionModel['asks'][number],
  answers: VisitAnswers,
): { value?: string; prefilled: boolean } {
  const given = answers[ask.id]
  if (given) return { value: given, prefilled: false }
  if (ask.prefill) return { value: ask.prefill.value, prefilled: true }
  return { prefilled: false }
}

export const BLOCK_ORDER: readonly VisitBlock[] = ['status', 'treatment', 'outlook']

export function blockTitle(block: VisitBlock, isEnglish: boolean): string {
  switch (block) {
    case 'status': return isEnglish ? '01 Status · diagnosis / follow-up' : '01 現況 · 診斷／追蹤'
    case 'treatment': return isEnglish ? '02 Treatment' : '02 治療'
    case 'outlook': return isEnglish ? '03 Outlook and plan' : '03 預後與計畫'
  }
}

/** The state names a map cell prints beside its colour, so state never rests on colour. */
export function stateLabel(state: DecisionPointState, isEnglish: boolean): string {
  switch (state) {
    case 'safety': return isEnglish ? 'Safety' : '安全'
    case 'act': return isEnglish ? 'To decide' : '需處理'
    case 'confirm': return isEnglish ? 'Your call' : '需你確認'
    case 'ask': return isEnglish ? 'To answer' : '等你回答'
    case 'waiting': return isEnglish ? 'Waiting' : '等上一步'
    case 'done': return isEnglish ? 'Settled' : '已定'
    case 'info': return isEnglish ? 'Info' : '供參考'
    case 'not-applicable': return isEnglish ? 'N/A' : '不適用'
    case 'not-included': return isEnglish ? 'Not covered' : '尚未納入'
  }
}

/**
 * 「，1–2 週內」 after a check's text, in the guideline's words, or nothing
 * where the check has no interval. A decision stored before the pack gave its
 * interval in words reads back its day count.
 */
export function checkIntervalSuffix(check: { interval?: string; withinDays?: number } | undefined, isEnglish: boolean): string {
  const sep = isEnglish ? ', ' : '，'
  if (check?.interval) return isEnglish ? `${sep}within ${check.interval}` : `${sep}${check.interval}內`
  if (typeof check?.withinDays === 'number') return isEnglish ? `${sep}within ${check.withinDays} days` : `${sep}${check.withinDays} 天內`
  return ''
}

/**
 * The text 「複製本次摘要」 puts on the clipboard: the pack's status line and
 * values, the answers as the pack worded the options, today's decisions with
 * their checks, and the pack's plan lines. Host words are labels only.
 */
export function buildVisitSummaryText(input: {
  model: VisitDecisionModel
  answers: VisitAnswers
  decisions: PhysicianDecisionMap | undefined
  now: Date
  isEnglish: boolean
}): string {
  const { model, answers, decisions, now, isEnglish } = input
  const lines: string[] = [model.headline]
  const values = model.keyValues.map((item) => (
    `${item.label} ${item.value}${item.date ? `（${item.date}）` : ''}`
  ))
  if (values.length) lines.push(values.join(isEnglish ? '; ' : '；'))
  if (model.triggers.length) {
    lines.push(`${isEnglish ? 'Reassessment' : '重新評估'}：${model.triggers.map((trigger) => trigger.text).join(isEnglish ? '; ' : '；')}`)
  }
  const answered = model.asks.flatMap((ask) => {
    const { value, prefilled } = effectiveAnswer(ask, answers)
    const option = ask.options.find((candidate) => candidate.value === value)
    if (!option) return []
    return [`${ask.label}${isEnglish ? ': ' : '：'}${option.label}${prefilled && ask.prefill ? `（${ask.prefill.basis}）` : ''}`]
  })
  if (answered.length) lines.push(answered.join(isEnglish ? '; ' : '；'))
  const decided = model.points.flatMap((point) => pointSteps(point, decisions, now).flatMap((step) => {
    const decision = step.decision
    if (!decision) return []
    const check = decision.record.responseCheck
    return [`- ${point.dp} ${point.label}${isEnglish ? ': ' : '：'}${decision.record.actionLabel ?? decision.action.label}${
      check ? `（${isEnglish ? 'check' : '回應檢查'}：${check.text}${checkIntervalSuffix(check, isEnglish)}）` : ''
    }`]
  }))
  lines.push(isEnglish ? "Today's decisions:" : '今天的決定：')
  lines.push(...(decided.length ? decided : [isEnglish ? '- none recorded' : '- 尚未記錄']))
  const plan = buildVisitPlan(model, decisions, now)
  lines.push(...plan.notes.map((note) => note.text))
  return lines.join('\n')
}

/**
 * The FMT pillars whose 「不耐受」 the clinician recorded on the map, as DP
 * numbers (`DP-08`). The pack's action ids name them — `dp08-intolerant`, and
 * `dp07-arni-intolerant` for the ARNI — so nothing here reads the label.
 */
export function intolerantPillars(decisions: Readonly<Record<string, { actionId?: string; decision?: string }>>): string[] {
  const dps = new Set<string>()
  for (const decision of Object.values(decisions)) {
    const match = /^dp(07|08|09|10)-(?:arni-)?intolerant$/.exec(decision.actionId ?? '')
    if (match) dps.add(`DP-${match[1]}`)
  }
  return [...dps].sort()
}

import type { Row } from '../types'

export function isCancerScreeningRecommendationTitle(title: string): boolean {
  return /建議|recommendation/i.test(title)
}

export function cancerScreeningProgramTitle(title: string): string {
  const withoutSuffix = title.replace(/\s*(?:建議|recommendation)\s*$/i, '').trim()
  return withoutSuffix || title.trim() || 'Cancer screening'
}

export function cancerScreeningProgramKey(title: string): string {
  return cancerScreeningProgramTitle(title)
    .normalize('NFKC')
    .replace(/\s+/g, '')
    .toLocaleLowerCase()
}

function rowDateValue(row: Row): number {
  const raw = row.effectiveDate || row.obs[0]?.effectiveDateTime
  if (!raw) return 0
  const value = new Date(raw).getTime()
  return Number.isNaN(value) ? 0 : value
}

function flattenUnique(values: Array<string[] | undefined>): string[] | undefined {
  const flattened = Array.from(new Set(values.flatMap((value) => value ?? [])))
  return flattened.length > 0 ? flattened : undefined
}

function createCancerScreeningGroup(members: Row[]): Row {
  const resultRows = members
    .filter((member) => !isCancerScreeningRecommendationTitle(member.title))
    .sort((a, b) => rowDateValue(b) - rowDateValue(a))
  const recommendationRows = members.filter((member) => (
    isCancerScreeningRecommendationTitle(member.title)
  ))
  const latestResult = resultRows[0]
  const representative = latestResult ?? recommendationRows[0] ?? members[0]
  const title = cancerScreeningProgramTitle(representative.title)
  const groupedRows = [...resultRows, ...recommendationRows]

  return {
    id: `cancer-screening:${encodeURIComponent(cancerScreeningProgramKey(title))}`,
    title,
    rawTitle: title,
    meta: representative.meta,
    group: 'cancer-screening',
    obs: groupedRows.flatMap((member) => member.obs),
    institution: latestResult?.institution,
    effectiveDate: latestResult?.effectiveDate,
    groupedRows,
    diagnosticReportIds: flattenUnique(groupedRows.map((member) => member.diagnosticReportIds)),
    imagingStudyIds: flattenUnique(groupedRows.map((member) => member.imagingStudyIds)),
  }
}

/**
 * Replace raw cancer-screening result/recommendation rows with one display
 * group per screening programme. The original rows stay in `groupedRows`, so
 * source navigation and FHIR identity remain intact.
 */
export function groupCancerScreeningRows(rows: Row[]): Row[] {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    if (row.group !== 'cancer-screening') continue
    const key = cancerScreeningProgramKey(row.title)
    const members = groups.get(key)
    if (members) members.push(row)
    else groups.set(key, [row])
  }

  if (groups.size === 0) return rows

  const emitted = new Set<string>()
  const output: Row[] = []
  for (const row of rows) {
    if (row.group !== 'cancer-screening') {
      output.push(row)
      continue
    }

    const key = cancerScreeningProgramKey(row.title)
    if (emitted.has(key)) continue
    emitted.add(key)
    output.push(createCancerScreeningGroup(groups.get(key) ?? [row]))
  }

  return output
}

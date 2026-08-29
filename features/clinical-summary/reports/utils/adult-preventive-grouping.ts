import type { Row } from '../types'
import { isSystolicDiastolicBloodPressureRow } from './blood-pressure-panel'

type OrderRule = (row: Row) => boolean

function sourceDayKey(iso?: string): string {
  return iso?.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] ?? ''
}

function institutionKey(institution?: string): string {
  return (institution ?? '').normalize('NFKC').trim().toLocaleLowerCase()
}

function clusterKey(row: Row): string {
  return `${sourceDayKey(row.effectiveDate)}|${institutionKey(row.institution)}`
}

function flattenUnique(values: Array<string[] | undefined>): string[] | undefined {
  const flattened = Array.from(new Set(values.flatMap((value) => value ?? [])))
  return flattened.length > 0 ? flattened : undefined
}

function rowCodes(row: Row): string[] {
  return row.obs.flatMap((observation) => [
    ...(observation.code?.coding ?? []).map((coding) => coding.code).filter(Boolean),
    ...(observation.component ?? []).flatMap((component) =>
      (component.code?.coding ?? []).map((coding) => coding.code).filter(Boolean),
    ),
  ]) as string[]
}

function rowSourceTitle(row: Row): string {
  return [
    row.title,
    row.rawTitle ?? '',
    ...row.obs.flatMap((observation) => [
      observation.code?.text ?? '',
      ...(observation.code?.coding ?? []).map((coding) => coding.display ?? ''),
    ]),
  ].join(' ')
}

function matchesCodeOrTitle(row: Row, codes: readonly string[], title: RegExp): boolean {
  const actualCodes = rowCodes(row)
  return codes.some((code) => actualCodes.includes(code))
    || title.test(rowSourceTitle(row))
}

const ADULT_PREVENTIVE_ORDER: readonly OrderRule[] = [
  // 一般檢查
  (row) => matchesCodeOrTitle(row, ['8302-2'], /body height|身高/i),
  (row) => matchesCodeOrTitle(row, ['29463-7'], /body weight|體重/i),
  (row) => matchesCodeOrTitle(row, ['39156-5'], /\bbmi\b|body mass index/i),
  (row) => matchesCodeOrTitle(row, ['8280-0'], /waist circumference|腰圍/i),

  // 血壓檢查
  (row) => rowCodes(row).some((code) => ['85354-9', '55284-4'].includes(code))
    || isSystolicDiastolicBloodPressureRow(row)
    || (/blood pressure|血壓/i.test(rowSourceTitle(row))
      && !/檢查結果|(?:check|screening|test) result/i.test(rowSourceTitle(row))),
  (row) => matchesCodeOrTitle(
    row,
    ['blood-pressure'],
    /血壓檢查結果|blood pressure (?:check|screening|test) result/i,
  ),

  // 血脂肪檢查
  (row) => matchesCodeOrTitle(row, ['2093-3'], /\bchol\b|total cholesterol|總膽固醇/i),
  (row) => matchesCodeOrTitle(row, ['2571-8'], /\btg\b|triglyceride|三酸甘油/i),
  (row) => matchesCodeOrTitle(row, ['2085-9'], /\bhdl(?:-c)?\b|高密度脂蛋白/i),
  (row) => matchesCodeOrTitle(row, ['2089-1'], /\bldl(?:-c)?\b|低密度脂蛋白/i),
  (row) => matchesCodeOrTitle(
    row,
    ['blood-lipids'],
    /血脂肪檢查結果|blood lipid(?:s)? (?:check|screening|test) result/i,
  ),

  // 血糖檢查
  (row) => matchesCodeOrTitle(row, ['1558-6', '2345-7'], /glucose-ac|glu-ac|飯前血糖|空腹血糖/i),
  (row) => matchesCodeOrTitle(row, ['4548-4'], /hba1c|glycated hemoglobin|糖化血色素/i),
  (row) => matchesCodeOrTitle(
    row,
    ['blood-glucose'],
    /血糖檢查結果|blood glucose (?:check|screening|test) result/i,
  ),

  // 腎功能檢查
  (row) => matchesCodeOrTitle(row, ['3094-0'], /\bbun\b|blood urea nitrogen|尿素氮/i),
  (row) => matchesCodeOrTitle(row, ['2160-0'], /\bcrea\b|creatinine|肌酸酐/i),
  (row) => matchesCodeOrTitle(row, ['77147-7', '62238-1', '33914-3'], /\begfr\b|腎絲球過濾率/i),
  (row) => matchesCodeOrTitle(
    row,
    ['renal-function'],
    /腎功能檢查結果|(?:renal|kidney) function (?:check|screening|test) result/i,
  ),

  // 尿酸檢查
  (row) => matchesCodeOrTitle(row, ['3084-1'], /\bua\b|uric acid|尿酸/i),
  (row) => matchesCodeOrTitle(row, ['uric-acid'], /尿酸檢查結果|uric acid (?:check|screening|test) result/i),

  // 尿液檢查
  (row) => matchesCodeOrTitle(row, ['20454-5', '2888-6'], /\bprot\b|urine protein|尿液蛋白/i),
  (row) => matchesCodeOrTitle(row, ['urine-test', 'urinalysis'], /尿液檢查結果|urine (?:check|screening|test) result/i),

  // 代謝症候群檢查
  (row) => matchesCodeOrTitle(
    row,
    ['metabolic-syndrome-screening', '代謝症候群篩檢 (Metabolic Syndrome Screening)'],
    /代謝症候群(?:篩檢|檢查)|metabolic syndrome screening/i,
  ),

  // 肝功能檢查
  (row) => matchesCodeOrTitle(row, ['1920-8'], /\bast\b|\bsgot\b/i),
  (row) => matchesCodeOrTitle(row, ['1742-6'], /\balt\b|\bsgpt\b/i),
  (row) => matchesCodeOrTitle(
    row,
    ['liver-function'],
    /肝功能檢查結果|liver function (?:check|screening|test) result/i,
  ),

  // B、C 型肝炎檢查
  (row) => matchesCodeOrTitle(row, ['5195-3', '5196-1'], /hbsag|b 型肝炎表面抗原|hepatitis b surface antigen/i),
  (row) => matchesCodeOrTitle(row, ['hepatitis-b'], /b 型肝炎檢查結果|hepatitis b (?:check|screening|test) result/i),
  (row) => matchesCodeOrTitle(row, ['13955-0', '40726-2'], /anti-hcv|c 型肝炎抗體|hepatitis c antibody/i),
  (row) => matchesCodeOrTitle(row, ['hepatitis-c'], /c 型肝炎檢查結果|hepatitis c (?:check|screening|test) result/i),
]

/**
 * Follow the section order used by the original NHI adult preventive-health
 * document. Rows within the same item keep source order; unrecognized rows are
 * retained at the end in their original relative order.
 */
export function orderAdultPreventiveMembers(members: Row[]): Row[] {
  return members
    .map((row, sourceIndex) => ({
      row,
      sourceIndex,
      orderIndex: ADULT_PREVENTIVE_ORDER.findIndex((rule) => rule(row)),
    }))
    .sort((left, right) => {
      if (left.orderIndex < 0 && right.orderIndex < 0) {
        return left.sourceIndex - right.sourceIndex
      }
      if (left.orderIndex < 0) return 1
      if (right.orderIndex < 0) return -1
      return left.orderIndex - right.orderIndex || left.sourceIndex - right.sourceIndex
    })
    .map(({ row }) => row)
}

function buildAdultPreventiveGroup(members: Row[]): Row {
  const head = members[0]
  return {
    ...head,
    id: `adult-preventive:${clusterKey(head)}`,
    title: 'Adult health exam',
    rawTitle: 'Adult health exam',
    obs: [],
    images: undefined,
    viewerActions: undefined,
    isPossibleDuplicate: undefined,
    bridgeDupCount: undefined,
    groupedRows: orderAdultPreventiveMembers(members),
    adultPreventiveGroup: true,
    diagnosticReportIds: flattenUnique(members.map((member) => member.diagnosticReportIds)),
    imagingStudyIds: flattenUnique(members.map((member) => member.imagingStudyIds)),
  }
}

/**
 * Fold adult preventive-health rows into one display card per source
 * (calendar day × institution). Only the All tab consumes this projection;
 * category tabs keep their existing lab/vitals reading units. Undated rows
 * pass through because combining them would invent an encounter boundary.
 */
export function groupAdultPreventiveRows(rows: Row[]): Row[] {
  const clusters = new Map<string, { firstIndex: number; members: Row[] }>()

  rows.forEach((row, index) => {
    if (row.sourceProgram !== 'adult-preventive' || !sourceDayKey(row.effectiveDate)) return
    const key = clusterKey(row)
    const cluster = clusters.get(key)
    if (cluster) cluster.members.push(row)
    else clusters.set(key, { firstIndex: index, members: [row] })
  })

  if (clusters.size === 0) return rows

  const output: Row[] = []
  rows.forEach((row, index) => {
    if (row.sourceProgram !== 'adult-preventive' || !sourceDayKey(row.effectiveDate)) {
      output.push(row)
      return
    }
    const cluster = clusters.get(clusterKey(row))!
    if (index !== cluster.firstIndex) return
    output.push(buildAdultPreventiveGroup(cluster.members))
  })

  return output
}

import { getAnalyteDisplayForMode, getLabRowDisplayParts } from '@/src/shared/utils/lab-analyte-display.utils'
import { buildLabPivots } from '@/src/shared/utils/lab-pivot.utils'

const observation = (text: string, loinc?: string, specimen?: string) => ({
  resourceType: 'Observation',
  code: { text, coding: loinc ? [{ system: 'http://loinc.org', code: loinc }] : [] },
  category: [{ coding: [{ code: 'laboratory' }] }],
  specimen: specimen ? { display: specimen } : undefined,
  effectiveDateTime: '2026-09-01',
  valueQuantity: { value: 2, unit: 'test-unit' },
})

const cases = [
  { obs: observation('Protein,total 總蛋白', '2885-2'), label: 'TP' },
  { obs: observation('PTH-i 副甲狀腺素', '2731-8'), label: 'iPTH' },
  { obs: observation('鎂', '2601-3'), label: 'Mg' },
  { obs: observation('Magnesium'), label: 'Mg' },
  { obs: observation('FINGER SUGAR', '1558-6'), label: 'Finger sugar' },
  { obs: observation('飯前血糖', '1558-6'), label: 'Glu-AC' },
  { obs: observation('尿糖', '5792-7', 'Urine'), label: 'Glucose' },
  { obs: observation('肌酸酐', '2160-0'), label: 'CREA' },
  { obs: observation('不規則抗體 (篩檢)', undefined, 'Blood'), label: '不規則抗體 (篩檢)' },
]

describe('shared report analyte names', () => {
  it.each(cases)('standardizes $obs.code.text as $label', ({ obs, label }) => {
    expect(getAnalyteDisplayForMode(obs, 'medical', 'zh-TW')).toBe(label)
  })

  it.each(['medical', 'patient'] as const)('keeps cumulative and individual names identical for %s in both languages and modes', (audience) => {
    for (const language of ['zh-TW', 'en'] as const) {
      for (const mode of ['standardized', 'original'] as const) {
        for (const { obs } of cases) {
          const rows = Object.values(buildLabPivots([obs], { nameMode: mode }))
            .flatMap((pivot) => pivot.rows).filter((row) => row.values.size)
          expect(rows).toHaveLength(1)
          const { name, abbr } = getLabRowDisplayParts(rows[0], audience, language, mode)
          expect(abbr ? `${name} (${abbr})` : name)
            .toBe(getAnalyteDisplayForMode(obs, audience, language, mode))
        }
      }
    }
  })

  it('keeps the hospital label in original mode', () => {
    const obs = observation('鎂', '2601-3')
    obs.code.coding.push({ system: 'https://example.org/his-local-lab', code: 'MGL', display: 'Mg (Serum)' } as typeof obs.code.coding[number])
    expect(getAnalyteDisplayForMode(obs, 'medical', 'zh-TW', 'original')).toBe('Mg (Serum)')
  })
})

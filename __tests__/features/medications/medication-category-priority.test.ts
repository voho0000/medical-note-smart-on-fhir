import { isCoagulationOrSurgeryRelevant } from '@/features/clinical-summary/medications/utils/medication-category-priority'

describe('isCoagulationOrSurgeryRelevant', () => {
  it.each(['B01AC06', 'B01AA03', 'B02AA02', 'B02BD02'])(
    'prioritises governed ATC coagulation class %s',
    (atcCode) => {
      expect(isCoagulationOrSurgeryRelevant({
        category: '來源分類',
        drugTerminology: {
          source: 'nhi-official-drug-master',
          snapshotId: 'test-snapshot',
          atcCode,
        },
      })).toBe(true)
    },
  )

  it('does not elevate text when a governed non-coagulation ATC code contradicts it', () => {
    expect(isCoagulationOrSurgeryRelevant({
      category: '抗凝血相關文字',
      drugTerminology: {
        source: 'nhi-official-drug-master',
        snapshotId: 'test-snapshot',
        atcCode: 'R05CB01',
      },
    })).toBe(false)
  })

  it.each(['抗血小板藥', '抗凝血劑', 'ANTITHROMBOTIC AGENTS', 'Haemostatic agents'])(
    'uses source category text only when structured ATC is unavailable: %s',
    (category) => {
      expect(isCoagulationOrSurgeryRelevant({ category })).toBe(true)
    },
  )
})

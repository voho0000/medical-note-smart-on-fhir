import { renderHook } from '@testing-library/react'
import { useProcedureRows } from '@/features/clinical-summary/reports/hooks/useProcedureRows'

jest.mock('@/src/application/providers/language.provider', () => ({
  useLanguage: () => ({
    locale: 'zh-TW',
    t: {
      procedures: {
        performedDate: '執行日期',
        performer: '醫事機構',
        code: '編碼',
        source: '來源',
        explicitDate: '明載日期',
        dateNotStated: '未明載',
        sourceNhiOrder: '健保醫令',
        sourceInpatientSecondary: '住院次處置',
        sourceProcedure: 'FHIR Procedure',
        orderCode: '健保醫令碼',
        classificationCode: 'ICD-10-PCS',
        category: '類別',
        categoryLabels: {
          'surgical-procedure': '手術',
          'major-procedure': '重大處置',
          'outpatient-treatment': '門診治療／小處置',
        },
        reason: '申報診斷',
        outcome: '結果',
        location: '地點',
        bodySite: '身體部位',
        followUp: '後續追蹤',
        reports: '報告',
        notes: '註記',
      },
    },
  }),
}))

const bridgeSurgicalCategory = {
  coding: [{
    system: 'https://nhi-fhir-bridge.github.io/CodeSystem/procedure-classification',
    code: 'surgical-procedure',
  }],
  text: '手術',
}

const mainProcedure = {
  id: 'main',
  status: 'completed',
  category: bridgeSurgicalCategory,
  code: {
    coding: [{
      system: 'http://www.cms.gov/Medicare/Coding/ICD10',
      code: '0FT44ZZ',
      display: 'Resection of Gallbladder, Percutaneous Endoscopic Approach',
    }],
    text: '經皮內視鏡膽囊全部切除術',
  },
  performedDateTime: '2024-03-08T00:00:00+08:00',
  encounter: { reference: 'Encounter/same-encounter' },
  performer: [{ actor: { display: '嘉基醫院' } }],
}

const nhiChild = {
  id: 'nhi-child',
  status: 'completed',
  category: bridgeSurgicalCategory,
  code: {
    coding: [{
      system: 'https://twcore.mohw.gov.tw/CodeSystem/nhi-medical-order-code',
      code: '75215B',
      display: 'Laparoscopic cholecystectomy',
    }],
    text: '腹腔鏡膽囊切除術',
  },
  partOf: [{ reference: 'Procedure/main' }],
  performedDateTime: '2024-03-08T00:00:00+08:00',
  encounter: { reference: 'Encounter/same-encounter' },
}

const inpatientSecondaryChild = {
  id: 'secondary-child',
  status: 'completed',
  category: {
    coding: [{
      system: 'http://snomed.info/sct',
      code: '387713003',
    }],
  },
  code: {
    coding: [{
      system: 'http://www.cms.gov/Medicare/Coding/ICD10',
      code: '0DNW4ZZ',
      display: 'Release Peritoneum, Percutaneous Endoscopic Approach',
    }],
    text: '經皮內視鏡腹膜鬆解術',
  },
  partOf: [{ reference: 'Procedure/main' }],
  encounter: { reference: 'Encounter/same-encounter' },
}

const sameEncounterWithoutPartOf = {
  ...nhiChild,
  id: 'standalone',
  partOf: undefined,
  code: {
    ...nhiChild.code,
    text: '同日同院但無 partOf 的處置',
  },
}

describe('useProcedureRows Procedure.partOf grouping', () => {
  it('groups only explicit children and keeps each source item auditable', () => {
    const { result } = renderHook(() => useProcedureRows([
      mainProcedure,
      nhiChild,
      inpatientSecondaryChild,
      sameEncounterWithoutPartOf,
    ]))

    expect(result.current).toHaveLength(2)
    const mainRow = result.current.find((row) => row.id === 'procedure:main')
    const standaloneRow = result.current.find((row) => row.id === 'procedure:standalone')
    expect(mainRow?.relatedCount).toBe(2)
    expect(mainRow?.procedureIds).toEqual(['main', 'nhi-child', 'secondary-child'])
    expect(mainRow?.institution).toBe('嘉基醫院')
    expect(standaloneRow?.procedureIds).toEqual(['standalone'])
    expect(standaloneRow).toBeDefined()

    const components = (mainRow?.obs[0]?.component ?? []) as Array<{
      code?: { text?: string }
      valueString?: string
      _isProcedureChild?: boolean
      _procedureCodeLabel?: string
      _procedureSourceLabel?: string
      _procedureSource?: string
      _procedureDateLabel?: string
      _procedureDate?: string
    }>
    const childComponents = components.filter((component) => component._isProcedureChild)
    expect(childComponents.map((component) => component.code?.text)).toEqual([
      '經皮內視鏡腹膜鬆解術',
      '腹腔鏡膽囊切除術',
    ])
    expect(childComponents[0]).toEqual(expect.objectContaining({
      valueString: '0DNW4ZZ · 經皮內視鏡腹膜鬆解術',
      _procedureCodeLabel: 'ICD-10-PCS',
      _procedureSourceLabel: '來源',
      _procedureSource: '住院次處置',
      _procedureDateLabel: '明載日期',
      _procedureDate: '未明載',
    }))
    expect(childComponents[1]).toEqual(expect.objectContaining({
      valueString: '75215B',
      _procedureCodeLabel: '健保醫令碼',
      _procedureSource: '健保醫令',
    }))
    expect(childComponents[1]._procedureDate).not.toBe('未明載')

    // Header already shows these; expanded details should not duplicate them.
    expect(components.some((component) => component.code?.text === '執行日期')).toBe(false)
    expect(components.some((component) => component.code?.text === '醫事機構')).toBe(false)
  })
})

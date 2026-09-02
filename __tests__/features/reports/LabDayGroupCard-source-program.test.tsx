import { render, screen } from '@testing-library/react'
import { LabDayGroupCard } from '@/features/clinical-summary/reports/components/LabDayGroupCard'
import type { Row } from '@/features/clinical-summary/reports/types'
import { LanguageProvider } from '@/src/application/providers/language.provider'
import { AudienceProvider } from '@/src/application/providers/audience.provider'

describe('LabDayGroupCard source-program provenance', () => {
  it('labels an adult health-exam card in its header', () => {
    const member: Row = {
      id: 'adult-health-exam-cholesterol',
      title: 'CHOL',
      meta: 'Observation Group',
      group: 'lab',
      institution: '良安診所',
      sourceProgram: 'adult-preventive',
      effectiveDate: '2024-06-28T00:00:00+08:00',
      obs: [{
        id: 'adult-health-exam-cholesterol-observation',
        code: { text: 'CHOL' },
        valueQuantity: { value: 210, unit: 'mg/dL' },
      }],
    }
    const row: Row = {
      ...member,
      id: 'labday:adult-health-exam-lipid',
      obs: [],
      dayGroup: true,
      dayGroupCategoryId: 'chem',
      dayGroupLabelIds: ['chem'],
      groupedRows: [member],
    }

    render(
      <LanguageProvider>
        <AudienceProvider>
          <LabDayGroupCard row={row} defaultOpen={[]} />
        </AudienceProvider>
      </LanguageProvider>,
    )

    expect(screen.getByTestId('report-source-program').closest('button'))
      .toHaveTextContent('成人健檢')
  })

  it('keeps the item and abnormal counts in stable aligned columns', () => {
    const member: Row = {
      id: 'abnormal-creatinine',
      title: 'CREA',
      meta: 'Observation Group',
      group: 'lab',
      institution: '示範長青醫院',
      effectiveDate: '2026-06-02T00:00:00+08:00',
      obs: [{
        id: 'abnormal-creatinine-observation',
        code: { text: 'CREA' },
        valueQuantity: { value: 2.1, unit: 'mg/dL' },
        interpretation: { coding: [{ code: 'H' }] },
      }],
    }
    const row: Row = {
      ...member,
      id: 'labday:abnormal-creatinine',
      obs: [],
      dayGroup: true,
      dayGroupCategoryId: 'chem',
      dayGroupLabelIds: ['chem'],
      groupedRows: [member],
    }

    render(
      <LanguageProvider>
        <AudienceProvider>
          <LabDayGroupCard row={row} defaultOpen={[]} />
        </AudienceProvider>
      </LanguageProvider>,
    )

    expect(screen.getByTestId('lab-day-metrics'))
      .toHaveClass('grid-cols-[5.5rem_6.5rem]')
    expect(screen.getByTestId('lab-day-item-count'))
      .toHaveClass('justify-self-end')
    expect(screen.getByTestId('lab-day-abnormal-count'))
      .toHaveClass('justify-self-start')
  })
})

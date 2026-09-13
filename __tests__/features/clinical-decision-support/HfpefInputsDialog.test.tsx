/**
 * 補完心超數值, rendered.
 *
 * The promise it makes is narrow and worth holding: every row says where its
 * number came from, and applying writes only what the reader actually changed
 * — an auto-filled value must never become 「你輸入」 by being looked at.
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { HfpefInputsDialog } from '@/features/clinical-decision-support/renderers/HfpefInputsDialog'
import { buildHfpefReading } from '@/features/clinical-decision-support/utils/hfpef-scores'
import type { Autofill, AutofillValue } from '@/features/medical-calculator/hooks/use-lab-autofill.hook'
import type { CdssPatientProfile } from '@/features/clinical-decision-support/types'

const NOW = new Date('2026-09-12T14:09:00+08:00')
const ECHO_DAY = '2026-07-14'

const ECHO: Record<string, number> = {
  averageEe: 13.2, ee: 13.2, trv: 3.1, pasp: 58, lavi: 36, lvmi: 118, rwt: 0.44, wall: 12,
}

const autofill: Autofill = {
  sex: 'female',
  clinicalSelects: {
    rhythm: { value: 'sr', date: '2026-05-25', testName: '最近 EKG：竇性心律' },
  },
  resolve: (source): AutofillValue | undefined => {
    if (!source) return undefined
    if (source.kind === 'age') return { value: 76, unit: 'y', date: '' }
    if (source.kind === 'echo' && ECHO[source.key] !== undefined) {
      return { value: ECHO[source.key], unit: '', date: ECHO_DAY, testName: '心臟超音波' }
    }
    return undefined
  },
}

const profile: CdssPatientProfile = { id: 'p1', facts: {} }

function renderDialog(onApply = jest.fn()) {
  const reading = buildHfpefReading({ profile, autofill })
  render(
    <HfpefInputsDialog
      open
      onOpenChange={() => {}}
      reading={reading}
      isEnglish={false}
      now={NOW}
      onApply={onApply}
    />,
  )
  return onApply
}

describe('the HFpEF input dialog', () => {
  it('says where each value came from, and what the report did not print', () => {
    renderDialog()

    expect(screen.getByTestId('cdss-hf-hfpef-row-lavi')).toHaveTextContent('自動帶入')
    expect(screen.getByTestId('cdss-hf-hfpef-row-lavi')).toHaveTextContent(`心超 ${ECHO_DAY}`)
    expect(screen.getByTestId('cdss-hf-hfpef-row-gls')).toHaveTextContent('報告未提供')
    // A laboratory value nobody has drawn is ordered, not typed.
    expect(screen.getByTestId('cdss-hf-hfpef-row-ntprobnp')).toHaveTextContent('紀錄無值')
    expect(screen.getByTestId('cdss-hf-hfpef-dialog-score-hfa-peff')).toHaveTextContent('4')
  })

  it('applies only the fields the reader changed, dated today', () => {
    const onApply = renderDialog()

    fireEvent.change(screen.getByTestId('cdss-hf-hfpef-input-gls'), { target: { value: '14' } })
    fireEvent.click(screen.getByTestId('cdss-hf-hfpef-dialog-apply'))

    // LAVI was auto-filled and untouched: it stays the report's value, with the
    // report's date, and no entry of its own is written.
    expect(onApply).toHaveBeenCalledWith({ gls: { value: '14', measuredOn: '2026-09-12' } })
  })

  it('writes nothing when nothing was changed', () => {
    const onApply = renderDialog()
    fireEvent.click(screen.getByTestId('cdss-hf-hfpef-dialog-apply'))

    expect(onApply).toHaveBeenCalledWith({})
  })

  it('shows the H₂FPEF inputs on their own tab', () => {
    renderDialog()
    fireEvent.click(screen.getByTestId('cdss-hf-hfpef-tab-h2fpef'))

    expect(screen.getByTestId('cdss-hf-hfpef-row-pasp')).toHaveTextContent('PASP')
    expect(screen.queryByTestId('cdss-hf-hfpef-row-lavi')).toBeNull()
  })
})

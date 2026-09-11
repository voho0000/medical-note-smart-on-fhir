import { separateGluedOrderCode, formatReportText } from '@/src/shared/utils/report-text-format'

describe('separateGluedOrderCode', () => {
  it('separates the order codes real captures glue to the description', () => {
    expect(separateGluedOrderCode('XCH01Chest PA')).toBe('XCH01 Chest PA')
    expect(separateGluedOrderCode('XCH20Chest Portable')).toBe('XCH20 Chest Portable')
    expect(separateGluedOrderCode('XLE18Both ankle')).toBe('XLE18 Both ankle')
    expect(separateGluedOrderCode("XLE05L't knee")).toBe("XLE05 L't knee")
    expect(separateGluedOrderCode('090170BRAIN CT without contrast'))
      .toBe('090170 BRAIN CT without contrast')
    expect(separateGluedOrderCode('330272Pulmonary embolism CT'))
      .toBe('330272 Pulmonary embolism CT')
  })

  it('never deletes the code — it is what the order is matched against', () => {
    expect(separateGluedOrderCode('XCH01Chest PA')).toContain('XCH01')
  })

  it('handles the five-digits-plus-letter NHI shape', () => {
    expect(separateGluedOrderCode('18005CEcho report')).toBe('18005C Echo report')
    expect(separateGluedOrderCode('12193CNT-proBNP')).toBe('12193C NT-proBNP')
  })

  it('does not claim a trailing letter for the lettered form', () => {
    // "XCH01C" and "XCH01" + "Chest" are the same characters; the code keeps
    // only what is unambiguous, so the description keeps its first letter.
    expect(separateGluedOrderCode('XCH01Chest PA')).toBe('XCH01 Chest PA')
  })

  it('leaves clinical text that merely starts with digits alone', () => {
    expect(separateGluedOrderCode('12mm nodule in RUL')).toBe('12mm nodule in RUL')
    expect(separateGluedOrderCode('2024 follow-up study')).toBe('2024 follow-up study')
    expect(separateGluedOrderCode('500000 units')).toBe('500000 units')
    expect(separateGluedOrderCode('1000000IU daily')).toBe('1000000IU daily')
  })

  it('leaves ordinary prose alone', () => {
    const prose = 'THE MULTI-DETECTOR ROW CT OF THE CHEST WAS PERFORMED'
    expect(separateGluedOrderCode(prose)).toBe(prose)
    expect(separateGluedOrderCode('Radiography of Chest A-P View(Supine)'))
      .toBe('Radiography of Chest A-P View(Supine)')
  })

  it('only touches the first line, never a code-like token mid-report', () => {
    const text = 'Chest PA\nCompared with XCH01Chest PA taken earlier.'
    expect(separateGluedOrderCode(text)).toBe(text)
  })

  it('reaches the rendered lines', () => {
    const lines = formatReportText('XCH01Chest PA\n＞ Cardiomegaly was noted.')
    expect(lines[0].text).toContain('XCH01 Chest PA')
  })
})

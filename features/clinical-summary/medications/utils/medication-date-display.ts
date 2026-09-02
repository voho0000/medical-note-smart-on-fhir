interface NumericDateParts {
  year: string
  month: string
  day: string
}

function numericDateParts(value?: string): NumericDateParts | null {
  if (!value) return null
  const yearFirst = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/.exec(value)
  if (yearFirst) {
    return { year: yearFirst[1], month: yearFirst[2], day: yearFirst[3] }
  }
  const yearLast = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.exec(value)
  if (yearLast) {
    return { year: yearLast[3], month: yearLast[1], day: yearLast[2] }
  }
  return null
}

function shortDate(value?: string): string {
  if (!value) return ''
  return value.replace(/(\d{1,2})\/(\d{1,2})\/(\d{2})(\d{2})/, '$1/$2/$4')
}

/** The compact coverage date shared by medication summary and history rows. */
export function compactMedicationDate(value: string | undefined, locale: string): string {
  if (!locale.startsWith('zh')) return shortDate(value)
  const parts = numericDateParts(value)
  if (!parts) return shortDate(value)
  return `${parts.year.slice(-2)}/${parts.month.padStart(2, '0')}/${parts.day.padStart(2, '0')}`
}

/** Full-year companion used where the compact date needs a precise tooltip. */
export function fullMedicationDate(value: string | undefined, locale: string): string {
  if (!locale.startsWith('zh')) return shortDate(value)
  const parts = numericDateParts(value)
  if (!parts) return shortDate(value)
  return `${parts.year}/${parts.month.padStart(2, '0')}/${parts.day.padStart(2, '0')}`
}

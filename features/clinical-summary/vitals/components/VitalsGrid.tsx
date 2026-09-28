// Vitals Grid Component
//
// One line per measurement day: the readings taken that day, then the date
// and how long ago it was. Usually that is a single line — a health check
// measures everything at once — but a height from 2018 and a blood pressure
// from last month each keep their own date instead of sharing the newer one.
import { Fragment } from 'react'
import type { VitalKey, VitalsView } from '../types'
import { useLanguage } from '@/src/application/providers/language.provider'
import { formatDate } from '@/src/shared/utils/fhir-helpers'
import { groupReadingsByDay, readingAge, type ReadingAge } from '../utils/reading-dates'

interface VitalsGridProps {
  vitals: VitalsView
}

export function VitalsGrid({ vitals }: VitalsGridProps) {
  const { t } = useLanguage()
  const groups = groupReadingsByDay(vitals.readings)

  if (groups.length === 0) {
    return <p className="text-muted-foreground">{t.vitals.noData}</p>
  }

  const labels: Record<VitalKey, string> = {
    height: t.vitals.height,
    weight: t.vitals.weight,
    bmi: t.vitals.bmi,
    bp: t.vitals.bp,
    hr: t.vitals.hr,
  }
  const ageText = (age: ReadingAge): string => {
    if (age.unit === 'today') return t.vitals.ageToday
    const [many, one] = {
      days: [t.vitals.ageDays, t.vitals.ageDaysOne],
      months: [t.vitals.ageMonths, t.vitals.ageMonthsOne],
      years: [t.vitals.ageYears, t.vitals.ageYearsOne],
    }[age.unit]
    return age.n === 1 ? one : many.replace('{n}', String(age.n))
  }
  const measuredOn = (day: string): string => {
    const age = readingAge(day)
    return age
      ? t.vitals.measuredOn.replace('{date}', formatDate(day)).replace('{age}', ageText(age))
      : formatDate(day)
  }

  return (
    <div className="space-y-0.5">
      {groups.map((group) => (
        <p key={group.day || 'undated'} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {group.readings.map((reading, i) => (
            <Fragment key={reading.key}>
              {i > 0 && <span aria-hidden="true" className="text-muted-foreground/50">·</span>}
              <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
                <span className="text-muted-foreground">{labels[reading.key]}</span>
                <span className="font-semibold tabular-nums">{reading.value}</span>
              </span>
            </Fragment>
          ))}
          {group.day && (
            <time dateTime={group.day} className="ml-1 whitespace-nowrap text-xs text-muted-foreground tabular-nums">
              {measuredOn(group.day)}
            </time>
          )}
        </p>
      ))}
    </div>
  )
}

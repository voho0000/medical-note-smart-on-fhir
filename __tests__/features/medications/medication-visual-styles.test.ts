import {
  medicationAcuteSwatchClass,
  medicationAcuteFutureTimelineBarClass,
  medicationAcuteTimelineBarClass,
  medicationCategoryChipClass,
  medicationChronicBadgeClass,
  medicationChronicSwatchClass,
  medicationChronicFutureTimelineBarClass,
  medicationChronicTimelineBarClass,
  medicationFutureTimelineSwatchClass,
  medicationIcdChipClass,
  medicationIcdCodeClass,
  medicationIcdDescriptionClass,
  getMedicationDaysLeftBadgeClass,
  getMedicationStatusBadgeClass,
} from '@/features/clinical-summary/medications/components/medication-chip-styles'
import {
  clinicalIcdCodeToneClass,
  clinicalIcdDescriptionToneClass,
  clinicalIcdToneClass,
  clinicalTooltipSurfaceClass,
} from '@/features/clinical-summary/components/clinical-metadata-styles'

describe('medication status visual language', () => {
  it('uses one clinical green family for chronic prescriptions across list and timeline', () => {
    const chronicStyles = [
      medicationChronicBadgeClass,
      medicationChronicSwatchClass,
      medicationChronicTimelineBarClass,
    ]

    chronicStyles.forEach((classes) => {
      expect(classes).toContain('teal-')
      expect(classes).not.toMatch(/sky|violet|purple|emerald/)
    })
  })

  it('keeps medication categories in a low-chroma secondary role', () => {
    expect(medicationCategoryChipClass).toContain('bg-secondary/65')
    expect(medicationCategoryChipClass).toContain('text-secondary-foreground/75')
    expect(medicationCategoryChipClass).toContain('dark:bg-secondary/55')
    expect(medicationCategoryChipClass).toContain('max-w-full')
    expect(medicationCategoryChipClass).not.toContain('max-w-[10rem]')
    expect(medicationCategoryChipClass).not.toMatch(/blue-|teal|emerald|amber/)
  })

  it('uses one neutral family for acute medication timeline marks', () => {
    expect(medicationAcuteSwatchClass).toContain('slate-')
    expect(medicationAcuteTimelineBarClass).toContain('slate-')
  })

  it('uses lighter type-aware colours plus a dashed key for after-today periods', () => {
    expect(medicationChronicFutureTimelineBarClass).toContain('fill-teal-100')
    expect(medicationChronicFutureTimelineBarClass).toContain('dark:fill-teal-950/70')
    expect(medicationAcuteFutureTimelineBarClass).toContain('fill-slate-100')
    expect(medicationAcuteFutureTimelineBarClass).toContain('dark:fill-slate-950/70')
    expect(medicationFutureTimelineSwatchClass).toContain('border-dashed')
  })

  it('keeps routine supply metadata quiet and escalates only near depletion', () => {
    expect(getMedicationDaysLeftBadgeClass(20)).toContain('bg-muted/45')
    expect(getMedicationDaysLeftBadgeClass(20)).toContain('w-full')
    expect(getMedicationDaysLeftBadgeClass(20)).toContain('min-w-0')
    expect(getMedicationDaysLeftBadgeClass(20)).toContain('max-w-none')
    expect(getMedicationDaysLeftBadgeClass(7)).toContain('w-full')
    expect(getMedicationDaysLeftBadgeClass(7)).toContain('bg-amber-50')
    expect(getMedicationDaysLeftBadgeClass(3)).toContain('w-full')
    expect(getMedicationDaysLeftBadgeClass(3)).toContain('bg-amber-100')
    expect(getMedicationDaysLeftBadgeClass(0)).toContain('justify-center')
    expect(getMedicationDaysLeftBadgeClass(-1)).toContain('text-destructive')
  })

  it('keeps routine active status neutral so it does not compete with chronic type', () => {
    expect(getMedicationStatusBadgeClass('active')).toContain('bg-muted')
    expect(getMedicationStatusBadgeClass('active')).not.toMatch(/sky|violet|purple/)
  })

  it('shares the restrained diagnosis tone used by visit-history ICDs', () => {
    expect(medicationIcdChipClass).toContain(clinicalIcdToneClass)
    expect(medicationIcdCodeClass).toContain(clinicalIcdCodeToneClass)
    expect(medicationIcdDescriptionClass).toContain(clinicalIcdDescriptionToneClass)
    expect(medicationIcdChipClass).toContain('bg-amber-50/50')
    expect(medicationIcdChipClass).toContain('dark:bg-amber-500/10')
    expect(medicationIcdChipClass).not.toContain('bg-amber-100')
  })

  it('keeps clinical tooltip cards and their arrows on one themed surface', () => {
    expect(clinicalTooltipSurfaceClass).toContain('bg-secondary')
    expect(clinicalTooltipSurfaceClass).toContain('text-secondary-foreground')
    expect(clinicalTooltipSurfaceClass).toContain('[&_svg]:bg-secondary!')
    expect(clinicalTooltipSurfaceClass).toContain('[&_svg]:fill-secondary!')
    expect(clinicalTooltipSurfaceClass).not.toContain('bg-foreground')
  })
})

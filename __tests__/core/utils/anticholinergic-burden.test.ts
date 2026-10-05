import { anticholinergicMedicinesLine, reviewAnticholinergicAlert } from '@/src/core/utils/anticholinergic-burden.utils'
import { generateSafetyAlertsUseCase } from '@/src/core/use-cases/safety-alerts/generate-safety-alerts.use-case'
import type { SummarySourceCatalogEntry } from '@/src/core/entities/medical-summary.entity'

// Synthetic catalog entries, shaped as buildSourceCatalog writes them.
const med = (
  key: string, ingredient: string, date: string, anticholinergic?: string, supplyEnd?: string,
): SummarySourceCatalogEntry => ({
  key, resourceType: 'MedicationRequest', resourceId: `r-${key}`, display: `SYN-${ingredient.toUpperCase()}`, date,
  medicationClass: `${ingredient} · X00X SYNTHETIC`,
  medicine: { mechanism: 'Synthetic', complete: true, ...(anticholinergic ? { anticholinergic } : {}) },
  ...(supplyEnd ? { supplyEnd } : {}),
})

const catalog = [
  med('M1', 'oxybutynin', '2026-09-15', 'ACB 3', '2026-10-15'),
  med('M2', 'oxybutynin', '2026-08-15', 'ACB 3', '2026-09-14'),
  med('M3', 'imipramine', '2026-06-01', 'ACB 3', '2026-08-30'),
  med('M4', 'quetiapine', '2026-02-01', 'ACB 3', '2026-03-02'),
  med('M5', 'codeine', '2026-09-20', 'ACB 1'),
  med('M6', 'mirabegron', '2026-09-15', undefined, '2026-10-15'),
]

describe('anticholinergicMedicinesLine', () => {
  it('lists each anticholinergic supplied in the last 90 days once, by its newest fill', () => {
    expect(anticholinergicMedicinesLine(catalog, '2026-10-05')).toBe(
      'ANTICHOLINERGIC MEDICINES SUPPLIED IN THE 90 DAYS BEFORE 2026-10-05: oxybutynin [M1] ACB 3; imipramine [M3] ACB 3 (2 medicines).',
    )
  })

  it('leaves out supply that ended long ago, ACB 1 medicines and non-anticholinergics', () => {
    const line = anticholinergicMedicinesLine(catalog, '2026-10-05')!
    expect(line).not.toMatch(/quetiapine|codeine|mirabegron/)
    // None among the recent ones: no line at all, so the topic is not raised.
    expect(anticholinergicMedicinesLine([catalog[3], catalog[4]], '2026-10-05')).toBeUndefined()
    expect(anticholinergicMedicinesLine([], '2026-10-05')).toBeUndefined()
  })

  it('counts one medicine as one, so the rules can tell it from a burden', () => {
    expect(anticholinergicMedicinesLine([catalog[0]], '2026-10-05')).toMatch(/\(1 medicine\)\.$/)
  })

  it('marks an anticholinergic alert the Beers rules do not support, and only that', () => {
    const alert = (title: string, detail: string) => ({ title, detail })
    // None supplied in the window: any anticholinergic alert is to verify.
    expect(reviewAnticholinergicAlert(alert('Polypharmacy and anticholinergic risk', 'Synthetic sedative and antipsychotic.'), 0))
      .toBe('none-supplied')
    // One, with no related condition named.
    expect(reviewAnticholinergicAlert(alert('Anticholinergic burden (ACB 3)', 'Synthetic antipsychotic in a patient over 65.'), 1))
      .toBe('one-without-condition')
    // One, with urinary retention (any sex) or dementia named: meets the rule.
    expect(reviewAnticholinergicAlert(alert('Anticholinergic with urinary retention', 'ACB 3 medicine in a 90-year-old with urinary retention.'), 1))
      .toBeUndefined()
    expect(reviewAnticholinergicAlert(alert('抗膽鹼藥物與失智', '失智病人使用 ACB 3 藥物。'), 1)).toBeUndefined()
    // Two or more: meets the rule. Not about anticholinergics: not judged.
    expect(reviewAnticholinergicAlert(alert('Anticholinergic burden: 2 medicines', 'Two ACB 3 medicines.'), 2)).toBeUndefined()
    expect(reviewAnticholinergicAlert(alert('Renal dosing review', 'eGFR 31 with a renally cleared medicine.'), 0)).toBeUndefined()
  })

  it('reaches the standalone safety prompt, with the rule that reads it', () => {
    const [system, user] = generateSafetyAlertsUseCase.buildMessages({ clinicalContext: 'x', locale: 'en', catalog })
    // Without a reference date the newest record (2026-09-20) stands in.
    expect(user.content).toContain('ANTICHOLINERGIC MEDICINES SUPPLIED IN THE 90 DAYS BEFORE 2026-09-20: oxybutynin [M1] ACB 3; imipramine [M3] ACB 3')
    expect(system.content).toMatch(/Raise anticholinergic burden only when the ANTICHOLINERGIC MEDICINES line lists two or more/)
  })
})

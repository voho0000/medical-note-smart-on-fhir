// Custom Hook: Vitals View Processing
//
// Latest reading per vital, each carrying its own date. Height from a 2018
// health check and a blood pressure from last month are different readings;
// the card must not stamp one date on both.
import { useMemo } from 'react'
import type { Observation, VitalReading, VitalsView, ObsComponent } from '../types'
import { VITAL } from '../types'
import {
  pickLatestByVital,
  filterVitalSigns,
  matchesVital,
} from '../utils/observation-helpers'
import { formatQuantity } from '../utils/fhir-helpers'

function effectiveOf(o?: Observation): string | undefined {
  return o?.effectiveDateTime || o?.effectivePeriod?.start || undefined
}

function componentValue(c?: ObsComponent): string | null {
  return c?.valueQuantity?.value != null ? String(Math.round(Number(c.valueQuantity.value))) : null
}

export function useVitalsView(vitalSigns: any[]) {
  const vitalObservations = useMemo(() => filterVitalSigns(vitalSigns), [vitalSigns])

  return useMemo<VitalsView>(() => {
    const readings: VitalReading[] = []
    const addQuantity = (key: VitalReading['key'], o?: Observation) => {
      if (o?.valueQuantity) readings.push({ key, value: formatQuantity(o.valueQuantity), effective: effectiveOf(o) })
    }

    addQuantity('height', pickLatestByVital(vitalObservations, VITAL.HEIGHT))
    addQuantity('weight', pickLatestByVital(vitalObservations, VITAL.WEIGHT))
    addQuantity('bmi', pickLatestByVital(vitalObservations, VITAL.BMI))

    // Blood Pressure — try the panel first (LOINC + aliases + keywords),
    // fall back to individual systolic/diastolic Observations if no panel
    // exists (some vendors ship them separately).
    const bpPanel = pickLatestByVital(vitalObservations, VITAL.BP_PANEL)
    if (bpPanel?.component?.length) {
      const s = componentValue(bpPanel.component.find((c: ObsComponent) => matchesVital(c, VITAL.BP_SYS)))
      const d = componentValue(bpPanel.component.find((c: ObsComponent) => matchesVital(c, VITAL.BP_DIA)))
      if (s && d) readings.push({ key: 'bp', value: `${s}/${d} mmHg`, effective: effectiveOf(bpPanel) })
    } else {
      const sObs = pickLatestByVital(vitalObservations, VITAL.BP_SYS)
      const dObs = pickLatestByVital(vitalObservations, VITAL.BP_DIA)
      const s = sObs?.valueQuantity?.value != null ? String(Math.round(Number(sObs.valueQuantity.value))) : null
      const d = dObs?.valueQuantity?.value != null ? String(Math.round(Number(dObs.valueQuantity.value))) : null
      if (s && d) readings.push({ key: 'bp', value: `${s}/${d} mmHg`, effective: effectiveOf(sObs) ?? effectiveOf(dObs) })
    }

    const hr = pickLatestByVital(vitalObservations, VITAL.HR)
    if (hr?.valueQuantity?.value != null) {
      readings.push({ key: 'hr', value: `${Math.round(Number(hr.valueQuantity.value))} bpm`, effective: effectiveOf(hr) })
    }

    return { readings }
  }, [vitalObservations])
}

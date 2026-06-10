// Custom Hook: Vitals View Processing
import { useMemo } from 'react'
import type { VitalsView, ObsComponent } from '../types'
import { VITAL } from '../types'
import {
  pickLatestByVital,
  filterVitalSigns,
  matchesVital,
} from '../utils/observation-helpers'
import { formatQuantity, formatDate } from '../utils/fhir-helpers'

export function useVitalsView(vitalSigns: any[]) {
  const vitalObservations = useMemo(() => filterVitalSigns(vitalSigns), [vitalSigns])

  return useMemo<VitalsView>(() => {
    const height = pickLatestByVital(vitalObservations, VITAL.HEIGHT)
    const weight = pickLatestByVital(vitalObservations, VITAL.WEIGHT)
    const bmi = pickLatestByVital(vitalObservations, VITAL.BMI)

    // Blood Pressure — try the panel first (LOINC + aliases + keywords),
    // fall back to individual systolic/diastolic Observations if no panel
    // exists (some vendors ship them separately).
    let bpS: string | null = null
    let bpD: string | null = null
    const bpPanel = pickLatestByVital(vitalObservations, VITAL.BP_PANEL)

    if (bpPanel?.component?.length) {
      const s = bpPanel.component.find((c: ObsComponent) => matchesVital(c, VITAL.BP_SYS))
      const d = bpPanel.component.find((c: ObsComponent) => matchesVital(c, VITAL.BP_DIA))
      if (s?.valueQuantity?.value != null) bpS = String(Math.round(Number(s.valueQuantity.value)))
      if (d?.valueQuantity?.value != null) bpD = String(Math.round(Number(d.valueQuantity.value)))
    } else {
      const sObs = pickLatestByVital(vitalObservations, VITAL.BP_SYS)
      const dObs = pickLatestByVital(vitalObservations, VITAL.BP_DIA)
      if (sObs?.valueQuantity?.value != null) bpS = String(Math.round(Number(sObs.valueQuantity.value)))
      if (dObs?.valueQuantity?.value != null) bpD = String(Math.round(Number(dObs.valueQuantity.value)))
    }

    const hr = pickLatestByVital(vitalObservations, VITAL.HR)
    const rr = pickLatestByVital(vitalObservations, VITAL.RR)
    const temp = pickLatestByVital(vitalObservations, VITAL.TEMP)
    const spo2 = pickLatestByVital(vitalObservations, VITAL.SPO2)

    const lastTime = [height, weight, bmi, bpPanel, hr, rr, temp, spo2]
      .map(o => o?.effectiveDateTime ? new Date(o.effectiveDateTime).getTime() : 0)
      .reduce((a, b) => Math.max(a, b), 0)

    return {
      height: height?.valueQuantity ? formatQuantity(height.valueQuantity) : "—",
      weight: weight?.valueQuantity ? formatQuantity(weight.valueQuantity) : "—",
      bmi: bmi?.valueQuantity ? formatQuantity(bmi.valueQuantity) : "—",
      bp: (bpS && bpD) ? `${bpS}/${bpD} mmHg` : "—",
      hr: hr?.valueQuantity ? `${Math.round(Number(hr.valueQuantity.value))} bpm` : "—",
      rr: rr?.valueQuantity ? `${Math.round(Number(rr.valueQuantity.value))} /min` : "—",
      temp: temp?.valueQuantity ? formatQuantity(temp.valueQuantity) : "—",
      spo2: spo2?.valueQuantity ? `${Math.round(Number(spo2.valueQuantity.value))}%` : "—",
      time: lastTime ? formatDate(new Date(lastTime).toISOString()) : "",
    }
  }, [vitalObservations])
}

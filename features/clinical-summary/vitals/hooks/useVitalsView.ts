// Custom Hook: Vitals View Processing
import { useMemo } from 'react'
import type { Observation, VitalsView, ObsComponent, Coding } from '../types'
import { LOINC } from '../types'
import { pickLatestByCode, filterVitalSigns } from '../utils/observation-helpers'
import { formatQuantity, formatDate } from '../utils/fhir-helpers'

export function useVitalsView(vitalSigns: any[]) {
  const vitalObservations = useMemo(() => filterVitalSigns(vitalSigns), [vitalSigns])

  return useMemo<VitalsView>(() => {
    const height = pickLatestByCode(vitalObservations, LOINC.HEIGHT)
    const weight = pickLatestByCode(vitalObservations, LOINC.WEIGHT)
    const bmi = pickLatestByCode(vitalObservations, LOINC.BMI)

    // Blood Pressure - try panel first, fallback to individual
    let bpS: string | null = null
    let bpD: string | null = null
    const bpPanel = pickLatestByCode(vitalObservations, LOINC.BP_PANEL)
    if (bpPanel?.component?.length) {
      const s = bpPanel.component.find((c: ObsComponent) => 
        (c.code?.coding || []).some((x: Coding) => x.code === LOINC.BP_SYS)
      )
      const d = bpPanel.component.find((c: ObsComponent) => 
        (c.code?.coding || []).some((x: Coding) => x.code === LOINC.BP_DIA)
      )
      if (s?.valueQuantity?.value != null) bpS = String(Math.round(Number(s.valueQuantity.value)))
      if (d?.valueQuantity?.value != null) bpD = String(Math.round(Number(d.valueQuantity.value)))
    } else {
      const sObs = pickLatestByCode(vitalObservations, LOINC.BP_SYS)
      const dObs = pickLatestByCode(vitalObservations, LOINC.BP_DIA)
      if (sObs?.valueQuantity?.value != null) bpS = String(Math.round(Number(sObs.valueQuantity.value)))
      if (dObs?.valueQuantity?.value != null) bpD = String(Math.round(Number(dObs.valueQuantity.value)))
    }

    const hr = pickLatestByCode(vitalObservations, LOINC.HR)
    const rr = pickLatestByCode(vitalObservations, LOINC.RR)
    const temp = pickLatestByCode(vitalObservations, LOINC.TEMP)
    const spo2 = pickLatestByCode(vitalObservations, LOINC.SPO2)

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

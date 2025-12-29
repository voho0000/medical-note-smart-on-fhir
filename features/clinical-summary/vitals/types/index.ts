// Types for Vitals
export type Coding = { system?: string; code?: string; display?: string }
export type CodeableConcept = { text?: string; coding?: Coding[] }
export type ObsComponent = {
  code?: CodeableConcept
  valueQuantity?: { value?: number; unit?: string }
  valueString?: string
}

export interface Observation {
  id?: string
  code?: CodeableConcept
  valueQuantity?: { value?: number; unit?: string }
  valueString?: string
  effectiveDateTime?: string
  category?: Array<{
    coding?: Array<{
      code?: string
      display?: string
    }>
  }>
  component?: ObsComponent[]
}

export interface VitalsView {
  height: string
  weight: string
  bmi: string
  bp: string
  hr: string
  rr: string
  temp: string
  spo2: string
  time: string
}

export const LOINC = {
  HEIGHT: "8302-2",
  WEIGHT: "29463-7",
  BMI: "39156-5",
  BP_PANEL: "85354-9",
  BP_SYS: "8480-6",
  BP_DIA: "8462-4",
  HR: "8867-4",
  RR: "9279-1",
  TEMP: "8310-5",
  SPO2: "59408-5",
}

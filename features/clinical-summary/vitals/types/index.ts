import type { Observation, CodeableConcept, Quantity, Coding, ObservationComponent } from '@/src/shared/types/fhir.types'

export type { Observation, CodeableConcept, Quantity, Coding, ObservationComponent }

// Type aliases for backward compatibility
export type ObsComponent = ObservationComponent
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

// Application Provider: Patient
"use client"

import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react'
import { GetPatientUseCase } from '@/src/core/use-cases/patient/get-patient.use-case'
import { FhirPatientRepository } from '@/src/infrastructure/fhir/repositories/patient.repository'
import type { PatientEntity } from '@/src/core/entities/patient.entity'

interface PatientContextValue {
  patient: PatientEntity | null
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

const PatientContext = createContext<PatientContextValue | null>(null)

export function PatientProvider({ children }: { children: ReactNode }) {
  const [patient, setPatient] = useState<PatientEntity | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPatient = async () => {
    setLoading(true)
    setError(null)

    try {
      const repository = new FhirPatientRepository()
      const useCase = new GetPatientUseCase(repository)
      const result = await useCase.execute()
      setPatient(result)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load patient'
      setError(message)
      setPatient(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPatient()
  }, [])

  const value = useMemo(
    () => ({
      patient,
      loading,
      error,
      refetch: fetchPatient
    }),
    [patient, loading, error]
  )

  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>
}

export function usePatient() {
  const context = useContext(PatientContext)
  if (!context) {
    throw new Error('usePatient must be used within PatientProvider')
  }
  return context
}

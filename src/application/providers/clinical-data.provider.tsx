// Application Provider: Clinical Data
"use client"

import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from 'react'
import { FetchClinicalDataUseCase } from '@/src/core/use-cases/clinical-data/fetch-clinical-data.use-case'
import { FhirClinicalDataRepository } from '@/src/infrastructure/fhir/repositories/clinical-data.repository'
import type { ClinicalDataCollection } from '@/src/core/entities/clinical-data.entity'
import { usePatient } from './patient.provider'

interface ClinicalDataContextValue extends ClinicalDataCollection {
  isLoading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

const ClinicalDataContext = createContext<ClinicalDataContextValue | null>(null)

export function ClinicalDataProvider({ children }: { children: ReactNode }) {
  const { patient, loading: patientLoading } = usePatient()
  const [data, setData] = useState<ClinicalDataCollection>({
    conditions: [],
    medications: [],
    allergies: [],
    observations: [],
    vitalSigns: [],
    diagnosticReports: [],
    procedures: [],
    encounters: []
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const fetchData = async () => {
    if (!patient?.id) return

    setIsLoading(true)
    setError(null)

    try {
      const repository = new FhirClinicalDataRepository()
      const useCase = new FetchClinicalDataUseCase(repository)
      const result = await useCase.execute(patient.id)
      setData(result)
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load clinical data')
      setError(error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (!patientLoading && patient?.id) {
      fetchData()
    }
  }, [patient?.id, patientLoading])

  const value = useMemo(
    () => ({
      ...data,
      isLoading: patientLoading || isLoading,
      error,
      refetch: fetchData
    }),
    [data, patientLoading, isLoading, error]
  )

  return <ClinicalDataContext.Provider value={value}>{children}</ClinicalDataContext.Provider>
}

export function useClinicalData() {
  const context = useContext(ClinicalDataContext)
  if (!context) {
    throw new Error('useClinicalData must be used within ClinicalDataProvider')
  }
  return context
}

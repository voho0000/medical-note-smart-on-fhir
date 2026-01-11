/**
 * Patient Provider (Bridge to React Query)
 * 
 * This file now acts as a compatibility layer, re-exporting the React Query hooks.
 * This allows all existing components to work without modification.
 * 
 * Migration path:
 * 1. Keep this file as a bridge (current approach)
 * 2. All components continue to import from here
 * 3. No component changes needed!
 */

// Re-export everything from the React Query hook
export { usePatient, usePatientQuery } from '@/src/application/hooks/patient/use-patient-query.hook'

// Dummy PatientProvider for backward compatibility (does nothing now)
export function PatientProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}

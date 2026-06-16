// Allergy List Component
import type { AllergyIntolerance } from '@/src/shared/types/fhir.types'
import { AllergyItem } from './AllergyItem'

interface AllergyListProps {
  allergies: AllergyIntolerance[]
  isLoading: boolean
  error: Error | null
}

export function AllergyList({ allergies, isLoading, error }: AllergyListProps) {
  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Loading allergies…</div>
  }
  
  if (error) {
    return (
      <div className="text-sm text-red-600">
        {error instanceof Error ? error.message : String(error)}
      </div>
    )
  }

  if (allergies.length === 0) {
    return <div className="text-sm text-muted-foreground">No active allergies found.</div>
  }

  return (
    <ul className="space-y-2">
      {allergies.map((allergy, index) => (
        // Stable fallback key: Math.random() here generated a fresh key every
        // render, remounting the row (lost state / flicker). The list is static
        // (no reordering), so the index is a safe fallback when id is absent.
        <AllergyItem key={allergy.id || `allergy-${index}`} allergy={allergy} />
      ))}
    </ul>
  )
}

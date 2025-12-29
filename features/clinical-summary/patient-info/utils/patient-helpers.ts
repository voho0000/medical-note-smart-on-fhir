// Patient Helper Functions
export function calculateAge(birthDate?: string): string {
  if (!birthDate) return "N/A"
  try {
    const birth = new Date(birthDate)
    const today = new Date()
    let age = today.getFullYear() - birth.getFullYear()
    const monthDiff = today.getMonth() - birth.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--
    }
    return age.toString()
  } catch (error) {
    console.error("Error calculating age:", error)
    return "N/A"
  }
}

export function formatGender(gender?: string): string {
  if (!gender) return "N/A"
  return gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase()
}

export function formatName(patient: any): string {
  if (!patient?.name?.[0]) return "N/A"
  const name = patient.name[0]
  const givenName = name.given?.join(" ").trim()
  const familyName = name.family?.trim() || ""
  return [givenName, familyName].filter(Boolean).join(" ") || "N/A"
}

export function formatError(error: unknown): string {
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object') {
    const err = error as { message?: unknown }
    if (typeof err.message === 'string') {
      return err.message
    }
    return JSON.stringify(error)
  }
  return String(error)
}

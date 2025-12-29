// Status Badge Component with Color Mapping
import { cn } from "@/src/shared/utils/cn.utils"

interface StatusBadgeProps {
  status: string
  type: 'clinical' | 'verification'
}

export function StatusBadge({ status, type }: StatusBadgeProps) {
  if (!status) return null
  
  const normalizedStatus = status.toLowerCase()
  
  // Clinical Status Colors
  const clinicalColors: Record<string, string> = {
    'active': 'bg-red-50 text-red-700 ring-red-200 font-semibold',
    'recurrence': 'bg-orange-50 text-orange-700 ring-orange-200',
    'relapse': 'bg-orange-50 text-orange-700 ring-orange-200',
    'inactive': 'bg-gray-50 text-gray-600 ring-gray-200',
    'remission': 'bg-blue-50 text-blue-700 ring-blue-200',
    'resolved': 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  }
  
  // Verification Status Colors
  const verificationColors: Record<string, string> = {
    'confirmed': 'bg-sky-50 text-sky-700 ring-sky-200',
    'unconfirmed': 'bg-amber-50 text-amber-600 ring-amber-200',
    'provisional': 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    'differential': 'bg-purple-50 text-purple-700 ring-purple-200',
    'refuted': 'bg-red-50 text-red-700 ring-red-200',
    'entered-in-error': 'bg-red-50 text-red-600 ring-red-200',
  }
  
  const colorMap = type === 'clinical' ? clinicalColors : verificationColors
  const colorClass = colorMap[normalizedStatus] || 'bg-gray-100 text-gray-700 ring-gray-200'
  
  return (
    <span className={cn(
      "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ring-1",
      colorClass
    )}>
      {status}
    </span>
  )
}

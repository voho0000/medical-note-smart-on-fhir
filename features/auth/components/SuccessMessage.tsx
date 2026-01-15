// Success Message Component
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

interface SuccessMessageProps {
  title: string
  description: string
  buttonLabel: string
  onClose: () => void
  variant?: 'success' | 'info'
}

export function SuccessMessage({ 
  title, 
  description, 
  buttonLabel, 
  onClose,
  variant = 'success'
}: SuccessMessageProps) {
  const isSuccess = variant === 'success'
  
  return (
    <Alert className={isSuccess ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" : ""}>
      <AlertCircle className={`h-4 w-4 ${isSuccess ? 'text-green-600 dark:text-green-500' : ''}`} />
      <AlertTitle className={isSuccess ? "text-green-800 dark:text-green-200" : ""}>
        {title}
      </AlertTitle>
      <AlertDescription className={isSuccess ? "text-green-700 dark:text-green-300" : ""}>
        {description}
      </AlertDescription>
      {buttonLabel && (
        <Button 
          onClick={onClose} 
          className="mt-3 w-full"
          variant="default"
        >
          {buttonLabel}
        </Button>
      )}
    </Alert>
  )
}

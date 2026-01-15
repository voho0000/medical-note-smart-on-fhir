// Login Prompt Component
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LoginPromptProps {
  title: string
  description: string
  buttonLabel: string
  onLogin: () => void
}

export function LoginPrompt({ title, description, buttonLabel, onLogin }: LoginPromptProps) {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-180px)] px-6 text-center">
      <LogIn className="h-16 w-16 text-muted-foreground/50 mb-6" />
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">{description}</p>
      <Button onClick={onLogin} className="gap-2">
        <LogIn className="h-4 w-4" />
        {buttonLabel}
      </Button>
    </div>
  )
}

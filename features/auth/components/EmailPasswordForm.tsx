// Email Password Form Component
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react'
import type { AuthMode, AuthError } from '../hooks/useAuthDialog'

interface EmailPasswordFormProps {
  mode: AuthMode
  email: string
  setEmail: (email: string) => void
  password: string
  setPassword: (password: string) => void
  showPassword: boolean
  setShowPassword: (show: boolean) => void
  error: AuthError | null
  loading: boolean
  resetEmailSent: boolean
  onSubmit: (e: React.FormEvent) => void
  onSwitchToReset: () => void
  emailLabel: string
  passwordLabel: string
  forgotPasswordLabel: string
  submitLabel: string
  showPasswordLabel: string
  hidePasswordLabel: string
}

export function EmailPasswordForm({
  mode,
  email,
  setEmail,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  error,
  loading,
  resetEmailSent,
  onSubmit,
  onSwitchToReset,
  emailLabel,
  passwordLabel,
  forgotPasswordLabel,
  submitLabel,
  showPasswordLabel,
  hidePasswordLabel,
}: EmailPasswordFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="email">{emailLabel}</Label>
        <Input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
        />
      </div>

      {mode !== 'reset' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{passwordLabel}</Label>
            {mode === 'signin' && (
              <button
                type="button"
                onClick={onSwitchToReset}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                {forgotPasswordLabel}
              </button>
            )}
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              className="pr-10"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showPassword ? hidePasswordLabel : showPasswordLabel}
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{error.title}</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" className="w-full" disabled={loading || (mode === 'reset' && resetEmailSent)}>
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {submitLabel}
      </Button>
    </form>
  )
}

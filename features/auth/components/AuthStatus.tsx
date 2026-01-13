// Authentication Status Component
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { AuthDialog } from './AuthDialog'
import { LogIn, LogOut, User } from 'lucide-react'

export function AuthStatus() {
  const { t } = useLanguage()
  const { user, loading, signOut, dailyUsage, dailyLimit } = useAuth()
  const [showAuthDialog, setShowAuthDialog] = useState(false)

  if (loading) {
    return (
      <div className="rounded-lg border p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
        <div className="h-3 bg-muted rounded w-3/4"></div>
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <LogIn className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-sm mb-1">
                💡 {t.auth.useProxyModels}
              </h3>
              <p className="text-sm text-muted-foreground mb-3">
                {t.auth.freeQuotaDescription}
              </p>
              <ul className="text-xs text-muted-foreground space-y-1 mb-3">
                <li>• {t.auth.benefit1}</li>
                <li>• {t.auth.benefit2}</li>
                <li>• {t.auth.benefit3}</li>
              </ul>
              <Button
                size="sm"
                onClick={() => setShowAuthDialog(true)}
                className="w-full sm:w-auto"
              >
                <LogIn className="mr-2 h-4 w-4" />
                {t.auth.signInToUseQuota}
              </Button>
            </div>
          </div>
        </div>

        <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
      </>
    )
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <div className="rounded-full bg-green-500/10 p-2">
            <User className="h-5 w-5 text-green-600 dark:text-green-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-sm mb-1">
              ✓ {t.auth.signedInAs}
            </h3>
            <p className="text-sm text-muted-foreground truncate">
              {user.displayName || user.email}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={signOut}
          disabled={loading}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {t.auth.signOut}
        </Button>
      </div>

      <div className="pt-3 border-t">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t.auth.usageToday}</span>
          <span className="font-medium">
            {dailyUsage} / {dailyLimit}
          </span>
        </div>
        <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${(dailyUsage / dailyLimit) * 100}%` }}
          />
        </div>
      </div>
    </div>
  )
}

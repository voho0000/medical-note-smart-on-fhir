// Authentication Status Component
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { AuthDialog } from './AuthDialog'
import { LogIn, LogOut, User, Info, Gift, ShieldCheck } from 'lucide-react'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{used} / {limit}</span>
      </div>
      <div className="mt-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${Math.min((used / limit) * 100, 100)}%` }}
        />
      </div>
    </div>
  )
}

export function AuthStatus() {
  const { t } = useLanguage()
  const {
    user,
    isAnonymous,
    loading,
    signOut,
    dailyUsage,
    dailyLimit,
    perplexityUsage,
    whisperUsage,
    perplexityLimit,
    whisperLimit,
  } = useAuth()
  const [showAuthDialog, setShowAuthDialog] = useState(false)

  if (ENV_CONFIG.offlineMode) {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 dark:border-emerald-900 dark:bg-emerald-950/20">
        <div className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700 dark:text-emerald-400" />
          <div>
            <h3 className="text-sm font-medium">{t.settings.openAiCompatibleGroupLabel}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t.settings.openAiCompatibleDirectStatus}
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="rounded-lg border p-4 animate-pulse">
        <div className="h-4 bg-muted rounded w-1/2 mb-2"></div>
        <div className="h-3 bg-muted rounded w-3/4"></div>
      </div>
    )
  }

  // Anonymous (free-tier) visitor — show their free usage and invite them to
  // sign in for the larger quota + cloud features. `user` is null by design.
  if (!user && isAnonymous) {
    return (
      <>
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="rounded-full bg-primary/10 p-2">
                <Gift className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-medium text-sm mb-1">{t.auth.guestFreeTier}</h3>
                <p className="text-sm text-muted-foreground">{t.auth.freeQuotaDescription}</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setShowAuthDialog(true)}
              className="shrink-0"
            >
              <LogIn className="mr-2 h-4 w-4" />
              {t.auth.signIn}
            </Button>
          </div>

          <div className="pt-3 border-t space-y-3">
            <span className="text-sm text-muted-foreground">{t.auth.usageToday}</span>
            <UsageRow label={t.auth.usageChat} used={dailyUsage} limit={dailyLimit} />
            <UsageRow label={t.auth.usagePerplexity} used={perplexityUsage} limit={perplexityLimit} />
            <UsageRow label={t.auth.usageWhisper} used={whisperUsage} limit={whisperLimit} />
            <p className="text-xs text-muted-foreground">💡 {t.auth.signInForMore}</p>
          </div>
        </div>

        <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
      </>
    )
  }

  if (!user) {
    return (
      <>
        <div className="rounded-lg border p-3">
          <div className="flex items-start gap-2">
            <div className="rounded-full bg-primary/10 p-1.5 shrink-0">
              <LogIn className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-sm mb-1">
                💡 {t.auth.useProxyModels}
              </h3>
              <ul className="text-xs text-muted-foreground space-y-0.5">
                <li>• {t.auth.benefit1}</li>
                <li>• {t.auth.benefit2}</li>
                <li>• {t.auth.benefit3}</li>
              </ul>
            </div>
            <Button
              size="sm"
              onClick={() => setShowAuthDialog(true)}
              className="h-8 text-xs shrink-0"
            >
              <LogIn className="mr-1.5 h-3.5 w-3.5" />
              {t.auth.signInToUseQuota}
            </Button>
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

      <div className="pt-3 border-t space-y-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-sm text-muted-foreground flex items-center gap-1 cursor-help w-fit">
              {t.auth.usageToday}
              <Info className="h-3 w-3" />
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t.auth.usageTodayTooltip}
          </TooltipContent>
        </Tooltip>
        <UsageRow label={t.auth.usageChat} used={dailyUsage} limit={dailyLimit} />
        <UsageRow
          label={t.auth.usagePerplexity}
          used={perplexityUsage}
          limit={perplexityLimit}
        />
        <UsageRow
          label={t.auth.usageWhisper}
          used={whisperUsage}
          limit={whisperLimit}
        />
      </div>
    </div>
  )
}

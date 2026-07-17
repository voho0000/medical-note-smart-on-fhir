// Header Authentication Button Component
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { AuthDialog } from './AuthDialog'
import { LogIn, User, Info, Gift, ShieldCheck } from 'lucide-react'
import { ENV_CONFIG } from '@/src/shared/config/env.config'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'

function MiniUsageRow({ label, used, limit }: { label: string; used: number; limit: number }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{used} / {limit}</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${Math.min((used / limit) * 100, 100)}%` }}
        />
      </div>
    </div>
  )
}

export function HeaderAuthButton() {
  const { t } = useLanguage()
  const {
    user,
    isAnonymous,
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
      <Button variant="outline" size="sm" className="h-9 gap-2" disabled>
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <span className="hidden sm:inline">{t.settings.openAiCompatibleGroupLabel}</span>
      </Button>
    )
  }

  // Anonymous (free-tier) visitor — `user` is null by design. Surface their
  // free usage and a CTA to sign in for the larger quota.
  if (!user && isAnonymous) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2 h-9">
              <Gift className="h-4 w-4" />
              <span className="hidden sm:inline">{t.auth.guest}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="text-sm font-medium">{t.auth.guestFreeTier}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-2">
                <span className="text-xs text-muted-foreground">{t.auth.usageToday}</span>
                <MiniUsageRow label={t.auth.usageChat} used={dailyUsage} limit={dailyLimit} />
                <MiniUsageRow label={t.auth.usagePerplexity} used={perplexityUsage} limit={perplexityLimit} />
                <MiniUsageRow label={t.auth.usageWhisper} used={whisperUsage} limit={whisperLimit} />
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setShowAuthDialog(true)}>
              <LogIn className="mr-2 h-4 w-4" />
              {t.auth.signInForMore}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
      </>
    )
  }

  if (!user) {
    return (
      <>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAuthDialog(true)}
          className="gap-2 h-9"
        >
          <LogIn className="h-4 w-4" />
          <span className="hidden sm:inline">{t.auth.signIn}</span>
        </Button>
        <AuthDialog open={showAuthDialog} onOpenChange={setShowAuthDialog} />
      </>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-9">
          <User className="h-4 w-4" />
          <span className="hidden sm:inline">{user.displayName || user.email?.split('@')[0]}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium">{user.displayName || t.auth.signedInAs}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-muted-foreground flex items-center gap-1 cursor-help w-fit">
                  {t.auth.usageToday}
                  <Info className="h-3 w-3" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                {t.auth.usageTodayTooltip}
              </TooltipContent>
            </Tooltip>
            <MiniUsageRow label={t.auth.usageChat} used={dailyUsage} limit={dailyLimit} />
            <MiniUsageRow
              label={t.auth.usagePerplexity}
              used={perplexityUsage}
              limit={perplexityLimit}
            />
            <MiniUsageRow
              label={t.auth.usageWhisper}
              used={whisperUsage}
              limit={whisperLimit}
            />
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={signOut}>
          {t.auth.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

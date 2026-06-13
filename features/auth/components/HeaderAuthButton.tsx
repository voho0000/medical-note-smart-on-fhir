// Header Authentication Button Component
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
import { QUOTA_CONFIG } from '@/src/shared/config/quota.config'
import { AuthDialog } from './AuthDialog'
import { LogIn, User, Info } from 'lucide-react'
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
  const { user, signOut, dailyUsage, dailyLimit, perplexityUsage, whisperUsage } = useAuth()
  const [showAuthDialog, setShowAuthDialog] = useState(false)

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
              limit={QUOTA_CONFIG.PERPLEXITY_DAILY_LIMIT}
            />
            <MiniUsageRow
              label={t.auth.usageWhisper}
              used={whisperUsage}
              limit={QUOTA_CONFIG.WHISPER_DAILY_LIMIT}
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

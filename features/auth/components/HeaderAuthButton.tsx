// Header Authentication Button Component
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useLanguage } from '@/src/application/providers/language.provider'
import { useAuth } from '@/src/application/providers/auth.provider'
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

export function HeaderAuthButton() {
  const { t } = useLanguage()
  const { user, signOut, dailyUsage, dailyLimit } = useAuth()
  const [showAuthDialog, setShowAuthDialog] = useState(false)

  if (!user) {
    return (
      <>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAuthDialog(true)}
          className="gap-2"
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
        <Button variant="outline" size="sm" className="gap-2">
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
            <div className="flex items-center justify-between text-xs">
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-muted-foreground flex items-center gap-1 cursor-help">
                    {t.auth.usageToday}
                    <Info className="h-3 w-3" />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {t.auth.usageTodayTooltip}
                </TooltipContent>
              </Tooltip>
              <span className="font-medium">{dailyUsage} / {dailyLimit}</span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all"
                style={{ width: `${(dailyUsage / dailyLimit) * 100}%` }}
              />
            </div>
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

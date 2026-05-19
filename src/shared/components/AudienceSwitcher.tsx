// Audience Switcher Component
"use client"

import { useAudience, type Audience } from '@/src/application/providers/audience.provider'
import { useLanguage } from '@/src/application/providers/language.provider'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Stethoscope, User } from 'lucide-react'

const ORDER: Audience[] = ['medical', 'patient']

export function AudienceSwitcher() {
  const { audience, setAudience } = useAudience()
  const { t } = useLanguage()

  const Icon = audience === 'medical' ? Stethoscope : User
  const label = audience === 'medical' ? t.audience.medical : t.audience.patient

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={t.audience.switcherLabel}
          className="gap-2 border-border/40 hover:bg-accent hover:text-accent-foreground"
        >
          <Icon className="h-4 w-4" />
          <span className="hidden sm:inline">{label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {ORDER.map((value) => {
          const ItemIcon = value === 'medical' ? Stethoscope : User
          const itemLabel = value === 'medical' ? t.audience.medical : t.audience.patient
          return (
            <DropdownMenuItem
              key={value}
              onClick={() => setAudience(value)}
              className={`gap-2 ${audience === value ? 'bg-accent' : ''}`}
            >
              <ItemIcon className="h-4 w-4" />
              {itemLabel}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

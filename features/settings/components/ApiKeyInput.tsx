// API Key Input Component
import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { cn } from "@/src/shared/utils/cn.utils"
import { useLanguage } from "@/src/application/providers/language.provider"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { InfoHint } from "@/src/shared/components/InfoHint"

interface ApiKeyInputProps {
  id: string
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onClear: () => void
  helpText: string
  clearWarning?: string
  disabled?: boolean
}

export function ApiKeyInput({
  id,
  label,
  placeholder,
  value,
  onChange,
  onSave,
  onClear,
  helpText,
  clearWarning,
  disabled = false,
}: ApiKeyInputProps) {
  const { t } = useLanguage()
  const [showPassword, setShowPassword] = useState(false)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className="text-xs uppercase text-muted-foreground">
          {label}
        </Label>
        <InfoHint contentClassName="max-w-xs">
          <p className="text-xs">{helpText}</p>
        </InfoHint>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative sm:flex-1">
          {/* NOT type="password": Chrome ignores autoComplete="off" on password
              fields and offers saved-login autofill (these aren't credentials).
              Stay type="text" and mask via -webkit-text-security so no password
              manager latches on, plus the usual ignore attributes. */}
          <Input
            id={id}
            name={id}
            type="text"
            placeholder={placeholder}
            className={cn("pr-10", !showPassword && "[-webkit-text-security:disc]")}
            value={value || ''}
            onChange={(event) => onChange(event.target.value)}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            data-form-type="other"
            disabled={disabled}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            disabled={disabled}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={showPassword ? t.settings.hideKey : t.settings.showKey}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="flex gap-2 sm:w-auto">
          <Button size="sm" onClick={onSave} disabled={disabled || !value?.trim()}>
            {t.settings.saveKey}
          </Button>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="sm" variant="outline" onClick={onClear} disabled={disabled}>
                  {t.settings.clear}
                </Button>
              </TooltipTrigger>
              {clearWarning && (
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">{clearWarning}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  )
}

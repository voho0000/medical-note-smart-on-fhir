// API Key Input Component
import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { useLanguage } from "@/src/application/providers/language.provider"

interface ApiKeyInputProps {
  id: string
  label: string
  placeholder: string
  value: string
  onChange: (value: string) => void
  onSave: () => void
  onClear: () => void
  helpText: string
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
}: ApiKeyInputProps) {
  const { t } = useLanguage()
  const [showPassword, setShowPassword] = useState(false)
  
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs uppercase text-muted-foreground">
        {label}
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative sm:flex-1">
          <Input
            id={id}
            type={showPassword ? "text" : "password"}
            placeholder={placeholder}
            className="pr-10"
            value={value || ''}
            onChange={(event) => onChange(event.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={showPassword ? "隱藏 API key" : "顯示 API key"}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="flex gap-2 sm:w-auto">
          <Button size="sm" onClick={onSave} disabled={!value?.trim()}>
            {t.settings.saveKey}
          </Button>
          <Button size="sm" variant="outline" onClick={onClear}>
            {t.settings.clear}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{helpText}</p>
    </div>
  )
}

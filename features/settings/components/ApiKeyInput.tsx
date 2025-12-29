// API Key Input Component
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"

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
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-xs uppercase text-muted-foreground">
        {label}
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={id}
          type="password"
          placeholder={placeholder}
          className="sm:flex-1"
          value={value || ''}
          onChange={(event) => onChange(event.target.value)}
        />
        <div className="flex gap-2 sm:w-auto">
          <Button size="sm" onClick={onSave} disabled={!value?.trim()}>
            Save key
          </Button>
          <Button size="sm" variant="outline" onClick={onClear}>
            Clear
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{helpText}</p>
    </div>
  )
}

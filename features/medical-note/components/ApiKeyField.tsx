// features/medical-note/components/ApiKeyField.tsx
"use client"

import { useState } from "react"
import { useApiKey } from "@/lib/providers/ApiKeyProvider"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function ApiKeyField() {
  const { apiKey, setApiKey, clearApiKey } = useApiKey()
  const [value, setValue] = useState(apiKey)

  return (
    // ↓ tighter vertical spacing
    <div className="max-w-xl space-y-1">
      {/* ↓ smaller label */}
      <label htmlFor={`api-key-${Date.now()}`} className="text-xs text-muted-foreground">
        OpenAI API key（僅保存在本機瀏覽器）
      </label>
      {/* ↓ smaller gap */}
      <div className="flex gap-1.5">
        <Input
          id={`api-key-${Date.now()}`}
          type="password"
          placeholder="sk-..."
          className="h-8 text-sm"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {/* ↓ small buttons */}
        <Button size="sm" onClick={() => setApiKey(value)} disabled={!value}>Save</Button>
        <Button size="sm" variant="outline" onClick={() => { setValue(""); clearApiKey() }}>Clear</Button>
      </div>
      {!apiKey && (
        <p className="text-[11px] leading-tight text-muted-foreground">
          尚未設定金鑰，ASR 與 GPT 功能將無法呼叫 OpenAI。
        </p>
      )}
    </div>
  )
}
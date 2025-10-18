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
    <div className="max-w-xl space-y-2">
      <label htmlFor="openai-key" className="text-sm text-muted-foreground">
        OpenAI API key（僅保存在本機瀏覽器）
      </label>
      <div className="flex gap-2">
        <Input
          id="openai-key"
          type="password"
          placeholder="sk-..."
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <Button onClick={() => setApiKey(value)} disabled={!value}>Save</Button>
        <Button variant="outline" onClick={() => { setValue(""); clearApiKey() }}>Clear</Button>
      </div>
      {!apiKey && (
        <p className="text-xs text-muted-foreground">
          尚未設定金鑰，ASR 與 GPT 功能將無法呼叫 OpenAI。
        </p>
      )}
    </div>
  )
}

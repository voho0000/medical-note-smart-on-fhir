// components/recording/PromptEditor.tsx
"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"

type Props = {
  prompt: string
  setPrompt: (v: string) => void
  title?: string
}

export function PromptEditor({ prompt, setPrompt, title = "Prompt" }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Enter your prompt here"
          className="min-h-[120px]"
          spellCheck={false}
        />
      </CardContent>
    </Card>
  )
}

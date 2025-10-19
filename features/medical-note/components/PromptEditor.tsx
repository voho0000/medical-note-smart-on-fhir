// features/medical-note/components/PromptEditor.tsx
"use client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { useNote } from "../providers/NoteProvider"

export function PromptEditor({ title = "Prompt" }: { title?: string }) {
  const { prompt, setPrompt } = useNote()
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <Textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} className="min-h-[60px]" spellCheck={false} />
      </CardContent>
    </Card>
  )
}

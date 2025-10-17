// components/GptPanel.tsx
"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useApiKey } from "./ApiKeyProvider"

export type PatientLite = { name?: { given?: string[]; family?: string }[]; gender?: string; birthDate?: string }

function calculateAge(b?: string) {
  if (!b) return "N/A"
  const d = new Date(b); if (Number.isNaN(d.getTime())) return "N/A"
  const t = new Date(); let a = t.getFullYear() - d.getFullYear()
  const m = t.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--
  return a
}

export function GptPanel({
  prompt, asrText, gptResponse, setGptResponse, model = "gpt-4.1", patient
}: {
  prompt: string; asrText: string; gptResponse: string; setGptResponse: (v: string) => void; model?: string; patient?: PatientLite | null
}) {
  const { apiKey } = useApiKey()
  const [isGenerating, setIsGenerating] = useState(false)

  async function handleGptRequest() {
    if (!apiKey) { alert("請先在上方輸入 OpenAI API key"); return }
    setIsGenerating(true)

    const patientInfo = patient
      ? `Patient Info:
Name: ${patient.name?.[0]?.given?.join(" ") || "N/A"} ${patient.name?.[0]?.family || "N/A"}
Gender: ${patient.gender || "N/A"}
Age: ${patient.birthDate ? calculateAge(patient.birthDate) : "N/A"}`
      : "No patient information available."

    const fullPrompt = `${patientInfo}\n\nASR Content:\n${asrText}\n\n${prompt}`

    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: fullPrompt }] })
      })
      const j = await r.json()
      setGptResponse(j?.choices?.[0]?.message?.content || "No response received")
    } catch (e) {
      console.error(e)
      setGptResponse("Failed to generate GPT response.")
    } finally { setIsGenerating(false) }
  }

  return (
    <Card>
      <CardHeader><CardTitle>GPT Response</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Textarea value={gptResponse} onChange={(e) => setGptResponse(e.target.value)} placeholder="GPT response will appear here" className="min-h-[200px]" spellCheck={false} />
        <Button onClick={handleGptRequest} disabled={isGenerating}>
          {isGenerating ? "Generating…" : "Generate GPT Response"}
        </Button>
      </CardContent>
    </Card>
  )
}

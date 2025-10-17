"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { PatientInfoCard } from "../components/PatientInfoCard"
import { ApiKeyField } from "../components/ApiKeyField"
// ⬇️ 以動態載入並停用 SSR 的方式載入會用到瀏覽器 API 的元件
const AsrPanel = dynamic(
  () => import("../components/AsrPanel").then((m) => m.AsrPanel),
  { ssr: false }
)
import { PromptEditor } from "../components/PromptEditor"
import { GptPanel } from "../components/GptPanel"
import { useSmartPatient } from "../lib/useSmartPatient"

export default function Page() {
  const { patient, loading } = useSmartPatient()
  const [asrText, setAsrText] = useState("")
  const [prompt, setPrompt] = useState("Generate Medical Summary")
  const [gptResponse, setGptResponse] = useState("")

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
    <h1 className="text-3xl font-semibold text-center">
      Medical Note · SMART on FHIR
    </h1>
      {loading ? (
        <div className="rounded-md border p-4 text-sm text-muted-foreground">Loading patient…</div>
      ) : (
        <PatientInfoCard patient={patient} />
      )}

      <ApiKeyField />
      <AsrPanel asrText={asrText} setAsrText={setAsrText} />
      <PromptEditor prompt={prompt} setPrompt={setPrompt} />
      <GptPanel
        prompt={prompt}
        asrText={asrText}
        gptResponse={gptResponse}
        setGptResponse={setGptResponse}
        patient={patient}
      />
    </div>
  )
}

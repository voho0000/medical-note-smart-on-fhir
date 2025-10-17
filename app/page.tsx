// app/page.tsx
"use client"

import { useState } from "react"
import { PatientInfoCard } from "../components/PatientInfoCard"
import { ApiKeyField } from "../components/ApiKeyField"
import { AsrPanel } from "../components/AsrPanel"
import { PromptEditor } from "../components/PromptEditor"
import { GptPanel } from "../components/GptPanel"

export default function Page() {
  const patient = { name: [{ given: ["Jane"], family: "Doe" }], gender: "female", birthDate: "1987-05-12" }
  const [asrText, setAsrText] = useState("")
  const [prompt, setPrompt] = useState("Generate Medical Summary")
  const [gptResponse, setGptResponse] = useState("")

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-6">
      <h1 className="text-3xl font-semibold text-center">SMART on FHIR App</h1>
      <PatientInfoCard patient={patient} />
      <ApiKeyField />
      <AsrPanel asrText={asrText} setAsrText={setAsrText} />
      <PromptEditor prompt={prompt} setPrompt={setPrompt} />
      <GptPanel prompt={prompt} asrText={asrText} gptResponse={gptResponse} setGptResponse={setGptResponse} patient={patient} />
    </div>
  )
}

// features/medical-note/Feature.tsx
"use client"

import { NoteProvider } from "./providers/NoteProvider"
import { ApiKeyField } from "./components/ApiKeyField"
import { AsrPanel } from "./components/AsrPanel"
import { PromptEditor } from "./components/PromptEditor"
import { GptPanel } from "./components/GptPanel"
import { usePatient } from "@/lib/providers/PatientProvider"

export default function MedicalNoteFeature() {
  const { patient } = usePatient()
  return (
    <NoteProvider>
      <div className="space-y-6">
        <ApiKeyField />
        <AsrPanel />
        <PromptEditor />
        <GptPanel patient={patient ?? undefined} />
      </div>
    </NoteProvider>
  )
}

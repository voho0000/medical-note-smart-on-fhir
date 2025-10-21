// features/medical-note/components/GptPanel.tsx
"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { useNote } from "../providers/NoteProvider"
import { usePatient } from "@/lib/providers/PatientProvider"
import { useApiKey } from "@/lib/providers/ApiKeyProvider"
import { useGptQuery } from "../hooks/useGptQuery"
import { useClinicalContext } from "@/features/data-selection/hooks/useClinicalContext"

type PatientLite = { 
  name?: { given?: string[]; family?: string }[]; 
  gender?: string; 
  birthDate?: string 
}

function calculateAge(birthDate?: string): string {
  if (!birthDate) return "N/A"
  const birth = new Date(birthDate)
  if (isNaN(birth.getTime())) return "N/A"
  
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--
  }
  
  return age.toString()
}

export function GptPanel({ 
  patient, 
  defaultModel = "gpt-4" 
}: { 
  patient?: PatientLite | null 
  defaultModel?: string 
}) {
  const { patient: currentPatient } = usePatient()
  const { asrText, prompt, model, setModel } = useNote()
  const { getFormattedClinicalContext } = useClinicalContext()
  
  const { queryGpt, isLoading, error, response: gptResponse } = useGptQuery({
    defaultModel: defaultModel
  })
  const { apiKey } = useApiKey()
  const [displayResponse, setDisplayResponse] = useState("")
  const [isEdited, setIsEdited] = useState(false)

  const validateApiKey = () => {
    if (!apiKey) {
      alert('請先輸入 OpenAI API key')
      return false
    }
    return true
  }

  const handleGptRequest = async () => {
    if (!validateApiKey()) return
    
    try {
      // 1. Get de-identified patient info
      const patientInfo = currentPatient
        ? `Patient ID: ${currentPatient.id || 'N/A'}
        Gender: ${currentPatient.gender || "N/A"}
        Age: ${currentPatient.birthDate ? calculateAge(currentPatient.birthDate) : "N/A"}`
        : "No patient information available."
      
      // Log original patient info (for debugging, not sent to GPT)
      if (currentPatient) {
        console.log('Original Patient Info (not sent to GPT):', {
          name: `${currentPatient.name?.[0]?.given?.join(" ") || ""} ${currentPatient.name?.[0]?.family || ""}`.trim() || 'N/A',
          gender: currentPatient.gender,
          birthDate: currentPatient.birthDate,
          id: currentPatient.id
        })
      }

      console.log('Patient Info:', patientInfo)

      // 2. Get selected clinical data context
      const clinicalContext = getFormattedClinicalContext()
      console.log('Raw Clinical Context:', clinicalContext)
      
      // Define types for clinical context
      interface ClinicalContextSection {
        title?: string;
        items?: (string | { [key: string]: any })[] | string;
      }
      
      // Format the clinical context for display
      const formatClinicalContext = (context: ClinicalContextSection[] | string | null | undefined): string => {
        if (!context) return 'No clinical data selected';
        
        if (Array.isArray(context)) {
          return context
            .map((section: ClinicalContextSection) => {
              if (!section) return '';
              const title = section.title || 'Untitled';
              const items = Array.isArray(section.items) 
                ? section.items.map((item: any) => `- ${typeof item === 'object' ? JSON.stringify(item) : item}`).join('\n')
                : String(section.items || '');
              return `${title}:\n${items}`;
            })
            .filter(Boolean)
            .join('\n\n');
        }
        
        return String(context);
      };
      
      const formattedContext = formatClinicalContext(clinicalContext);
      console.log('Formatted Clinical Context:', formattedContext);

      // 3. Combine all context into the prompt
      const fullPrompt = `## Patient Information\n${patientInfo}\n\n## Clinical Context\n${formattedContext}\n\n## Note\n${asrText || 'No note provided.'}\n\n## Instruction\n${prompt || 'Generate Medical Summary'}`

      console.log('Full Prompt:', fullPrompt)

      // 4. Make the API call
      // The response will be set by the useGptQuery hook
      await queryGpt([
        { 
          role: 'system', 
          content: 'You are a helpful medical assistant. Provide clear and concise responses based on the patient information and clinical context provided.' 
        },
        { 
          role: 'user', 
          content: fullPrompt 
        }
      ], model || defaultModel)
    } catch (err) {
      console.error('Error in handleGptRequest:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate GPT response'
      console.error('Error details:', { error: err })
      setDisplayResponse(`Error: ${errorMessage}`)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>GPT Response</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {/* 若之後要加模型選單，可用 <Select> 改 setModel */}
        <Textarea 
          value={isEdited ? displayResponse : (gptResponse || displayResponse || '')} 
          onChange={(e) => {
            if (!isEdited) setIsEdited(true);
            setDisplayResponse(e.target.value)
          }} 
          placeholder="GPT response will appear here..." 
          className="min-h-[80px]"
        />
        <Button onClick={handleGptRequest} disabled={isLoading}>
          {isLoading ? "Generating…" : "Generate GPT Response"}
        </Button>
      </CardContent>
    </Card>
  )
}

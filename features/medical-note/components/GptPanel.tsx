// features/medical-note/components/GptPanel.tsx
"use client"

import { useState, useCallback, useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { useNote } from "../providers/NoteProvider"
import { usePatient } from "@/lib/providers/PatientProvider"
import { useApiKey } from "@/lib/providers/ApiKeyProvider"
import { useGptQuery, type QueryMetadata } from "../hooks/useGptQuery"
import { useClinicalContext } from "@/features/data-selection/hooks/useClinicalContext"
import { useGptResponse } from "../context/GptResponseContext"
import { DEFAULT_MODEL_ID, getModelDefinition, isBuiltInModelId } from "@/features/medical-note/constants/models"
import { hasChatProxy, hasGeminiProxy } from "@/lib/config/ai"
import { useDataSelection } from "@/features/data-selection/hooks/useDataSelection"

interface PatientLite { 
  name?: Array<{ 
    given?: string[]; 
    family?: string 
  }>; 
  gender?: string; 
  birthDate?: string;
}

interface ClinicalContextSection {
  title?: string;
  items?: Array<string | Record<string, unknown>> | string;
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
  patient
}: { 
  patient?: PatientLite | null 
}) {
  const { patient: currentPatient } = usePatient()
  const { asrText, prompt, model } = useNote()
  const { getFullClinicalContext } = useClinicalContext()
  const { isAnySelected } = useDataSelection()
  
  const { setGptResponse, setIsGenerating } = useGptResponse();
  
  const { queryGpt, isLoading, error, response: gptResponse } = useGptQuery({
    defaultModel: DEFAULT_MODEL_ID,
    onResponse: (response, metadata) => {
      setGptResponse(response);
      setDisplayResponse(response);
      setResponseMetadata(metadata);
      setIsGenerating(false);
    },
    onError: (error) => {
      console.error('GPT Error:', error);
      setDisplayResponse(`Error: ${error.message}`);
      setIsGenerating(false);
    }
  });
  
  const { apiKey, geminiKey } = useApiKey();
  const [displayResponse, setDisplayResponse] = useState("");
  const [isEdited, setIsEdited] = useState(false);
  const [responseMetadata, setResponseMetadata] = useState<QueryMetadata | null>(null);

  const handleGenerate = useCallback(async () => {
    const definition = getModelDefinition(model)
    const provider = definition?.provider ?? "openai"

    if (provider === "openai") {
      if (!apiKey && definition?.requiresUserKey) {
        alert("Enter your OpenAI API key in Settings to use this GPT model.")
        return
      }

      if (!apiKey && !hasChatProxy) {
        alert("Configure the PrismaCare chat proxy or add an OpenAI key before using GPT models.")
        return
      }
    } else if (provider === "gemini" && !geminiKey && !hasGeminiProxy) {
      alert("Configure the PrismaCare Gemini proxy or add a Gemini key before using this model.")
      return
    }

    try {
      setIsGenerating(true);
      setDisplayResponse('');
      setResponseMetadata(null);
      
      const clinicalContext = getFullClinicalContext();
      
      // Only include patient info if any data is selected
      let fullPrompt = '';
      if (isAnySelected) {
        const patientInfo = patient || currentPatient;
        const patientDetails = patientInfo ? [
          `Gender: ${patientInfo.gender || 'Unknown'}`,
          `Age: ${calculateAge(patientInfo.birthDate)}`
        ].join('\n') : 'No patient information available.';
        
        fullPrompt = [
          '## Patient Information',
          patientDetails,
          '\n## Clinical Context',
          clinicalContext,
          asrText ? '\n## Additional Notes from ASR\n' + asrText : '',
          '\n## Instruction\n' + (prompt || 'Generate a clinical note based on the above information.')
        ].join('\n');
      } else {
        fullPrompt = [
          '## Clinical Context',
          'No clinical data available.',
          asrText ? '\n## Additional Notes from ASR\n' + asrText : '',
          '\n## Instruction\n' + (prompt || 'Generate a clinical note based on the above information.')
        ].join('\n');
      }

      console.log('Sending prompt to GPT:', fullPrompt);
      
      // Call GPT with the full prompt as a user message
      await queryGpt([
        { 
          role: 'system' as const, 
          content: 'You are a helpful medical assistant. Provide clear and concise responses based on the patient information and clinical context provided.' 
        },
        { 
          role: 'user' as const, 
          content: fullPrompt 
        }
      ], model);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate response';
      console.error('Error generating response:', error);
      setDisplayResponse(`Error: ${errorMessage}`);
      alert('Error generating response. Please check the console for details.');
    } finally {
      setIsGenerating(false);
    }
  }, [
    asrText, 
    currentPatient, 
    getFullClinicalContext, 
    isAnySelected,
    model, 
    patient, 
    prompt, 
    queryGpt, 
    setIsGenerating, 
    setGptResponse
  ]);

  const handleResponseChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDisplayResponse(e.target.value);
    setIsEdited(true);
  }, []);

  const selectedModel = useMemo(() => {
    const definition = getModelDefinition(model)
    if (!definition) return null
    return {
      label: definition.label,
      provider: definition.provider,
    }
  }, [model]);

  const headerModelInfo = useMemo(() => {
    // Always show the currently selected model
    if (selectedModel) {
      return {
        label: selectedModel.label,
        provider: selectedModel.provider.toUpperCase(),
      }
    }

    return {
      label: model,
      provider: "OPENAI",
    }
  }, [model, selectedModel]);

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle>AI Response</CardTitle>
        <p className="text-sm text-muted-foreground">
          Model: {headerModelInfo.label} ({headerModelInfo.provider})
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Textarea 
          value={displayResponse}
          onChange={handleResponseChange}
          placeholder="AI response will appear here..."
          className="min-h-[300px] font-mono text-sm"
          readOnly={isLoading}
        />
        <div className="flex justify-between items-center">
          <div className="text-sm text-muted-foreground">
            {isLoading ? 'Generating...' : isEdited ? 'Edited' : ''}
          </div>
          <Button 
            onClick={handleGenerate}
            disabled={isLoading}
            className="ml-auto"
          >
            {isLoading ? 'Generating...' : 'Generate'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

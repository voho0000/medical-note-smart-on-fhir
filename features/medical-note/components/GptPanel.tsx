// features/medical-note/components/GptPanel.tsx
"use client"

import { useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { useNote } from "../providers/NoteProvider"
import { usePatient } from "@/lib/providers/PatientProvider"
import { useApiKey } from "@/lib/providers/ApiKeyProvider"
import { useGptQuery } from "../hooks/useGptQuery"
import { useClinicalContext } from "@/features/data-selection/hooks/useClinicalContext"
import { useGptResponse } from "../context/GptResponseContext"

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
  patient, 
  defaultModel = "gpt-4" 
}: { 
  patient?: PatientLite | null 
  defaultModel?: string 
}) {
  const { patient: currentPatient } = usePatient()
  const { asrText, prompt, model, setModel } = useNote()
  const { getFormattedClinicalContext } = useClinicalContext()
  
  const { setGptResponse, setIsGenerating } = useGptResponse();
  
  const { queryGpt, isLoading, error, response: gptResponse } = useGptQuery({
    defaultModel: defaultModel,
    onResponse: (response) => {
      setGptResponse(response);
      setDisplayResponse(response);
      setIsGenerating(false);
    },
    onError: (error) => {
      console.error('GPT Error:', error);
      setDisplayResponse(`Error: ${error.message}`);
      setIsGenerating(false);
    }
  });
  
  const { apiKey } = useApiKey();
  const [displayResponse, setDisplayResponse] = useState("");
  const [isEdited, setIsEdited] = useState(false);

  const validateApiKey = useCallback(() => {
    if (!apiKey) {
      alert('Please enter your OpenAI API key');
      return false;
    }
    return true;
  }, [apiKey]);

  const formatClinicalContext = useCallback((context: unknown): string => {
    if (Array.isArray(context)) {
      return context
        .map((section: ClinicalContextSection) => {
          if (!section) return '';
          const title = section.title || 'Untitled';
          const items = Array.isArray(section.items) 
            ? section.items.map(item => `- ${typeof item === 'object' ? JSON.stringify(item) : item}`).join('\n')
            : String(section.items || '');
          return `${title}:\n${items}`;
        })
        .filter(Boolean)
        .join('\n\n');
    }
    return String(context);
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!validateApiKey()) return;
    if (!apiKey) {
      alert('Please set your API key in the settings');
      return;
    }

    try {
      setIsGenerating(true);
      setDisplayResponse('');
      
      const context = getFormattedClinicalContext();
      const patientInfo = patient || currentPatient;
      
      const patientDetails = patientInfo ? [
        `Patient: ${patientInfo.name?.[0]?.given?.[0] || 'Unknown'} ${patientInfo.name?.[0]?.family || ''}`,
        `Gender: ${patientInfo.gender || 'Unknown'}`,
        `Age: ${calculateAge(patientInfo.birthDate)}`
      ].join('\n') : 'No patient information available.';

      const formattedContext = formatClinicalContext(context);
      
      const fullPrompt = [
        '## Patient Information',
        patientDetails,
        '\n## Clinical Context',
        formattedContext,
        asrText ? '\n## Additional Notes from ASR\n' + asrText : '',
        '\n## Instruction\n' + (prompt || 'Generate a clinical note based on the above information.')
      ].join('\n');

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
      ]);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to generate response';
      console.error('Error generating response:', error);
      setDisplayResponse(`Error: ${errorMessage}`);
      alert('Error generating response. Please check the console for details.');
    } finally {
      setIsGenerating(false);
    }
  }, [
    apiKey, 
    asrText, 
    currentPatient, 
    formatClinicalContext, 
    getFormattedClinicalContext, 
    model, 
    patient, 
    prompt, 
    queryGpt, 
    setIsGenerating, 
    setGptResponse, 
    validateApiKey
  ]);

  const handleResponseChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setDisplayResponse(e.target.value);
    setIsEdited(true);
  }, []);

  return (
    <Card>
      <CardHeader><CardTitle>GPT Response</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <Textarea 
          value={displayResponse}
          onChange={handleResponseChange}
          placeholder="GPT response will appear here..."
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

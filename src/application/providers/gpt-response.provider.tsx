"use client"

import { createContext, useContext, useState, ReactNode } from 'react';

interface GptResponseContextType {
  gptResponse: string;
  setGptResponse: (response: string) => void;
  isGenerating: boolean;
  setIsGenerating: (isGenerating: boolean) => void;
}

const GptResponseContext = createContext<GptResponseContextType | undefined>(undefined);

export function GptResponseProvider({ children }: { children: ReactNode }) {
  const [gptResponse, setGptResponse] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  return (
    <GptResponseContext.Provider value={{ gptResponse, setGptResponse, isGenerating, setIsGenerating }}>
      {children}
    </GptResponseContext.Provider>
  );
}

export function useGptResponse() {
  const context = useContext(GptResponseContext);
  if (context === undefined) {
    throw new Error('useGptResponse must be used within a GptResponseProvider');
  }
  return context;
}

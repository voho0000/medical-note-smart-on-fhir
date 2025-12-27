"use client"

import { createContext, useContext, useState, ReactNode } from 'react';

interface AsrContextType {
  asrText: string;
  setAsrText: (text: string) => void;
  isAsrLoading: boolean;
  setIsAsrLoading: (isLoading: boolean) => void;
}

const AsrContext = createContext<AsrContextType | undefined>(undefined);

export function AsrProvider({ children }: { children: ReactNode }) {
  const [asrText, setAsrText] = useState('');
  const [isAsrLoading, setIsAsrLoading] = useState(false);

  return (
    <AsrContext.Provider value={{ asrText, setAsrText, isAsrLoading, setIsAsrLoading }}>
      {children}
    </AsrContext.Provider>
  );
}

export function useAsr() {
  const context = useContext(AsrContext);
  if (context === undefined) {
    throw new Error('useAsr must be used within an AsrProvider');
  }
  return context;
}

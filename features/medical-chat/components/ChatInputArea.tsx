// Chat Input Area Component
"use client"

import { Square } from "lucide-react"
import { useLanguage } from "@/src/application/providers/language.provider"
import { VoiceRecorder } from "./VoiceRecorder"

interface ChatInputAreaProps {
  input: {
    input: string
    setInput: (value: string | ((prev: string) => string)) => void
    handleKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>, handleSend: () => Promise<void>, isLoading?: boolean, disabled?: boolean) => void
  }
  textareaRef: React.RefObject<HTMLTextAreaElement | null>
  isLoading: boolean
  onSend: () => Promise<void>
  onStopGeneration: () => void
  voice: {
    isRecording: boolean
    isAsrLoading: boolean
    toggleRecording: () => void
    onRecordingStart: () => void
    onRecordingStop: (url: string, blob: Blob) => Promise<void>
    startRecordingRef: React.MutableRefObject<() => void>
    stopRecordingRef: React.MutableRefObject<() => void>
  }
  disabled?: boolean
}

export function ChatInputArea({
  input,
  textareaRef,
  isLoading,
  onSend,
  onStopGeneration,
  voice,
  disabled = false
}: ChatInputAreaProps) {
  const { t } = useLanguage()

  return (
    <>
      <div className="flex w-full gap-2 items-end">
        <div className="flex-1 flex flex-col justify-end">
          <textarea
            ref={textareaRef}
            value={input.input}
            onChange={(event) => input.setInput(event.target.value)}
            onKeyDown={(e) => input.handleKeyDown(e, onSend, isLoading, disabled)}
            placeholder={t.chat.placeholder}
            spellCheck={false}
            rows={1}
            className="w-full resize-none overflow-y-auto rounded-xl border-2 border-input bg-background/50 px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:ring-4 focus-visible:ring-blue-500/10 focus-visible:shadow-lg focus-visible:bg-background hover:border-input/80 hover:bg-background disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200"
            style={{ minHeight: '44px', maxHeight: '200px' }}
          />
        </div>
        <VoiceRecorder
          isRecording={voice.isRecording}
          isLoading={voice.isAsrLoading}
          onToggleRecording={voice.toggleRecording}
          onRecordingStart={voice.onRecordingStart}
          onRecordingStop={voice.onRecordingStop}
          startRecordingRef={voice.startRecordingRef}
          stopRecordingRef={voice.stopRecordingRef}
        />
        {isLoading ? (
          <button
            onClick={onStopGeneration}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 py-2"
          >
            <Square className="h-4 w-4 fill-current" />
            {t.common.stop}
          </button>
        ) : (
          <button
            onClick={() => onSend()}
            disabled={!input.input.trim() || isLoading || disabled}
            className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            {t.common.send}
          </button>
        )}
      </div>
      {input.input.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-muted-foreground/60">
          <span>{input.input.length} {t.chat.characters}</span>
        </div>
      )}
    </>
  )
}

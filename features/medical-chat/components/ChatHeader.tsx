"use client"

import { CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

interface ChatHeaderProps {
  recordingStatus?: string
  asrError?: string | null
  chatError?: Error | null
  isRecording?: boolean
  isAsrLoading?: boolean
}

export function ChatHeader({ recordingStatus, asrError, chatError, isRecording, isAsrLoading }: ChatHeaderProps) {
  return (
    <CardHeader className="space-y-1 pb-2">
      <div className="flex flex-col gap-0.5">
        <CardTitle className="text-base">Medical Note Chat</CardTitle>
        <p className="text-xs text-muted-foreground">
          Ask follow-up questions or dictate updates using the microphone.
        </p>
      </div>
      {recordingStatus || asrError || chatError ? (
        <div className="space-y-0.5 text-[11px]">
          {recordingStatus ? (
            <p className="flex items-center gap-2 text-muted-foreground">
              {isRecording ? (
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                </span>
              ) : isAsrLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : null}
              {recordingStatus}
            </p>
          ) : null}
          {asrError ? <p className="text-destructive">Voice input error: {asrError}</p> : null}
          {chatError ? <p className="text-destructive">Chat error: {chatError.message}</p> : null}
        </div>
      ) : null}
    </CardHeader>
  )
}

"use client"

import { useState } from "react"
import { CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/src/application/providers/language.provider"
import { Loader2, Eye, EyeOff, Edit, Save, RotateCcw } from "lucide-react"

interface ChatHeaderProps {
  recordingStatus?: string
  asrError?: string | null
  chatError?: Error | null
  isRecording?: boolean
  isAsrLoading?: boolean
  systemPrompt?: string
  onUpdateSystemPrompt?: (prompt: string) => void
  onResetSystemPrompt?: () => void
  isCustomPrompt?: boolean
}

export function ChatHeader({ 
  recordingStatus, 
  asrError, 
  chatError, 
  isRecording, 
  isAsrLoading, 
  systemPrompt,
  onUpdateSystemPrompt,
  onResetSystemPrompt,
  isCustomPrompt
}: ChatHeaderProps) {
  const { t } = useLanguage()
  const [showSystemPrompt, setShowSystemPrompt] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [editedPrompt, setEditedPrompt] = useState("")
  
  const handleEdit = () => {
    setEditedPrompt(systemPrompt || "")
    setIsEditing(true)
  }
  
  const handleSave = () => {
    if (onUpdateSystemPrompt && editedPrompt.trim()) {
      onUpdateSystemPrompt(editedPrompt.trim())
      setIsEditing(false)
    }
  }
  
  const handleCancel = () => {
    setIsEditing(false)
    setEditedPrompt("")
  }
  
  const handleReset = () => {
    if (onResetSystemPrompt) {
      onResetSystemPrompt()
      setIsEditing(false)
    }
  }
  
  return (
    <CardHeader className="space-y-1 pb-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5 flex-1">
          <CardTitle className="text-base">{t.chat.title}</CardTitle>
          <p className="text-xs text-muted-foreground">
            {t.chat.description}
          </p>
        </div>
        {systemPrompt && (
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSystemPrompt(!showSystemPrompt)}
              className="h-7 px-2 text-xs"
            >
              {showSystemPrompt ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
              System Prompt
            </Button>
          </div>
        )}
      </div>
      {showSystemPrompt && systemPrompt && (
        <div className="mt-2 space-y-2">
          {isEditing ? (
            <>
              <Textarea
                value={editedPrompt}
                onChange={(e) => setEditedPrompt(e.target.value)}
                className="min-h-32 text-xs font-mono"
                placeholder="Enter system prompt..."
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} className="h-7 text-xs">
                  <Save className="h-3 w-3 mr-1" />
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={handleCancel} className="h-7 text-xs">
                  Cancel
                </Button>
                {isCustomPrompt && (
                  <Button size="sm" variant="outline" onClick={handleReset} className="h-7 text-xs ml-auto">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset to Default
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="rounded-md bg-muted/50 p-3 text-xs font-mono whitespace-pre-wrap max-h-60 overflow-y-auto border">
                {systemPrompt}
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleEdit} className="h-7 text-xs">
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                {isCustomPrompt && (
                  <Button size="sm" variant="outline" onClick={handleReset} className="h-7 text-xs">
                    <RotateCcw className="h-3 w-3 mr-1" />
                    Reset to Default
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
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
          {asrError ? <p className="text-destructive">{t.chat.voiceInputError} {asrError}</p> : null}
          {chatError ? <p className="text-destructive">{t.chat.chatError} {chatError.message}</p> : null}
        </div>
      ) : null}
    </CardHeader>
  )
}

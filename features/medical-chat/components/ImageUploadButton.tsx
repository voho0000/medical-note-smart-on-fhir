/**
 * Image Upload Button Component
 * 
 * Single Responsibility: Handle file selection and drag-drop
 * Similar to ChatGPT/Gemini - paperclip icon with file input
 */

import { useRef, useCallback } from 'react'
import { Paperclip, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface ImageUploadButtonProps {
  onFilesSelected: (files: File[]) => void
  disabled?: boolean
  isProcessing?: boolean
  multiple?: boolean
}

export function ImageUploadButton({
  onFilesSelected,
  disabled,
  isProcessing,
  multiple = true
}: ImageUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleClick = useCallback(() => {
    fileInputRef.current?.click()
  }, [])

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length > 0) {
      onFilesSelected(files)
    }
    // Reset input to allow selecting the same file again
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [onFilesSelected])

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        multiple={multiple}
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        onClick={handleClick}
        disabled={disabled || isProcessing}
        className="h-10 w-10 shrink-0"
        title="Upload image"
      >
        {isProcessing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Paperclip className="h-4 w-4" />
        )}
      </Button>
    </>
  )
}

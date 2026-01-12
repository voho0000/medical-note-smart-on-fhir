// Textarea Auto Resize Hook
import { useEffect } from 'react'

const TEXTAREA_MIN_HEIGHT = 40
const TEXTAREA_MAX_HEIGHT = 200

export function useTextareaAutoResize(
  textareaRef: React.RefObject<HTMLTextAreaElement | null>,
  inputValue: string
) {
  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    
    textarea.style.height = 'auto'
    
    const newHeight = Math.min(
      Math.max(textarea.scrollHeight, TEXTAREA_MIN_HEIGHT),
      TEXTAREA_MAX_HEIGHT
    )
    
    textarea.style.height = `${newHeight}px`
  }, [inputValue, textareaRef])
}

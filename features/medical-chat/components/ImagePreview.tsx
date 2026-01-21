/**
 * Image Preview Component
 * 
 * Single Responsibility: Display uploaded images with remove functionality
 * Similar to ChatGPT/Gemini UI - compact grid with hover effects
 */

import { X } from 'lucide-react'
import type { ImageFile } from '../hooks/useImageUpload'

interface ImagePreviewProps {
  images: ImageFile[]
  onRemove: (index: number) => void
  disabled?: boolean
}

export function ImagePreview({ images, onRemove, disabled }: ImagePreviewProps) {
  if (images.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2 p-2">
      {images.map((image, index) => (
        <div
          key={index}
          className="relative group rounded-lg overflow-hidden border border-border bg-muted"
          style={{ width: '80px', height: '80px' }}
        >
          <img
            src={image.preview}
            alt={image.file.name || `Image ${index + 1}`}
            className="w-full h-full object-cover"
          />
          {!disabled && (
            <button
              onClick={() => onRemove(index)}
              className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              title="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 truncate">
            {image.file.name}
          </div>
        </div>
      ))}
    </div>
  )
}

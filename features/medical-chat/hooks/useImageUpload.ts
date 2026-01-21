/**
 * Simplified Image Upload Hook
 * 
 * Uses File objects directly with Object URLs for preview
 * Delegates image processing to Firebase Proxy (base64 conversion)
 * Much simpler and more performant than client-side processing
 */

import { useState, useCallback } from 'react'

export interface ImageFile {
  file: File
  preview: string  // Object URL for preview
}

export interface ImageUploadState {
  images: ImageFile[]
  isProcessing: boolean
  error: string | null
}

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export function useImageUpload() {
  const [state, setState] = useState<ImageUploadState>({
    images: [],
    isProcessing: false,
    error: null
  })

  const validateFile = (file: File): string | null => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return `Invalid file type: ${file.type}. Supported: JPEG, PNG, GIF, WebP`
    }
    
    if (file.size > MAX_FILE_SIZE) {
      return `File too large: ${(file.size / 1024 / 1024).toFixed(2)}MB. Max: 10MB`
    }
    
    return null
  }

  const addImages = useCallback(async (files: File[]) => {
    setState(prev => ({ ...prev, isProcessing: true, error: null }))

    try {
      const validImages: ImageFile[] = []

      for (const file of files) {
        // Validate file
        const error = validateFile(file)
        if (error) {
          throw new Error(error)
        }

        // Create preview URL (no processing needed!)
        const preview = URL.createObjectURL(file)
        
        validImages.push({
          file,
          preview
        })
      }

      setState(prev => ({
        images: [...prev.images, ...validImages],
        isProcessing: false,
        error: null
      }))
    } catch (error) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: error instanceof Error ? error.message : 'Failed to process image'
      }))
    }
  }, [])

  const removeImage = useCallback((index: number) => {
    setState(prev => {
      // Revoke object URL to free memory
      const imageToRemove = prev.images[index]
      if (imageToRemove) {
        URL.revokeObjectURL(imageToRemove.preview)
      }
      
      return {
        ...prev,
        images: prev.images.filter((_, i) => i !== index)
      }
    })
  }, [])

  const clearImages = useCallback(() => {
    setState(prev => {
      // Revoke all object URLs to free memory
      prev.images.forEach(img => URL.revokeObjectURL(img.preview))
      
      return {
        images: [],
        isProcessing: false,
        error: null
      }
    })
  }, [])

  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }))
  }, [])

  return {
    images: state.images,
    isProcessing: state.isProcessing,
    error: state.error,
    addImages,
    removeImage,
    clearImages,
    clearError
  }
}

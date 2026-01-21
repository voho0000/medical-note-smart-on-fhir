/**
 * Simplified Image Upload Hook
 * 
 * Uses File objects directly with Object URLs for preview
 * Delegates image processing to Firebase Proxy (base64 conversion)
 * Much simpler and more performant than client-side processing
 */

import { useState, useCallback } from 'react'
import { useLanguage } from '@/src/application/providers/language.provider'

export interface ImageFile {
  file: File
  preview: string  // Object URL for preview
}

export interface ImageUploadState {
  images: ImageFile[]
  isProcessing: boolean
  error: string | null
}

const MAX_FILE_SIZE = 20 * 1024 * 1024 // 20MB per image (OpenAI API limit)
const WARNING_FILE_SIZE = 5 * 1024 * 1024 // 5MB (performance warning)
const MAX_TOTAL_SIZE = 20 * 1024 * 1024 // 20MB total for all images
const MAX_IMAGES = 10 // Maximum number of images
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export function useImageUpload() {
  const { t } = useLanguage()
  const [state, setState] = useState<ImageUploadState>({
    images: [],
    isProcessing: false,
    error: null
  })

  const validateFile = (file: File): { error: string | null; warning: string | null } => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      return {
        error: t.chat.imageUpload.invalidType.replace('{type}', file.type),
        warning: null
      }
    }
    
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(2)
      return {
        error: t.chat.imageUpload.fileTooLarge.replace('{size}', sizeMB),
        warning: null
      }
    }
    
    // Warning for large files (but still allowed)
    if (file.size > WARNING_FILE_SIZE) {
      const sizeMB = (file.size / 1024 / 1024).toFixed(2)
      return {
        error: null,
        warning: t.chat.imageUpload.largeFileWarning.replace('{size}', sizeMB)
      }
    }
    
    return { error: null, warning: null }
  }

  const addImages = useCallback(async (files: File[]) => {
    // Use functional setState to get current state
    let shouldProcess = true
    let errorMessage = ''
    
    setState(prev => {
      const currentCount = prev.images.length
      const newCount = currentCount + files.length
      
      // Check image count limit
      if (newCount > MAX_IMAGES) {
        shouldProcess = false
        errorMessage = t.chat.imageUpload.tooManyImages
          .replace('{max}', String(MAX_IMAGES))
          .replace('{current}', String(currentCount))
          .replace('{adding}', String(files.length))
        return {
          ...prev,
          error: errorMessage
        }
      }
      
      // Check total size limit
      const currentTotalSize = prev.images.reduce((sum, img) => sum + img.file.size, 0)
      const newFilesSize = files.reduce((sum, file) => sum + file.size, 0)
      const totalSize = currentTotalSize + newFilesSize
      
      if (totalSize > MAX_TOTAL_SIZE) {
        shouldProcess = false
        const currentMB = (currentTotalSize / 1024 / 1024).toFixed(2)
        const newMB = (newFilesSize / 1024 / 1024).toFixed(2)
        const totalMB = (totalSize / 1024 / 1024).toFixed(2)
        errorMessage = t.chat.imageUpload.totalSizeExceeded
          .replace('{current}', currentMB)
          .replace('{adding}', newMB)
          .replace('{total}', totalMB)
        return {
          ...prev,
          error: errorMessage
        }
      }
      
      return { ...prev, isProcessing: true, error: null }
    })
    
    if (!shouldProcess) {
      return
    }

    try {
      const validImages: ImageFile[] = []
      const warnings: string[] = []

      for (const file of files) {
        // Validate file
        const validation = validateFile(file)
        if (validation.error) {
          throw new Error(validation.error)
        }
        
        if (validation.warning) {
          warnings.push(validation.warning)
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
        error: warnings.length > 0 ? warnings.join(' ') : null
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

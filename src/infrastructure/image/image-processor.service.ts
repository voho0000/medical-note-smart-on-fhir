/**
 * Image Processing Service
 * 
 * Single Responsibility: Handle image compression, thumbnail generation, and format conversion
 * Follows SOLID principles - this service only handles image processing logic
 */

export interface ImageProcessingOptions {
  maxWidth?: number
  maxHeight?: number
  quality?: number
  mimeType?: string
}

export interface ProcessedImage {
  data: string        // base64 data URL
  mimeType: string
  width: number
  height: number
  size: number        // size in bytes
}

export class ImageProcessorService {
  private static readonly DEFAULT_THUMBNAIL_SIZE = 200
  private static readonly DEFAULT_MAX_SIZE = 1920
  private static readonly DEFAULT_QUALITY = 0.85
  private static readonly THUMBNAIL_QUALITY = 0.7

  /**
   * Convert File to base64 data URL
   */
  async fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  /**
   * Load image from File or base64
   */
  private async loadImage(source: File | string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      
      if (typeof source === 'string') {
        img.src = source
      } else {
        const url = URL.createObjectURL(source)
        img.src = url
        img.onload = () => {
          URL.revokeObjectURL(url)
          resolve(img)
        }
      }
    })
  }

  /**
   * Calculate new dimensions while maintaining aspect ratio
   */
  private calculateDimensions(
    originalWidth: number,
    originalHeight: number,
    maxWidth: number,
    maxHeight: number
  ): { width: number; height: number } {
    let width = originalWidth
    let height = originalHeight

    if (width > maxWidth) {
      height = (height * maxWidth) / width
      width = maxWidth
    }

    if (height > maxHeight) {
      width = (width * maxHeight) / height
      height = maxHeight
    }

    return { width: Math.round(width), height: Math.round(height) }
  }

  /**
   * Compress and resize image
   */
  async processImage(
    source: File | string,
    options: ImageProcessingOptions = {}
  ): Promise<ProcessedImage> {
    const {
      maxWidth = ImageProcessorService.DEFAULT_MAX_SIZE,
      maxHeight = ImageProcessorService.DEFAULT_MAX_SIZE,
      quality = ImageProcessorService.DEFAULT_QUALITY,
      mimeType = 'image/jpeg'
    } = options

    const img = await this.loadImage(source)
    const { width, height } = this.calculateDimensions(
      img.width,
      img.height,
      maxWidth,
      maxHeight
    )

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      throw new Error('Failed to get canvas context')
    }

    ctx.drawImage(img, 0, 0, width, height)

    const data = canvas.toDataURL(mimeType, quality)
    const size = Math.round((data.length * 3) / 4) // Approximate size in bytes

    return {
      data,
      mimeType,
      width,
      height,
      size
    }
  }

  /**
   * Generate thumbnail (small compressed version for storage)
   */
  async generateThumbnail(source: File | string): Promise<ProcessedImage> {
    return this.processImage(source, {
      maxWidth: ImageProcessorService.DEFAULT_THUMBNAIL_SIZE,
      maxHeight: ImageProcessorService.DEFAULT_THUMBNAIL_SIZE,
      quality: ImageProcessorService.THUMBNAIL_QUALITY,
      mimeType: 'image/jpeg'
    })
  }

  /**
   * Validate image file
   */
  validateImage(file: File, maxSizeMB: number = 10): { valid: boolean; error?: string } {
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
    
    if (!validTypes.includes(file.type)) {
      return {
        valid: false,
        error: `Invalid file type. Supported: ${validTypes.join(', ')}`
      }
    }

    const maxSizeBytes = maxSizeMB * 1024 * 1024
    if (file.size > maxSizeBytes) {
      return {
        valid: false,
        error: `File too large. Maximum size: ${maxSizeMB}MB`
      }
    }

    return { valid: true }
  }

  /**
   * Get image dimensions without loading full image
   */
  async getImageDimensions(file: File): Promise<{ width: number; height: number }> {
    const img = await this.loadImage(file)
    return {
      width: img.width,
      height: img.height
    }
  }
}

// Singleton instance
export const imageProcessorService = new ImageProcessorService()

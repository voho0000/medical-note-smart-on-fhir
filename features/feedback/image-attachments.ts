import { fileToBase64 } from "@/src/shared/utils/file-to-base64.utils"

export const MAX_FEEDBACK_IMAGES = 3
export const MAX_FEEDBACK_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024
export const FEEDBACK_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp"
const MAX_FEEDBACK_IMAGE_DIMENSION = 2400

const FEEDBACK_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
])

export interface FeedbackImagePayload {
  contentType: string
  data: string
}

export type FeedbackImageValidationError =
  | { code: "too-many" }
  | { code: "invalid-type"; fileName: string }
  | { code: "empty"; fileName: string }
  | { code: "total-too-large" }
  | { code: "processing-failed"; fileName: string }

export function validateFeedbackImageFiles(
  currentFiles: File[],
  addedFiles: File[],
): FeedbackImageValidationError | null {
  if (currentFiles.length + addedFiles.length > MAX_FEEDBACK_IMAGES) {
    return { code: "too-many" }
  }

  for (const file of addedFiles) {
    if (!FEEDBACK_IMAGE_TYPES.has(file.type)) {
      return { code: "invalid-type", fileName: file.name }
    }
    if (file.size === 0) {
      return { code: "empty", fileName: file.name }
    }
  }

  const totalBytes = [...currentFiles, ...addedFiles]
    .reduce((sum, file) => sum + file.size, 0)
  if (totalBytes > MAX_FEEDBACK_TOTAL_IMAGE_BYTES) {
    return { code: "total-too-large" }
  }

  return null
}

export async function fileToFeedbackImagePayload(
  file: File,
): Promise<FeedbackImagePayload> {
  const dataUrl = await fileToBase64(file)
  const commaIndex = dataUrl.indexOf(",")
  if (commaIndex < 0 || commaIndex === dataUrl.length - 1) {
    throw new Error("Invalid image data")
  }

  return {
    contentType: file.type,
    data: dataUrl.slice(commaIndex + 1),
  }
}

interface DecodedImage {
  source: CanvasImageSource
  width: number
  height: number
  cleanup: () => void
}

async function decodeImage(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file)
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    }
  }

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error("Unable to decode image"))
      element.src = objectUrl
    })
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      cleanup: () => URL.revokeObjectURL(objectUrl),
    }
  } catch (error) {
    URL.revokeObjectURL(objectUrl)
    throw error
  }
}

/**
 * Re-encode a screenshot before it leaves the browser. Drawing only visible
 * pixels to a canvas removes EXIF and other embedded metadata, while the
 * dimension cap keeps high-DPI screenshots practical for email delivery.
 */
export async function prepareFeedbackImage(file: File): Promise<File> {
  let decoded: DecodedImage | null = null
  try {
    decoded = await decodeImage(file)
    if (decoded.width < 1 || decoded.height < 1) {
      throw new Error("Invalid image dimensions")
    }

    const scale = Math.min(
      1,
      MAX_FEEDBACK_IMAGE_DIMENSION / Math.max(decoded.width, decoded.height),
    )
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(decoded.width * scale))
    canvas.height = Math.max(1, Math.round(decoded.height * scale))
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Canvas is unavailable")
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(
        resolve,
        file.type,
        file.type === "image/png" ? undefined : 0.88,
      )
    })
    if (!blob || blob.size === 0) throw new Error("Unable to encode image")

    const encodedType = FEEDBACK_IMAGE_TYPES.has(blob.type)
      ? blob.type
      : "image/png"
    return new File([blob], file.name, {
      type: encodedType,
      lastModified: Date.now(),
    })
  } finally {
    decoded?.cleanup()
  }
}

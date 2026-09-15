export const MAX_FEEDBACK_IMAGES = 3
export const MAX_FEEDBACK_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024

const EXTENSION_BY_CONTENT_TYPE = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const

type FeedbackImageContentType = keyof typeof EXTENSION_BY_CONTENT_TYPE

export interface FeedbackImagePayload {
  contentType: string
  data: string
}

export interface ValidatedFeedbackImage {
  contentType: FeedbackImageContentType
  data: string
  extension: string
  size: number
}

type FeedbackImageValidationResult =
  | { ok: true; images: ValidatedFeedbackImage[] }
  | { ok: false; status: 400 | 413 }

const MAX_BASE64_LENGTH = Math.ceil(MAX_FEEDBACK_TOTAL_IMAGE_BYTES / 3) * 4

function hasCanonicalBase64Syntax(data: string): boolean {
  if (data.length % 4 !== 0) return false

  let contentLength = data.length
  if (data.endsWith("=")) {
    contentLength -= 1
    if (data[contentLength - 1] === "=") contentLength -= 1
  }

  for (let index = 0; index < contentLength; index += 1) {
    const code = data.charCodeAt(index)
    const isBase64Character = (
      (code >= 65 && code <= 90)
      || (code >= 97 && code <= 122)
      || (code >= 48 && code <= 57)
      || code === 43
      || code === 47
    )
    if (!isBase64Character) return false
  }

  for (let index = contentLength; index < data.length; index += 1) {
    if (data[index] !== "=") return false
  }

  return true
}

function hasExpectedSignature(
  bytes: Buffer,
  contentType: FeedbackImageContentType,
): boolean {
  if (contentType === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (contentType === "image/png") {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value)
  }

  return bytes.length >= 12
    && bytes.subarray(0, 4).toString("ascii") === "RIFF"
    && bytes.subarray(8, 12).toString("ascii") === "WEBP"
}

export function validateFeedbackImages(input: unknown): FeedbackImageValidationResult {
  if (input === undefined) return { ok: true, images: [] }
  if (!Array.isArray(input) || input.length > MAX_FEEDBACK_IMAGES) {
    return { ok: false, status: 400 }
  }

  const images: ValidatedFeedbackImage[] = []
  let totalBytes = 0

  for (const item of input) {
    if (!item || typeof item !== "object") return { ok: false, status: 400 }
    const { contentType, data } = item as Partial<FeedbackImagePayload>
    if (
      typeof contentType !== "string"
      || !Object.prototype.hasOwnProperty.call(EXTENSION_BY_CONTENT_TYPE, contentType)
      || typeof data !== "string"
      || data.length === 0
    ) {
      return { ok: false, status: 400 }
    }
    if (data.length > MAX_BASE64_LENGTH) return { ok: false, status: 413 }
    if (!hasCanonicalBase64Syntax(data)) return { ok: false, status: 400 }

    const typedContentType = contentType as FeedbackImageContentType
    const bytes = Buffer.from(data, "base64")
    if (bytes.toString("base64") !== data || !hasExpectedSignature(bytes, typedContentType)) {
      return { ok: false, status: 400 }
    }

    totalBytes += bytes.byteLength
    if (totalBytes > MAX_FEEDBACK_TOTAL_IMAGE_BYTES) {
      return { ok: false, status: 413 }
    }

    images.push({
      contentType: typedContentType,
      data,
      extension: EXTENSION_BY_CONTENT_TYPE[typedContentType],
      size: bytes.byteLength,
    })
  }

  return { ok: true, images }
}

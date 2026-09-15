import {
  MAX_FEEDBACK_TOTAL_IMAGE_BYTES,
  validateFeedbackImages,
} from "@/app/api/feedback/image-attachments"

const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
])

describe("feedback API image validation", () => {
  it("accepts a canonical base64 image whose signature matches its MIME type", () => {
    expect(validateFeedbackImages([{
      contentType: "image/png",
      data: PNG_HEADER.toString("base64"),
    }])).toEqual({
      ok: true,
      images: [{
        contentType: "image/png",
        data: PNG_HEADER.toString("base64"),
        extension: "png",
        size: PNG_HEADER.length,
      }],
    })
  })

  it("rejects malformed base64, MIME spoofing, and inherited object keys", () => {
    expect(validateFeedbackImages([{ contentType: "image/png", data: "not-base64" }]))
      .toEqual({ ok: false, status: 400 })
    expect(validateFeedbackImages([{
      contentType: "image/jpeg",
      data: PNG_HEADER.toString("base64"),
    }])).toEqual({ ok: false, status: 400 })
    expect(validateFeedbackImages([{
      contentType: "toString",
      data: Buffer.from("RIFF0000WEBP").toString("base64"),
    }])).toEqual({ ok: false, status: 400 })
  })

  it("rejects more than three images and more than 8 MB decoded data", () => {
    const image = { contentType: "image/png", data: PNG_HEADER.toString("base64") }
    expect(validateFeedbackImages([image, image, image, image]))
      .toEqual({ ok: false, status: 400 })

    const atLimit = Buffer.alloc(8 * 1024 * 1024)
    PNG_HEADER.copy(atLimit)
    const atLimitResult = validateFeedbackImages([{
      contentType: "image/png",
      data: atLimit.toString("base64"),
    }])
    expect(atLimitResult.ok).toBe(true)
    if (atLimitResult.ok) {
      expect(atLimitResult.images[0].size).toBe(MAX_FEEDBACK_TOTAL_IMAGE_BYTES)
    }

    const oversized = Buffer.alloc(MAX_FEEDBACK_TOTAL_IMAGE_BYTES + 1)
    PNG_HEADER.copy(oversized)
    expect(validateFeedbackImages([{
      contentType: "image/png",
      data: oversized.toString("base64"),
    }])).toEqual({ ok: false, status: 413 })
  })
})

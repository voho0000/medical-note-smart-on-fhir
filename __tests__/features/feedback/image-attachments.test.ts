import {
  MAX_FEEDBACK_TOTAL_IMAGE_BYTES,
  fileToFeedbackImagePayload,
  validateFeedbackImageFiles,
} from "@/features/feedback/image-attachments"

function imageFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type })
}

describe("feedback image attachments", () => {
  it("accepts up to three supported images within the shared size limit", () => {
    expect(MAX_FEEDBACK_TOTAL_IMAGE_BYTES).toBe(8 * 1024 * 1024)

    const files = [
      imageFile("one.png", "image/png", 100),
      imageFile("two.jpg", "image/jpeg", 200),
      imageFile("three.webp", "image/webp", 300),
    ]

    expect(validateFeedbackImageFiles([], files)).toBeNull()
    expect(validateFeedbackImageFiles([], [
      imageFile("limit.png", "image/png", 8 * 1024 * 1024),
    ])).toBeNull()
  })

  it("rejects too many, unsupported, empty, and oversized selections", () => {
    const png = () => imageFile("screen.png", "image/png", 1)

    expect(validateFeedbackImageFiles([], [png(), png(), png(), png()]))
      .toEqual({ code: "too-many" })
    expect(validateFeedbackImageFiles([], [imageFile("screen.gif", "image/gif", 1)]))
      .toEqual({ code: "invalid-type", fileName: "screen.gif" })
    expect(validateFeedbackImageFiles([], [imageFile("empty.png", "image/png", 0)]))
      .toEqual({ code: "empty", fileName: "empty.png" })
    expect(validateFeedbackImageFiles([], [
      imageFile("large.png", "image/png", MAX_FEEDBACK_TOTAL_IMAGE_BYTES + 1),
    ])).toEqual({ code: "total-too-large" })
  })

  it("serializes only the MIME type and base64 body", async () => {
    const file = new File([new Uint8Array([0x89])], "patient-name-is-not-sent.png", {
      type: "image/png",
    })

    await expect(fileToFeedbackImagePayload(file)).resolves.toEqual({
      contentType: "image/png",
      data: "iQ==",
    })
  })
})

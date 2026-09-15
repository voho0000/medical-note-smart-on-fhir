const getProxyAuthHeaders = jest.fn(async () => ({
  Authorization: "Bearer firebase-id-token",
}))
const getAppCheckToken = jest.fn(async () => "firebase-app-check-token")

jest.mock("@/src/infrastructure/ai/utils/proxy-auth", () => ({
  getProxyAuthHeaders: () => getProxyAuthHeaders(),
}))

jest.mock("@/src/infrastructure/ai/utils/app-check", () => ({
  getAppCheckToken: () => getAppCheckToken(),
}))

import { getFeedbackRequestHeaders } from "@/src/application/feedback/feedback-request-headers"

describe("feedback request headers", () => {
  const previousClientKey = process.env.NEXT_PUBLIC_PROXY_KEY

  afterAll(() => {
    if (previousClientKey === undefined) delete process.env.NEXT_PUBLIC_PROXY_KEY
    else process.env.NEXT_PUBLIC_PROXY_KEY = previousClientKey
  })

  it("uses the backend header contract with Firebase Auth and App Check", async () => {
    process.env.NEXT_PUBLIC_PROXY_KEY = "public-client-marker"

    await expect(getFeedbackRequestHeaders()).resolves.toEqual({
      "Content-Type": "application/json",
      "x-proxy-key": "public-client-marker",
      Authorization: "Bearer firebase-id-token",
      "X-Firebase-AppCheck": "firebase-app-check-token",
    })
  })
})

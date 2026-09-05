import { CSP_CONTENT } from "@/src/shared/config/content-security-policy"

describe("production Content-Security-Policy", () => {
  it("allows the Firebase Hosting iframe that completes Google sign-in", () => {
    const frameSrc = CSP_CONTENT.split("; ").find((directive) => directive.startsWith("frame-src "))

    expect(frameSrc).toContain("https://mediprisma.web.app")
  })
})

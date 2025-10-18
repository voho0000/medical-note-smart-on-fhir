// app/layout.tsx
import "./globals.css"
import type { Metadata } from "next"
import { ApiKeyProvider } from "@/lib/providers/ApiKeyProvider"

export const metadata: Metadata = {
  title: "Medical Note · SMART on FHIR",
  description: "A modular SMART on FHIR app with clinical summary and medical note features.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ApiKeyProvider storage="session">
          {children}
        </ApiKeyProvider>
      </body>
    </html>
  )
}

// app/layout.tsx
import "./globals.css"
import type { Metadata } from "next"
import { ApiKeyProvider } from "@/lib/providers/ApiKeyProvider"
import { PatientProvider } from "@/lib/providers/PatientProvider"
import { ClinicalDataProvider } from "@/lib/providers/ClinicalDataProvider"

export const metadata: Metadata = {
  title: "Medical Note · SMART on FHIR",
  description: "A modular SMART on FHIR app with clinical summary and medical note features.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ApiKeyProvider storage="session">
          <PatientProvider>
            <ClinicalDataProvider>
              {children}
            </ClinicalDataProvider>
          </PatientProvider>
        </ApiKeyProvider>
      </body>
    </html>
  )
}

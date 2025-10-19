// features/clinical-summary/components/DiagnosesCard.tsx
"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useClinicalData } from "@/lib/providers/ClinicalDataProvider"

// FHIR R4 Type Definitions
interface Coding {
  system?: string
  code?: string
  display?: string
}

interface CodeableConcept {
  coding?: Coding[]
  text?: string
}

interface Category {
  coding?: Coding[]
  text?: string
}

interface Condition {
  id?: string
  code?: CodeableConcept
  clinicalStatus?: CodeableConcept
  verificationStatus?: CodeableConcept
  category?: Category[]
  onsetDateTime?: string
  recordedDate?: string
  encounter?: { reference?: string }
}

interface Row {
  id: string
  title: string
  when?: string
  verification?: string
  clinical?: string
  categories: string[]
}

function ccText(cc?: CodeableConcept): string {
  if (!cc) return "—"
  return cc.text || cc.coding?.[0]?.display || cc.coding?.[0]?.code || "—"
}

function fmtDate(d?: string): string {
  if (!d) return ""
  try { return new Date(d).toLocaleDateString() } catch { return d }
}

export function DiagnosesCard() {
  const { diagnoses = [], isLoading, error } = useClinicalData()
  
  const rows = useMemo<Row[]>(() => {
    if (!diagnoses || !Array.isArray(diagnoses)) return []
    
    return (diagnoses as Condition[]).map(condition => {
      // Extract categories safely
      const categories: string[] = []
      if (condition.category) {
        condition.category.forEach((cat: Category) => {
          if (cat.coding) {
            cat.coding.forEach((coding: Coding) => {
              if (coding.display) categories.push(coding.display)
              else if (coding.code) categories.push(coding.code)
            })
          }
        })
      }

      return {
        id: condition.id || Math.random().toString(36),
        title: condition.code?.text || condition.code?.coding?.[0]?.display || 'Unknown',
        when: fmtDate(condition.onsetDateTime || condition.recordedDate),
        clinical: condition.clinicalStatus?.coding?.[0]?.display || condition.clinicalStatus?.coding?.[0]?.code || '',
        verification: condition.verificationStatus?.coding?.[0]?.display || condition.verificationStatus?.coding?.[0]?.code || '',
        categories: categories,
      }
    })
  }, [diagnoses])

  const loading = isLoading
  const err = error ? String(error) : null

  const body = useMemo(() => {
    if (loading) return <div className="text-sm text-muted-foreground">Loading diagnoses…</div>
    if (err) return <div className="text-sm text-red-600">{err}</div>
    if (rows.length === 0) return <div className="text-sm text-muted-foreground">No active diagnoses.</div>

    return (
      <ul className="space-y-2">
        {rows.map(r => (
          <li key={r.id} className="rounded-md border p-3">
            <div className="flex items-baseline justify-between">
              <div className="font-medium">{r.title}</div>
              {r.when && <div className="text-xs text-muted-foreground">{r.when}</div>}
            </div>

            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              {r.clinical && (
                <span className="inline-flex items-center rounded bg-emerald-50 px-2 py-0.5 text-emerald-700 ring-1 ring-emerald-200">
                  {r.clinical}
                </span>
              )}
              {r.verification && (
                <span className="inline-flex items-center rounded bg-sky-50 px-2 py-0.5 text-sky-700 ring-1 ring-sky-200">
                  {r.verification}
                </span>
              )}
              {r.categories?.map((c, i) => (
                <span key={i} className="inline-flex items-center rounded bg-gray-100 px-2 py-0.5 text-gray-700 ring-1 ring-gray-200">
                  {c}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    )
  }, [rows, loading, err])

  return (
    <Card>
      <CardHeader><CardTitle>Diagnosis / Problem List</CardTitle></CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}

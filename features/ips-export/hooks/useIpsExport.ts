"use client"

import { useCallback, useState } from 'react'
import { usePatientQuery } from '@/src/application/hooks/patient/use-patient-query.hook'
import { getPatientDisplayName } from '@/src/core/entities/patient.entity'
import { dateStampForFilename } from '../utils/ips-helpers'
import type { IpsBundle } from '../utils/ips-types'

export type IpsExportFormat = 'json' | 'markdown'

export interface UseIpsExportResult {
  /** Trigger a browser download of the IPS Bundle as a .json file. */
  downloadJson: (bundle: IpsBundle) => void
  /** Trigger a browser download of the deterministic Markdown companion file. */
  downloadMarkdown: (markdown: string) => void
  /** Copy the pretty-printed IPS Bundle JSON to the clipboard. */
  copyJson: (bundle: IpsBundle) => Promise<void>
  /** Copy the deterministic Markdown companion file to the clipboard. */
  copyMarkdown: (markdown: string) => Promise<void>
  /** Format copied most recently, briefly set after a successful copy. */
  copiedFormat: IpsExportFormat | null
  /** Set when the last copy failed (e.g. clipboard unavailable). */
  copyError: string | null
  jsonFilename: string
  markdownFilename: string
}

function sanitizeForFilename(name: string): string {
  return name.replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^_+|_+$/g, '') || 'patient'
}

export function useIpsExport(): UseIpsExportResult {
  const { data: patient } = usePatientQuery()
  const [copiedFormat, setCopiedFormat] = useState<IpsExportFormat | null>(null)
  const [copyError, setCopyError] = useState<string | null>(null)

  const filename = useCallback((extension: 'json' | 'md') => {
    const name = sanitizeForFilename(getPatientDisplayName(patient ?? null))
    return `IPS_${name}_${dateStampForFilename()}.${extension}`
  }, [patient])

  const jsonFilename = filename('json')
  const markdownFilename = filename('md')

  const downloadText = useCallback(
    (text: string, file: string, type: string) => {
      const blob = new Blob([text], { type })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // Revoke on the next tick so the download has a chance to start.
      setTimeout(() => URL.revokeObjectURL(url), 0)
    },
    [],
  )

  const downloadJson = useCallback(
    (bundle: IpsBundle) => {
      downloadText(JSON.stringify(bundle, null, 2), filename('json'), 'application/fhir+json')
    },
    [downloadText, filename],
  )

  const downloadMarkdown = useCallback(
    (markdown: string) => {
      downloadText(markdown, filename('md'), 'text/markdown;charset=utf-8')
    },
    [downloadText, filename],
  )

  const copyText = useCallback(async (text: string, format: IpsExportFormat) => {
    setCopyError(null)
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        throw new Error('Clipboard API unavailable')
      }
      setCopiedFormat(format)
      setTimeout(() => setCopiedFormat(null), 2000)
    } catch (err) {
      setCopyError(err instanceof Error ? err.message : 'Copy failed')
    }
  }, [])

  const copyJson = useCallback(
    async (bundle: IpsBundle) => {
      await copyText(JSON.stringify(bundle, null, 2), 'json')
    },
    [copyText],
  )

  const copyMarkdown = useCallback(
    async (markdown: string) => {
      await copyText(markdown, 'markdown')
    },
    [copyText],
  )

  return {
    downloadJson,
    downloadMarkdown,
    copyJson,
    copyMarkdown,
    copiedFormat,
    copyError,
    jsonFilename,
    markdownFilename,
  }
}

// Shared hidden <input type="file"> for local FHIR-bundle import.
//
// There are two entry points that let a user pick a bundle off their device —
// the header CTA (ImportBundleButton) and the welcome-screen card
// (WelcomeOnboarding). They used to each carry their own <input>, `accept`
// string and change handler, so every import-file change (e.g. accepting .txt)
// had to be made twice. This component is the single source of truth: it owns
// the accepted file types, the input element, and the change → importFile
// behaviour. Both entry points render it and trigger it via the imperative
// `open()` on its ref.
'use client'

import { forwardRef, useCallback, useImperativeHandle, useRef } from 'react'

/** File types the local-import picker offers. FHIR Bundles and Health Bank SDK
 *  exports are JSON; some sources ship the same JSON with a `.txt` extension,
 *  so we accept both. Import detects and validates by content. */
export const BUNDLE_FILE_ACCEPT = '.json,.txt,application/json,text/plain'

export interface BundleFileInputHandle {
  /** Open the OS file picker. */
  open: () => void
}

interface BundleFileInputProps {
  /** Optional test id forwarded to the underlying <input> (e2e hooks). */
  testId?: string
  /** Import callback from the parent hook instance so loading/errors remain in
   * sync with the visible button or welcome screen. */
  importFile: (file: File) => Promise<void>
}

export const BundleFileInput = forwardRef<BundleFileInputHandle, BundleFileInputProps>(
  function BundleFileInput({ testId, importFile }, ref) {
    const inputRef = useRef<HTMLInputElement>(null)

    useImperativeHandle(ref, () => ({ open: () => inputRef.current?.click() }), [])

    const onChange = useCallback(
      async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        try {
          if (file) await importFile(file)
        } catch {
          // Error surfaces through the parent hook instance.
        } finally {
          // Reset so re-picking the SAME file still fires onChange.
          if (inputRef.current) inputRef.current.value = ''
        }
      },
      [importFile],
    )

    return (
      <input
        ref={inputRef}
        data-testid={testId}
        type="file"
        accept={BUNDLE_FILE_ACCEPT}
        className="hidden"
        onChange={onChange}
      />
    )
  },
)

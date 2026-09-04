'use client'

import dynamic from 'next/dynamic'
import { useCallback, useState } from 'react'
import type { UseReportInterpretationArgs } from '@/src/application/hooks/report-interpretation/use-report-interpretation.hook'
import type { ReportInterpretHost } from '@/src/application/telemetry/usage-analytics'
import { ReportInterpretationButton } from './ReportInterpretationButton'

const ReportInterpretationRequestRunner = dynamic(
  () => import('./ReportInterpretationRequestRunner').then(
    (module_) => module_.ReportInterpretationRequestRunner,
  ),
  { ssr: false },
)

interface ReportInterpretationLauncherProps extends UseReportInterpretationArgs {
  onReady: () => void
  className?: string
  dataTour?: string
  detailSourceId?: string
  asDiv?: boolean
  /** Which surface this launcher sits on, for usage analytics. */
  analyticsHost: ReportInterpretHost
}

/** Starts translation in the background and reveals the right pane only after
 * the complete result is available in the shared cache. */
export function ReportInterpretationLauncher({
  onReady,
  className,
  dataTour,
  detailSourceId,
  asDiv,
  analyticsHost,
  ...request
}: ReportInterpretationLauncherProps) {
  const [requested, setRequested] = useState(false)

  const handleRequest = useCallback((event: React.MouseEvent) => {
    event.stopPropagation()
    setRequested(true)
  }, [])
  const handleReady = useCallback(() => {
    setRequested(false)
    onReady()
  }, [onReady])
  const handleFailed = useCallback(() => setRequested(false), [])

  return (
    <>
      <ReportInterpretationButton
        active={false}
        analyticsHost={analyticsHost}
        asDiv={asDiv}
        busy={requested}
        className={className}
        dataTour={dataTour}
        detailSourceId={detailSourceId}
        onToggle={handleRequest}
      />
      {requested && (
        <ReportInterpretationRequestRunner
          {...request}
          onReady={handleReady}
          onFailed={handleFailed}
        />
      )}
    </>
  )
}

// Application-layer facade for usage analytics.
//
// `features/**` may not import `src/infrastructure/**` directly (eslint
// boundary: features go through application/core). The adapter itself stays in
// infrastructure — it is the only module allowed to touch `firebase/analytics`
// — and every feature and layout imports it from here instead, so swapping the
// sink later is still a one-file change.
'use client'

export {
  ANALYTICS_HOSTNAME_ALLOWLIST,
  consumeTrigger,
  markUserTrigger,
  setUserProps,
  trackEvent,
  type AnalyticsArea,
  type AnalyticsTour,
  type AnalyticsTrigger,
  type AiOutcome,
  type AiSurface,
  type DurationBucket,
  type FedResourceCounts,
  type LaunchSite,
  type LaunchSource,
  type PatientResourceCounts,
  type ReportInterpretHost,
  type SourceNavOrigin,
  type UsageEventName,
  type UsageEventParams,
  type UserProps,
  type UserPropName,
} from '@/src/infrastructure/telemetry/usage-analytics'
export { useTrackView } from '@/src/infrastructure/telemetry/use-track-view'

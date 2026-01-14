/**
 * Application Providers - Barrel Export
 * 
 * Migrated to Zustand:
 * - ApiKeyProvider → useAiConfigStore
 * - ModelSelectionProvider → useAiConfigStore
 * - ChatMessagesProvider → useChatStore
 * 
 * Migrated to React Query:
 * - PatientProvider → usePatientQuery
 * - ClinicalDataProvider → useClinicalDataQuery
 */

// Active Context Providers
export { AsrProvider, useAsr } from './asr.provider'
export { ClinicalInsightsConfigProvider, useClinicalInsightsConfig } from './clinical-insights-config.provider'
export { DataSelectionProvider, useDataSelection } from './data-selection.provider'
export { LanguageProvider, useLanguage } from './language.provider'
export { ChatTemplatesProvider, useChatTemplates } from './chat-templates.provider'
export { RightPanelProvider, useRightPanel } from './right-panel.provider'
export { ThemeProvider, useTheme } from './theme.provider'

// React Query Hooks (re-exported for convenience)
export { usePatient, usePatientQuery } from '@/src/application/hooks/patient/use-patient-query.hook'
export { useClinicalData, useClinicalDataQuery } from '@/src/application/hooks/clinical-data/use-clinical-data-query.hook'

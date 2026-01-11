// Application Providers - Barrel Export
export { ApiKeyProvider, useApiKey } from './api-key.provider'
export { AsrProvider, useAsr } from './asr.provider'
export { ClinicalDataProvider, useClinicalData } from './clinical-data.provider'
export { ClinicalInsightsConfigProvider, useClinicalInsightsConfig } from './clinical-insights-config.provider'
export { DataSelectionProvider, useDataSelection } from './data-selection.provider'
export { GptResponseProvider, useGptResponse } from './gpt-response.provider'
export { LanguageProvider, useLanguage } from './language.provider'
export { PatientProvider, usePatient } from './patient.provider'
export { PromptTemplatesProvider, usePromptTemplates } from './prompt-templates.provider'
export { RightPanelProvider, useRightPanel } from './right-panel.provider'
export { ThemeProvider, useTheme } from './theme.provider'

// Focused providers (replaced old NoteProvider)
export { ModelSelectionProvider, useModelSelection } from './model-selection.provider'
export { ChatMessagesProvider, useChatMessages, type ChatMessage, type AgentState } from './chat-messages.provider'

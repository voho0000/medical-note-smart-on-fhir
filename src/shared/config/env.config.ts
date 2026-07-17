// Environment Configuration
import { DEPLOYMENT_CONFIG } from './deployment-profile.config'

const cloudValue = (value: string | undefined): string =>
  DEPLOYMENT_CONFIG.allowsCloudAi ? value || '' : ''

export const ENV_CONFIG = {
  deploymentProfile: DEPLOYMENT_CONFIG.profile,
  // Backward-compatible name used throughout the UI. The authoritative
  // boundary is now NEXT_PUBLIC_DEPLOYMENT_PROFILE=onprem.
  offlineMode: DEPLOYMENT_CONFIG.isOnPrem,
  // AI Proxy URLs
  chatProxyUrl: cloudValue(process.env.NEXT_PUBLIC_CHAT_URL),
  whisperProxyUrl: cloudValue(process.env.NEXT_PUBLIC_WHISPER_URL),
  geminiProxyUrl: cloudValue(process.env.NEXT_PUBLIC_GEMINI_URL),
  claudeProxyUrl: cloudValue(process.env.NEXT_PUBLIC_CLAUDE_URL),
  openAiCompatibleGatewayUrl: cloudValue(
    process.env.NEXT_PUBLIC_OPENAI_COMPATIBLE_GATEWAY_URL,
  ),
  perplexityProxyUrl: cloudValue(process.env.NEXT_PUBLIC_PERPLEXITY_PROXY_URL),
  proxyClientKey: cloudValue(process.env.NEXT_PUBLIC_PROXY_KEY),
  
  // Feature flags
  hasChatProxy: DEPLOYMENT_CONFIG.allowsCloudAi && Boolean(process.env.NEXT_PUBLIC_CHAT_URL),
  hasWhisperProxy: DEPLOYMENT_CONFIG.allowsCloudAi && Boolean(process.env.NEXT_PUBLIC_WHISPER_URL),
  hasGeminiProxy: DEPLOYMENT_CONFIG.allowsCloudAi && Boolean(process.env.NEXT_PUBLIC_GEMINI_URL),
  hasClaudeProxy: DEPLOYMENT_CONFIG.allowsCloudAi && Boolean(process.env.NEXT_PUBLIC_CLAUDE_URL),
  hasOpenAiCompatibleGateway:
    DEPLOYMENT_CONFIG.allowsCloudAi &&
    Boolean(process.env.NEXT_PUBLIC_OPENAI_COMPATIBLE_GATEWAY_URL),
  
  // Streaming watchdog: abort a chat stream that produces no new token for this
  // long (ms), so a stalled/never-closing upstream stream surfaces a timeout
  // error instead of hanging the UI forever. Idle-based, so legitimate long
  // replies that keep streaming are unaffected. Overridable for E2E.
  streamIdleTimeoutMs: Number(process.env.NEXT_PUBLIC_STREAM_IDLE_TIMEOUT_MS) || 60_000,

  // SMART on FHIR
  smartClientId: (process.env.NEXT_PUBLIC_SMART_CLIENT_ID || 'my_web_app').trim(),
  smartScopes: 'launch openid fhirUser patient/*.rs online_access',
  smartStandaloneScopes: 'launch/patient openid fhirUser patient/*.rs online_access',
  
  // GitHub Pages base path
  githubPages: process.env.GITHUB_PAGES === 'true',
  repoBasePath: '/medical-note-smart-on-fhir'
} as const

export type EnvConfig = typeof ENV_CONFIG

// Legacy exports for backward compatibility with lib/config/ai.ts
export const CHAT_PROXY_URL = ENV_CONFIG.chatProxyUrl
export const WHISPER_PROXY_URL = ENV_CONFIG.whisperProxyUrl
export const GEMINI_PROXY_URL = ENV_CONFIG.geminiProxyUrl
export const PROXY_CLIENT_KEY = ENV_CONFIG.proxyClientKey
export const hasChatProxy = ENV_CONFIG.hasChatProxy
export const hasWhisperProxy = ENV_CONFIG.hasWhisperProxy
export const hasGeminiProxy = ENV_CONFIG.hasGeminiProxy
export const hasClaudeProxy = ENV_CONFIG.hasClaudeProxy

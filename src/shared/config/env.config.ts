// Environment Configuration
export const ENV_CONFIG = {
  // Air-gapped deployment: do not initialize Firebase/Auth/App Check and do
  // not advertise owner-funded proxy availability. Build with
  // NEXT_PUBLIC_OFFLINE_MODE=1 behind the hospital HTTPS gateway.
  offlineMode: process.env.NEXT_PUBLIC_OFFLINE_MODE === '1',
  // AI Proxy URLs
  chatProxyUrl: process.env.NEXT_PUBLIC_CHAT_URL || '',
  whisperProxyUrl: process.env.NEXT_PUBLIC_WHISPER_URL || '',
  geminiProxyUrl: process.env.NEXT_PUBLIC_GEMINI_URL || '',
  claudeProxyUrl: process.env.NEXT_PUBLIC_CLAUDE_URL || '',
  proxyClientKey: process.env.NEXT_PUBLIC_PROXY_KEY || '',
  
  // Feature flags
  hasChatProxy: process.env.NEXT_PUBLIC_OFFLINE_MODE !== '1' && Boolean(process.env.NEXT_PUBLIC_CHAT_URL),
  hasWhisperProxy: process.env.NEXT_PUBLIC_OFFLINE_MODE !== '1' && Boolean(process.env.NEXT_PUBLIC_WHISPER_URL),
  hasGeminiProxy: process.env.NEXT_PUBLIC_OFFLINE_MODE !== '1' && Boolean(process.env.NEXT_PUBLIC_GEMINI_URL),
  hasClaudeProxy: process.env.NEXT_PUBLIC_OFFLINE_MODE !== '1' && Boolean(process.env.NEXT_PUBLIC_CLAUDE_URL),
  
  // Streaming watchdog: abort a chat stream that produces no new token for this
  // long (ms), so a stalled/never-closing upstream stream surfaces a timeout
  // error instead of hanging the UI forever. Idle-based, so legitimate long
  // replies that keep streaming are unaffected. Overridable for E2E.
  streamIdleTimeoutMs: Number(process.env.NEXT_PUBLIC_STREAM_IDLE_TIMEOUT_MS) || 60_000,

  // SMART on FHIR
  smartClientId: 'my_web_app',
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

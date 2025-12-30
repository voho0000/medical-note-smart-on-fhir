// Environment Configuration
export const ENV_CONFIG = {
  // AI Proxy URLs
  chatProxyUrl: process.env.NEXT_PUBLIC_CHAT_URL || '',
  whisperProxyUrl: process.env.NEXT_PUBLIC_WHISPER_URL || '',
  geminiProxyUrl: process.env.NEXT_PUBLIC_GEMINI_URL || '',
  proxyClientKey: process.env.NEXT_PUBLIC_PROXY_KEY || '',
  
  // Feature flags
  hasChatProxy: Boolean(process.env.NEXT_PUBLIC_CHAT_URL),
  hasWhisperProxy: Boolean(process.env.NEXT_PUBLIC_WHISPER_URL),
  hasGeminiProxy: Boolean(process.env.NEXT_PUBLIC_GEMINI_URL),
  
  // SMART on FHIR
  smartClientId: 'my_web_app',
  smartScopes: 'launch openid fhirUser patient/*.read online_access',
  
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

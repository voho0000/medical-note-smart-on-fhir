const FALLBACK_CHAT_PROXY_URL = "https://proxychatcompletion-dnl5zk7goa-uc.a.run.app"
const FALLBACK_WHISPER_PROXY_URL = "https://proxywhisper-dnl5zk7goa-uc.a.run.app"

const configuredChatProxy = process.env.NEXT_PUBLIC_PRISMACARE_CHAT_URL ?? ""
const configuredWhisperProxy = process.env.NEXT_PUBLIC_PRISMACARE_WHISPER_URL ?? ""

export const CHAT_PROXY_URL = configuredChatProxy || FALLBACK_CHAT_PROXY_URL
export const WHISPER_PROXY_URL = configuredWhisperProxy || FALLBACK_WHISPER_PROXY_URL
export const PROXY_CLIENT_KEY = process.env.NEXT_PUBLIC_PRISMACARE_PROXY_KEY ?? ""

export const hasChatProxy = CHAT_PROXY_URL.length > 0
export const hasWhisperProxy = WHISPER_PROXY_URL.length > 0

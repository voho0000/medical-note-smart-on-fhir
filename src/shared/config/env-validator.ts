// Environment Variable Validator
// Validates required environment variables at startup

interface EnvValidationResult {
  isValid: boolean
  missing: string[]
  warnings: string[]
}

interface EnvConfig {
  required?: string[]
  optional?: string[]
  validate?: (env: Record<string, string | undefined>) => string[]
}

/**
 * Validate environment variables
 * @param config - Configuration for validation
 * @returns Validation result
 */
export function validateEnvironment(config: EnvConfig): EnvValidationResult {
  const missing: string[] = []
  const warnings: string[] = []

  // Check required variables
  if (config.required) {
    for (const key of config.required) {
      if (!process.env[key]) {
        missing.push(key)
      }
    }
  }

  // Check optional variables (warnings only)
  if (config.optional) {
    for (const key of config.optional) {
      if (!process.env[key]) {
        warnings.push(`Optional environment variable '${key}' is not set`)
      }
    }
  }

  // Custom validation
  if (config.validate) {
    const customWarnings = config.validate(process.env as Record<string, string | undefined>)
    warnings.push(...customWarnings)
  }

  return {
    isValid: missing.length === 0,
    missing,
    warnings,
  }
}

/**
 * Validate and log environment variables
 * Throws error if required variables are missing
 */
export function validateAndLogEnvironment(config: EnvConfig): void {
  const result = validateEnvironment(config)

  if (!result.isValid) {
    console.error('❌ Environment validation failed!')
    console.error('Missing required environment variables:')
    result.missing.forEach(key => console.error(`  - ${key}`))
    throw new Error(`Missing required environment variables: ${result.missing.join(', ')}`)
  }

  if (result.warnings.length > 0) {
    console.warn('⚠️  Environment warnings:')
    result.warnings.forEach(warning => console.warn(`  - ${warning}`))
  }

  console.log('✅ Environment validation passed')
}

/**
 * Application-specific environment validation
 */
export function validateAppEnvironment(): void {
  validateAndLogEnvironment({
    required: [
      // Add required variables here if any
    ],
    optional: [
      'NEXT_PUBLIC_PRISMACARE_CHAT_URL',
      'NEXT_PUBLIC_PRISMACARE_WHISPER_URL',
      'NEXT_PUBLIC_PRISMACARE_GEMINI_URL',
      'NEXT_PUBLIC_PRISMACARE_PROXY_KEY',
    ],
    validate: (env) => {
      const warnings: string[] = []

      // Validate proxy configuration
      const hasProxyKey = !!env.NEXT_PUBLIC_PRISMACARE_PROXY_KEY
      const hasChatUrl = !!env.NEXT_PUBLIC_PRISMACARE_CHAT_URL
      const hasWhisperUrl = !!env.NEXT_PUBLIC_PRISMACARE_WHISPER_URL
      const hasGeminiUrl = !!env.NEXT_PUBLIC_PRISMACARE_GEMINI_URL

      if (hasProxyKey && !hasChatUrl && !hasWhisperUrl && !hasGeminiUrl) {
        warnings.push('Proxy key is set but no proxy URLs are configured')
      }

      if ((hasChatUrl || hasWhisperUrl || hasGeminiUrl) && !hasProxyKey) {
        warnings.push('Proxy URLs are configured but proxy key is missing')
      }

      return warnings
    }
  })
}

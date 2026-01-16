// Crypto Utilities - Secure API Key Storage
// Uses Web Crypto API for encryption/decryption

const ENCRYPTION_ALGORITHM = 'AES-GCM'
const KEY_LENGTH = 256
const IV_LENGTH = 12

/**
 * Generate a cryptographic key from a password
 * Uses PBKDF2 to derive a key from the user's session
 */
async function deriveKey(password: string, salt: BufferSource): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const passwordBuffer = encoder.encode(password)
  
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passwordBuffer,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  )
  
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    } as Pbkdf2Params,
    baseKey,
    { name: ENCRYPTION_ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Get or create a persistent encryption password
 * This is stored in localStorage to persist across browser sessions
 */
function getSessionPassword(): string {
  if (typeof window === 'undefined') return ''
  
  const STORAGE_KEY = '__crypto_session_key__'
  let password = localStorage.getItem(STORAGE_KEY)
  
  if (!password) {
    // Generate a random password for encryption
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    password = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(STORAGE_KEY, password)
  }
  
  return password
}

/**
 * Encrypt a string value
 * Returns base64-encoded encrypted data with salt and IV
 */
export async function encrypt(plaintext: string): Promise<string> {
  if (typeof window === 'undefined' || !plaintext) return plaintext
  
  try {
    const encoder = new TextEncoder()
    const data = encoder.encode(plaintext)
    
    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
    
    // Derive encryption key
    const password = getSessionPassword()
    const key = await deriveKey(password, salt)
    
    // Encrypt the data
    const encryptedData = await crypto.subtle.encrypt(
      { name: ENCRYPTION_ALGORITHM, iv },
      key,
      data
    )
    
    // Combine salt + IV + encrypted data
    const combined = new Uint8Array(salt.length + iv.length + encryptedData.byteLength)
    combined.set(salt, 0)
    combined.set(iv, salt.length)
    combined.set(new Uint8Array(encryptedData), salt.length + iv.length)
    
    // Convert to base64
    return btoa(String.fromCharCode(...combined))
  } catch (error) {
    console.error('Encryption failed:', error)
    // Fallback to plaintext if encryption fails
    return plaintext
  }
}

/**
 * Decrypt an encrypted string
 * Expects base64-encoded data with salt and IV
 */
export async function decrypt(encryptedText: string): Promise<string> {
  if (typeof window === 'undefined' || !encryptedText) return encryptedText
  
  try {
    // Check if this looks like encrypted data (base64)
    if (!/^[A-Za-z0-9+/=]+$/.test(encryptedText)) {
      // Not encrypted, return as-is (for backward compatibility)
      return encryptedText
    }
    
    // Decode from base64
    const combined = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0))
    
    // Validate minimum length (salt + IV + some data)
    const minLength = 16 + IV_LENGTH + 1
    if (combined.length < minLength) {
      throw new Error('Encrypted data too short')
    }
    
    // Extract salt, IV, and encrypted data
    const salt = combined.slice(0, 16)
    const iv = combined.slice(16, 16 + IV_LENGTH)
    const encryptedData = combined.slice(16 + IV_LENGTH)
    
    // Derive decryption key
    const password = getSessionPassword()
    const key = await deriveKey(password, salt)
    
    // Decrypt the data
    const decryptedData = await crypto.subtle.decrypt(
      { name: ENCRYPTION_ALGORITHM, iv },
      key,
      encryptedData
    )
    
    // Convert back to string
    const decoder = new TextDecoder()
    return decoder.decode(decryptedData)
  } catch (error) {
    // Decryption failed - this is expected when session key changes
    // Throw error so caller can handle (e.g., clear corrupted keys)
    throw error
  }
}

/**
 * Check if a string is encrypted
 */
export function isEncrypted(value: string): boolean {
  if (!value) return false
  // Check if it's base64 and has minimum length for encrypted data
  return /^[A-Za-z0-9+/=]+$/.test(value) && value.length > 40
}

/**
 * Clear the encryption key
 * Call this on logout or when clearing all data
 */
export function clearSessionKey(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('__crypto_session_key__')
  }
}

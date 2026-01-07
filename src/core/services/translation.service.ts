// Translation Service
// Provides safe access to nested translation keys
// Eliminates the need for 'as any' type assertions

/**
 * Service for safely accessing nested translation objects
 * Prevents runtime errors and type assertion issues
 */
export class TranslationService {
  /**
   * Safely retrieves a nested translation value
   * @param translations - The translation object (e.g., t.dataSelection)
   * @param key - The translation key (e.g., 'labReports')
   * @param fallback - Fallback value if translation not found
   * @returns The translated string or fallback
   */
  static get(
    translations: Record<string, unknown>,
    key: string,
    fallback: string
  ): string {
    const value = translations[key]
    return typeof value === 'string' ? value : fallback
  }

  /**
   * Retrieves a nested translation using dot notation
   * @param translations - The root translation object
   * @param keyPath - Dot-separated path (e.g., 'dataSelection.labReports')
   * @param fallback - Fallback value if translation not found
   * @returns The translated string or fallback
   */
  static getByPath(
    translations: Record<string, unknown>,
    keyPath: string,
    fallback: string
  ): string {
    const parts = keyPath.split('.')
    let current: unknown = translations
    
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = (current as Record<string, unknown>)[part]
      } else {
        return fallback
      }
    }
    
    return typeof current === 'string' ? current : fallback
  }

  /**
   * Checks if a translation key exists
   * @param translations - The translation object
   * @param key - The translation key
   * @returns True if the key exists and has a string value
   */
  static has(translations: Record<string, unknown>, key: string): boolean {
    return key in translations && typeof translations[key] === 'string'
  }
}

/**
 * useLocalStorage Hook
 * 
 * Reusable hook for localStorage operations with SSR safety and type safety.
 * Consolidates duplicate localStorage logic across providers.
 * 
 * Architecture: Shared Layer
 */

import { useState, useEffect, useCallback } from 'react'

interface UseLocalStorageOptions<T> {
  key: string
  defaultValue: T
  serializer?: (value: T) => string
  deserializer?: (value: string) => T
}

/**
 * Hook for managing localStorage with React state synchronization
 * 
 * Features:
 * - SSR safe (checks for window)
 * - Type safe
 * - Automatic serialization/deserialization
 * - Error handling
 * - State synchronization
 */
export function useLocalStorage<T>({
  key,
  defaultValue,
  serializer = JSON.stringify,
  deserializer = JSON.parse,
}: UseLocalStorageOptions<T>) {
  const [value, setValue] = useState<T>(defaultValue)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return

    try {
      const stored = window.localStorage.getItem(key)
      if (stored !== null) {
        const parsed = deserializer(stored)
        setValue(parsed)
      }
    } catch (error) {
      console.warn(`Failed to load from localStorage (key: ${key}):`, error)
    } finally {
      setIsLoaded(true)
    }
  }, [key, deserializer])

  // Save to localStorage when value changes
  useEffect(() => {
    if (typeof window === 'undefined' || !isLoaded) return

    try {
      const serialized = serializer(value)
      window.localStorage.setItem(key, serialized)
    } catch (error) {
      console.warn(`Failed to save to localStorage (key: ${key}):`, error)
    }
  }, [key, value, serializer, isLoaded])

  // Update value and trigger save
  const updateValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const updated = typeof newValue === 'function' 
        ? (newValue as (prev: T) => T)(prev)
        : newValue
      return updated
    })
  }, [])

  // Remove from localStorage
  const removeValue = useCallback(() => {
    if (typeof window === 'undefined') return

    try {
      window.localStorage.removeItem(key)
      setValue(defaultValue)
    } catch (error) {
      console.warn(`Failed to remove from localStorage (key: ${key}):`, error)
    }
  }, [key, defaultValue])

  return {
    value,
    setValue: updateValue,
    removeValue,
    isLoaded,
  }
}

/**
 * Simplified version for string values (no serialization needed)
 */
export function useLocalStorageString(key: string, defaultValue: string) {
  return useLocalStorage({
    key,
    defaultValue,
    serializer: (v) => v,
    deserializer: (v) => v,
  })
}

/**
 * Version for boolean values
 */
export function useLocalStorageBoolean(key: string, defaultValue: boolean) {
  return useLocalStorage({
    key,
    defaultValue,
    serializer: (v) => String(v),
    deserializer: (v) => v === 'true',
  })
}

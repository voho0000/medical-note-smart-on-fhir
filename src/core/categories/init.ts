// Initialize Data Categories
// This file should be imported once at app startup

import { initializeCategories } from './index'

let initialized = false

export function ensureCategoriesInitialized(): void {
  if (!initialized) {
    initializeCategories()
    initialized = true
  }
}

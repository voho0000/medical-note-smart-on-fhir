// First-run onboarding — gating + versioning.
//
// The flag is VERSIONED in its key so adding a new onboarding question later can
// re-introduce the flow for existing users (bump v1 → v2) without a migration
// step. Mirrors the audience-selected localStorage gate pattern.
export const ONBOARDING_STORAGE_KEY = 'medical-note-onboarding-v1'

// Clinical Insights Panel Sync with Firestore
import { Timestamp, type Unsubscribe } from 'firebase/firestore'
import {
  coerceInsightLanguagePolicy,
  coerceInsightOutputFormat,
  coerceShowInSummary,
  type InsightLanguagePolicy,
  type InsightOutputFormat,
} from '@/src/shared/constants/clinical-insights.constants'
import { createUserCollectionSync } from './user-collection-sync'

export type PanelAudience = 'medical' | 'patient'

export interface ClinicalInsightPanel {
  id: string
  title: string
  prompt: string
  showInSummary: boolean
  autoGenerate: boolean
  order: number
  audience: PanelAudience
  outputFormat: InsightOutputFormat
  languagePolicy: InsightLanguagePolicy
  templateLibraryRevision?: number
  createdAt?: Date
  updatedAt?: Date
}

interface FirestoreClinicalInsightPanel {
  id: string
  title: string
  prompt: string
  showInSummary?: boolean
  autoGenerate: boolean
  order: number
  audience?: PanelAudience
  outputFormat?: InsightOutputFormat
  languagePolicy?: InsightLanguagePolicy
  templateLibraryRevision?: number
  createdAt: Timestamp
  updatedAt: Timestamp
}

const panelSync = createUserCollectionSync<ClinicalInsightPanel, FirestoreClinicalInsightPanel>({
  collectionName: 'clinicalInsightPanels',
  largeTextField: 'prompt',
  logLabel: 'Clinical Insights Sync',
  nounSingular: 'panel',
  nounPlural: 'panels',
  getId: panel => panel.id,
  fromDoc: (id, data) => ({
    id,
    title: data.title,
    prompt: data.prompt,
    showInSummary: coerceShowInSummary(data.showInSummary, data.id),
    autoGenerate: data.autoGenerate || false,
    order: data.order || 0,
    audience: data.audience ?? 'medical',
    outputFormat: coerceInsightOutputFormat(data.outputFormat),
    languagePolicy: coerceInsightLanguagePolicy(data.languagePolicy),
    templateLibraryRevision: typeof data.templateLibraryRevision === 'number'
      ? data.templateLibraryRevision
      : undefined,
    createdAt: data.createdAt?.toDate(),
    updatedAt: data.updatedAt?.toDate(),
  }),
  toDoc: (panel, now) => ({
    id: panel.id,
    title: panel.title,
    prompt: panel.prompt,
    showInSummary: panel.showInSummary,
    autoGenerate: panel.autoGenerate,
    order: panel.order,
    audience: panel.audience ?? 'medical',
    outputFormat: coerceInsightOutputFormat(panel.outputFormat),
    languagePolicy: coerceInsightLanguagePolicy(panel.languagePolicy),
    ...(typeof panel.templateLibraryRevision === 'number'
      ? { templateLibraryRevision: panel.templateLibraryRevision }
      : {}),
    createdAt: panel.createdAt ? Timestamp.fromDate(panel.createdAt) : now,
    updatedAt: now,
  }),
  subscribeOrdering: { mode: 'query' },
})

/**
 * Get all clinical insight panels for a user
 */
export async function getUserClinicalInsightPanels(userId: string): Promise<ClinicalInsightPanel[]> {
  return panelSync.getAll(userId)
}

/**
 * Save or update a clinical insight panel
 */
export async function saveClinicalInsightPanel(
  userId: string,
  panel: ClinicalInsightPanel
): Promise<boolean> {
  return panelSync.save(userId, panel)
}

/**
 * Delete a clinical insight panel
 */
export async function deleteClinicalInsightPanel(
  userId: string,
  panelId: string
): Promise<boolean> {
  return panelSync.remove(userId, panelId)
}

/**
 * Subscribe to real-time clinical insight panel updates
 */
export function subscribeToClinicalInsightPanels(
  userId: string,
  onUpdate: (panels: ClinicalInsightPanel[]) => void
): Unsubscribe {
  return panelSync.subscribe(userId, onUpdate)
}

/**
 * Batch save multiple clinical insight panels (for migration)
 */
export async function batchSaveClinicalInsightPanels(
  userId: string,
  panels: ClinicalInsightPanel[]
): Promise<boolean> {
  return panelSync.batchSave(userId, panels)
}

/**
 * Atomically apply only locally changed panels. This prevents another device's
 * unrelated templates from being re-created by a stale full-library save.
 */
export async function applyClinicalInsightPanelChanges(
  userId: string,
  upserts: ClinicalInsightPanel[],
  deleteIds: string[]
): Promise<boolean> {
  return panelSync.applyChanges(userId, upserts, deleteIds)
}

/**
 * Replace all clinical insight panels (delete all existing, then save new ones)
 */
export async function replaceAllClinicalInsightPanels(
  userId: string,
  panels: ClinicalInsightPanel[]
): Promise<boolean> {
  return panelSync.replaceAll(userId, panels)
}

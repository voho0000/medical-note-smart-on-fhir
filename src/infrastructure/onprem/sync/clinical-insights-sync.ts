export type PanelAudience = 'medical' | 'patient'

export interface ClinicalInsightPanel {
  id: string
  title: string
  prompt: string
  showInSummary: boolean
  autoGenerate: boolean
  order: number
  audience: PanelAudience
  createdAt?: Date
  updatedAt?: Date
}

export async function getUserClinicalInsightPanels(
  _userId: string,
): Promise<ClinicalInsightPanel[]> {
  return []
}

export async function saveClinicalInsightPanel(
  _userId: string,
  _panel: ClinicalInsightPanel,
): Promise<boolean> {
  return false
}

export async function deleteClinicalInsightPanel(
  _userId: string,
  _panelId: string,
): Promise<boolean> {
  return false
}

export function subscribeToClinicalInsightPanels(
  _userId: string,
  onUpdate: (panels: ClinicalInsightPanel[]) => void,
): () => void {
  onUpdate([])
  return () => {}
}

export async function batchSaveClinicalInsightPanels(
  _userId: string,
  _panels: ClinicalInsightPanel[],
): Promise<boolean> {
  return false
}

export async function replaceAllClinicalInsightPanels(
  _userId: string,
  _panels: ClinicalInsightPanel[],
): Promise<boolean> {
  return false
}

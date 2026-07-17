export type TemplateAudience = 'medical' | 'patient'

export interface ChatTemplate {
  id: string
  label: string
  content: string
  shortcut?: string
  order: number
  audience: TemplateAudience
  createdAt?: Date
  updatedAt?: Date
}

export async function getUserChatTemplates(_userId: string): Promise<ChatTemplate[]> {
  return []
}

export async function saveChatTemplate(
  _userId: string,
  _template: ChatTemplate,
): Promise<boolean> {
  return false
}

export async function deleteChatTemplate(
  _userId: string,
  _templateId: string,
): Promise<boolean> {
  return false
}

export function subscribeToChatTemplates(
  _userId: string,
  onUpdate: (templates: ChatTemplate[]) => void,
): () => void {
  onUpdate([])
  return () => {}
}

export async function batchSaveChatTemplates(
  _userId: string,
  _templates: ChatTemplate[],
): Promise<boolean> {
  return false
}

export async function replaceAllChatTemplates(
  _userId: string,
  _templates: ChatTemplate[],
): Promise<boolean> {
  return false
}

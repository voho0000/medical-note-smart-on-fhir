import { useMemo } from 'react'
import { useChatTemplates } from '@/src/application/providers/chat-templates.provider'
import type { SlashTemplate } from '../utils/slash-trigger'

/**
 * The templates offered by the "/shortcut" menu. v1 = the user's personal chat
 * templates (audience-aware, carrying the explicit `shortcut` keyword). Built
 * to be extended later with prompt-gallery entries — just concat another
 * mapped list here.
 */
export function useSlashTemplates(): SlashTemplate[] {
  const { templates } = useChatTemplates()
  return useMemo(
    () =>
      (templates || [])
        .filter((t) => t.content?.trim())
        .map((t) => ({
          id: t.id,
          label: t.label,
          shortcut: t.shortcut,
          body: t.content,
          source: 'personal' as const,
        })),
    [templates],
  )
}

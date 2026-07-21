// Use Case: Follow-up Suggestions (pure-AI, JSON output).
// After a chat answer, propose 3–4 short, diverse "next step" prompts the
// clinician is likely to want. Pure prompt+parse, no state/framework — runs on
// a cheap model and fails closed (empty list) so it can never break the chat.
import type { AiMessage } from '@/src/core/entities/ai.entity'
import { tryExtractJsonValue } from '@/src/core/utils/llm-json.utils'
import { MODEL_ROLE_IDS } from '@/src/shared/constants/ai-models.constants'

export interface FollowupSuggestion {
  /** Short button text, in the UI language (≤ ~12 words). */
  label: string
  /** The full message sent to the chat when the chip is clicked. */
  prompt: string
}

// Cheap, fast, free-via-proxy model — never the user's (possibly slow/expensive)
// chat model. Matches SAFETY_ALERTS_MODEL_ID's reasoning: a background helper
// shouldn't ride the main model.
export const FOLLOWUP_MODEL_ID = MODEL_ROLE_IDS['followup-suggestions']

export interface GenerateFollowupInput {
  lastUser: string
  lastAssistant: string
  locale: 'en' | 'zh-TW'
  /** Who's reading — biases the KIND of suggestion. 'medical' (default) → clinical;
   *  'patient' → plain-language. Kept as a literal union so core stays provider-free. */
  audience?: 'medical' | 'patient'
  /** Deep-research vs quick-chat mode — biases multi-step vs single-step suggestions. */
  isDeepMode?: boolean
  /** The reader's own recent questions this session — mirror their interests/phrasing
   *  (implicit personalisation). The current question is filtered out automatically. */
  recentUserMessages?: string[]
}

export class GenerateFollowupSuggestionsUseCase {
  buildMessages(input: GenerateFollowupInput): AiMessage[] {
    const lang = input.locale === 'zh-TW' ? 'Traditional Chinese (zh-TW)' : 'English'

    // Personalisation lever ① — tailor the KINDS of suggestion to who's reading and
    // how they're working, so chips feel "for me" rather than generic.
    const audienceLine =
      input.audience === 'patient'
        ? 'The reader is a PATIENT or family member: keep every suggestion in plain language ' +
          '(what this means for them, daily self-care, what to ask at the next visit, warning ' +
          'signs to watch for) — no clinical jargon.'
        : 'The reader is a MEDICAL PROFESSIONAL: keep suggestions clinically substantive ' +
          '(deeper analysis of a finding, differential diagnoses, latest guideline/evidence, ' +
          'medication/management, follow-up or referral).'
    const modeLine = input.isDeepMode
      ? 'They are in deep-research mode — lean toward suggestions worth multi-step reasoning, ' +
        'evidence lookup, or cross-referencing the record.'
      : 'They are in quick-chat mode — lean toward concise, single-step suggestions.'

    const system =
      'You generate follow-up suggestions for a clinical documentation assistant. ' +
      'Given the latest exchange, propose 3-4 SHORT, SPECIFIC next actions the reader is ' +
      'likely to want next. ' +
      audienceLine + ' ' + modeLine + ' ' +
      'Keep the 3-4 suggestions DIVERSE (do not collapse to one kind). ' +
      'Ground each one in the actual content above (real findings, drugs, diagnoses), and ' +
      'do NOT repeat what the user already asked. ' +
      `Write each "label" in ${lang}, concise (a button, ≤ ~12 words). "prompt" is the ` +
      'full message to send if the chip is clicked (can be longer, same language). ' +
      'Output ONLY a JSON object — no markdown fences, no other text:\n' +
      '{"suggestions":[{"label":"<short button text>","prompt":"<full message>"}]}'

    // Personalisation lever ② — the reader's earlier questions this session are an
    // AVOID-LIST, not topics to re-raise. The model only sees the last turn otherwise,
    // so it could recycle something asked a few turns back; feeding the covered set
    // keeps every suggestion genuinely NEW across the whole session. Drop the current
    // question + blanks/dupes (they'd just be noise).
    const currentQ = (input.lastUser || '').trim()
    const recent = (input.recentUserMessages || [])
      .map((m) => (m || '').trim())
      .filter((m) => m.length > 0 && m !== currentQ)
      .slice(-5)
    const recentBlock = recent.length
      ? `\n\nAlready asked and answered earlier this session — do NOT re-suggest any of these; ` +
        `propose genuinely NEW next steps that build beyond them:\n` +
        recent.map((m) => `- ${m.slice(0, 200)}`).join('\n')
      : ''

    const user =
      `Latest user message:\n${currentQ.slice(0, 1500)}\n\n` +
      `Assistant answer:\n${(input.lastAssistant || '').slice(0, 3000)}` +
      recentBlock
    return [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ]
  }

  /** Tolerant parse: shared fence/prose-stripping extractor, then validate. */
  parse(text: string): FollowupSuggestion[] {
    if (!text || !text.trim()) return []
    const obj = tryExtractJsonValue(text) as any
    if (obj === null) return []
    const arr = Array.isArray(obj?.suggestions) ? obj.suggestions : []
    return arr
      .filter((s: any) => s && typeof s.label === 'string' && typeof s.prompt === 'string')
      .map((s: any) => ({ label: s.label.trim().slice(0, 80), prompt: s.prompt.trim() }))
      .filter((s: FollowupSuggestion) => s.label.length > 0 && s.prompt.length > 0)
      .slice(0, 4)
  }
}

export const generateFollowupSuggestionsUseCase = new GenerateFollowupSuggestionsUseCase()

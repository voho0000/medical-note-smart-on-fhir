/**
 * Template fill-in (FR-09): prompts may carry placeholders such as
 * `{{藥物名稱}}` or `[新開藥物名稱]`. They become input fields in the preview,
 * the substituted text is what gets copied or brought into the workspace,
 * and the typed values live only in that dialog session (never persisted).
 */

export interface TemplateVariable {
  /** Placeholder name as written, e.g. 藥物名稱 */
  name: string
  /** Every literal occurrence, e.g. `{{藥物名稱}}` and `[藥物名稱]` */
  tokens: string[]
}

const MAX_NAME_LENGTH = 40
const CURLY = /\{\{\s*([^{}\n]{1,40}?)\s*\}\}/g
// Square brackets are only a placeholder when short, on one line, not a markdown
// link target and not a plain number or list marker.
const SQUARE = /\[([^[\]\n]{1,40})\](?!\()/g
const NOT_A_NAME = /^(?:\d+|x|\s*)$/i

export function extractTemplateVariables(prompt: string): TemplateVariable[] {
  const found = new Map<string, Set<string>>()
  const add = (rawName: string, token: string) => {
    const name = rawName.trim()
    if (!name || name.length > MAX_NAME_LENGTH || NOT_A_NAME.test(name)) return
    if (!found.has(name)) found.set(name, new Set())
    found.get(name)!.add(token)
  }
  for (const match of prompt.matchAll(CURLY)) add(match[1], match[0])
  for (const match of prompt.matchAll(SQUARE)) add(match[1], match[0])
  return [...found.entries()].map(([name, tokens]) => ({ name, tokens: [...tokens] }))
}

/** Replace every filled placeholder; empty values leave the placeholder in place. */
export function applyTemplateVariables(prompt: string, values: Record<string, string>, variables = extractTemplateVariables(prompt)): string {
  let result = prompt
  for (const variable of variables) {
    const value = values[variable.name]?.trim()
    if (!value) continue
    for (const token of variable.tokens) result = result.split(token).join(value)
  }
  return result
}

export function missingTemplateVariables(values: Record<string, string>, variables: TemplateVariable[]): string[] {
  return variables.filter((variable) => !values[variable.name]?.trim()).map((variable) => variable.name)
}

// Legacy "safety" insight-panel cleanup. Pure (no React / firebase deps) so it
// is unit-testable in isolation.
//
// STRICT: only the PRISTINE legacy default is removed — a panel whose id is the
// fixed default "safety" AND whose prompt is still the original EN/ZH default.
// An EDITED one (prompt changed; id stays "safety") is KEPT, to respect the
// user's work. A user-created panel can NEVER match: ids from addPanel() are
// random UUIDs, never the literal "safety" — even if the user titles it 安全警示
// or copies the prompt.
const LEGACY_SAFETY_PROMPTS = new Set<string>([
  "Review the clinical context and flag any immediate patient safety risks, including drug interactions, abnormal results, or urgent follow-up needs. Respond with concise bullet points ordered by severity.",
  "檢視臨床資料並標記任何立即的病人安全風險，包括藥物交互作用、異常結果或緊急追蹤需求。以簡潔的條列式回應，依嚴重程度排序。",
])

export function stripLegacySafetyPanels<T extends { id: string; prompt: string }>(panels: T[]): T[] {
  return panels.filter((p) => !(p.id === "safety" && LEGACY_SAFETY_PROMPTS.has(p.prompt)))
}

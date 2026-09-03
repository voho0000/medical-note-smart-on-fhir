# Manual document context retention — local review

Status: experimental branch checkpoint for cross-machine review (2026-09-03). Not approved for master or deployment.

## Policy change

- Explicit `custom` document selections survive every adaptive fitting tier.
- Selected document bodies are preserved in full, including record-level prioritization.
- Optional non-document records use the remaining budget. Existing mandatory safety-record rules remain unchanged.
- If retained content cannot fit, surface overflow; do not silently deselect, discard or truncate manual documents.
- Summary transport retries may remove optional source-navigation overhead, but cannot slice clinical text for custom selections, even on non-VGH providers.
- Custom-selection cache identities include `manualDocumentPolicy: complete-v1` so old summaries that omitted selected documents are not reused.
- Empty custom selection remains empty. Automatic/latest/recent/all modes retain their existing fitting rules.

## Boundaries

This builds on the already-unreleased VGH policy in this worktree: estimated patient context capped at 100,000 tokens and complete input capped at 150,000 tokens, with model capacity also respected. It does not introduce a 50K routing threshold, change automatic document selection, or validate summary quality/provider latency.

Token counts are local estimates. Provider overflow still fails visibly if removing optional overhead is insufficient. A fitting target is not a guarantee that the final assembled prompt will fit; full-request preflight remains required.

## Verification / manual acceptance

1. On localhost:3001, import the synthetic cloud-oncology fixture (>1M estimated tokens; no real patient data).
2. Select latest admission, then manually check two additional discharge summaries.
3. After recalculation, all three remain checked and appear in Preview; none are marked excluded by model fitting.
4. Switch models and reopen the drawer. Repeat the Preview check.
5. Select enough complete documents to exceed capacity: retain checks and full bodies, display actionable overflow, and do not submit an oversized request or truncate on retry.
6. Uncheck documents, including the last selected document: omitted documents must not reappear as the latest admission fallback.

Automated coverage includes adaptive tiers, record prioritization, real clinical-input hooks and catalogs, cache identity, overflow notices, and transport preflight/retry. Browser verification uses synthetic data with external network requests blocked; no model requests were made. Check widths: 320, 390, 430, 768, 1024, 1440 CSS pixels.

Known pre-existing experimental-branch issue: initial login/header hydration mismatch before import. Browser assertions exclude that known message only, not interaction errors. Summary quality and real model timings still require separate review before release.

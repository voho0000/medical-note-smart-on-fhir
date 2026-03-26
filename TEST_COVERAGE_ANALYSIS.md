# Test Coverage Analysis

**Date:** 2026-03-26
**Overall Coverage:** ~13% statements (threshold: 70%)
**Test Suites:** 59 total (57 passing, 2 failing)
**Test Cases:** 632 total (630 passing, 2 failing)

---

## Summary

The codebase has 59 test suites with 632 test cases, but coverage is concentrated in a subset of modules. Large portions of the application — especially hooks, providers, infrastructure services, and UI components — have **zero test coverage**. The global coverage threshold of 70% is far from being met.

---

## Failing Tests (2)

| Test File | Failure |
|-----------|---------|
| `__tests__/infrastructure/ai/openai.service.test.ts` | Expects `x-openai-key` header but implementation no longer sends it (line 191) |
| `__tests__/core/use-cases/agent/query-fhir-data.use-case.test.ts` | Expects `Patient?patient=patient-123` but implementation now uses `Patient/patient-123` (line 144) |

**Recommendation:** Fix these two tests first — they indicate the tests drifted from implementation changes.

---

## Modules with 0% Coverage (Critical Gaps)

### Application Layer — Hooks (0%)

These hooks contain complex state management, side effects, and business orchestration logic:

| File | Why It Matters |
|------|---------------|
| `src/application/hooks/ai/use-fhir-tools.hook.ts` | FHIR tool integration for AI agents |
| `src/application/hooks/ai/use-literature-tools.hook.ts` | Literature search tool integration |
| `src/application/hooks/ai/use-unified-ai.hook.ts` | Central AI orchestration hook |
| `src/application/hooks/chat/use-auto-save-chat.hook.ts` | Auto-save logic — data loss risk |
| `src/application/hooks/chat/use-chat-history.hook.ts` | Chat history management |
| `src/application/hooks/chat/use-chat-session.hook.ts` | Session lifecycle management |
| `src/application/hooks/chat/use-send-message.hook.ts` | Core message sending flow |
| `src/application/hooks/chat/use-smart-title-generation.hook.ts` | AI title generation |
| `src/application/hooks/clinical-insights/use-generate-insight.hook.ts` | Clinical insight generation |
| `src/application/hooks/data/use-clinical-data-mapper.hook.ts` | Data mapping logic |
| `src/application/hooks/use-clinical-context.hook.ts` | Clinical context aggregation |
| `src/application/hooks/use-transcription.hook.ts` | Audio transcription |

### Application Layer — Providers (0%)

All providers are completely untested:

- `app-providers.tsx`, `asr.provider.tsx`, `auth.provider.tsx`, `chat-templates.provider.tsx`
- `clinical-insights-config.provider.tsx`, `data-selection.provider.tsx`, `language.provider.tsx`
- `query-provider.tsx`, `right-panel.provider.tsx`, `theme.provider.tsx`

### Core Layer (0%)

| File | Why It Matters |
|------|---------------|
| `src/core/categories/*.ts` (8 files) | Data category definitions — foundational to clinical data handling |
| `src/core/registry/data-category.registry.ts` | Registry pattern for categories |
| `src/core/services/clinical-data-collection.service.ts` | Clinical data collection orchestration |
| `src/core/services/translation.service.ts` | Translation service |
| `src/core/use-cases/clinical-data/fetch-clinical-data.use-case.ts` | Core use case for fetching clinical data |
| `src/core/utils/data-grouping.utils.ts` | Data grouping logic |
| `src/core/utils/date-filter.utils.ts` | Date filtering logic |

### Infrastructure Layer (0%)

| File | Why It Matters |
|------|---------------|
| `src/infrastructure/ai/factories/ai-provider.factory.ts` | Factory for AI providers — determines which service is used |
| `src/infrastructure/ai/interceptors/proxy-fetch.interceptor.ts` | Proxy/fetch interception logic |
| `src/infrastructure/ai/streaming/*.ts` (3 files) | Streaming adapters for AI responses |
| `src/infrastructure/ai/tools/*.ts` (3 files) | FHIR and literature tool definitions |
| `src/infrastructure/ai/transformers/*.ts` (2 files) | Request transformers for AI services |
| `src/infrastructure/firebase/*.ts` (4 files) | Firebase auth, sync, usage tracking, chat repo |
| `src/infrastructure/image/image-processor.service.ts` | Image processing service |

### Shared Layer (0%)

| File | Why It Matters |
|------|---------------|
| `src/shared/components/*.tsx` (11 files) | All UI components — zero component tests |
| `src/shared/hooks/storage/use-local-storage.hook.ts` | localStorage persistence |
| `src/shared/utils/context-window-manager.ts` | AI context window management |
| `src/shared/utils/file-to-base64.utils.ts` | File conversion utility |
| `src/shared/utils/reports-count.utils.ts` | Report counting logic (226 lines!) |
| `src/shared/utils/token-estimator.ts` | Token estimation for AI |
| `src/shared/config/feature-registry.ts` | Feature flag registry |
| `src/shared/config/firebase.config.ts` | Firebase configuration |
| `src/shared/config/right-panel-registry.ts` | Right panel configuration |
| `src/shared/config/ui-theme.config.ts` | UI theme configuration |

---

## Modules with Low Coverage (Needs Improvement)

| Module | Stmts | Branch | Lines | Key Gaps |
|--------|-------|--------|-------|----------|
| `application/hooks/clinical-context/` | 5.4% | 2.9% | 4.4% | Context hooks for allergies, conditions, medications, vitals, etc. |
| `core/errors/` | 21.2% | 1.3% | 20.6% | Error classes (ai, fhir, validation) mostly untested |
| `shared/config/` | 28.8% | 44% | 26.8% | Feature registry, firebase config, UI theme |
| `infrastructure/fhir/client/` | 36.8% | 25% | 35.3% | FHIR client service — critical for data access |
| `shared/utils/` | 50.2% | 42.1% | 50.5% | crypto.utils partially covered; 4 files at 0% |
| `infrastructure/ai/services/` | 51.3% | 41.2% | 52.7% | AI services (perplexity, transcription) gaps |
| `shared/di/` | 54.1% | 44.8% | 51.3% | DI container and service registry |
| `application/stores/` | 64.7% | 72.7% | 93.1% | Store functions coverage is low at 42.6% |

---

## Prioritized Recommendations

### Priority 1: Fix Failing Tests
1. **Fix `openai.service.test.ts`** — Update test to match current header implementation
2. **Fix `query-fhir-data.use-case.test.ts`** — Update expected URL format from query string to path-based

### Priority 2: High-Impact Pure Logic (easy to test, high value)
3. **`src/shared/utils/reports-count.utils.ts`** — 226 lines of pure logic at 0% coverage
4. **`src/shared/utils/token-estimator.ts`** — Token estimation affects AI behavior
5. **`src/shared/utils/context-window-manager.ts`** — Context window management affects AI quality
6. **`src/core/utils/data-grouping.utils.ts`** — Data grouping logic, pure functions
7. **`src/core/utils/date-filter.utils.ts`** — Date filtering logic, pure functions
8. **`src/shared/utils/crypto.utils.ts`** — Increase from 65% to full coverage

### Priority 3: Core Business Logic
9. **`src/core/services/clinical-data-collection.service.ts`** — Orchestrates clinical data collection
10. **`src/core/use-cases/clinical-data/fetch-clinical-data.use-case.ts`** — Core use case
11. **`src/core/categories/*.ts`** — Category definitions are foundational
12. **`src/core/errors/*.ts`** — Increase error handling coverage from 21%

### Priority 4: Infrastructure Services
13. **`src/infrastructure/ai/factories/ai-provider.factory.ts`** — Factory correctness is critical
14. **`src/infrastructure/ai/transformers/*.ts`** — Request transformation correctness
15. **`src/infrastructure/ai/streaming/*.ts`** — Streaming adapter correctness
16. **`src/infrastructure/fhir/client/fhir-client.service.ts`** — Increase from 37% to >80%
17. **`src/infrastructure/firebase/repositories/chat-session.repository.ts`** — Data persistence

### Priority 5: Application Hooks (require React testing setup)
18. **`src/application/hooks/chat/use-send-message.hook.ts`** — Core user flow
19. **`src/application/hooks/chat/use-auto-save-chat.hook.ts`** — Data loss prevention
20. **`src/application/hooks/ai/use-unified-ai.hook.ts`** — Central AI orchestration
21. **`src/application/hooks/clinical-context/use*.ts`** — Clinical context hooks (currently 5%)
22. **`src/shared/hooks/storage/use-local-storage.hook.ts`** — Persistence hook

### Priority 6: UI Components (requires component testing setup)
23. **`src/shared/components/*.tsx`** — All 11 components have zero tests. Start with `ErrorBoundary.tsx` and `MarkdownRenderer.tsx` which handle complex rendering logic.

---

## Estimated Effort to Reach 70% Coverage

The codebase has approximately 150+ source files. To reach the 70% threshold:

- **~40 new test files** need to be created (for 0% coverage modules)
- **~10 existing test files** need expanded test cases (for low-coverage modules)
- **2 test files** need bug fixes (failing tests)
- Focus on Priorities 1-3 first — they are pure logic/services that are straightforward to unit test and will provide the fastest coverage gains

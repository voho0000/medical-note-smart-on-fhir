# Features - Public API Documentation

## Overview

Each feature in this directory has a **Barrel File** (`index.ts`) that defines its public API. This enforces encapsulation and prevents cross-feature coupling.

## Architecture Rules

### ✅ DO: Import from feature's public API

```typescript
// ✅ Correct - Use barrel file
import { MedicalChatFeature } from '@/features/medical-chat'
import { ClinicalInsightsFeature } from '@/features/clinical-insights'
import { AllergiesCard, VitalsCard } from '@/features/clinical-summary'
```

### ❌ DON'T: Import internal implementation

```typescript
// ❌ Wrong - Don't access internal files
import MedicalChat from '@/features/medical-chat/components/MedicalChat'
import { useStreamingChat } from '@/features/medical-chat/hooks/useStreamingChat'
```

### ❌ DON'T: Cross-feature dependencies

```typescript
// ❌ Wrong - Features should not depend on each other
import { SomeHook } from '@/features/other-feature/hooks/SomeHook'
```

## Feature Catalog

### 1. Medical Chat
**Entry Point:** `@/features/medical-chat`

```typescript
import { MedicalChatFeature } from '@/features/medical-chat'

// Usage
<MedicalChatFeature />
```

**Description:** AI-powered medical chat with normal and agent modes.

---

### 2. Clinical Insights
**Entry Point:** `@/features/clinical-insights`

```typescript
import { ClinicalInsightsFeature } from '@/features/clinical-insights'

// Usage
<ClinicalInsightsFeature />
```

**Description:** AI-generated clinical insights with customizable panels.

---

### 3. Data Selection
**Entry Point:** `@/features/data-selection`

```typescript
import { DataSelectionFeature } from '@/features/data-selection'

// Usage
<DataSelectionFeature />
```

**Description:** Interactive data selection and filtering interface.

---

### 4. Settings
**Entry Point:** `@/features/settings`

```typescript
import { SettingsFeature } from '@/features/settings'

// Usage
<SettingsFeature />
```

**Description:** Application settings and configuration.

---

### 5. Clinical Summary
**Entry Point:** `@/features/clinical-summary`

**Special Note:** This feature exports multiple cards for flexible composition.

```typescript
import { 
  AllergiesCard,
  DiagnosesCard,
  MedListCard,
  PatientInfoCard,
  ReportsCard,
  VisitHistoryCard,
  VitalsCard
} from '@/features/clinical-summary'

// Usage - Compose as needed
<div>
  <PatientInfoCard />
  <VitalsCard />
  <MedListCard />
</div>
```

**Available Cards:**
- `AllergiesCard` - Patient allergies
- `DiagnosesCard` - Diagnoses/conditions
- `MedListCard` - Medication list
- `PatientInfoCard` - Patient demographics
- `ReportsCard` - Diagnostic reports
- `VisitHistoryCard` - Encounter history
- `VitalsCard` - Vital signs

## Dependencies

Features can depend on:
- ✅ `@/src/core/*` - Domain entities and use cases
- ✅ `@/src/application/*` - Application hooks and providers
- ✅ `@/src/infrastructure/*` - Infrastructure services
- ✅ `@/src/shared/*` - Shared utilities and components
- ✅ `@/components/ui/*` - UI components
- ❌ `@/features/*` - Other features (NOT ALLOWED)

## Internal Structure

Each feature follows this structure:

```
features/
  feature-name/
    ├── index.ts              # 🚪 Public API (Barrel File)
    ├── Feature.tsx           # Main component
    ├── components/           # Internal components
    ├── hooks/                # Internal hooks
    ├── utils/                # Internal utilities
    └── types/                # Internal types
```

**Only `index.ts` exports are public.** Everything else is internal implementation.

## Benefits

1. **Encapsulation** - Internal changes don't affect consumers
2. **Clear Boundaries** - Easy to understand what's public vs private
3. **Refactoring Safety** - Can reorganize internals without breaking imports
4. **Prevents Coupling** - Forces features to be independent
5. **Better Tree-shaking** - Bundlers can optimize unused code

## Enforcement

Consider adding ESLint rules to enforce these patterns:

```json
{
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "patterns": [
          {
            "group": ["@/features/*/*"],
            "message": "Import from feature's index.ts instead: @/features/feature-name"
          }
        ]
      }
    ]
  }
}
```

## Questions?

If you need to share functionality between features, consider:
1. Moving it to `@/src/shared/*` (for UI/utilities)
2. Moving it to `@/src/core/*` (for business logic)
3. Moving it to `@/src/application/*` (for application-level concerns)

**Never** create direct dependencies between features.

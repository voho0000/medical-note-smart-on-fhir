# 重構實施路線圖

## 策略：在現有 Repo 上漸進式重構

**不需要重開新的 repo！** 我們將採用安全的漸進式重構策略。

---

## 階段 0: 準備工作（1 天）

### 1. 建立重構分支
```bash
git checkout -b refactor/clean-architecture
```

### 2. 建立功能開關
```typescript
// src/shared/config/feature-flags.ts
export const FEATURE_FLAGS = {
  USE_REFACTORED_CLINICAL_INSIGHTS: false,
  USE_REFACTORED_MEDICAL_CHAT: false,
  USE_UNIFIED_AI_HOOKS: false,
} as const

// 可以透過環境變數覆蓋
if (process.env.NEXT_PUBLIC_USE_REFACTORED_FEATURES === 'true') {
  FEATURE_FLAGS.USE_REFACTORED_CLINICAL_INSIGHTS = true
  FEATURE_FLAGS.USE_REFACTORED_MEDICAL_CHAT = true
  FEATURE_FLAGS.USE_UNIFIED_AI_HOOKS = true
}
```

### 3. 建立測試基準
```bash
# 執行所有測試，確保當前狀態正常
npm test

# 記錄測試結果
npm test -- --coverage > test-baseline.txt
```

---

## 階段 1: 建立新架構（已完成 ✅）

- ✅ 統一錯誤處理系統
- ✅ AI 服務介面
- ✅ useUnifiedAi hook
- ✅ useClinicalInsights 重構範例

---

## 階段 2: 重構 Clinical Insights（3-5 天）

### 步驟 2.1: 建立新的 Hook（1 天）
```bash
# 將 .refactored.ts 重命名為實際檔案
mv features/clinical-insights/hooks/useClinicalInsights.refactored.ts \
   features/clinical-insights/hooks/useClinicalInsights.v2.ts
```

### 步驟 2.2: 建立新的 Feature 組件（1 天）
```typescript
// features/clinical-insights/Feature.v2.tsx
import { useClinicalInsights } from './hooks/useClinicalInsights.v2'

export default function ClinicalInsightsFeatureV2() {
  const { t } = useLanguage()
  const insights = useClinicalInsights()
  
  return (
    <ScrollArea className="h-full pr-3">
      <InsightTabs
        panels={insights.panels}
        states={insights.panelStates}
        onGenerate={insights.generate}
        onStop={insights.stop}
        onUpdateResponse={insights.updateResponse}
        onUpdatePrompt={insights.updatePrompt}
      />
    </ScrollArea>
  )
}
```

### 步驟 2.3: 使用功能開關切換（1 天）
```typescript
// features/clinical-insights/Feature.tsx
import { FEATURE_FLAGS } from '@/src/shared/config/feature-flags'
import ClinicalInsightsFeatureV1 from './Feature.v1'
import ClinicalInsightsFeatureV2 from './Feature.v2'

export default function ClinicalInsightsFeature() {
  if (FEATURE_FLAGS.USE_REFACTORED_CLINICAL_INSIGHTS) {
    return <ClinicalInsightsFeatureV2 />
  }
  return <ClinicalInsightsFeatureV1 />
}
```

### 步驟 2.4: 測試和驗證（1-2 天）
```bash
# 開啟功能開關測試
NEXT_PUBLIC_USE_REFACTORED_FEATURES=true npm run dev

# 執行測試
npm test features/clinical-insights

# 手動測試所有功能
# - 生成 insights
# - 編輯 prompts
# - 停止生成
# - 錯誤處理
```

### 步驟 2.5: 清理舊代碼（1 天）
```bash
# 確認新版本穩定後
rm features/clinical-insights/Feature.v1.tsx
rm features/clinical-insights/hooks/useInsightPanels.ts
rm features/clinical-insights/hooks/useInsightGeneration.ts
rm features/clinical-insights/hooks/useAutoGenerate.ts

# 更新 Feature.tsx 直接使用 v2
```

**Commit:**
```bash
git add .
git commit -m "refactor(clinical-insights): unify hooks and simplify architecture

- Consolidate 3 hooks into useClinicalInsights
- Reduce code from ~500 to ~300 lines
- Improve error handling with unified error system
- Add comprehensive tests"
```

---

## 階段 3: 重構 Medical Chat（3-5 天）

### 步驟 3.1: 建立統一的 Chat Hook
```typescript
// features/medical-chat/hooks/useMedicalChat.v2.ts
export function useMedicalChat(mode: 'normal' | 'agent' = 'normal') {
  // 統一 normal 和 agent mode
}
```

### 步驟 3.2: 簡化組件
```typescript
// features/medical-chat/components/MedicalChat.v2.tsx
export function MedicalChatV2() {
  const chat = useMedicalChat(isAgentMode ? 'agent' : 'normal')
  // 簡化邏輯
}
```

### 步驟 3.3: 功能開關切換
```typescript
// features/medical-chat/Feature.tsx
if (FEATURE_FLAGS.USE_REFACTORED_MEDICAL_CHAT) {
  return <MedicalChatV2 />
}
return <MedicalChat />
```

### 步驟 3.4: 測試和清理

**Commit:**
```bash
git commit -m "refactor(medical-chat): unify normal and agent mode

- Consolidate useStreamingChat and useAgentChat
- Reduce code from ~600 to ~400 lines
- Improve state management"
```

---

## 階段 4: 簡化 Provider 架構（2-3 天）

### 步驟 4.1: 建立 Provider 組合
```typescript
// src/application/providers/app.provider.tsx
export function AppProviders({ children }) {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <ApiKeyProvider>
          <NoteProvider>
            <FhirProvider>
              <ClinicalProvider>
                {children}
              </ClinicalProvider>
            </FhirProvider>
          </NoteProvider>
        </ApiKeyProvider>
      </LanguageProvider>
    </ErrorBoundary>
  )
}
```

### 步驟 4.2: 更新 app/layout.tsx
```typescript
import { AppProviders } from '@/src/application/providers/app.provider'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <AppProviders>
          {children}
        </AppProviders>
      </body>
    </html>
  )
}
```

**Commit:**
```bash
git commit -m "refactor(providers): simplify provider architecture

- Create AppProviders composition
- Create ClinicalProvider composition
- Reduce component dependencies"
```

---

## 階段 5: 更新測試（2-3 天）

### 步驟 5.1: 更新單元測試
```bash
# 更新所有受影響的測試
__tests__/features/clinical-insights/
__tests__/features/medical-chat/
__tests__/application/hooks/
```

### 步驟 5.2: 新增整合測試
```typescript
// __tests__/integration/clinical-insights.integration.test.tsx
describe('Clinical Insights Integration', () => {
  it('should generate all insights successfully', async () => {
    // 完整流程測試
  })
})
```

**Commit:**
```bash
git commit -m "test: update tests for refactored architecture

- Update unit tests
- Add integration tests
- Improve test coverage to 80%+"
```

---

## 階段 6: 文件和清理（1-2 天）

### 步驟 6.1: 更新文件
```bash
# 更新 README.md
# 更新 ARCHITECTURE_UPDATE.md
# 建立 MIGRATION_GUIDE.md
```

### 步驟 6.2: 移除功能開關
```typescript
// 移除所有 FEATURE_FLAGS
// 直接使用重構後的版本
```

### 步驟 6.3: 最終清理
```bash
# 移除所有 .v1, .v2 後綴
# 移除舊的 hooks
# 移除未使用的 imports
```

**Commit:**
```bash
git commit -m "docs: update documentation for refactored architecture

- Update README with new architecture
- Add migration guide
- Remove feature flags"
```

---

## 階段 7: 合併到主分支（1 天）

### 步驟 7.1: 最終測試
```bash
# 執行所有測試
npm test

# 執行 E2E 測試（如果有）
npm run test:e2e

# 手動測試所有功能
```

### 步驟 7.2: Code Review
```bash
# 建立 Pull Request
# 自我審查所有變更
# 確認沒有破壞性變更
```

### 步驟 7.3: 合併
```bash
git checkout main
git merge refactor/clean-architecture
git push origin main
```

---

## 時間估計

| 階段 | 工作量 | 時間 |
|------|--------|------|
| 階段 0: 準備 | 小 | 1 天 |
| 階段 1: 新架構 | 中 | ✅ 已完成 |
| 階段 2: Clinical Insights | 大 | 3-5 天 |
| 階段 3: Medical Chat | 大 | 3-5 天 |
| 階段 4: Providers | 中 | 2-3 天 |
| 階段 5: 測試 | 中 | 2-3 天 |
| 階段 6: 文件 | 小 | 1-2 天 |
| 階段 7: 合併 | 小 | 1 天 |
| **總計** | | **13-20 天** |

---

## 風險管理

### 如果遇到問題怎麼辦？

1. **功能開關保護**
   - 隨時可以切回舊版本
   - 不影響生產環境

2. **Git 分支保護**
   - 所有變更都在分支上
   - 可以隨時回退

3. **測試覆蓋**
   - 每個階段都有測試
   - 確保功能正常

4. **逐步進行**
   - 一次只重構一個功能
   - 驗證後再繼續

---

## 成功指標

- ✅ 所有測試通過
- ✅ 程式碼減少 30-40%
- ✅ 沒有功能退化
- ✅ 錯誤處理統一
- ✅ 架構清晰一致
- ✅ 文件完整更新

---

## 下一步

**立即開始：**
```bash
# 1. 建立分支
git checkout -b refactor/clean-architecture

# 2. 建立功能開關
# 建立 src/shared/config/feature-flags.ts

# 3. 開始重構 Clinical Insights
# 使用已經建立的 useClinicalInsights.refactored.ts
```

**需要我幫忙嗎？**
我可以幫你：
1. 建立功能開關系統
2. 完成 Clinical Insights 重構
3. 逐步驗證每個階段
4. 建立測試

不需要重開 repo，讓我們在現有基礎上安全地重構！

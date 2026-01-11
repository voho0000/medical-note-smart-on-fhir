# 重構分析報告 (Refactoring Analysis Report)

## 執行摘要 (Executive Summary)

本文件分析當前程式碼庫的架構問題，並提供符合 SOLID 原則、Clean Code 和 Clean Architecture 的重構計劃。

## 當前架構評估 (Current Architecture Assessment)

### 優點 (Strengths)
1. ✅ **已採用 Clean Architecture 分層**
   - Domain Layer (`src/core`)
   - Application Layer (`src/application`)
   - Infrastructure Layer (`src/infrastructure`)
   - Presentation Layer (`features`, `app`)

2. ✅ **Feature-based 組織**
   - 功能模組化 (clinical-insights, medical-chat, data-selection, settings)
   - Registry 模式實現可插拔架構

3. ✅ **依賴注入基礎設施**
   - Service Container (`src/shared/di`)
   - Repository Pattern

### 主要問題 (Major Issues)

#### 1. **重複的 AI 調用邏輯 (Duplicated AI Call Logic)**

**問題位置:**
- `src/application/hooks/use-ai-query.hook.ts` - 非串流 AI 查詢
- `src/application/hooks/use-ai-streaming.hook.ts` - 串流 AI 查詢
- `features/medical-chat/hooks/useStreamingChat.ts` - Chat 專用串流
- `features/medical-chat/hooks/useAgentChat.ts` - Agent 模式
- `features/clinical-insights/hooks/useInsightGeneration.ts` - Insights 生成

**違反原則:**
- ❌ DRY (Don't Repeat Yourself)
- ❌ Single Responsibility Principle

**影響:**
- 每個功能實現自己的 AI 調用邏輯
- 錯誤處理不一致
- 難以統一更新 AI 提供者

#### 2. **不一致的狀態管理模式 (Inconsistent State Management)**

**問題:**
- Clinical Insights: 使用 local state + custom hooks
- Medical Chat: 使用 multiple custom hooks
- Data Selection: 使用 Provider pattern
- Settings: 混合使用 localStorage + Provider

**違反原則:**
- ❌ Consistency
- ❌ Single Source of Truth

#### 3. **Provider 過度耦合 (Provider Over-coupling)**

**問題位置:**
- `src/application/providers/` 包含 10+ providers
- 功能組件依賴多個 providers
- Provider 之間存在隱式依賴

**範例 (Clinical Insights Feature):**
```typescript
// 依賴 6 個不同的 providers
useLanguage()
useClinicalContext()
useApiKey()
useClinicalData()
useClinicalInsightsConfig()
useNote()
```

**違反原則:**
- ❌ Dependency Inversion Principle
- ❌ Interface Segregation Principle

#### 4. **Business Logic 在 Hooks 中 (Business Logic in Hooks)**

**問題:**
- Hooks 包含業務邏輯而非僅狀態管理
- Use Cases 未被充分利用
- 難以測試和重用

**範例:**
- `features/clinical-insights/hooks/useInsightGeneration.ts` - 包含生成邏輯
- `features/medical-chat/hooks/useAgentChat.ts` - 包含 agent 邏輯

**違反原則:**
- ❌ Separation of Concerns
- ❌ Testability

#### 5. **型別定義分散 (Scattered Type Definitions)**

**問題位置:**
- `src/core/entities/` - Domain entities
- `src/application/dto/` - DTOs
- `src/shared/types/` - Shared types
- Feature-level `types/` - Feature-specific types
- Inline types in components

**違反原則:**
- ❌ Single Source of Truth
- ❌ Type Safety

#### 6. **缺乏統一的錯誤處理 (Lack of Unified Error Handling)**

**問題:**
- 每個功能自行處理錯誤
- 錯誤訊息格式不一致
- 沒有全域錯誤邊界策略

#### 7. **重複的 FHIR 資料轉換邏輯 (Duplicated FHIR Data Transformation)**

**問題位置:**
- `src/application/hooks/clinical-context/` - 多個格式化函數
- `src/core/services/clinical-data-mapper.service.ts` - Mapper service
- Feature-level 轉換邏輯

## 重構策略 (Refactoring Strategy)

### 階段 1: 核心層重構 (Core Layer Refactoring)

#### 1.1 統一 AI Service 介面
**目標:** 建立單一、一致的 AI 服務介面

**新增檔案:**
```
src/core/interfaces/services/
├── ai-service.interface.ts (統一介面)
├── ai-streaming.interface.ts (串流介面)
└── ai-model.interface.ts (模型定義)
```

**重構檔案:**
```
src/infrastructure/ai/
├── services/
│   ├── ai-service.ts (重構)
│   ├── streaming-service.ts (新增)
│   └── model-registry.ts (新增)
└── providers/
    ├── openai-provider.ts (重構)
    └── gemini-provider.ts (重構)
```

#### 1.2 統一 Use Cases
**目標:** 將業務邏輯從 hooks 移至 use cases

**新增 Use Cases:**
```
src/core/use-cases/ai/
├── query-ai.use-case.ts (已存在，需重構)
├── stream-ai.use-case.ts (新增)
├── generate-insight.use-case.ts (新增)
└── chat-with-ai.use-case.ts (新增)
```

#### 1.3 統一錯誤處理
**新增檔案:**
```
src/core/errors/
├── base.error.ts
├── ai.error.ts
├── fhir.error.ts
└── validation.error.ts
```

### 階段 2: 應用層重構 (Application Layer Refactoring)

#### 2.1 重構 Hooks 架構
**原則:** Hooks 只負責狀態管理，業務邏輯委派給 Use Cases

**重構策略:**
```
src/application/hooks/
├── ai/
│   ├── use-ai-service.hook.ts (統一 AI hook)
│   └── use-ai-streaming.hook.ts (統一串流 hook)
├── clinical-data/
│   └── use-clinical-data.hook.ts (統一資料 hook)
└── shared/
    ├── use-async-operation.hook.ts (通用非同步操作)
    └── use-error-handler.hook.ts (統一錯誤處理)
```

#### 2.2 簡化 Provider 架構
**目標:** 減少 provider 數量，使用組合模式

**重構策略:**
```
src/application/providers/
├── app.provider.tsx (根 provider，組合所有子 providers)
├── clinical.provider.tsx (組合臨床相關 providers)
├── ai.provider.tsx (組合 AI 相關 providers)
└── settings.provider.tsx (設定 provider)
```

#### 2.3 統一 DTO 和 Mappers
**新增檔案:**
```
src/application/mappers/
├── fhir-to-domain.mapper.ts
├── domain-to-dto.mapper.ts
└── ai-response.mapper.ts
```

### 階段 3: 功能層重構 (Feature Layer Refactoring)

#### 3.1 Clinical Insights 重構
**重點:**
- 移除重複的 AI 調用邏輯
- 使用統一的 AI service hook
- 簡化 hook 依賴

#### 3.2 Medical Chat 重構
**重點:**
- 統一 normal mode 和 agent mode
- 使用統一的串流 service
- 簡化狀態管理

#### 3.3 Data Selection 重構
**重點:**
- 已經相對乾淨，微調即可
- 確保使用統一的 mapper

#### 3.4 Settings 重構
**重點:**
- 統一設定儲存邏輯
- 使用統一的加密服務

### 階段 4: 基礎設施層重構 (Infrastructure Layer Refactoring)

#### 4.1 AI Infrastructure
**重構:**
- 統一 OpenAI 和 Gemini 提供者介面
- 實現 Strategy Pattern 用於模型選擇
- 統一串流處理

#### 4.2 FHIR Infrastructure
**重構:**
- 統一 FHIR 資料獲取
- 實現 Repository Pattern
- 統一錯誤處理

## SOLID 原則應用 (SOLID Principles Application)

### S - Single Responsibility Principle
- ✅ 每個 Use Case 只負責一個業務操作
- ✅ Hooks 只負責狀態管理
- ✅ Services 只負責外部整合

### O - Open/Closed Principle
- ✅ 使用 Strategy Pattern 支援多個 AI 提供者
- ✅ Registry Pattern 支援功能擴展
- ✅ Interface-based 設計

### L - Liskov Substitution Principle
- ✅ AI Providers 可互換
- ✅ Repository 實作可替換

### I - Interface Segregation Principle
- ✅ 細分 AI 服務介面 (query, stream, agent)
- ✅ 避免 fat interfaces

### D - Dependency Inversion Principle
- ✅ 依賴抽象介面而非具體實作
- ✅ 使用 Dependency Injection

## 重構優先順序 (Refactoring Priority)

### 高優先級 (High Priority)
1. ✅ 統一 AI Service 介面和實作
2. ✅ 建立統一錯誤處理機制
3. ✅ 重構 Clinical Insights (最複雜的功能)

### 中優先級 (Medium Priority)
4. ✅ 重構 Medical Chat
5. ✅ 簡化 Provider 架構
6. ✅ 統一 Use Cases

### 低優先級 (Low Priority)
7. ✅ 重構 Data Selection (已相對乾淨)
8. ✅ 重構 Settings
9. ✅ 優化型別定義

## 測試策略 (Testing Strategy)

### 單元測試 (Unit Tests)
- Use Cases: 100% 覆蓋率
- Services: 核心邏輯測試
- Mappers: 轉換邏輯測試

### 整合測試 (Integration Tests)
- AI Service 整合
- FHIR Client 整合
- Provider 整合

### E2E 測試 (End-to-End Tests)
- 關鍵使用者流程
- 功能完整性測試

## 預期成果 (Expected Outcomes)

### 程式碼品質
- ✅ 減少 40% 重複程式碼
- ✅ 提升 50% 測試覆蓋率
- ✅ 統一錯誤處理和日誌

### 可維護性
- ✅ 清晰的架構邊界
- ✅ 一致的設計模式
- ✅ 易於擴展新功能

### 開發效率
- ✅ 新功能開發時間減少 30%
- ✅ Bug 修復時間減少 40%
- ✅ 程式碼審查時間減少 25%

## 風險評估 (Risk Assessment)

### 高風險
- 重構過程中可能引入新 bug
- 需要大量測試確保功能正常

### 緩解措施
- 逐步重構，每個階段完成後測試
- 保持向後相容
- 建立完整的測試套件

## 時間估算 (Time Estimation)

- 階段 1 (核心層): 2-3 天
- 階段 2 (應用層): 3-4 天
- 階段 3 (功能層): 4-5 天
- 階段 4 (基礎設施層): 2-3 天
- 測試和驗證: 2-3 天

**總計: 13-18 天**

## 下一步行動 (Next Actions)

1. 建立統一的 AI Service 介面
2. 實作統一的錯誤處理
3. 重構 Clinical Insights 功能
4. 逐步重構其他功能
5. 建立完整測試套件

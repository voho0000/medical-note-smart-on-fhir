# 下一步重構機會分析

## ✅ 已完成的重構（今天）

### 1. 統一 AI 介面
- ✅ Clinical Insights 使用 useUnifiedAi
- ✅ Medical Chat (useStreamingChat, useChatMessages) 使用 useUnifiedAi
- ✅ useAgentChat 改進錯誤處理

### 2. 統一錯誤處理
- ✅ 所有 hooks 使用 getUserErrorMessage
- ✅ 一致的錯誤訊息格式

### 3. 移除重複
- ✅ 刪除 use-ai-query.hook.ts
- ✅ 刪除 use-ai-streaming.hook.ts

---

## 🔍 發現的架構問題

### 1. Provider 過度耦合 ⚠️

**問題：** 13 個 providers，組件依賴多個 providers

**範例：**
```typescript
// Clinical Insights Feature 依賴 6 個 providers
useLanguage()
useClinicalContext()
useApiKey()
useClinicalData()
useClinicalInsightsConfig()
useNote()
```

**影響：**
- 組件難以測試
- 依賴關係不清晰
- 違反 Dependency Inversion Principle

**建議解決方案：**
- 選項 A: 建立 Facade Providers（組合多個 providers）
- 選項 B: 使用 Dependency Injection Container
- 選項 C: 保持現狀（providers 本身不是問題）

**優先級：** 中 - 不影響功能，但影響可維護性

---

### 2. formatErrorMessage vs getUserErrorMessage 🤔

**發現：**
- `features/medical-chat/utils/formatErrorMessage.ts` - 詳細的錯誤訊息映射
- `src/core/errors/index.ts` - getUserErrorMessage - 簡單的錯誤處理

**問題：**
- 兩個類似功能的函數
- formatErrorMessage 更詳細，有多語言支持
- getUserErrorMessage 更簡單

**建議解決方案：**
- 選項 A: 合併兩者，將 formatErrorMessage 的邏輯移到 core/errors
- 選項 B: 保持兩者，各有用途
- 選項 C: 移除 formatErrorMessage，統一使用 getUserErrorMessage

**優先級：** 低 - 功能重複但不影響使用

---

### 3. 業務邏輯在 Hooks 中 ⚠️

**問題：**
- Hooks 包含業務邏輯而非僅狀態管理
- Use Cases 未被充分利用

**範例：**
- `useInsightGeneration` - 包含生成邏輯
- `useAgentChat` - 包含 agent 邏輯

**建議解決方案：**
- 提取業務邏輯到 Use Cases
- Hooks 只負責狀態管理和調用 Use Cases

**優先級：** 中 - 符合 Clean Architecture，但需要大量重構

---

### 4. Clinical Summary 功能未檢查 📋

**發現：**
- `features/clinical-summary/` 有 60 個項目
- 可能有類似的 AI 調用邏輯
- 未檢查是否有重複

**建議：**
- 檢查 clinical-summary 是否使用舊的 AI hooks
- 如有，重構使用 useUnifiedAi

**優先級：** 高 - 可能有未統一的 AI 調用

---

### 5. Settings 功能 ⚙️

**發現：**
- `features/settings/` 有 12 個項目
- 混合使用 localStorage + Provider

**可能問題：**
- 狀態管理不一致
- 可能有重複的 localStorage 邏輯

**優先級：** 低 - 功能性問題，不是架構問題

---

## 🎯 建議的下一步重構順序

### 優先級 1: 檢查 Clinical Summary（高）
**原因：** 可能有未統一的 AI 調用邏輯
**預計時間：** 30-60 分鐘
**風險：** 低

### 優先級 2: 合併錯誤處理函數（中）
**原因：** 減少重複，統一錯誤處理
**預計時間：** 1-2 小時
**風險：** 低

### 優先級 3: Provider 架構改進（中）
**原因：** 改善可測試性和依賴管理
**預計時間：** 3-4 小時
**風險：** 中

### 優先級 4: 提取業務邏輯到 Use Cases（低）
**原因：** 更符合 Clean Architecture
**預計時間：** 1-2 天
**風險：** 高

---

## 📊 目前架構評分

### 已改進的部分 ✅
- **AI 介面統一**: 9/10 (useAgentChat 特殊，可接受)
- **錯誤處理統一**: 8/10 (還有 formatErrorMessage)
- **程式碼重複**: 9/10 (大幅減少)
- **分層清晰**: 8/10 (基本符合 Clean Architecture)

### 待改進的部分 ⚠️
- **Provider 耦合**: 6/10 (多個 providers 依賴)
- **業務邏輯位置**: 6/10 (在 hooks 中而非 use cases)
- **測試覆蓋**: ?/10 (未評估)

---

## 💡 建議

**立即執行：**
1. 檢查 Clinical Summary 是否需要重構
2. Commit 目前的 useAgentChat 改進

**短期（1-2 週）：**
1. 合併錯誤處理函數
2. 增加測試覆蓋

**長期（1 個月+）：**
1. 考慮 Provider 架構改進
2. 逐步提取業務邏輯到 Use Cases

---

**最後更新**: 2026-01-11
**狀態**: 主要重構完成，剩餘為優化項目

# AI Agent Implementation Guide

## 概述

實作了 AI Agent 功能，讓 AI 可以自動調用 FHIR API 查詢病人資料。使用 **客戶端 tool calling** 架構，在瀏覽器端執行 FHIR 查詢。

## 核心架構設計

### 為什麼使用客戶端 Tool Calling？

SMART on FHIR 的 `fhirclient` 庫是專門為瀏覽器設計的，它依賴：
- `window` 對象
- `sessionStorage` 來管理 OAuth Token
- 瀏覽器的 OAuth2 flow

因此，FHIR client **只能在瀏覽器環境中運行**，無法在 Next.js API Route (Node.js) 中使用。

### 解決方案：客戶端執行 Tools

使用 Vercel AI SDK 的 `streamText` **直接在瀏覽器端執行**：

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (useAgentChat Hook)                                │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  1. streamText({ model, messages, tools })             │ │
│  │     ↓                                                   │ │
│  │  2. AI 決定要調用 queryConditions                       │ │
│  │     ↓                                                   │ │
│  │  3. 在瀏覽器執行 tool.execute()                         │ │
│  │     ↓                                                   │ │
│  │  4. FHIR.oauth2.ready() ✓ (有 sessionStorage)          │ │
│  │     ↓                                                   │ │
│  │  5. 獲取 FHIR 資料                                      │ │
│  │     ↓                                                   │ │
│  │  6. 回傳給 AI 繼續生成回答                              │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## 架構組件

### 1. Use Case 層
- `@/src/core/use-cases/agent/query-fhir-data.use-case.ts`
  - 封裝 FHIR 查詢邏輯
  - 支援所有主要 FHIR 資源類型

### 2. Infrastructure 層
- `@/src/infrastructure/ai/tools/fhir-tools.ts`
  - 定義 6 個 FHIR tools 供 AI 調用
  - **在瀏覽器端執行**，可以訪問 fhirClient
  - 使用 zod 進行參數驗證

### 3. Application 層
- `@/features/medical-chat/hooks/useAgentChat.ts`
  - **客戶端 tool calling** 實作
  - 使用 AI SDK 的 `streamText` 在瀏覽器執行
  - 創建 FHIR tools 並傳遞給 AI
  - 處理 streaming 響應

### 4. UI 層
- `@/features/medical-chat/components/MedicalChat.tsx`
  - 加入模式切換按鈕（一般模式 vs 深入模式）
  - 根據模式使用不同的 chat hook

## 可用的 FHIR Tools

1. **queryConditions** - 查詢診斷/病況
   - 參數：category, clinicalStatus
   
2. **queryMedications** - 查詢用藥
   - 參數：status
   
3. **queryAllergies** - 查詢過敏史
   - 參數：type
   
4. **queryObservations** - 查詢檢驗/生命徵象
   - 參數：category, code
   
5. **queryProcedures** - 查詢手術/處置
   - 參數：status
   
6. **queryEncounters** - 查詢就診紀錄
   - 參數：class

## 使用方式

### 在 Medical Chat 中使用

1. 點擊「深入模式」按鈕
2. 輸入問題，例如：
   - "這個病人有什麼診斷？"
   - "最近的檢驗結果是什麼？"
   - "病人有哪些用藥？"
   - "有過敏史嗎？"

3. AI 會自動：
   - 判斷需要查詢哪些資料
   - 調用對應的 FHIR tools
   - 整合查詢結果
   - 生成回答

### 示例對話

**User**: "這個病人有什麼慢性病？"

**AI**: 
1. 調用 `queryConditions` tool
2. 獲取病人的 Condition 資料
3. 分析並回答

## 安全性

- ✅ 僅限查詢當前病人的資料（patientId 由系統提供）
- ✅ 僅限讀取操作，無寫入權限
- ✅ 使用 FHIR client 的權限控制

## 已知問題

### TypeScript 類型錯誤
`src/infrastructure/ai/tools/fhir-tools.ts` 中有 TypeScript 類型警告，這是因為：
- AI SDK v6.0.6 的 `tool` 函數類型定義較嚴格
- 不影響運行時功能
- 可以通過以下方式解決：
  1. 升級到最新版 AI SDK
  2. 或使用 `// @ts-ignore` 暫時忽略

## 測試建議

1. **基本功能測試**
   - 切換到深入模式
   - 詢問病人的診斷、用藥、檢驗等
   - 確認 AI 能正確調用 tools

2. **錯誤處理測試**
   - 沒有 patient ID 時的錯誤處理
   - API key 缺失時的錯誤處理
   - FHIR 查詢失敗時的錯誤處理

3. **模式切換測試**
   - 在一般模式和深入模式間切換
   - 確認使用正確的 chat hook

## 未來改進

1. **增強 Tools**
   - 加入更多 FHIR 資源類型
   - 支援更複雜的查詢參數
   - 加入資料聚合功能

2. **UI 改進**
   - 顯示 tool calling 過程
   - 顯示查詢到的資料摘要
   - 加入 loading 狀態指示

3. **效能優化**
   - 快取查詢結果
   - 批次查詢優化
   - Token 使用優化

4. **文獻搜尋**
   - 整合 PubMed API
   - 整合 Semantic Scholar
   - 結合 FHIR 資料和文獻進行分析

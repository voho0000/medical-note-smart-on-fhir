# Chat History Implementation Guide

## 概述

本文檔說明 Chat History（對話紀錄）功能的完整實作，包括架構設計、資料結構、以及如何解決多沙盒環境下的病人 ID 衝突問題。

## 核心設計理念

### 1. 病人中心 (Patient-Centric) 設計

與 ChatGPT 的時間軸設計不同，我們的 Chat History 是**以病人為中心**的：

- ✅ **正確做法**：只顯示當前病人的歷史對話
- ❌ **錯誤做法**：顯示所有對話（可能混淆不同病人）

### 2. 多沙盒/多醫院支援

**關鍵問題**：不同 FHIR 沙盒（如 Cerner、Epic）可能有相同的 Patient ID

**解決方案**：使用 `fhirServerUrl` + `patientId` 的組合作為唯一識別

```typescript
// Firestore 查詢條件
WHERE patientId == "123" 
  AND fhirServerUrl == "https://fhir.epic.com/..."
```

這樣可以確保：
- 在 Cerner 沙盒的病人 123 ≠ Epic 沙盒的病人 123
- 同一個醫師在不同醫院工作時，資料不會混淆

## 資料結構

### Firestore Schema

```
/users/{userId}/chats/{chatId}
```

**欄位說明**：

```typescript
{
  id: string                    // Firestore 自動生成的 Document ID
  userId: string                // Firebase Auth User ID
  fhirServerUrl: string         // FHIR 伺服器 URL (用於區分不同沙盒/醫院)
  patientId: string             // FHIR Patient ID
  patientName: string           // 病人姓名（冗餘欄位，方便顯示）
  title: string                 // 對話標題（AI 自動生成或取前 50 字）
  summary?: string              // 對話摘要（選填，未來可用 AI 生成）
  messages: ChatMessage[]       // 完整對話內容
  createdAt: Timestamp          // 建立時間
  updatedAt: Timestamp          // 最後更新時間
  messageCount: number          // 訊息數量
  tags?: string[]               // 標籤（選填，如 "Medication", "Diagnosis"）
}
```

### 複合索引 (Composite Index)

Firestore 需要建立以下索引以支援查詢：

```
Collection: users/{userId}/chats
Fields:
  - patientId (Ascending)
  - fhirServerUrl (Ascending)
  - updatedAt (Descending)
```

## 架構層級

### 1. Core Layer (核心層)

**Entities** (`src/core/entities/chat-session.entity.ts`):
- `ChatSessionEntity`: 完整的對話實體
- `ChatSessionMetadata`: 對話元資料（不含完整訊息）
- `CreateChatSessionDto`: 建立對話的 DTO
- `UpdateChatSessionDto`: 更新對話的 DTO

**Interfaces** (`src/core/interfaces/repositories/`):
- `IChatSessionRepository`: 定義 Repository 介面

**Use Cases** (`src/core/use-cases/chat/`):
- `SaveChatSessionUseCase`: 儲存新對話
- `UpdateChatSessionUseCase`: 更新現有對話
- `GetChatHistoryUseCase`: 取得歷史紀錄列表
- `LoadChatSessionUseCase`: 載入完整對話
- `DeleteChatSessionUseCase`: 刪除對話
- `GenerateChatTitleUseCase`: AI 生成對話標題

### 2. Infrastructure Layer (基礎設施層)

**Repository** (`src/infrastructure/firebase/repositories/chat-session.repository.ts`):
- 實作 Firestore CRUD 操作
- 處理 Timestamp 轉換
- 提供 real-time subscription

### 3. Application Layer (應用層)

**Stores** (`src/application/stores/`):
- `chat-history.store.ts`: 管理對話列表狀態
- `chat.store.ts`: 管理當前對話訊息（已存在）

**Hooks** (`src/application/hooks/chat/`):
- `use-chat-history.hook.ts`: 載入和管理歷史紀錄
- `use-chat-session.hook.ts`: 載入特定對話
- `use-auto-save-chat.hook.ts`: 自動儲存對話（防抖）
- `use-fhir-context.hook.ts`: 取得 FHIR 上下文（病人 ID、伺服器 URL）

### 4. Presentation Layer (展示層)

**Components** (`features/chat-history/components/`):
- `ChatHistoryDrawer.tsx`: 左側抽屜式歷史紀錄面板

## 核心功能

### 1. 自動儲存 (Auto-save)

**特點**：
- 使用 **debounce** 機制，預設 5 秒後才儲存
- 避免每次輸入都寫入 Firestore（節省成本）
- 只在訊息數量變化時才觸發儲存

**實作位置**：
```typescript
// features/medical-chat/components/MedicalChat.tsx
useAutoSaveChat({
  patientId,
  patientName,
  fhirServerUrl,
  debounceMs: 5000,
  enabled: !!user && !!patientId && !!fhirServerUrl,
})
```

### 2. Real-time 同步

使用 Firestore `onSnapshot` 實現即時同步：

```typescript
// src/application/hooks/chat/use-chat-history.hook.ts
useEffect(() => {
  const unsubscribe = repository.subscribe(
    userId,
    patientId,
    fhirServerUrl,
    (updatedSessions) => {
      setSessions(updatedSessions)
    }
  )
  return () => unsubscribe()
}, [userId, patientId, fhirServerUrl])
```

### 3. 對話標題生成

**預設行為**：取第一則使用者訊息的前 50 字

**進階功能**（未來可實作）：
```typescript
// 使用 AI 生成簡短標題
const title = await generateChatTitleUseCase.execute(messages, aiService)
// 例如："高血壓藥物調整諮詢"
```

## UI/UX 設計

### 歷史紀錄面板

**位置**：聊天工具列最左側的 "History" 按鈕

**功能**：
1. **新對話**：清空當前對話，開始新的對話
2. **載入歷史**：點擊任一紀錄，載入該對話
3. **刪除對話**：滑鼠懸停時顯示刪除按鈕
4. **時間顯示**：智慧顯示相對時間（剛剛、5分鐘前、2小時前、3天前）

**空狀態**：
- 顯示提示訊息："尚無對話紀錄"
- 引導使用者開始對話

### 國際化 (i18n)

已新增以下翻譯鍵：

**英文** (`src/shared/i18n/locales/en.ts`):
```typescript
chatHistory: {
  title: 'Chat History',
  description: 'View your previous conversations',
  conversationsFor: 'Conversations for',
  newChat: 'New Chat',
  noHistory: 'No chat history yet',
  startConversation: 'Start a conversation to see it here',
  confirmDelete: 'Delete this conversation?',
  justNow: 'Just now',
  minutesAgo: 'm ago',
  hoursAgo: 'h ago',
  daysAgo: 'd ago',
}
```

**繁體中文** (`src/shared/i18n/locales/zh-TW.ts`):
```typescript
chatHistory: {
  title: '對話紀錄',
  description: '查看您的歷史對話',
  conversationsFor: '對話紀錄：',
  newChat: '新對話',
  noHistory: '尚無對話紀錄',
  startConversation: '開始對話後將顯示在這裡',
  confirmDelete: '確定要刪除此對話嗎？',
  justNow: '剛剛',
  minutesAgo: '分鐘前',
  hoursAgo: '小時前',
  daysAgo: '天前',
}
```

## 測試指南

### 1. 基本功能測試

**測試步驟**：
1. 登入 Firebase Auth
2. 透過 SMART Launch 進入應用程式
3. 開始一段對話（至少 2-3 則訊息）
4. 等待 5 秒（auto-save debounce）
5. 點擊 "History" 按鈕
6. 確認對話出現在列表中

**預期結果**：
- ✅ 對話標題顯示正確
- ✅ 訊息數量正確
- ✅ 時間顯示正確

### 2. 多沙盒測試

**測試步驟**：
1. 在 Cerner 沙盒中，對病人 ID "123" 進行對話
2. 在 Epic 沙盒中，對病人 ID "123" 進行對話
3. 分別查看兩個沙盒的歷史紀錄

**預期結果**：
- ✅ 兩個沙盒的對話**不會混淆**
- ✅ 每個沙盒只顯示該沙盒的對話

### 3. 載入對話測試

**測試步驟**：
1. 點擊歷史紀錄中的某一則對話
2. 確認對話內容完整載入
3. 繼續對話，新增訊息
4. 重新整理頁面

**預期結果**：
- ✅ 對話內容完整載入
- ✅ 新訊息自動儲存
- ✅ 重新整理後對話保留

### 4. 刪除對話測試

**測試步驟**：
1. 滑鼠懸停在某則對話上
2. 點擊刪除按鈕
3. 確認刪除對話框
4. 確認刪除

**預期結果**：
- ✅ 對話從列表中移除
- ✅ Firestore 中的資料被刪除

## 安全性考量

### 1. 資料隔離

- 每個使用者只能存取自己的對話 (`/users/{userId}/chats`)
- Firestore Security Rules 應設定為：

```javascript
match /users/{userId}/chats/{chatId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

### 2. 敏感資訊

- 對話內容包含病人資料，必須遵守 HIPAA/GDPR
- 建議：
  - 使用 Firestore 的 encryption at rest
  - 定期清理舊對話（例如 90 天後自動刪除）

## 效能優化

### 1. 分頁載入

目前實作載入最近 50 筆對話。未來可實作：

```typescript
async listByUser(userId: string, limit: number = 50, startAfter?: Date)
```

### 2. 快取策略

- 使用 Zustand store 快取對話列表
- 使用 Firestore 的 offline persistence

### 3. 成本控制

- 使用 debounce 減少寫入次數
- 只儲存 metadata 在列表中，完整訊息在點擊時才載入

## 未來擴充

### 1. AI 摘要生成

```typescript
// 在對話結束時，自動生成摘要
const summary = await generateSummaryUseCase.execute(messages)
await updateChatSessionUseCase.execute(chatId, userId, { summary })
```

### 2. 標籤系統

```typescript
// 自動標記對話類型
tags: ["Medication", "Lab Results", "Diagnosis"]
```

### 3. 搜尋功能

```typescript
// 在對話標題和內容中搜尋
searchChats(userId: string, query: string)
```

### 4. 匯出功能

```typescript
// 匯出對話為 PDF 或文字檔
exportChat(chatId: string, format: 'pdf' | 'txt')
```

## 常見問題

### Q1: 為什麼使用 fhirServerUrl 而不是 iss？

A: `fhirServerUrl` 是從 SMART client 的 `state.serverUrl` 取得，更穩定且一致。`iss` 參數可能在不同實作中有差異。

### Q2: 對話會自動儲存嗎？

A: 是的，只要使用者已登入且有病人上下文，對話會在 5 秒 debounce 後自動儲存。

### Q3: 如何手動觸發儲存？

A: 可以使用 `useAutoSaveChat` hook 回傳的 `forceSave()` 函數：

```typescript
const { forceSave } = useAutoSaveChat({ ... })
await forceSave()
```

### Q4: 離線時對話會遺失嗎？

A: 目前實作需要網路連線。未來可以整合 Firestore offline persistence 來支援離線模式。

## 相關檔案

### Core
- `src/core/entities/chat-session.entity.ts`
- `src/core/interfaces/repositories/chat-session.repository.interface.ts`
- `src/core/use-cases/chat/*.use-case.ts`

### Infrastructure
- `src/infrastructure/firebase/repositories/chat-session.repository.ts`

### Application
- `src/application/stores/chat-history.store.ts`
- `src/application/hooks/chat/use-chat-history.hook.ts`
- `src/application/hooks/chat/use-chat-session.hook.ts`
- `src/application/hooks/chat/use-auto-save-chat.hook.ts`
- `src/application/hooks/chat/use-fhir-context.hook.ts`

### Presentation
- `features/chat-history/components/ChatHistoryDrawer.tsx`
- `features/chat-history/index.ts`
- `features/medical-chat/components/MedicalChat.tsx`
- `features/medical-chat/components/ChatToolbar.tsx`

### i18n
- `src/shared/i18n/locales/en.ts`
- `src/shared/i18n/locales/zh-TW.ts`

## 總結

Chat History 功能已完整實作，包含：

✅ 以病人為中心的設計  
✅ 多沙盒/多醫院支援  
✅ 自動儲存（防抖）  
✅ Real-time 同步  
✅ 完整的 Clean Architecture  
✅ 國際化支援  
✅ UI/UX 整合  

這個實作為 SMART on FHIR 比賽提供了強大的連續性照護功能，展現了系統的專業性與實用性。

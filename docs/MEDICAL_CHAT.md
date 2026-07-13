# Medical Chat 功能指南

> 包含 AI 對話、對話歷史、語音錄製等完整功能說明

## 🎯 功能概述

Medical Chat 是本系統的核心 AI 功能，提供：

### AI Agent 對話
- 單一 Agent 路徑，沒有一般／深入模式切換
- AI 依問題自主決定是否調用 FHIR 查詢或醫學文獻搜尋工具
- 病歷不會預先塞入對話；額外背景直接輸入對話框
- 支援 OpenAI、Google Gemini、Perplexity 多種 AI 模型

### 對話歷史
- 📝 依病人分類自動儲存對話
- 🔍 查看特定病人的歷史對話
- 🏥 支援多個 FHIR 沙盒/醫院環境
- 🔄 即時同步對話更新
- 🗑️ 刪除不需要的對話

### 其他功能
- 🎤 語音錄製和 Whisper 轉錄
- 📋 提示範本快速套用
- 🩺 AI Agent 依問題按需查詢 FHIR 資料

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

---

## 🚀 快速開始

### 1. 必要設定

#### Firestore Security Rules

在 Firebase Console 中設定以下規則：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      
      // Chat sessions sub-collection
      match /chats/{chatId} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

#### Firestore Indexes

建立複合索引以支援查詢：

**方法 1：自動建立**
- 執行應用程式後，Firestore 會提示建立索引
- 點擊連結自動建立

**方法 2：手動建立**
1. 前往 Firebase Console > Firestore > Indexes
2. 建立複合索引：
   - Collection: `users/{userId}/chats`
   - Fields:
     - `patientId` (Ascending)
     - `fhirServerUrl` (Ascending)
     - `updatedAt` (Descending)

### 2. 使用流程

1. **登入 Firebase Auth**：在應用程式右上角點擊登入按鈕
2. **透過 SMART Launch 進入**：訪問 SMART Launch URL
3. **開始對話**：在 "Note Chat" 標籤中與 AI 對話
4. **自動儲存**：等待 5 秒，對話會自動儲存
5. **查看歷史**：點擊聊天工具列的 **"History"** 按鈕

---

## 📊 資料結構

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

### 文件範例

```json
{
  "id": "abc123",
  "userId": "firebase-user-id",
  "fhirServerUrl": "https://fhir.epic.com/interconnect-fhir-oauth/api/FHIR/R4",
  "patientId": "eVj5Y.E3TEecZF8RMv4Mag3",
  "patientName": "John Doe",
  "title": "高血壓藥物調整諮詢",
  "messages": [
    {
      "id": "msg1",
      "role": "user",
      "content": "這位病人的血壓控制如何？",
      "timestamp": 1705276800000
    },
    {
      "id": "msg2",
      "role": "assistant",
      "content": "根據最近的生命徵象...",
      "timestamp": 1705276805000
    }
  ],
  "createdAt": "2024-01-15T00:00:00.000Z",
  "updatedAt": "2024-01-15T00:05:00.000Z",
  "messageCount": 2
}
```

---

## 🏗️ 架構設計

### 架構層級

#### 1. Core Layer (核心層)

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

#### 2. Infrastructure Layer (基礎設施層)

**Repository** (`src/infrastructure/firebase/repositories/chat-session.repository.ts`):
- 實作 Firestore CRUD 操作
- 處理 Timestamp 轉換
- 提供 real-time subscription

#### 3. Application Layer (應用層)

**Stores** (`src/application/stores/`):
- `chat-history.store.ts`: 管理對話列表狀態
- `chat.store.ts`: 管理當前對話訊息

**Hooks** (`src/application/hooks/chat/`):
- `use-chat-history.hook.ts`: 載入和管理歷史紀錄
- `use-chat-session.hook.ts`: 載入特定對話
- `use-auto-save-chat.hook.ts`: 自動儲存對話（防抖）
- `use-fhir-context.hook.ts`: 取得 FHIR 上下文

#### 4. Presentation Layer (展示層)

**Components** (`features/chat-history/components/`):
- `ChatHistoryDrawer.tsx`: 左側抽屜式歷史紀錄面板

### 關鍵功能實作

#### 1. 自動儲存 (Auto-save)

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

#### 2. Real-time 同步

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

#### 3. 對話標題生成

**預設行為**：取第一則使用者訊息的前 50 字

**進階功能**（未來可實作）：
```typescript
// 使用 AI 生成簡短標題
const title = await generateChatTitleUseCase.execute(messages, aiService)
// 例如："高血壓藥物調整諮詢"
```

---

## 🎨 UI/UX 設計

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

---

## 🔧 開發者指南

### 關鍵 Hooks

```typescript
// 取得 FHIR 上下文（病人 ID、伺服器 URL）
const { patientId, patientName, fhirServerUrl } = useFhirContext()

// 自動儲存對話
useAutoSaveChat({
  patientId,
  patientName,
  fhirServerUrl,
  debounceMs: 5000,
  enabled: !!user && !!patientId,
})

// 載入歷史紀錄
const { sessions, isLoading, deleteSession } = useChatHistory(
  patientId,
  fhirServerUrl
)

// 載入特定對話
const { loadSession, startNewSession } = useChatSession()
```

### 主要檔案

**Core Layer:**
- `src/core/entities/chat-session.entity.ts`
- `src/core/use-cases/chat/*.use-case.ts`

**Infrastructure:**
- `src/infrastructure/firebase/repositories/chat-session.repository.ts`

**Application:**
- `src/application/stores/chat-history.store.ts`
- `src/application/hooks/chat/use-chat-history.hook.ts`
- `src/application/hooks/chat/use-auto-save-chat.hook.ts`

**UI:**
- `features/chat-history/components/ChatHistoryDrawer.tsx`
- `features/medical-chat/components/ChatToolbar.tsx`

---

## 🐛 常見問題排查

### 問題 1: 對話沒有自動儲存

**檢查項目:**
- ✅ 使用者已登入 Firebase Auth
- ✅ 有 FHIR 上下文（patientId 和 fhirServerUrl 不為 null）
- ✅ 等待至少 5 秒（debounce 時間）
- ✅ 瀏覽器 Console 沒有錯誤訊息

**除錯方法:**
```typescript
// 在 MedicalChat.tsx 中加入 console.log
console.log('[Chat History Debug]', {
  user: !!user,
  patientId,
  fhirServerUrl,
  messagesCount: messages.length
})
```

### 問題 2: 歷史紀錄是空的

**檢查項目:**
- ✅ Firestore Security Rules 設定正確
- ✅ Firestore Indexes 已建立
- ✅ 使用者 ID 與儲存時的 ID 一致

**除錯方法:**
前往 Firebase Console > Firestore，檢查 `/users/{userId}/chats` 是否有資料。

### 問題 3: 不同沙盒的對話混在一起

**原因:** `fhirServerUrl` 沒有正確取得

**解決方法:**
檢查 `useFhirContext` hook 是否正確取得 `client.state.serverUrl`。

### 問題 4: 點擊歷史紀錄沒有反應

**檢查項目:**
- ✅ `useChatSession` hook 正確整合
- ✅ `useChatStore` 的 `setMessages` 函數正常運作

---

## 🔒 安全性考量

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

---

## ⚡ 效能優化

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

---

## 🚀 未來擴充

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

---

## 📋 測試指南

### 基本功能測試

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

### 多沙盒測試

**測試步驟**：
1. 在 Cerner 沙盒中，對病人 ID "123" 進行對話
2. 在 Epic 沙盒中，對病人 ID "123" 進行對話
3. 分別查看兩個沙盒的歷史紀錄

**預期結果**：
- ✅ 兩個沙盒的對話**不會混淆**
- ✅ 每個沙盒只顯示該沙盒的對話

---

## ✅ 部署檢查清單

- [ ] Firebase Auth 已設定
- [ ] Firestore Security Rules 已更新
- [ ] Firestore Indexes 已建立
- [ ] 測試基本儲存/載入功能
- [ ] 測試多沙盒情境
- [ ] 測試刪除功能
- [ ] UI 在手機上正常顯示
- [ ] i18n 翻譯完整

---

## 📚 相關資源

- [Firebase Firestore 文檔](https://firebase.google.com/docs/firestore)
- [SMART on FHIR 規範](http://www.hl7.org/fhir/smart-app-launch/)
- [Clean Architecture 指南](./ARCHITECTURE.md)

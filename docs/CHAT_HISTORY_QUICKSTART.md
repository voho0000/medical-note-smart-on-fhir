# Chat History 快速開始指南

## 🎯 功能概述

Chat History（對話紀錄）功能讓醫師可以：
- 📝 自動儲存與病人的對話
- 🔍 查看特定病人的歷史對話
- 🏥 支援多個 FHIR 沙盒/醫院環境
- 🔄 即時同步對話更新
- 🗑️ 刪除不需要的對話

## 🚀 快速測試

### 1. 啟動應用程式

```bash
npm run dev
```

### 2. 登入 Firebase Auth

在應用程式右上角點擊登入按鈕，使用 Google 或 Email 登入。

### 3. 透過 SMART Launch 進入

訪問 SMART Launch URL（例如從 Cerner 或 Epic 沙盒）：
```
http://localhost:3000/smart/launch?iss=https://fhir.epic.com/...
```

### 4. 開始對話

1. 在右側面板的 "Note Chat" 標籤中
2. 輸入一些訊息與 AI 對話
3. 等待 5 秒（自動儲存會觸發）

### 5. 查看歷史紀錄

1. 點擊聊天工具列最左側的 **"History"** 按鈕
2. 左側抽屜會滑出，顯示當前病人的對話列表
3. 點擊任一對話可以載入該對話內容

## 📋 必要設定

### Firestore Security Rules

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

### Firestore Indexes

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

## 🎨 UI 位置

```
┌─────────────────────────────────────────┐
│  MediPrisma · SMART on FHIR             │
├─────────────────────────────────────────┤
│                                         │
│  [Clinical Summary]  [Note Chat]       │
│                                         │
│  ┌──────────────────────────────────┐  │
│  │ [History] [+Context] [Template]  │  │ ← Chat History 按鈕在這裡
│  │                                  │  │
│  │  對話訊息區域...                 │  │
│  │                                  │  │
│  └──────────────────────────────────┘  │
│                                         │
└─────────────────────────────────────────┘
```

## 🔧 開發者資訊

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

## 📊 資料結構範例

### Firestore 文件範例

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

## 🎯 Demo 腳本（比賽用）

### 情境：展示連續性照護

**步驟 1: 設定情境**
> "這是一位慢性病回診的病人。上個月醫師評估過是否停用抗生素。"

**步驟 2: 點擊 History**
> "醫師不用重新閱讀整份病歷，只要點開對話紀錄..."

**步驟 3: 展示歷史對話**
> "可以看到上個月的對話，標題是 '評估是否停用抗生素'。"

**步驟 4: 載入對話**
> "點擊後，完整的對話內容立刻載入，醫師可以回想起上次的臨床決策邏輯。"

**步驟 5: 繼續對話**
> "醫師可以基於上次的討論，繼續這次的評估。這就是真正的 Longitudinal Care（縱向照護）。"

**亮點:**
- ✨ 以病人為中心，不會混淆不同病人
- ✨ 支援多醫院環境（不同沙盒）
- ✨ 自動儲存，無需手動操作
- ✨ 即時同步，多裝置可用

## 📚 延伸閱讀

- [完整實作文檔](./CHAT_HISTORY_IMPLEMENTATION.md)
- [Clean Architecture 指南](../README.md)
- [Firebase Firestore 文檔](https://firebase.google.com/docs/firestore)

## ✅ 檢查清單

部署前確認：

- [ ] Firebase Auth 已設定
- [ ] Firestore Security Rules 已更新
- [ ] Firestore Indexes 已建立
- [ ] 測試基本儲存/載入功能
- [ ] 測試多沙盒情境
- [ ] 測試刪除功能
- [ ] UI 在手機上正常顯示
- [ ] i18n 翻譯完整

## 🎉 完成！

Chat History 功能已準備就緒。開始使用並享受連續性照護的便利吧！

如有問題，請參考 [完整實作文檔](./CHAT_HISTORY_IMPLEMENTATION.md) 或聯繫開發團隊。

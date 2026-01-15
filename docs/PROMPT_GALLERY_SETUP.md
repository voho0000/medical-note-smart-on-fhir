# Prompt Gallery Firestore 設定指南

## 步驟 1: 建立 Collection

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 選擇你的專案
3. 點擊左側選單的 **Firestore Database**
4. 點擊 **開始集合**（Start collection）
5. 集合 ID 輸入：`sharedPrompts`
6. 先建立一個測試文件（之後可以刪除）

## 步驟 2: 設定安全規則

1. 在 Firestore Database 頁面
2. 點擊上方的 **規則**（Rules）標籤
3. 加入以下規則：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Shared Prompts Collection
    match /sharedPrompts/{promptId} {
      // 所有已登入使用者都可以讀取
      allow read: if request.auth != null;
      
      // 只有已登入使用者可以建立
      allow create: if request.auth != null
        && request.resource.data.keys().hasAll(['title', 'prompt', 'type', 'category', 'specialty', 'tags'])
        && request.resource.data.type in ['chat', 'insight', 'both'];
      
      // 只有作者可以更新和刪除（未來功能）
      allow update, delete: if request.auth != null 
        && request.auth.uid == resource.data.authorId;
    }
    
    // 保留你現有的其他規則...
    // 例如：users, chatSessions 等
  }
}
```

4. 點擊 **發布**（Publish）

## 步驟 3: 建立測試資料

### 方法 A: 手動在 Console 建立

1. 在 Firestore Database 的 **資料**（Data）標籤
2. 點擊 `sharedPrompts` collection
3. 點擊 **新增文件**（Add document）
4. 使用以下範例資料：

#### 範例 1: SOAP 筆記

```
文件 ID: (自動產生)

欄位：
title (string): "SOAP 筆記範本"
description (string): "標準 SOAP 格式的病歷筆記"
prompt (string): "請根據病患資料撰寫 SOAP 筆記：

Subjective (主訴):
- 

Objective (客觀發現):
- 

Assessment (評估):
- 

Plan (計畫):
- "
type (string): "chat"
category (string): "soap"
specialty (array): ["general", "internal"]
tags (array): ["基礎", "通用", "SOAP"]
createdAt (timestamp): (選擇當前時間)
updatedAt (timestamp): (選擇當前時間)
usageCount (number): 0
```

#### 範例 2: 安全警示

```
文件 ID: (自動產生)

欄位：
title (string): "安全警示檢查"
description (string): "自動檢查需要注意的安全事項"
prompt (string): "請檢查以下安全事項並標記需要注意的項目：

1. 藥物交互作用
2. 過敏史衝突
3. 異常檢驗值
4. 重複用藥
5. 劑量異常
6. 禁忌症

請列出所有發現的安全警示。"
type (string): "insight"
category (string): "safety"
specialty (array): ["general"]
tags (array): ["安全", "警示", "藥物"]
createdAt (timestamp): (選擇當前時間)
updatedAt (timestamp): (選擇當前時間)
usageCount (number): 0
```

#### 範例 3: 病程摘要（兩者皆可）

```
文件 ID: (自動產生)

欄位：
title (string): "病程摘要"
description (string): "總結病患的主要診斷和治療進展"
prompt (string): "請總結病患的臨床狀況：

1. 主要診斷
2. 目前治療
3. 近期變化
4. 待辦事項
5. 追蹤計畫"
type (string): "both"
category (string): "summary"
specialty (array): ["general", "internal"]
tags (array): ["摘要", "追蹤"]
createdAt (timestamp): (選擇當前時間)
updatedAt (timestamp): (選擇當前時間)
usageCount (number): 0
```

### 方法 B: 使用 Seed Script（進階）

如果你熟悉 Node.js：

1. 編輯 `scripts/seed-prompts.ts`，填入你的 Firebase 配置
2. 執行：
```bash
npm install -g ts-node
npx ts-node scripts/seed-prompts.ts
```

## 步驟 4: 驗證設定

1. 啟動你的應用程式
2. 登入系統
3. 前往 **Medical Chat**
4. 點擊工具列的 **設定** → **瀏覽範本庫**
5. 應該可以看到你建立的測試 Prompts

## 欄位說明

### 必填欄位

| 欄位 | 類型 | 說明 | 範例 |
|------|------|------|------|
| `title` | string | Prompt 標題 | "SOAP 筆記範本" |
| `prompt` | string | Prompt 內容 | "請根據病患資料..." |
| `type` | string | 類型 | "chat", "insight", "both" |
| `category` | string | 分類 | "soap", "admission", "discharge" 等 |
| `specialty` | array | 科別 | ["general", "internal"] |
| `tags` | array | 標籤 | ["基礎", "通用"] |
| `createdAt` | timestamp | 建立時間 | Firestore Timestamp |
| `updatedAt` | timestamp | 更新時間 | Firestore Timestamp |
| `usageCount` | number | 使用次數 | 0 |

### 選填欄位

| 欄位 | 類型 | 說明 |
|------|------|------|
| `description` | string | 詳細描述 |
| `authorId` | string | 作者 UID（未來功能） |
| `authorName` | string | 作者名稱（未來功能） |

## 可用的值

### Type（類型）
- `chat` - 用於對話
- `insight` - 用於臨床洞察
- `both` - 兩者皆可

### Category（分類）
- `soap` - SOAP 筆記
- `admission` - 入院記錄
- `discharge` - 出院摘要
- `safety` - 安全警示
- `summary` - 臨床摘要
- `progress` - 病程記錄
- `consult` - 會診記錄
- `procedure` - 處置記錄
- `other` - 其他

### Specialty（科別）
- `general` - 一般科
- `internal` - 內科
- `surgery` - 外科
- `emergency` - 急診
- `pediatrics` - 小兒科
- `obstetrics` - 婦產科
- `psychiatry` - 精神科
- `other` - 其他

## 疑難排解

### 問題：無法讀取 Prompts

**可能原因：**
1. Firestore 規則未正確設定
2. 使用者未登入
3. Collection 名稱錯誤

**解決方法：**
1. 檢查 Firestore 規則是否包含 `sharedPrompts` 的讀取權限
2. 確認使用者已登入系統
3. 確認 collection 名稱為 `sharedPrompts`（區分大小寫）

### 問題：Prompts 顯示為空

**可能原因：**
1. Collection 中沒有資料
2. 欄位名稱或類型錯誤

**解決方法：**
1. 在 Firestore Console 確認有資料
2. 檢查欄位名稱和類型是否符合上述說明

### 問題：篩選功能無效

**可能原因：**
1. 欄位值不符合預期格式
2. Array 欄位為空

**解決方法：**
1. 確保 `type`, `category` 使用正確的值
2. 確保 `specialty` 和 `tags` 是陣列且不為空

## 安全性注意事項

1. **不要在 Prompt 中包含病患資訊**
2. **定期檢查分享的 Prompts 內容**
3. **考慮加入審核機制**（未來功能）
4. **限制建立權限**（目前所有登入使用者都可建立）

## 未來擴展

目前的設定支援基本的讀取和建立功能。未來可以擴展：

1. **分享功能** - 使用者可以分享自己的 Prompts
2. **評分系統** - 使用者可以評分和評論
3. **審核機制** - 管理員審核後才公開
4. **版本控制** - 追蹤 Prompt 的修改歷史

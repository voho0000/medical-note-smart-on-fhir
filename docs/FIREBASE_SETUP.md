# Firebase Authentication 設定指南

本文件說明如何設定 Firebase Authentication 和 Firestore 以支援使用者認證和配額管理。

## 前置需求

- Firebase 專案（已建立）
- Firebase CLI（可選）

## 步驟 1: 取得 Firebase 配置

1. 前往 [Firebase Console](https://console.firebase.google.com/)
2. 選擇你的專案
3. 點擊專案設定（齒輪圖示）
4. 在「一般」頁籤中，找到「你的應用程式」區塊
5. 如果還沒有 Web 應用程式，點擊「新增應用程式」並選擇 Web
6. 複製 Firebase SDK 配置

## 步驟 2: 設定環境變數

1. 在專案根目錄創建 `.env.local` 文件
2. 添加以下環境變數（從 Firebase Console 複製）：

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

## 步驟 3: 啟用 Authentication 方法

1. 在 Firebase Console 中，前往 **Authentication** > **Sign-in method**
2. 啟用以下登入方式：
   - **Google** - 點擊「啟用」，設定專案名稱和支援電子郵件
   - **Email/Password** - 點擊「啟用」

### Google 登入設定

1. 啟用 Google 登入提供者
2. 設定專案公開名稱
3. 設定專案支援電子郵件
4. 儲存

## 步驟 4: 設定 Firestore 資料庫

1. 在 Firebase Console 中，前往 **Firestore Database**
2. 點擊「建立資料庫」
3. 選擇「以測試模式啟動」（開發階段）或「以正式版模式啟動」（生產環境）
4. 選擇資料庫位置（建議選擇離使用者最近的區域）

### Firestore 安全規則

在 **Firestore Database** > **規則** 中，設定以下規則：

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Users collection
    match /users/{userId} {
      // Users can read their own document
      allow read: if request.auth != null && request.auth.uid == userId;
      // Users can create their own document on first sign in
      allow create: if request.auth != null && request.auth.uid == userId;
      // Users can update their own document
      allow update: if request.auth != null && request.auth.uid == userId;
      
      // Usage subcollection
      match /usage/{date} {
        // Users can read their own usage
        allow read: if request.auth != null && request.auth.uid == userId;
        // Users can create/update their own usage (for tracking)
        allow create, update: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

## 步驟 5: 測試設定

1. 重新啟動開發伺服器：
   ```bash
   npm run dev
   ```

2. 前往 Settings 頁面

3. 測試登入功能：
   - 點擊「登入以使用免費配額」
   - 嘗試 Google 登入
   - 嘗試 Email 註冊/登入

4. 檢查 Firestore：
   - 前往 Firebase Console > Firestore Database
   - 確認 `users` collection 中有新的使用者文件
   - 確認 `users/{userId}/usage/{date}` 中有使用量記錄

## 資料結構

### Users Collection

```
users/{userId}
  - email: string
  - displayName: string
  - createdAt: string (ISO 8601)
```

### Usage Subcollection

```
users/{userId}/usage/{YYYY-MM-DD}
  - count: number (當日使用次數)
  - date: string (YYYY-MM-DD)
  - createdAt: string (ISO 8601)
  - lastUpdated: string (ISO 8601)
```

## 配額管理

- 預設每日配額：20 次
- 配額在每日 00:00 UTC 重置
- 超過配額後，使用者需要輸入自己的 API key

## 疑難排解

### 問題：Google 登入彈窗被封鎖

**解決方案**：
- 確認瀏覽器允許彈窗
- 檢查 Firebase Console 中的授權網域設定
- 在 Authentication > Settings > Authorized domains 中添加 `localhost`

### 問題：Firestore 權限錯誤

**解決方案**：
- 檢查 Firestore 安全規則
- 確認使用者已登入
- 檢查瀏覽器 Console 的錯誤訊息

### 問題：環境變數未載入

**解決方案**：
- 確認 `.env.local` 文件在專案根目錄
- 重新啟動開發伺服器
- 檢查環境變數名稱是否以 `NEXT_PUBLIC_` 開頭

## 生產環境部署

部署到生產環境時：

1. 在 Firebase Console 的 Authentication > Settings > Authorized domains 中添加你的生產網域
2. 更新 Firestore 安全規則為正式版模式
3. 在部署平台（如 Vercel）設定環境變數
4. 測試所有登入流程

## 相關文件

- [Firebase Authentication 文件](https://firebase.google.com/docs/auth)
- [Firestore 文件](https://firebase.google.com/docs/firestore)
- [Next.js 環境變數](https://nextjs.org/docs/basic-features/environment-variables)

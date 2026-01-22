# 問題回報功能設定指南

## 功能概述

問題回報功能允許使用者直接從應用程式介面回報遇到的問題，系統會自動收集相關資訊並發送郵件到指定信箱。

## UI 位置

問題回報按鈕位於**右上角 header 的最左邊**，按鈕順序為：
```
[問題回報] [FHIR 資訊] [主題切換] [語言切換] [登入/登出]
```

## 功能特點

### 使用者填寫資訊
- ✅ **回報者電子郵件**（必填）- 用於聯繫和追蹤
- ✅ **問題類型**（必填）- 功能錯誤/UI問題/效能問題/功能建議/其他
- ✅ **嚴重程度**（必填）- 低/中/高/緊急
- ✅ **問題描述**（必填，至少 20 字元）
- ✅ **重現步驟**（選填）

### 自動收集的系統資訊
- 時間戳記
- 瀏覽器版本
- 螢幕解析度
- 使用者語言設定
- 當前頁面路徑
- FHIR Server URL（如有連線）
- 患者 ID（如有）

## 郵件服務配置

### 選項 1: 使用 Resend（推薦）

1. **註冊 Resend 帳號**
   - 前往 https://resend.com
   - 註冊並驗證您的帳號

2. **驗證域名**
   - 在 Resend Dashboard 中新增並驗證您的域名
   - 或使用 Resend 提供的測試域名（僅限開發環境）

3. **取得 API Key**
   - 在 Resend Dashboard 建立 API Key
   - 複製 API Key

4. **設定環境變數**
   
   在專案根目錄建立 `.env.local` 檔案：
   ```bash
   RESEND_API_KEY=re_your_api_key_here
   ```

5. **更新發件人地址**
   
   編輯 `app/api/feedback/route.ts`，將第 146 行的發件人地址改為您的域名：
   ```typescript
   from: "MediPrisma <noreply@yourdomain.com>", // 改為您的域名
   ```

### 選項 2: 使用其他郵件服務

如果您想使用其他郵件服務（如 SendGrid、Mailgun、Nodemailer + SMTP），請修改 `app/api/feedback/route.ts` 中的郵件發送邏輯。

#### 使用 Nodemailer 範例：

1. **安裝依賴**
   ```bash
   npm install nodemailer
   npm install -D @types/nodemailer
   ```

2. **更新 API route**
   ```typescript
   import nodemailer from 'nodemailer'
   
   const transporter = nodemailer.createTransport({
     host: process.env.SMTP_HOST,
     port: parseInt(process.env.SMTP_PORT || '587'),
     secure: false,
     auth: {
       user: process.env.SMTP_USER,
       pass: process.env.SMTP_PASS,
     },
   })
   
   await transporter.sendMail({
     from: process.env.SMTP_FROM,
     to: 'voho0000@gmail.com',
     replyTo: email,
     subject: `[問題回報] ${getIssueTypeLabel(issueType)}`,
     html: emailContent,
     text: plainTextContent,
   })
   ```

3. **設定環境變數**
   ```bash
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-app-password
   SMTP_FROM=MediPrisma <your-email@gmail.com>
   ```

## 開發環境測試

在沒有配置 `RESEND_API_KEY` 的情況下：
- 系統會記錄回報內容到控制台
- 前端會顯示成功訊息
- 不會實際發送郵件

這樣可以在開發環境中測試功能而不需要配置郵件服務。

## 郵件內容範例

系統會發送格式化的 HTML 郵件，包含：

```
主旨：[問題回報] 功能錯誤 (Bug) - 高 (High)

內容：
- 回報者 Email: user@example.com
- 問題類型: 功能錯誤 (Bug)
- 嚴重程度: 高 (High)
- 問題描述: [使用者輸入的描述]
- 重現步驟: [使用者輸入的步驟]
- 系統資訊:
  * 時間: 2026-01-22 23:20:30
  * 瀏覽器: Chrome 120.0.0
  * FHIR Server: https://...
  * 患者 ID: 12345
  * 當前頁面: /smart/callback
```

## 多語系支援

問題回報功能支援繁體中文和英文：
- 繁體中文：`src/shared/i18n/locales/zh-TW.ts`
- 英文：`src/shared/i18n/locales/en.ts`

## 隱私考量

- ✅ 僅收集患者 ID，不收集患者姓名
- ✅ 使用者需主動提供自己的電子郵件
- ✅ 所有資料僅用於問題診斷
- ✅ 建議使用者在截圖前移除敏感資訊

## 檔案結構

```
app/api/feedback/
  └── route.ts                    # API endpoint

src/shared/components/
  ├── FeedbackButton.tsx          # 問題回報按鈕
  ├── FeedbackDialog.tsx          # 問題回報對話框
  └── index.ts                    # 元件匯出

src/shared/i18n/locales/
  ├── en.ts                       # 英文翻譯
  └── zh-TW.ts                    # 繁體中文翻譯

app/page.tsx                      # 整合到 header
```

## 疑難排解

### 郵件發送失敗

1. **檢查 API Key**
   - 確認 `.env.local` 中的 `RESEND_API_KEY` 正確
   - 確認 API Key 有發送郵件的權限

2. **檢查域名驗證**
   - 確認 Resend 中的域名已完成驗證
   - 確認發件人地址使用已驗證的域名

3. **檢查控制台錯誤**
   - 開啟瀏覽器開發者工具
   - 查看 Network 標籤中的 `/api/feedback` 請求
   - 查看伺服器控制台的錯誤訊息

### 表單驗證問題

- 電子郵件格式錯誤：確認輸入有效的 email 格式
- 問題描述太短：至少需要 20 個字元
- 未選擇問題類型：必須選擇一個類型

## 未來改進建議

- [ ] 加入截圖上傳功能
- [ ] 整合 Firebase Storage 儲存附件
- [ ] 加入問題追蹤編號
- [ ] 建立管理後台查看回報
- [ ] 加入自動回覆郵件功能

## 技術支援

如有任何問題，請聯繫：voho0000@gmail.com

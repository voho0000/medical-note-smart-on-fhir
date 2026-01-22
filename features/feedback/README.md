# Feedback Feature

問題回報功能，允許使用者直接從應用程式回報遇到的問題。

## 功能概述

使用者可以透過右上角的問題回報按鈕提交問題，系統會自動收集相關資訊並發送郵件到管理員信箱。

## 目錄結構

```
features/feedback/
├── components/
│   ├── FeedbackButton.tsx    # 問題回報按鈕（Bug icon）
│   └── FeedbackDialog.tsx    # 問題回報對話框表單
├── hooks/                     # （預留給未來的 hooks）
├── index.ts                   # Feature 匯出
└── README.md                  # 本文件
```

## 元件說明

### FeedbackButton

問題回報按鈕元件，顯示在應用程式 header 右上角。

**特點：**
- Bug icon 圖示
- Tooltip 提示
- 點擊開啟 FeedbackDialog

**使用方式：**
```tsx
import { FeedbackButton } from '@/features/feedback'

<FeedbackButton />
```

### FeedbackDialog

問題回報對話框，包含完整的表單和驗證邏輯。

**表單欄位：**
- 回報者電子郵件（必填）
- 問題類型（必填）：功能錯誤/UI問題/效能問題/功能建議/其他
- 嚴重程度（必填）：低/中/高/緊急
- 問題描述（必填，至少 20 字元）
- 重現步驟（選填）

**自動收集資訊：**
- 時間戳記
- 瀏覽器版本
- 螢幕解析度
- 使用者語言
- 當前頁面路徑
- FHIR Server URL
- 患者 ID

## API Endpoint

### POST `/api/feedback`

處理問題回報提交並發送郵件。

**Request Body:**
```typescript
{
  email: string
  issueType: string
  severity: string
  description: string
  steps?: string
  systemInfo: {
    timestamp: string
    userAgent: string
    screenResolution: string
    language: string
    currentPath: string
    fhirServerUrl: string
    patientId: string
  }
}
```

**Response:**
```typescript
{ success: true }
```

## 多語系支援

- 繁體中文：`src/shared/i18n/locales/zh-TW.ts`
- 英文：`src/shared/i18n/locales/en.ts`

所有文字都支援雙語切換。

## 郵件服務配置

### 使用 Resend

1. 註冊 Resend 帳號：https://resend.com
2. 驗證您的域名
3. 建立 API Key
4. 設定環境變數：

```bash
# .env.local
RESEND_API_KEY=re_your_api_key_here
```

5. 更新發件人地址（`app/api/feedback/route.ts`）：
```typescript
from: "MediPrisma <noreply@yourdomain.com>"
```

### 開發環境

無需立即配置郵件服務。在沒有 `RESEND_API_KEY` 的情況下：
- 系統會記錄回報內容到控制台
- 前端顯示成功訊息
- 不會實際發送郵件

## 整合方式

在 `app/page.tsx` 中：

```tsx
import { FeedbackButton } from "@/features/feedback"

// 在 header 中加入按鈕
<div className="flex items-center gap-2 sm:gap-3">
  <FeedbackButton />
  <ConnectionInfo />
  <ThemeToggle />
  <LanguageSwitcher />
  <HeaderAuthButton />
</div>
```

## 隱私與安全

- ✅ 僅收集患者 ID，不收集患者姓名
- ✅ 使用者需主動提供電子郵件
- ✅ 所有資料僅用於問題診斷
- ✅ 建議使用者在截圖前移除敏感資訊

## 未來改進

- [ ] 加入截圖上傳功能
- [ ] 整合 Firebase Storage 儲存附件
- [ ] 加入問題追蹤編號
- [ ] 建立管理後台查看回報
- [ ] 加入自動回覆郵件功能
- [ ] 建立 useFeedback hook 管理狀態

## 相關文件

- 詳細設定指南：`docs/FEEDBACK_SETUP.md`
- API 實作：`app/api/feedback/route.ts`
- 多語系檔案：`src/shared/i18n/locales/`

## 技術支援

如有問題，請聯繫：voho0000@gmail.com

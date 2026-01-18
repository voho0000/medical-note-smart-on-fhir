# 安全性指南 / Security Guide

## 🔒 已實作的安全功能

### 1. API Key 加密儲存
- 使用 Web Crypto API (AES-GCM 256-bit)
- PBKDF2 金鑰衍生（100,000 次迭代）
- Session-based 加密密碼
- 實作檔案：`src/shared/utils/crypto.utils.ts`

### 2. 安全 Headers
實作檔案：`next.config.ts`
- X-Frame-Options: SAMEORIGIN
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(self), geolocation=()

### 3. HTML Sanitization
- 移除危險的 script、iframe、事件處理器
- 實作檔案：`src/shared/utils/string.utils.ts`

### 4. 錯誤訊息過濾
- 過濾 API keys、tokens 等敏感資訊
- 實作檔案：AI service 層

### 5. SMART on FHIR 認證
- OAuth 2.0 with PKCE
- 符合 HIPAA 和 FHIR 安全標準

### 6. Firebase Authentication
- Google 登入、Email/密碼登入
- Email 驗證機制

### 7. Firestore Security Rules
- 使用者資料隔離
- 僅作者可修改自己的資料

### 8. HTTPS 加密
- 全站 HTTPS
- GitHub Pages 自動提供

## ⚠️ 建議改進

### 高優先級
1. **Content Security Policy (CSP)** - 目前尚未實作
2. **DOMPurify** - 增強 HTML sanitization
3. **Rate Limiting** - 防止 API 濫用
4. **環境變數驗證** - 使用 zod 驗證

### 中優先級
5. 更新測試
6. 監控和日誌
7. Subresource Integrity (SRI)

## 📋 安全檢查清單

### 部署前
- [x] API keys 加密儲存
- [x] 基本安全 headers
- [x] HTML sanitization
- [x] 錯誤訊息過濾
- [x] HTTPS
- [x] SMART on FHIR OAuth
- [x] Firebase Authentication
- [x] Firestore Security Rules
- [ ] Content Security Policy (CSP)
- [ ] 所有測試通過
- [ ] npm audit 無高危漏洞

### 定期檢查（每月）
- [ ] 更新依賴套件
- [ ] 執行 npm audit
- [ ] 審查存取日誌
- [ ] 檢查 Firebase 使用量
- [ ] 審查 Firestore Security Rules

## 🎯 總結

已實作：
✅ 資料加密（AES-GCM 256-bit）
✅ 傳輸安全（HTTPS）
✅ 認證授權（OAuth 2.0 + Firebase）
✅ XSS 防護（HTML Sanitization + 安全 Headers）
✅ 資料隔離（Firestore Rules）
✅ 錯誤處理（敏感資訊過濾）
✅ AI 安全（客戶端 Tool Calling 限制）

建議改進：
⚠️ 實作完整的 Content Security Policy (CSP)
⚠️ 安裝 DOMPurify
⚠️ 加入 Rate Limiting

## 📞 聯絡資訊

如發現安全問題，請立即聯絡 IT 安全團隊。
**請勿公開揭露安全漏洞**

# 安全性指南 / Security Guide

## 🔒 已實作的安全功能

### 1. API Key 加密儲存
- 使用 Web Crypto API (AES-GCM 256-bit)
- PBKDF2 金鑰衍生（100,000 次迭代）
- Session-based 加密密碼
- 實作檔案：`src/shared/utils/crypto.utils.ts`

### 2. 安全 Headers / CSP
實作檔案：`next.config.ts`（`headers()`）
- **Content-Security-Policy: frame-ancestors** — 白名單 `'self'` + 健保存摺 + `*.vghtpe.gov.tw` + 本機 mock-his。**刻意不設 X-Frame-Options**：其唯一的 allow-list 值（ALLOW-FROM）Chrome 已不支援，SAMEORIGIN 又會擋掉 EHR-FHIR Bridge 在 HIS 頁面內嵌本 app，故改用 CSP `frame-ancestors` 白名單。
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(self), geolocation=()

> ⚠️ **重要限制**：`next.config.ts` 的 `headers()` 只在 Node 伺服器（`next dev` / `next start`）生效。正式部署在 **GitHub Pages（靜態 CDN）時這些 response header 不會送出**——嵌入防護需改由 CDN／反向代理層或實際的 Node 託管提供。

### 3. HTML Sanitization（DOMPurify）
- FHIR 敘述性 XHTML（Composition / IPS narrative）注入前一律經 **DOMPurify 3.4.10** 淨化：`features/clinical-summary/document-summary/utils/sanitize-narrative.ts`、`features/ips-export/components/IpsSectionPreview.tsx`
- 其餘字串移除危險的 script、iframe、事件處理器：`src/shared/utils/string.utils.ts`

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
1. **正式部署的安全 Headers** — GitHub Pages 靜態部署不套用 `headers()`；CSP／嵌入防護需在 CDN／代理層補上（CSP、DOMPurify 本身已實作，見上方）
2. **環境變數驗證** — 使用 zod 驗證

> ✅ 已處理：feedback endpoint 改用 durable Firestore 限流（per-IP、fail-open；可再加 Turnstile / Firebase ID token 進一步強化）；SMART 移除瀏覽器端 client secret，改為 **public client + PKCE only**。

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
- [x] Firestore Security Rules（位於 `firebase-smart-on-fhir` repo，需確認已 deploy）
- [x] Content Security Policy（frame-ancestors；⚠️ GH Pages 靜態部署不套用，見上方）
- [x] DOMPurify（FHIR narrative 淨化）
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
✅ XSS 防護（DOMPurify narrative 淨化 + CSP frame-ancestors + 安全 Headers）
✅ 資料隔離（Firestore Rules）
✅ 錯誤處理（敏感資訊過濾）
✅ AI 安全（客戶端 Tool Calling 限制）

建議改進：
⚠️ 正式（GitHub Pages）部署補上 response-header 層級的 CSP／嵌入防護
⚠️ feedback endpoint 改用 durable rate limit + Turnstile
⚠️ SMART 改 public PKCE / BFF（勿在瀏覽器放 client secret）

## 📞 聯絡資訊

如發現安全問題，請立即聯絡 IT 安全團隊。
**請勿公開揭露安全漏洞**

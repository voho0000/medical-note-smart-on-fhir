# 安全性指南 / Security Guide

## 🔒 安全性評估

### 目前的安全措施

#### ✅ 已實作的安全功能

1. **API Key 管理**
   - API keys 僅存於瀏覽器 localStorage 或 sessionStorage
   - 不傳送到後端伺服器（僅在 API 請求時包含在 header）
   - 提供清除功能
   - 支援 sessionStorage（關閉瀏覽器即清除）

2. **SMART on FHIR 認證**
   - 使用標準 OAuth 2.0 with PKCE
   - 不儲存密碼
   - Token 管理由 fhirclient 處理
   - 符合 HIPAA 和 FHIR 安全標準

3. **XSS 防護**
   - React 預設 XSS 防護
   - 有 `sanitizeHtml` 函數處理 HTML 內容
   - 避免使用 `dangerouslySetInnerHTML`

4. **API 代理**
   - 使用 Firebase Functions 代理，避免暴露主 API key
   - 有 `x-proxy-key` 驗證機制
   - 限制 CORS 來源

5. **HTTPS**
   - 所有通訊使用 HTTPS 加密
   - GitHub Pages 自動提供 HTTPS

### ⚠️ 建議改進項目

#### 高優先級

1. **API Key 加密儲存**
   
   目前 API keys 以明文存於 localStorage：
   ```typescript
   // 目前
   storage.set(STORAGE_KEYS.API_KEY, key)
   ```

   **建議**：使用 Web Crypto API 加密
   ```typescript
   // 建議實作
   import { encrypt, decrypt } from '@/src/shared/utils/crypto.utils'
   
   const encryptedKey = await encrypt(key)
   storage.set(STORAGE_KEYS.API_KEY, encryptedKey)
   ```

2. **Content Security Policy (CSP)**
   
   **建議**：在 `next.config.ts` 加入 CSP headers
   ```typescript
   async headers() {
     return [{
       source: '/:path*',
       headers: [{
         key: 'Content-Security-Policy',
         value: [
           "default-src 'self'",
           "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
           "style-src 'self' 'unsafe-inline'",
           "img-src 'self' data: https:",
           "font-src 'self' data:",
           "connect-src 'self' https://api.openai.com https://generativelanguage.googleapis.com",
         ].join('; ')
       }]
     }]
   }
   ```

3. **使用 DOMPurify**
   
   目前的 `sanitizeHtml` 較簡單，建議使用成熟的 sanitization 庫：
   ```bash
   npm install dompurify @types/dompurify
   ```
   
   ```typescript
   import DOMPurify from 'dompurify'
   
   export function sanitizeHtml(html: string): string {
     return DOMPurify.sanitize(html, {
       ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br'],
       ALLOWED_ATTR: []
     })
   }
   ```

#### 中優先級

4. **Rate Limiting**
   
   **建議**：在 AI API 呼叫加入節流機制
   ```typescript
   import { debounce } from 'lodash'
   
   const debouncedSend = debounce(handleSend, 1000, {
     leading: true,
     trailing: false
   })
   ```

5. **環境變數驗證**
   
   **建議**：使用 zod 驗證環境變數
   ```typescript
   import { z } from 'zod'
   
   const envSchema = z.object({
     NEXT_PUBLIC_GEMINI_URL: z.string().url().optional(),
     NEXT_PUBLIC_PROXY_KEY: z.string().optional(),
   })
   
   export const ENV_CONFIG = envSchema.parse(process.env)
   ```

6. **錯誤訊息過濾**
   
   避免洩漏內部資訊：
   ```typescript
   // 不好
   throw new Error(errorData.error?.message)
   
   // 好
   const safeMessage = errorData.error?.message?.includes('API key')
     ? 'Authentication failed'
     : 'Request failed'
   throw new Error(safeMessage)
   ```

#### 低優先級

7. **Subresource Integrity (SRI)**
   
   為外部資源加入 integrity 屬性

8. **定期安全審計**
   
   使用工具定期檢查：
   ```bash
   npm audit
   npm audit fix
   ```

## 🛡️ 最佳實踐

### 使用者端

1. **API Key 管理**
   - 使用 sessionStorage 而非 localStorage（更安全）
   - 定期更換 API keys
   - 不在公共電腦儲存 keys
   - 使用完畢後清除 keys

2. **瀏覽器安全**
   - 使用最新版本的瀏覽器
   - 啟用瀏覽器的安全功能
   - 不在不安全的網路使用（如公共 WiFi）

3. **資料隱私**
   - 不複製病患資料到不安全的地方
   - AI 生成的內容需經過審核
   - 注意螢幕共享時的資料洩漏

### 開發者端

1. **程式碼審查**
   - 所有 PR 需經過審查
   - 檢查是否有硬編碼的 secrets
   - 使用 ESLint security plugins

2. **依賴管理**
   - 定期更新依賴套件
   - 檢查已知漏洞
   - 使用 `npm audit`

3. **測試**
   - 撰寫安全相關的測試
   - 測試 XSS 和注入攻擊
   - 測試認證和授權

4. **部署**
   - 使用環境變數管理 secrets
   - 不 commit secrets 到 git
   - 使用 `.gitignore` 排除敏感檔案

## 🚨 安全事件處理

### 發現安全問題時

1. **立即行動**
   - 停止使用受影響的功能
   - 通知 IT 安全團隊
   - 記錄事件詳情

2. **評估影響**
   - 確認受影響的範圍
   - 檢查是否有資料洩漏
   - 評估風險等級

3. **修復**
   - 實施緊急修復
   - 測試修復效果
   - 部署更新

4. **事後檢討**
   - 分析根本原因
   - 更新安全政策
   - 加強防護措施

## 📋 安全檢查清單

### 部署前檢查

- [ ] 所有 API keys 使用環境變數
- [ ] 沒有硬編碼的 secrets
- [ ] CSP headers 已設定
- [ ] HTTPS 已啟用
- [ ] 依賴套件已更新
- [ ] `npm audit` 無高危漏洞
- [ ] 錯誤訊息不洩漏敏感資訊
- [ ] 輸入驗證已實作
- [ ] XSS 防護已測試

### 定期檢查（每月）

- [ ] 更新依賴套件
- [ ] 執行安全掃描
- [ ] 檢查存取日誌
- [ ] 審查權限設定
- [ ] 測試備份恢復

## 🔗 相關資源

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [SMART on FHIR Security](https://www.hl7.org/fhir/smart-app-launch/)
- [HIPAA Compliance](https://www.hhs.gov/hipaa/index.html)
- [Next.js Security](https://nextjs.org/docs/app/building-your-application/configuring/security)

## 📞 聯絡資訊

如發現安全問題，請立即聯絡：
- IT 安全團隊
- 系統管理員
- 專案負責人

**請勿公開揭露安全漏洞**

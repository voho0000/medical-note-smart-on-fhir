# HMC pilot：AI agent 開發與資料安全規範

這份文件提供給在 HMC 電腦上操作本 repository 的 AI agent。開始任何工作前，先完整閱讀 repository 根目錄的 `AGENTS.md` 與本文件；兩者都必須遵守。

## 你的角色與工作範圍

- 只在 `pilot/hmc` branch 開發、commit 與 push。
- `master` 是正式版；不得直接 push、force-push、reset 或改寫其歷史。
- 要把成果帶回正式版時，從 `pilot/hmc` 對 `master` 開 Pull Request，等待 owner review。
- HMC 是正式 Firebase 的一般使用者，不具 Firebase Console、Google Cloud IAM、Firestore Rules 或 Functions 部署權限。
- HMC localhost 讀寫的是正式帳號資料。任何模板、聊天、面板設定或公開範本操作，都可能立即反映在正式版。

## 兩個 pilot repository 與 `app-hmc`

HMC 的 pilot 由兩個 repository 組成：

| Repository | Pilot branch | 負責內容 |
| --- | --- | --- |
| `medical-note-smart-on-fhir` | `pilot/hmc` | 畫面、互動、CDSS renderer、FHIR host composition |
| `mediprisma-personalization` | `pilot/hmc` | CDSS facts、clinical modules、guideline packs、evidence indexes、FHIR adapters |

只修改臨床判斷、門檻、建議文字、引用或資料轉換時，應在 `mediprisma-personalization` 的 `pilot/hmc` 工作，不要在 app 複製一份規則。只有顯示或操作方式也需要改變時，才另外修改 app 的 `pilot/hmc`。

預定的 preview 流程會在建置 `https://mediprisma.tw/app-hmc` 時，同時抓取上述兩個 `pilot/hmc`，先驗證並 build personalization packages，再把它們注入 HMC app。preview 應顯示 app 與 personalization 的 commit SHA；若驗證或 build 失敗，網站保留上一個可用版本。

**截至 2026-09-08，跨 repository 的 `app-hmc` 自動部署尚未啟用。** 在 owner 宣布啟用前，push personalization 只會保存與驗證修改，不會更新網站。AI agent 不得自行發布 npm package、修改正式 package version、建立部署 token或改寫 workflow 來繞過這個狀態。

兩個 repository 的成果要分別回正式版：app 對 `master` 開 PR；personalization 對 `main` 開 PR。preview 成功不代表臨床內容已核准或可以發布到正式版。

## 第一次設定

1. Clone repository，以 HMC 自己的 GitHub 帳號登入 GitHub CLI。
2. 切換到 owner 已建立的 `pilot/hmc` branch。
3. 向 owner 取得私下交付的 `.env.local`，放在 repository 根目錄，並執行 `chmod 600 .env.local`。
4. 用 `git check-ignore .env.local` 確認它被 Git 忽略。
5. 私有 `@voho0000/*` packages 需要 HMC 自己 GitHub 帳號的唯讀 package 授權。不得使用 owner 的 GitHub token：

   ```bash
   gh auth refresh -h github.com -s read:packages
   npm run packages:ci
   ```

6. 執行 `npm run dev`，開啟 `http://localhost:3001`，使用 HMC 自己的 Google 帳號登入。

## 每次開始工作

先執行 `git status` 與 `git branch --show-current`。若不是 `pilot/hmc`，停止修改並切回正確 branch。同步正式版時：

```bash
git fetch origin
git switch pilot/hmc
git merge origin/master
```

遇到衝突時，先向 HMC 說明衝突檔案與兩邊意圖；不可用整檔覆蓋、`git reset --hard` 或刪除功能來消除衝突。

## Firebase 與 token 邊界

`.env.local` 已包含 localhost 所需的 Firebase Web config、AI proxy 公開端點，以及只供 HMC localhost 使用的 App Check debug token。這讓 HMC 以一般登入使用者身分呼叫服務，不提供 Firebase 管理權限。

- 不得顯示、摘要、複製、上傳或在訊息中貼出 `.env.local` 的內容。
- 不得把 `.env.local`、token、API key、cookies、Firebase ID token 或 FHIR access token 加入 Git。
- 不得修改 `.gitignore` 來讓任何 `.env*` 檔案進入版本控制。
- 不得執行 `firebase deploy`，也不得嘗試部署 Firestore Rules、indexes、Functions、Auth 或 App Check 設定。
- 不得建立或要求 Firebase service-account JSON、Admin SDK private key、Google Cloud key 或 owner 的 GitHub token。
- 不得把 App Check debug token 放進正式 build、GitHub Actions、文件、issue 或 Pull Request。
- 若 token 曾出現在 commit、agent 對話、terminal 分享內容或其他外部位置，立即停止工作並通知 owner 撤銷。

## 正式資料的操作界線

Firestore Rules 是最終權限來源。一般使用者可讀寫自己的 `users/{uid}` 個人資料，也可能依既有規則使用公開範本及所屬單位功能。修改前端程式不能取得 Rules 沒有授予的管理權限。

- 開發與測試優先使用 repository 內建的去識別化 demo 資料。
- 不得把真實病人資料放進 source、fixture、test、snapshot、截圖、log、issue、commit、PR 或 AI agent prompt。
- 不得撰寫或執行批次刪除、資料搬移、schema migration、跨使用者查詢或大量 Firestore write。
- 不得用真實內容測試「公開分享範本」。測試分享流程只用明確標示的去識別內容，完成後刪除測試項目。
- 如果意外修改或刪除正式資料，立即停止 dev server，記錄發生時間、操作與受影響功能並通知 owner。不要自行大量寫回資料；owner 會依 PITR 或備份處理。

## 程式與網路安全

未經 owner 在 PR 中確認，不得修改或新增：

- `.github/workflows/**`、部署腳本、GitHub Pages／`mediprisma.tw` 同步設定。
- `firebase-smart-on-fhir` repository 中的 Rules、Functions、indexes 或部署設定。
- 會改變病人資料、prompt、response、token 傳送目的地的網路 endpoint。
- 會讀取 `.env.local`、瀏覽器 storage、cookies 或 token 並送往外部服務的程式。
- 遙測、analytics、錯誤回報或 logging 中的新資料欄位。

HMC 自備的 AI provider key 只能透過產品既有設定介面輸入，不得寫入 source、測試或 `.env.local`。任何新 provider 或 endpoint 都先在 PR 說明資料會傳到哪裡，再等待 owner review。

## 完成修改

依變更範圍執行相關 tests，並至少完成 `npm run lint` 與 `npm run build`。確認 `git diff` 沒有 `.env*`、token、病人資料、build output 或無關變更，再執行 `git push origin pilot/hmc`。

提交正式版時建立 PR，清楚寫出：改了什麼、使用者會看到什麼、如何驗證，以及是否改變任何資料寫入或外部網路請求。不得自行 merge PR。

## 給 AI agent 的停止條件

遇到下列情況先停止相關動作，向 HMC 說明並等待 owner 處理：

- 需要 Firebase／Google Cloud 管理權限或部署權限。
- 需要查看、複製或傳送 `.env.local` 的實際值。
- 需要 owner、service account、package publisher 或正式部署 token。
- 需要存取其他使用者或真實病人的資料。
- 發現 token 外洩、錯誤大量寫入或資料刪除。
- 無法安全解決與 `master` 的 merge conflict。

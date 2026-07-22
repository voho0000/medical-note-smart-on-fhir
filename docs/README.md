# MediPrisma 文件索引

> 基準版本：v0.43.0｜最後核對：2026-07-22

本目錄把文件分成「現行規格」與「歷史紀錄」。現行規格應隨程式一起更新；帶日期的文件保留當時的問題、假設與實驗結果，不應被當成目前功能承諾。

## 現行規格

| 文件 | 用途 | 主要程式依據 |
|---|---|---|
| [README](../README.md) | 產品入口、安裝、模型與部署 | `package.json`、`.env.example`、registries |
| [完整應用說明](../完整應用說明文件.md) | 使用者與利害關係人全覽 | UI、功能模組、資料與 AI 流程 |
| [ARCHITECTURE](ARCHITECTURE.md) | 分層、資料流、狀態與部署 | `src/`、`app/`、`features/` |
| [FEATURES](FEATURES.md) | Feature 模組與 registry 擴充方式 | `features/`、兩個 registry |
| [AI Agent](AI_AGENT_IMPLEMENTATION.md) | Agent loop、工具與安全邊界 | `run-deep-mode-agent.ts`、`fhir-tools.ts` |
| [Medical Chat](MEDICAL_CHAT.md) | 對話 UI、歷史、範本、語音 | `features/medical-chat/`、chat hooks |
| [Prompt Gallery](PROMPT_GALLERY.md) | 範本類型、篩選、分享與相容性 | `features/prompt-gallery/` |
| [Feedback](FEEDBACK_SETUP.md) | 回饋端點與部署設定 | `app/api/feedback/route.ts`、feedback feature |
| [Security](SECURITY.md) | 已實作控制、限制與部署檢查 | 儲存、代理、CSP、CI |
| [院內 HTTPS／純內網部署](INTRANET_HTTPS.md) | Cloud/on-prem profile、TLS、院內 AI、離線套件與防火牆 | `next.config.ts`、`scripts/build-intranet.mjs`、`deploy/intranet/` |
| [Privacy policy](../PRIVACY_POLICY.md) | 實際資料處理說明 | FHIR、Firestore、AI、回饋流程 |
| [E2E](../e2e/README.md) | Playwright 測試資料與執行方式 | `playwright*.config.ts`、`e2e/` |
| [Loop engineering](../scripts/loop/README.md) | 本機 verifier 與 dashboard | `scripts/loop/` |

互動式架構圖有兩份相同內容：`docs/architecture-diagram.html` 是來源，`public/architecture-diagram.html` 是靜態網站發布副本；修改時必須同步。

## 歷史與決策紀錄

| 文件 | 性質 |
|---|---|
| [BRIDGE LOINC request](BRIDGE-LOINC-REQUEST-CALCULATOR-2026-07-03.md) | app 與 NHI-FHIR-Bridge 的資料契約需求 |
| [Briefing panel design](BRIEFING-PANEL-DESIGN-2026-07-04.md) | 醫療摘要的設計演進與實作後記 |
| [Medical Summary audit](MEDICAL-SUMMARY-AUDIT-2026-07-12.md) | v0.34.0 時點稽核；表格內容是當時狀態 |
| [Lab format experiment](LAB-FORMAT-EXPERIMENT-2026-07-12.md) | 格式與資料忠實度實驗紀錄 |
| [Medication history scope experiment](MEDICATION-HISTORY-SCOPE-EXPERIMENT-2026-07-15.md) | 三模型、兩資料臂的 token 與醫療摘要品質 A/B 實驗 |
| [Loop Engineering process review](LOOP-ENGINEERING-PROCESS-REVIEW-2026-07-12.md) | 2026-07-12 的研究與流程診斷 |
| [Deep-mode eval loop](DEEP-MODE-EVAL-LOOP.md) | Agent 品質評估規格與現況 |
| [Deep-mode handoff](DEEP-MODE-HANDOFF.md) | 工作線交接狀態 |
| [Deep-mode ledger](DEEP-MODE-HARNESS-LEDGER.md) | 只接受實測數據的成績表 |
| [Loop app iteration](LOOP-ENGINEERING-APP-ITERATION.md) | app 自動迭代工作線說明 |

## 維護規則

1. 模型清單只引用 `src/shared/constants/ai-models.constants.ts`。
2. 左右面板功能只引用 `feature-registry.ts` 與 `right-panel-registry.ts`。
3. 環境變數以 `.env.example`、GitHub workflows 與實際讀取點三方交叉確認。
4. 部署模式以 `NEXT_PUBLIC_DEPLOYMENT_PROFILE`、build scripts 與 `next.config.ts` aliases 為準；port 不是 cloud/on-prem 安全邊界。
5. 安全與隱私只描述 codebase 已做到的控制；不把「可部署於合規環境」寫成「產品已通過法規認證」。
6. 歷史文件新增現況註記，不回頭改寫原始稽核結果或實驗數字。
7. 文件內本地連結、檔案路徑、指令與程式符號應在提交前驗證。

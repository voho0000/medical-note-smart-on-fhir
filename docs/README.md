# MediPrisma 文件索引

> 索引整理：2026-09-08｜專案版本：v0.51.0（各文件內容仍以自己的核對日期為準）

本目錄分為現行規格、歷史決策、實驗與待議規劃。協作者先讀[協作指南](../CONTRIBUTING.md)與 [WIP 工作線](WIP.md)。現行規格應隨程式一起更新；帶日期的文件保留當時的問題、假設與實驗結果，不應被當成目前功能承諾。

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
| [前端效能基準](PERFORMANCE_BASELINE.md) | 臨床工作區 p95、測試門檻與重跑方式 | `workspace-performance.spec.ts` |
| [Privacy policy](../PRIVACY_POLICY.md) | 實際資料處理說明 | FHIR、Firestore、AI、回饋流程 |
| [E2E](../e2e/README.md) | Playwright 測試資料與執行方式 | `playwright*.config.ts`、`e2e/` |
| [Loop engineering](../scripts/loop/README.md) | 本機 verifier 與 dashboard | `scripts/loop/` |

互動式架構圖保留來源 `docs/architecture-diagram.html` 與靜態發布副本 `public/architecture-diagram.html`。本次發現計算機數量為 58／57 的差異，尚待核對；不能把兩份視為已同步。見 [WIP](WIP.md)。

## 歷史與決策紀錄

已歸檔的 10 份稽核、設計與實驗紀錄見 [history 索引](history/README.md)。保留原日期與結論；原審閱的程式行號可能已漂移。

## 實驗與工作線

| 文件 | 性質 |
|---|---|
| [實驗入口](../scripts/experiments/README.md) | 手動評測用途、輸入、輸出與執行方式 |
| [Deep-mode eval loop](DEEP-MODE-EVAL-LOOP.md) | 評測規格；原日期的現況 |
| [Deep-mode handoff](DEEP-MODE-HANDOFF.md) | 評測交接；原日期的工作狀態 |
| [Deep-mode ledger](DEEP-MODE-HARNESS-LEDGER.md) | 實測紀錄；未於本次更新數據 |
| [Loop app iteration](LOOP-ENGINEERING-APP-ITERATION.md) | 自動迭代工作線 |
| [使用統計設計](USAGE-ANALYTICS-PLAN-2026-09-03.md) | 設計與實作時點紀錄；不是目前未提交狀態 |
| [門診流程規劃](plans/outpatient/README.md) | 7 份需求／規劃，非已上線功能 |
| [WIP 工作線](WIP.md) | 工作目錄保留項目與待辦 |
| [清理審核單](REPO-CLEANUP-REVIEW-2026-09-08.md) | 核准範圍與後續死碼候選 |

## 其他專題文件

| 文件 | 用途 |
|---|---|
| [Launch-route gates](LAUNCH-ROUTE-GATES.md) | 啟動路徑的功能可見性契約 |
| [私有套件架構](personalization-private-packages.md) | 套件邊界、權限與安裝 |
| [範本專科](prompt-gallery-specialties.md) | 範本專科分類 |
| [AKI 實作紀錄](AKI-ALERT-HEALTH-BANK-IMPLEMENTATION-2026-07-30.md) | 日期限定的實作說明 |
| [健康存摺就診資料遷移](HEALTH-BANK-ENCOUNTER-DISCIPLINE-FHIR-MIGRATION-2026-08-12.md) | FHIR 整合遷移紀錄 |
| [FHIR context 優化](FHIR-context-stability-optimization.txt) | 技術提案，使用前核對現行實作 |
| [糖尿病架構圖](diabetes-personalized-care-guidance-architecture.html) | 專題架構說明 |

## 維護規則

1. 模型清單只引用 `src/shared/constants/ai-models.constants.ts`。
2. 左右面板功能只引用 `feature-registry.ts` 與 `right-panel-registry.ts`。
3. 環境變數以 `.env.example`、GitHub workflows 與實際讀取點三方交叉確認。
4. 安全與隱私只描述 codebase 已做到的控制；不把「可部署於合規環境」寫成「產品已通過法規認證」。
5. 歷史文件新增現況註記，不回頭改寫原始稽核結果或實驗數字。
6. 文件內本地連結、檔案路徑、指令與程式符號應在提交前驗證。

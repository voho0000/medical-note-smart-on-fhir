# 開發交接：context 實驗與低風險上線審核

分支：`codex/vghbrain-context-test`。這次提交只是跨電腦保存工作，**不是上線批准，不可整包合併 master**。

## 另一台電腦接續

```sh
git fetch origin
git switch codex/vghbrain-context-test
git pull --ff-only origin codex/vghbrain-context-test
npm run packages:ci
node scripts/generate-cloud-oncology-stress-bundle.cjs
npm run dev
```

`npm run packages:ci` 可能需要該電腦原有的 GitHub Packages 存取設定。不要將 token 或 `.env.local` 加入 Git；依 `.env.example` 設定本機環境。未建立本機分支時，`git switch --track origin/codex/vghbrain-context-test`。

產生的 FHIR 檔案：`artifacts/synthetic-oncology/synthetic-cloud-oncology-v2-1100000-tokens.fhir.json`（約 66.4 MB）。全部為規則生成的合成資料，無真實病人資料。Git 保存產生器與驗證測試，不保存大型產物。優先使用 v2：無病程紀錄、無生命徵象，大量 CXR、其他影像、病理與檢驗。

## 已推 master 的效能批次

- `3f9ec10451a9c3a22841ed467bb21280b6d7340f`：資料範圍抽屜減少重複工作，不改 context 政策。
- `14aa41f2db42f6d42aa1dc049bc841dbdbc92ce5`：文件勾選與模型切換的回應性、保留使用者勾選。

上述發布批次與實驗分支有重疊的程式；不要當作全新功能重複合併。原電腦 `tmp/release-scope-perf` 是隔離發布用 worktree，不需要複製。

## 尚未批准上線

- VGHBrain：估計病人 context 100K、含導引的完整 input 150K；不以文字截短來達成上限。仍受較小模型視窗限制。
- 自選文件全文保護：每一縮減階段保留勾選文件，縮減其他資料；真的超量時提示，不默默排除。送出／重試亦不得截短自選文件。詳細見 `manual-document-context-review.md`。
- 自動依「院所＋第一個 ICD」保留出院病摘與設定遷移。
- claims/context 精簡、時間語意、來源導引 prompt／索引及恢復行為。
- 登入還原、登出／帳號隔離、Medcloud 啟動模型等分支既有變更，仍須分項審核。

尚未實作「低於 50K 全部送入、超過 50K 才 dynamic routing」的新規則。不得將分支備份視為摘要品質或模型速度已驗證。

## 最新阻擋問題：來源定位造成畫面崩潰（未修）

使用者在 localhost:3001，對合成病人的摘要點來源編號，選 `2026-08-08 Hemoglobin`，出現定位失敗提示及 `Maximum update depth exceeded`。

- 資料確實存在：Observation `synthetic-lab-95-11-0`，日期 `2026-08-08T08:00:00.000Z`。
- 此 fixture 有 1,344 個日期的 Hemoglobin，不是 context 遺漏導致查無原始資料。
- 本機 Next 開發紀錄的 component stack 是 `tr → LabPivotTable → CumulativeLabReport → ReportsCard`。
- `features/clinical-summary/reports/components/CumulativeLabReport.tsx` 在診斷時與 `origin/master` 相同。
- 初步假設：點原始來源切出累積報告後，force-mounted 隱藏表格仍在虛擬列量測；其 virtualizer 的 enabled 只判斷資料量與 scroll element，沒有可見分頁條件。**尚未以最小重現證實完整因果，尚未修改修復。**
- 下一步先重現／修復隱藏表格的觀察與量測生命週期，測試來源編號、累積報告按鈕、分類切換、隱藏後返回、大資料與重複定位。
- 程式另有獨立的處置來源定位修正可拆分審核，但不能直接 cherry-pick 整個 `b5cb530e`，其中混有 prompt 導引變更。

## 驗證狀態

上一輪自選文件修改：22 suites／255 tests 通過，lint、production build 通過。合成大病人瀏覽器驗證加選三份病摘、切模型、重新開啟及預覽，檢查 320／390／430／768／1024／1440 寬度。**不代表最新來源定位崩潰已解決。**

來源定位候選另有 5 suites／14 tests 通過，但部分元件被 mock，無法涵蓋真實大表格量測迴圈。

開發分支在首次匯入前還曾出現登入 Header 的 hydration mismatch；本機文件選取測試只排除此既有錯誤，其餘 page error 仍會失敗。

### 可重跑的本機瀏覽器測試

啟動 localhost:3001 並先產生 fixture；需安裝 Chrome。另開終端機：

```sh
npx playwright test --config playwright.context-review.config.ts
```

測試位於 `e2e/local-review/manual-document-retention.spec.ts`，與預設 E2E 分開。只在隔離瀏覽器 context 匯入合成資料，阻擋外部 HTTP，沒有呼叫真實 AI。截圖輸出至忽略的 `tmp/`。

### 回歸測試（PowerShell）

```powershell
$env:TZ = 'Asia/Taipei'
node node_modules/jest/bin/jest.js --runInBand --modulePathIgnorePatterns='tmp' --testPathPatterns='data-selection|clinical-input-document-performance|use-ai-slot-generation|context-window-retry|use-clinical-context|clinical-context-coverage|generate-medical-summary|use-registry-context-cache|use-medical-summary-orchestrator|medical-summary-peek|adaptive-clinical-context|prioritized-clinical-context|oncology-stress-bundle|vghbrain-context-policy'
npm run lint -- --ignore-pattern tmp/**
npm run build
```

不搬移瀏覽器登入、AI keys、`.env.local`、真實病歷、Next 日誌、`node_modules`、build 產物或其他本機工作目錄。

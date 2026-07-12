# 醫療摘要（AI Summary）功能稽核報告 — 2026-07-12

> 稽核範圍：醫療摘要 tab 全鏈路（v0.34.0 working tree, commit `1d27080` 之後）。
> 四個面向：A 輸出正確性、B 資料選擇、C UI/UX（醫事人員＋民眾）、D 程式碼品質。
> 各發現有編號（A1…D6），方便像上次 AUDIT-2026-06-12 一樣逐項認領修復。

---

## 總評

- **正確性管線的「骨架」是強的**：日期／機構／resourceType 永遠由 app 端決定、citation key 由 app 發號、unresolved ref 會被丟棄並計數、schema 採 clamp-not-reject。結構層面的幻覺（假日期、假事件）幾乎不可能。
- **但「內容層面」的把關只到 key 存在為止**（A1）：紫色「已驗證」pill 的語意是「這個 key 存在於 catalog」，不是「這個來源支持這句話」。安全掃描有 claim-level grounding，摘要沒有。
- **民眾端有兩個 P0 的 UI 問題**（C1/C2）：root 12px 之下正文只有 ~9.75px、免責聲明 ~7.5px、citation pill 觸控目標 ~6.75px——對高齡民眾幾乎不可用，且恰好廢掉了本功能最強的「點引註驗證」賣點。
- **資料選擇有一個信任落差**（B2）：使用者在資料選擇面板關掉的類別，narrative 會消失，但 SOURCE LIST catalog（E/M/P/L/C/K）仍然是全量資料——AI 仍可能引用使用者以為已排除的資料。
- **程式碼品質 B−**：核心 use-case 純淨且測試充分，但 summary/safety 兩支 hook ~85% 重複且完全沒有直接測試、1052 行的 god-use-case、insights 管線把同樣的職責放在不同層（features 層直接 import infrastructure）。

---

## A. 輸出正確性（faithfulness pipeline）

管線：`buildSourceCatalog`（app 發號 E/M/P/L/C/K/D key）→ prompt（SHARED_RULES 反幻覺條款）→ `parseResult`（Zod, clamp-not-reject）→ `finalizeResult`（citation 解析、emphasis guard、medication gate、timeline drop+count）→ UI（未驗證 = 琥珀色 pill）。

### 已經做得好的
- 日期/機構/類型全部 app 端解析，timeline 的日期結構上無法被幻覺（entity 註解即明言此設計）。
- unknown citation key → 琥珀「未驗證」而非靜默丟棄（SourceSup.tsx:90-92）；timeline 壞 ref → 丟棄且顯示計數（use-case :999-1006）。
- 安全掃描有 deterministic 後處理：`filterDuplicateFalsePositives`、`enforceSeverityFloor`、`findUnsupportedDocumentProcedureSources`（claim-level 文件內容比對）、`scannedCount` 用 catalog 長度而非模型自報。
- `guardedInvestigationDirection`（:624-651）：catalog 有 ≥2 筆同主題報告時，模型聲稱「單一結果」會被改成 unknown——防假安心。
- 用藥卡需 ≥1 個 verified `Medication*` 來源才 render（:927-940）。
- parse 失敗只 silent retry 一次，之後浮出 PARSE_FAILED（hook :254-259）。

### 發現
| # | 嚴重度 | 發現 | 建議 |
|---|---|---|---|
| **A1** | 高 | **「已驗證」= key 存在，不 = 內容支持該敘述**。`finalizeResult` → `registerKey` 只設 `verified: !!entry`（use-case :872）。摘要路徑沒有任何 claim-level 內容比對；`findUnsupportedDocumentProcedureSources` 只用在 safety（parseScanResult :263）。模型可以拿真實但無關的 L key 掛在捏造的數值上，仍顯示紫色 verified pill。 | 把文件/處置的 grounding 檢查延伸到摘要的 problems/investigations；lab 數值另見 A3。 |
| **A2** | 高→中 | **CATALOG_CAPS 截斷 + catalog/context 範圍不一致造成靜默資料遺失**。catalog 由全量 bundle 建（hook :200-205）但 caps 40/40/30/20/20/15/20 most-recent-first（:51-59）；narrative 卻是 insights profile 的時間窗。模型會拿到「有 key 沒內容」或「有內容沒 key」的資料。超出 cap 的舊重大住院只會變成 UI 上的一個 dropped 計數。 | 顯示「哪些」紀錄落在 cap 外（不只計數）；對齊 catalog 與 context 範圍，或在 prompt 明示 catalog ⊃ context。 |
| **A3** | 中 | **investigation 的 trend 數值是自由文字、未回對**。app 明明握有真值（`collectLongitudinalLabPoints`），但沒有把 trend 字串裡的數字 token 與被引用 L key 的實際觀測值比對；抄錯/捏造的「HbA1c 7.2→8.4」照樣 verified。 | 對被引用的 L key，diff trend 內數字 vs app 端數列，不符 → 琥珀。 |
| **A4** | 中 | **縱向趨勢 appendix 被 labs cap 靜默截斷**。`collectLongitudinalLabPoints` 遇到沒有 catalog key 的報告直接 skip（:493-494），labs cap=30；>30 份報告的病人，最舊的 HbA1c/eGFR 點被砍，趨勢被壓平——與 header 聲稱「from all available DiagnosticReports」矛盾，也削弱 A 節的 direction guard。 | 縱向點從全量 diagnosticReports 收集，只有「可引用 key」受 cap 約束。 |
| **A5** | 低→中 | **用藥卡 gate 只看 resourceType 不看藥物身份**（:927-940）。藥 A 的衛教文可以引用藥 B 的 M key 過關。這是民眾端最高風險面（見 A6）。 | 引用的 M 紀錄 display 需與 item.name 合理匹配才放行。 |
| **A6** | 中（民眾） | **兩個雙受眾不對稱**：(1) `medicationEducation` 只有民眾看得到，其 benefit 自由文字是全管線接地最弱、風險最高的表面（只有 A5 的型別 gate）；(2) SYSTEM_PATIENT 的「正向、安心」指示與 trend-honesty 條款存在張力，且只有 prose rule、無 deterministic backstop。 | A5 修好可解大半；另可對 patient 版加 deterministic trend 覆核（同 A3）。 |
| A7 | 低 | `rescueEmphasisFromQuotes` 升級的 highlight 帶空 sourceKeys（:120），會出現無引註的螢光標記。 | 不引人注目即可，順手修。 |

---

## B. 資料選擇

實際送給摘要的資料有兩條獨立路徑：
- **Path A（narrative）**：`useClinicalContext('insights')`——尊重資料選擇。預設：encounters 6m/MAX 10、labs 6m 全版本（每 analyte 8 點）、imaging 1y latest、meds 6m active、problem list all-time active、DNR/過敏/裝置 all-time、**documents 只有最近一次住院的一份病摘**。另附全時段縱向 appendix（16 lab 系列 ×8 點、8 影像 ×5 點）。
- **Path B（citation catalog）**：全量 bundle + CATALOG_CAPS，**不受資料選擇影響**（只有 D key 被 scope 到 includedDocumentIds）。
- Token budgeting：`token-estimator.ts`/`context-window-manager.ts` 在此路徑**完全未被使用**——全文照送，目前靠預設 Flash-Lite 900k context「碰巧」裝得下。
- 民眾 vs 醫師：資料完全相同，只有 system prompt 不同（合理）。safety 掃描與摘要共用同一 narrative + catalog（WeakMap memo，好）。

### 發現
| # | 嚴重度 | 發現 | 建議 |
|---|---|---|---|
| **B1** | 高 | **預設 `documentMode='latestAdmission'` 只送一份病摘**，較舊病摘連 catalog D key 都沒有（scopeDocumentSources :342-343）。健康存摺裡病摘常是重大事件唯一證據；多次住院病人 18 個月前的癌症手術病摘預設完全隱形。 | 預設含全部病摘（或最近 N 次住院）；至少讓所有文件保留可引用 D key，即使不 inline 全文。 |
| **B2** | 高 | **UI 與實送不符：資料選擇關掉類別 ≠ 從摘要證據移除**（見 A2 同根）。關掉 imaging/procedures/problem list，AI 仍收到 30/20/20 筆可引用條目。 | catalog 改用與 narrative 相同的過濾集，或在面板明示「摘要引註永遠涵蓋全量紀錄」。 |
| **B3** | 中 | **無 token budgeting、截斷程式碼是死碼**。切到 Haiku 4.5 (180k) / GPT-nano (120k) + 大 bundle 就是 provider error + 一次盲目 retry，無 graceful degradation、無「已省略 N 筆」提示。 | 把現成 context-window-manager 接進 buildMessages，或 deterministic recency trim + 使用者可見的截斷註記（報告解讀卡已有此模式可抄）。 |
| **B4** | 中 | **lab narrative 無 analyte 數量上限、無 abnormal 過濾**——常規 CBC/CMP 病人送幾十條正常值 trend line，然後 prompt 又叫模型忽略正常值。 | cap analyte 數；優先 interpretation 異常 + `investigationPriority` 清單（appendix 已用）。 |
| **B5** | 中 | **lab 與 imaging 共用一個 30 條 L cap**（:233-234）；lab 密集病人會把一年前的 CT/MRI 擠出 catalog。 | imaging 獨立 cap 或 30 條內分區。 |
| **B6** | 低→中 | MAX_VISITS=10 可能擠掉較舊的重要住院（含其 visit-linked 用藥）。encounterClass 已算出來卻沒用來排序。 | 住院/急診優先保留，不被門診擠掉。 |
| **B7** | 低 | 文件全文不截斷 inline（clinical-documents.utils :180-187）；documentMode='all' + 長病摘會放大 B3。 | per-doc head+tail clamp（報告解讀路徑已有）。 |
| B8 | 低 | coverage 卡顯示全量計數（如 120 次就醫）但實際只有 40 筆可引用、10 筆有敘述——「誠實邊界」卡本身有落差。 | coverage 註明 capped 數量。 |

---

## C. UI/UX

### 已經做得好的
- Citation → 來源導航整體是全功能最強的部分（iOS touch/mouse 判別、鍵盤開啟、nav timeout fallback toast）。
- Orchestrator 的 batch lifecycle：重生成期間保留上一份完整簡報、`retryFailed` 只重跑失敗的一半。
- 誠實邊界貫徹：CoverageCard 純 deterministic、timeline dropped 計數、推斷問題有 badge。
- 密度紀律（initial N + 計數展開）、container-query 響應 panel 寬度而非 viewport。
- 民眾版 safety 重新框架（琥珀色階 + 優先留意/健康提醒語彙）是全 app 民眾模式的典範。

### 發現
| # | 嚴重度 | 發現 | 建議 |
|---|---|---|---|
| **C1** | **P0** | **字級遠低於可及性下限**（root 12px）：正文 0.8125rem=9.75px、標題 8.25px、免責/coverage 7.5px、citation 數字與 customAutoBadge 6.75px。高齡民眾讀的健康摘要，法律/臨床上最重要的免責文字反而最小。 | 民眾模式字級升階（patient root 14–16px 或 patient: size map，正文 ≥13px、註腳 ≥11px）。 |
| **C2** | **P0** | **citation pill 觸控目標 ~13px 高、數 px 寬**（SourceSup.tsx:88），手機上點不到——廢掉「點引註驗證」的核心賣點。 | 視覺不變、hit area 撐到 ≥24px（min-h/min-w + 負 margin 或 ::before overlay）。小改動大回報。 |
| **C3** | P1 | **DecisionList（待確認事項）整組建好但沒接**：component 無人 import、i18n 齊全、AI 每次都在產 decisions、使用者永遠看不到——對醫師是最可行動的「需要你決定的事」，對民眾是「可與醫師討論的事」。也在浪費輸出 token。 | 決定去留：加 `"decisions"` card id 接進 layout，或刪 component+strings+schema 欄位。 |
| **C4** | P1 | **hero ↔ 下方卡片重複**（已知 IA debt 確認仍在）：hero 粗體段落與 problems/investigations/safety 卡重述同樣事實；section refs 已存在但沒拿來 scroll（Feature.tsx:242-246）。 | 照既定 verdict：hero 改為 anchor 層，emphasis segment 深連結捲動到對應卡片。 |
| **C5** | P1 | **民眾看得到 ModelPicker、重生成、settings 齒輪、卡片排版工具**（Feature.tsx:436-495 只 gate view 不 gate audience）。 | patient 隱藏/收合，留一顆「重新整理」。 |
| **C6** | P1 | **自訂摘要 tab 對民眾提供無引註自由文字 AI**，警語只有 6.75px 一行琥珀字。 | gate 到醫師限定，或大幅強化民眾警示與視覺區隔。 |
| **C7** | P2 | 民眾預設卡序把「照護提醒與下一步」放最後；且第一屏就是 AI 推斷問題清單（先驚嚇後行動）。 | patient 卡序：提醒/下一步放 hero 下第 2 位；推斷問題下移、badge 語氣放軟。 |
| **C8** | P2 | **重生成無卡內回饋**：hero 永遠 `updating={false}`（Feature.tsx:594），唯一訊號是 header 按鈕轉圈；orchestrator 明明已回傳 isSummaryGenerating/isSafetyGenerating。 | 接上現成 updating prop。 |
| **C9** | P2 | 低危 safety alerts 無折疊直接 inline，靠 24rem 內捲軸（scroll-trap）；lowGroupExpand/Collapse 字串成了死字串。 | 恢復 counted fold 或刪字串。 |
| C10 | P3 | SourceSup 無 aria-label（screen reader 只唸數字）；多數控件 h-7=28px；醫師版 hero emphasis 只有 9.75px 粗體、salience 低（被刪的 SummaryNarrativeCard 有紫色 highlight 可撿回）。 | 逐項小修。 |
| C11 | P3 | 大量死 i18n key（narrativeTitle、nav*、*GroupTitle 等，舊 grouped-nav IA 殘留）＋孤兒 component SummaryNarrativeCard。 | 清理。 |
| C12 | P3 | 自訂 tab loading 樣式與標準 tab（StreamingIndicator）不一致。 | 統一。 |

**醫師版 MedicationReconciliationCard**：actionable 的琥珀「待核對」項與 regimen 共用一個展開 toggle，regimen 佔滿 initial 4 格時預設被折疊——待核對項應獨立展示。

---

## D. 程式碼品質（總評 B−）

### 已經做得好的
- fullStream error-chunk 這個歷史 bug class 在 `ai-sdk-stream.adapter.ts:52-86` 修得正確（onError 捕捉 + idle timeout + user-abort 區分）。
- core 層零 layering violation、1052 行 use-case 純函式所以能有 767 行測試。
- auto-run gate 抽成純函式 `summary-auto-run-policy.ts` 並有測試。
- per-model slot / StrictMode double-invoke / AbortController Set 等併發設計有意識且有註解。

### 發現
| # | 嚴重度 | 發現 | 建議 |
|---|---|---|---|
| **D1** | 高（維護） | **summary/safety 兩支 hook ~85% 重複（~300 行平行邏輯）**：store、prefs、resolvedModelId gating、hydration、demo seed、auto-run、setModel 全是手動同步的兩份。 | 抽 `createAiSlotHook<TResult>` factory；兩檔各砍一半，invariant 收斂到一處。 |
| **D2** | 高（風險） | **兩支大型 stateful hook 零直接測試**——orchestrator 測試把兩支 hook 全 mock 掉。hydration→auto-run 順序、demo-seed vs live race、autoTriggeredRef、retry-once、model 切換 slot 隔離全部裸奔。 | 針對 hydration/auto-run/demo-seed 順序補 integration test。 |
| **D3** | 中 | **safety hook `dataReady: true` 寫死**（:312）且讀 clinicalData 不檢查 isLoading/error（:145）——auto-scan 可能對半載入資料開跑；與 summary hook 刻意平行卻無註解的分歧。 | 對齊 summary 的 dataReady 邏輯或註明為何安全。 |
| **D4** | 中 | **production 讀 `window.__safetyModelId` 測試後門**（:165-167），繞過正常 gating。 | 改 test-only provider / jest mock。 |
| **D5** | 中 | 1052 行 god-use-case 混四種職責（catalog / longitudinal analytics / 250 行 prompt 字串 / parse+finalize）；`finalizeResult` 的 registerKey 呼叫順序 = 引註編號順序，無測試保護。 | 拆四檔；補 numbering-order 測試。 |
| **D6** | 中 | **insights 管線 layering 不一致**：ClinicalInsightsRuntimeProvider（features 層）直接 import infrastructure cache + demo snapshots，同樣職責 summary/safety 放 application 層；且 :79-82 的「legacy workbench 共存」註解已因該 workbench 同 commit 被刪而失效。 | cache/hydration 下移 application hook；改註解。 |
| D7 | 低 | `useClinicalData() as unknown as` 雙重 cast（兩處）；`JSON.parse(panelPromptIdentity) as ...`（Provider :180）字串往返；`safetyCacheKey` 命名與註解過時。 | 型別對齊、保留陣列只 derive 字串、改名。 |

---

## 建議修復順序

**Phase 1 — 小改動大回報（可各自獨立出貨）**
1. C2 citation pill hit area ≥24px
2. C8 接上 updating prop
3. C5 民眾隱藏 ModelPicker/layout 工具
4. C3 決定 DecisionList 去留（接上或刪掉）
5. D3 safety dataReady 對齊、D4 移除 window 後門
6. A7 / C9 / C10 / C11 順手清

**Phase 2 — 民眾體驗（一個主題一起做）**
7. C1 民眾字級升階（結構性但值得）
8. C7 民眾卡序調整 + 推斷問題語氣
9. C6 自訂摘要對民眾的政策決定
10. A5/A6 用藥衛教的藥物身份 gate

**Phase 3 — 正確性深化**
11. A1 摘要 claim-level grounding（先把 doc/procedure 檢查延伸過來）
12. A3 investigation 數值回對
13. A4 縱向 appendix 脫離 cap
14. B1 病摘預設全含（或至少全數保留 D key）
15. B2 catalog 尊重資料選擇（或 UI 明示）

**Phase 4 — 結構償債**
16. D1 slot-hook factory、D2 hook integration tests
17. D5 use-case 拆檔、D6 insights 層次對齊
18. B3 token budgeting 接活、B4-B7 資料選擇細部
19. C4 hero anchor 化（照既定 redesign verdict）

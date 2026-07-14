# 醫療摘要 tab（零點擊 AI 摘要）設計規劃

> **文件性質：設計演進與實作後記。** 早期草案中的元件名稱、呼叫數與版面不一定代表 v0.40.0。現行入口是 `features/medical-summary/Feature.tsx`，由 `useMedicalSummaryOrchestrator()` 協調 summary／safety slots；右側 registry 將它設為預設、force-mounted、panel-scroll feature。最後核對：2026-07-14。

## v0.40.0 現況摘要（2026-07-14）

- 標準摘要已採固定 Zod schema，主要卡片為問題、時間軸、安全、決策、檢查趨勢與用藥；coverage 由 app deterministic 計算。
- `DecisionList` 已接回正式畫面，不再是孤兒元件。
- 新增 sticky card navigator、每受眾獨立的卡片排序／顯示管理，以及檢查趨勢跳至累積報告的 analyte focus。
- 自訂摘要已成為同一 feature 內的第二種 reading mode，管理 drawer 可從 Prompt Gallery 加入 summary prompt。
- 使用者仍可在 Medical Summary 內選 model；patient mode 保留 model picker 是目前產品決策，並有 E2E 保護。
- 本節是目前實作索引；以下內容保留原始設計決策與逐版後記。

日期：2026-07-04（v3——修正資料脈絡：健康存摺跨院資料，非院內資料）
狀態：**已實作（2026-07-05，工作樹，未 release）**，實作過程中的設計演進見文末「實作後記」
參考：外部 POC「caretrac-briefing」截圖；使用者核心需求：**「不想要有任何的點擊，盡量所有顯示的 AI 提醒、病程摘要重點提示都直接呈現」**

## 已確認決策

1. 獨立右側主 tab「醫療摘要」，第一位，開啟病人後的預設 tab。
2. 內含 4 張卡：病程摘要、安全警示、需要決定的事、時間軸（+1 張確定性的資料涵蓋卡，見 §4）。
3. 安全警示整個搬入；Clinical Insights 移除 locked 分頁，回歸純自訂工作台。
4. 雙受眾版本（醫療人員版 / 民眾版），跟隨全域 audience。
5. **（v3）資料脈絡 = 健康存摺**：跨院、健保申報 + 部分院所上傳，無院內碼、無癌登、無結構化分期。

---

## 1. 資料脈絡：POC 與本專案的根本差異

| | POC（院內） | 本專案（健康存摺 via NHI-FHIR-Bridge） |
|---|---|---|
| 視角 | 單一院所完整病歷 + 癌登 | **跨院所**健保就醫紀錄 |
| 編碼 | 院內碼、癌登欄位（vital/recurrence/cstatus） | ICD-10-CM、ATC/健保藥品碼、部分 LOINC |
| 分期 | 癌登結構化 cTNM/pTNM | 無結構化分期（僅可能出現在出院病摘文字） |
| 完整度 | 該院範圍內完整 | 自費項目不含、部分院所檢驗值未上傳、上傳有時間差 |
| 典型使用場景 | 院內交班 | **診間面對「他院治療史不明」的病人** |

### POC 元素的取捨

- ❌ **分期模組（cTNM→pTNM）**：無結構化來源，砍掉。不做從病摘文字硬撈 TNM 的低信心猜測。
- ❌ **「狀態碼=1」自動解讀**：癌登院內碼交叉比對，完全不適用，砍掉。
- 🔄 **資料缺口卡 → 資料涵蓋卡**：POC 講「癌登欄位未填」；我們要講的是**健康存摺的涵蓋邊界**（自費不含、上傳時間差、部分檢驗缺）——這對跨院判讀是安全必需品，而且**完全確定性計算，零 AI**（bundle 的 min/max 日期 + 各資源計數 + 院所數）。
- ✅ 保留並強化：交班敘事 highlight、來源可稽核、需要決定的事、時間軸、零點擊縱向流。

### 價值主張反轉：跨院是我們的獨門

POC 做不到、健康存摺獨有的三件事，應成為摘要的招牌：

1. **跨院時間軸**：多院所就醫合併成一條軸，每個事件掛**院所 tag**——「這病人在哪些地方看過什麼」一眼看完。
2. **跨院用藥重整（medication reconciliation）**：不同院所互相看不到彼此處方，重複用藥／交互作用偵測在跨院資料上才真正有力。Safety Alerts 的價值在此放大。
3. **追蹤中斷偵測**：慢箋領藥中斷、異常檢驗後無後續就醫——跨院視角才能判斷「不是在別家追蹤，是真的斷了」。

摘要卡的定位隨之從「交班簡報」改為**「跨院病程摘要」**（醫師第一次面對此病人時的就醫脈絡速覽）。

## 2. 現況點擊成本盤點（不變）

| 想看到的資訊 | 目前路徑 | 點擊數 |
|---|---|---|
| 用藥安全警示 | 切 Clinical Insights → 按「掃描」（autoScan 預設關） | 2 |
| 警示的證據 | 每卡點「證據（n）」chevron | +1/卡 |
| 自訂洞察 | 切子分頁 → 等待/重新生成 → 220–400px 滾動框讀 markdown | 2+ |

結構性根因：自由格式 markdown（`InsightResponseDisplay`）讓 UI 沒有排版權。Safety Alerts（v0.18.0）已有正確骨架：stream → Zod parse → 卡片 + encrypted cache（12h）+ audience 分流——本提案是擴大這個骨架。

## 3. 設計原則

1. **單頁縱向流**：無子分頁、無手風琴、無 maximize。閱讀零點擊，稽核才互動。
2. **結構化輸出**：Zod-validated JSON，UI 擁有排版權；串流中顯示骨架卡。
3. **證據永遠可見**：主張下方小字直列來源（資源類型 + **院所** + 日期）。
4. **來源可驗證**：模型只能引用 context 內存在的 resource id；App 對 bundle 驗證，查無標「未驗證」，不靜默丟棄。
5. **涵蓋邊界誠實**：資料涵蓋卡常駐，提醒「這不是完整病歷」——跨院資料的判讀安全底線。
6. **AI 建議，醫師決定**（民眾版：「請以醫療團隊說明為準」）。

## 4. 資訊架構

```
右側 tabs：醫療摘要(新·第一位·預設) · 筆記對話 · 資料選擇 · 臨床洞察 · IPS 匯出 · 計算機 · 設定

┌ 醫療摘要 tab（features/medical-summary/）
│ 1. 跨院病程摘要卡（violet 左邊條）
│    ├ 3–5 句摘要，關鍵片語 highlight + 上標來源編號
│    ├ 卡底來源 chip：〈資源類型 · 院所 · 日期〉，未驗證者琥珀標
│    └ 頁尾：由 n 筆就醫/用藥/檢驗（m 家院所）生成 · AI 建議，醫師決定
│ 2. 用藥安全卡（SafetyAlertsPanel 內嵌、證據常駐；prompt 補強跨院重整視角）
│ 3. 需要你決定的事（amber；民眾版轉「與醫師討論的事項」）
│ 4. 跨院時間軸（混合生成、院所 tag、零互動）
│ 5. 資料涵蓋卡（確定性計算，零 AI：日期範圍、資源計數、院所數 + 固定邊界聲明）
└ 6. 頁尾：原始 FHIR 資源保留於左側面板（第二層證據視圖）
```

## 5. 生成架構：2 個 AI 呼叫 + 1 個純計算

| 產出 | 方式 | 說明 |
|---|---|---|
| 用藥安全卡 | 既有 Safety scan | prompt 增補「跨院重複用藥/交互作用」提示語；其餘不動 |
| 摘要 + 決定事項 + 時間軸策展 | 新 Summary call（一個 schema） | Gemini Flash-Lite；不用 GPT-Nano（大 context ~77s 已知痛點） |
| 資料涵蓋卡 | **App 端純計算** | bundle 掃一遍即得，即開即渲染，也是骨架期唯一先亮的卡 |

區塊獨立進場：涵蓋卡秒出 → safety 掃完先渲染 → 摘要完成補上。

### 時間軸：混合生成（零幻覺日期、零幻覺院所）

1. App 端確定性抽事件骨架：Encounter／MedicationRequest／Procedure／Observation 的日期 + **院所**（`Encounter.serviceProvider` 等，依 FHIR 泛用原則迭代 `Reference[]` 並以 system 比對 coding）；文件日期沿用 `context.period.start` 規則。
2. AI 只做**策展**：跨院 3 年資料量大（門診可能數十筆），AI 從骨架挑「值得上軸的事件 + 一句話標籤」——這在跨院脈絡比院內更關鍵，否則時間軸變成流水帳。
3. App 以 resource id 對回骨架；查無 id 不上軸。日期與院所永遠來自 bundle，AI 只出文字標籤。

## 6. 雙受眾設計

跟隨全域 `useAudience()`，tab 內無切換器。lazy per-audience 生成（只生成當前受眾，cache key 含 audience，同 Safety 模式）；同一 schema，差異在 prompt 與文案。

**v3 註記**：健康存摺本來就是**病人自己的資料**，民眾版的正當性比院內 POC 更強——定位是「幫民眾看懂自己的健康存摺」。

| 區塊 | 醫療人員版 | 民眾版 |
|---|---|---|
| 摘要 | 臨床語言、數值趨勢（HbA1c 7.2→8.4）、縮寫 | 衛教語氣白話病名；禁止預後推測 |
| 用藥安全 | 「用藥安全」跨院重整視角 | 「健康提醒」（已上線分流沿用）；行動導向「回診時主動告知」 |
| 決定事項 | 臨床行動 + 依據 | 「可以與醫師討論的事」（回診可問的問題） |
| 時間軸 | 完整臨床細節 + 院所 | 簡化標籤，院所用通稱 |
| 資料涵蓋卡 | 完整邊界聲明 | 白話版保留（「自費與最近就醫可能尚未包含」）——民眾更需要知道健康存摺不是全部 |
| 來源 chip | resourceType · 院所 · 日期 | 白話類型（「就醫紀錄」「用藥紀錄」）· 院所 · 日期 |
| 未驗證標記 | 顯示 | 隱藏，該項敘述降級保守措辭 |
| 頁尾 | AI 建議，醫師決定 | 資料來自您的健康存摺，僅供參考，請以醫療團隊說明為準 |

民眾版 prompt 護欄：禁止預後/機率陳述；不確定導向「與醫師討論」；國中閱讀程度；不得出現 ICD/ATC 碼原文。

## 7. Schema（草案）

```ts
// src/core/entities/medical-summary.entity.ts
const SourceRef = z.object({
  resourceType: z.string(),
  resourceId: z.string(),            // 必須存在於 bundle，App 端驗證
  display: z.string(),
  organization: z.string().optional(), // 院所名，App 端從 bundle 補（AI 不出）
  date: z.string().optional(),
})

export const MedicalSummarySchema = z.object({
  headline: z.string(),
  summary: z.array(z.object({
    text: z.string(),
    emphasis: z.boolean().default(false),
    sources: z.array(z.string()).default([]),
  })),
  decisions: z.array(z.object({
    text: z.string(),
    urgency: z.enum(['high', 'medium', 'low']),
    rationale: z.string(),
    sources: z.array(z.string()).default([]),
  })),
  timelinePicks: z.array(z.object({   // 日期與院所由 App 骨架提供，AI 只出標籤
    resourceId: z.string(),
    label: z.string(),
    category: z.enum(['diagnosis','procedure','medication','encounter','lab','followup']),
  })),
  sourceIndex: z.array(SourceRef.omit({ organization: true })),
})
// 資料涵蓋卡不在 AI schema 內——App 端純計算：
// { dateRange, orgCount, counts: { encounter, medication, lab, procedure } }
```

驗證管線：stream 收滿 → parse → `sourceIndex` 對 bundle 驗證（含 organization 回填）→ `timelinePicks` 對回骨架。FhirMapper 白名單陷阱注意：若需要 `Encounter.serviceProvider` 等欄位，需確認 Entity 型別與 mapper 兩處都有列（v0.15.6 教訓）。

## 8. 元件與架構落點

| 項目 | 內容 |
|---|---|
| Feature | `features/medical-summary/`：`Feature.tsx`、`SummaryCard`、`DecisionList`、`CrossFacilityTimeline`、`CoverageCard`、`SourceChips` |
| Safety 內嵌 | `SafetyAlertsPanel` 加 `embedded` prop；clinical-insights 移除 `SAFETY_TAB_ID` |
| SafetyAlertCard | 移除 `showEvidence` toggle，證據常駐（`text-xs`，上限 3 條 + 「等 n 筆」截斷說明） |
| Registry | `medical-summary` order 0、`forceMount: true`；其餘 +1；`right-panel.provider` 預設 tab 改之 |
| Theme | tab icon 建議 `ClipboardList`；colorKey 新增 teal 系與 insight violet 區隔 |
| i18n | `t.tabs.medicalSummary`、`t.medicalSummary.*` + `.patient.*` |
| 快取 | encrypted-session-cache 12h，key 含 audience |
| 觸發 | 已登入 auto-generate；匿名手動按鈕（50/day 配額保護） |
| tab 擁擠 | 7 tabs × ~380px ≈ 54px/格：窄幅 inactive 只顯 icon，或短標籤「摘要」 |

## 9. 風險與對策

| 風險 | 對策 |
|---|---|
| 幻覺主張/日期/院所 | 來源稽核；時間軸日期與院所只來自 bundle |
| 跨院資料被誤讀為完整病歷 | 資料涵蓋卡常駐（確定性），兩版皆顯示 |
| 上傳時間差（最近就醫缺席） | 涵蓋卡固定聲明；摘要 prompt 提示「最近 2–4 週資料可能不全，避免斷言『目前無就醫』」 |
| 資料量大生成慢 | 涵蓋卡秒出 + 骨架卡 + safety 先進場；Flash-Lite |
| bridge 資料形狀問題 | 照不遮蔽原則呈現，供回報 bridge |
| 民眾版語氣風險 | prompt 護欄 + 頁尾免責 |

## 10. 分階段實施

- **P0（~0.5 天，可獨立先出）**：SafetyAlertCard 證據常駐化；已登入 autoScan 預設開。
- **P1（~3 天）**：醫療摘要 tab（醫療人員版）：registry/theme/i18n + schema + use-case + hook + 摘要卡 + 決定事項卡 + **資料涵蓋卡（純計算，先做，最便宜）** + Safety 內嵌搬遷 + 預設 tab + tab 擁擠處理。
- **P2（~2 天）**：跨院時間軸（骨架抽取含院所欄位——注意 FhirMapper 白名單）+ SourceChips + 來源稽核。
- **P3（~1–1.5 天）**：民眾版。可與 P2 對調，不互相依賴。
- **P4（可選）**：點 highlight 捲至來源、Safety prompt 跨院重整強化語調校。

---

## 實作後記（2026-07-05）

實作全數落地，與 v3 規劃的差異／演進：

1. **來源呈現從「常駐 chip 列」改為「互動引用藥丸」**：常駐來源清單實測太佔空間（8 筆來源≈半張卡）。改為 Perplexity 式引用藥丸（`SourceSup`）：桌機 hover、行動版 tap 開 popover；未驗證引用＝琥珀色藥丸＋不可點。閱讀零點擊原則不變——稽核才互動，回到 POC 的原始互動哲學。
2. **來源導航（第二層證據連結）**：popover 內的已驗證來源列與時間軸事件列皆可點，導航至左側面板對應分頁並閃爍定位目標卡（`resource-navigation.store` + `useResourceAnchor`，Encounter/用藥/Condition 以錨點精準定位；DiagnosticReport/Observation 由 ReportsCard 認領——自動切至含該列的子分頁、驅動虛擬化清單捲動、自動展開並閃爍（列為虛擬化所以不能用掛載式錨點））。左側 Tabs 因此由 uncontrolled 改 controlled；手機情境會先切回臨床摘要側。
3. **Encounter.class 細分**：時間軸「就醫」事件由 App 端從 `Encounter.class`（IMP/EMER/AMB + 文字 fallback）確定性判別為住院／急診／門診，AI 只出大類——住院不再被貼「門診」標籤。
4. **Highlight 防線**：prompt 要求 ≤5 個、各 ≤15 字的關鍵片語 + `finalizeResult` 確定性防線（>24 字元降級、>5 個截斷），杜絕「整面紫色壁紙」。
5. **解析韌性**：Flash-Lite 大 context 偶發壞 JSON——失敗自動靜默重試一次 + console 留原始回應片段（300 字）供診斷。
6. **自動產生不分登入**：onboarding 第 3 步改為「AI 自動產生內容」總開關（同時控制摘要與安全掃描、附 PHI 上傳提示、無額度話術）；匿名訪客的 client 端閘門移除（配額由伺服器端強制）。
7. 醫療摘要閒置態不再顯示說明卡（標題列按鈕即入口）。

**未完成／後續**：民眾版實測調校；tab 擁擠（現況 icon 化降級可接受）。

---

## v2 版面重整（2026-07-06）— 分級密度 + 有界區塊 + 區塊導覽

問題：原版面假設每個區塊「小而美」，但安全警示（可十幾筆）與跨院時間軸（可十幾個事件）都是無上限的，任一爆量就把下方內容推到摺疊線以下。排序本身正確（敘事→警示→決定→時間軸→涵蓋，行動型在前、查閱型在後），病在無界區塊。

實作：

1. **安全警示分級密度**（`SafetyAlertCard` density prop + `SafetyAlertsPanel` 分組）：確定性 severity 排序（高→中→低）。高風險＝完整卡（含依據，永遠展開）；中風險＝緊湊列（嚴重度 pill + 標題 + 一行建議，點擊展開 detail+依據）；低風險＝整批收成一行「另有 N 筆低風險提醒 ▾」。15 筆警示從 ~75 行壓到 ~26 行。
2. **時間軸有界**（`CrossFacilityTimeline`）：預設顯示最近 8 筆（跨院近期事件價值 > 久遠門診），較早的收成頂部「更早 N 筆事件 ▾」；時序方向不變（老→新）。
3. **區塊導覽列**（`SummarySectionNav`）：敘事卡下方一行跳轉 chip「⚠ 警示 3·5·7｜☑ 待決 3｜🕐 時間軸 12」，色碼嚴重度計數（紅/琥珀/藍）；計數本身就是資訊（不捲動即知「3 個高風險」），點擊平滑捲至該區塊。`useSafetyAlertCounts` 唯讀選擇器讀同一 store、不觸發第二次掃描。
4. 零點擊原則精確化為「重點閱讀零點擊」：高風險警示、待決事項、近期病程恆常可見；收合的只有「低風險的量」與「久遠的尾巴」，且收合處皆為有計數的說明列（不是隱形黑盒）。
5. 註記：巢狀 Radix ScrollArea 內原生 smooth scroll 於背景分頁不animate（rAF 暫停），改以 reduced-motion 感知的 `scrollIntoView`；真實前景瀏覽器正常動畫。

---

## v3 版面：寬版兩欄（Container Query，2026-07-06）

問題：左側面板收合後右面板可達 ~1900px，原單欄卡片直接拉滿 → (1) 敘事一行 100+ 字遠超可讀行寬；(2) 扁卡 + 大量留白，寬螢幕空間浪費。

關鍵決策：**用 container query（`@container` / `@min-[52rem]:`）而非視窗斷點**。面板寬度 ≠ 視窗寬度（分割視圖 ~700px vs 左側收合 ~1900px，同一視窗），`md:/lg:` 會全錯。Tailwind v4 原生支援，無外掛。

版面（容器 ≥ 52rem 切兩欄，以下維持單欄）：
- 標題列 + 導覽 chips：全寬
- **左欄「評估」**：跨院病程摘要 → 安全警示（這病人是誰、有什麼危險——兩張必讀卡同欄）
- **右欄「行動＋脈絡」**：需要你決定的事 → 跨院時間軸
- 資料涵蓋卡 + 頁尾：全寬
- **關鍵約束（2026-07-06 修正）**：欄內卡片順序必須讓單欄（< 52rem，手機/一般分割視圖，最常見）flatten 後為正確閱讀序 narrative→safety→decisions→timeline。nested column div 在單欄時 DOM 序＝左欄全部再右欄全部,故左欄=[敘事,安全]、右欄=[決定,時間軸](各半,依典型高度均衡)。初版誤把時間軸放左欄→單欄時時間軸跳到安全警示前面,已修正。配合分級密度 + 時間軸有界化,1080p 全寬四卡同屏。

細節：`@container mx-auto max-w-[84rem]`（ultrawide 兩欄各 ~666px ≈ 40 中文字/行，維持可讀行寬）；grid `items-start`（各欄依內容高度）；`grid-cols-1 @min-[52rem]:grid-cols-2`；< 52rem 完全不變（手機、一般分割視圖）。卡片元件本身零改動——純 Feature.tsx 佈局層。

否決：2×2 固定格（高度差→欄內空洞）、三欄（每欄 ~600px 擠、注意力太碎）、CSS columns（閱讀順序與跳轉定位不可控）。

---

## v4 控制項合一（2026-07-06）

問題：醫療摘要 tab 由兩個獨立 AI 呼叫組成（summary use-case + safety use-case），但兩套 header 控制項沒合併——摘要 header 有自動產生開關/產生按鈕/模型選擇，安全警示區塊又殘留自己的自動掃描開關/掃描按鈕，且安全警示的模型從 UI 完全改不到（內嵌時 picker 被砍）。矛盾點：onboarding 早已把自動開關合一（一個「AI 自動產生內容」設定 autoGenerate + autoScan），tab 卻還是兩個。

決策：**觸發合一，渲染獨立。** tab 只留一組頂層控制，各驅動兩個呼叫；兩個呼叫仍各自跑（不同 schema/cache、可不同時完成）、各顯示自己 loading/error。

實作：
- `useSafetyAlerts` 上提到 `Feature`（**唯一** instance，auto-scan effect 只跑一次）；`SafetyAlertsPanel` 改為純呈現元件（props: result/isScanning/error/hasPatient，無任何控制項，只留區塊標題＋掃描摘要＋分級卡）。
- 單一模型 picker → `setModelBoth`（寫兩個 hook 的 setModel）；單一自動開關 → `setAutoBoth`（設 autoGenerate + autoScan）；單一產生按鈕 → `runBoth`（generate() + scan()）；按鈕忙碌/有結果狀態合併（isGenerating||isScanning、result||safetyResult）。
- **對齊預設值**：safety `autoScan` 預設 false→true，與 summary autoGenerate 預設 true 一致，否則合一開關會顯示 ON 但安全掃描靜默不跑。
- 移除為避免雙 instance 而建的 `useSafetyAlertCounts` selector（Feature 現在直接由自己持有的 safetyResult 算 countBySeverity）；保留 `SafetyAlertCounts` 型別給 SummarySectionNav。
- 否決：維持分離但把安全警示 picker 加回去 → 三組重複控制。完全合一模型（無「摘要用聰明、安全用便宜」情境，兩者吃同一 context）。

---

## 卡片高度上限（2026-07-06）

問題：安全警示（多筆高風險，high 不可折疊）、決定事項、展開後的時間軸都可能無限長，把單卡撐爆、破壞「四卡同屏」與兩欄均衡。

決策：**每張內容卡的內容區上限 30rem（480px），超過即內部捲動；卡片標題固定在捲動區上方。** 值的取捨：480px 可容 ~4 張 high 警示卡 / ~6 筆決定 / 完整 recent-8 時間軸（不捲），單卡總高 ≤ ~540px 故不會壓過同欄另一張卡。捲軸用 `scrollbar-thin-persistent`（常駐細捲軸，暗示可捲）。

套用範圍（標題固定、內容捲動）：
- 敘事卡：headline + 敘事段捲動；標題與「AI 建議，醫師決定」責任聲明頁尾固定（安全網，敘事幾乎不會超過）。
- 安全警示：分級卡列表（high/medium/low）捲動；區塊標題 + 掃描摘要行固定。
- 決定事項：決定列表捲動；標題固定。
- 時間軸：事件 ul 捲動；標題 + 「更早 N 筆」toggle 固定。時間軸圓點位於 x≥0，捲動框不裁切。
- 資料涵蓋卡：不設限（本來就小而固定）。

實測：recent-8 時間軸 457px（不捲）；展開全部→566px 內容、框固定 480px 內捲。四卡於 1080p 全寬同屏。

---

## 微調（2026-07-06）：時間軸倒序 + 低風險常駐

- **時間軸改倒序（最新在最上）**：`finalizeResult` 排序由 `a.date-b.date`（舊→新）改為 `b.date-a.date`（新→舊）——最新事件承載最高臨床權重,置頂,往下捲看歷史。元件對應調整:顯示前 INITIAL_VISIBLE 筆(即最新 8 筆),`slice(0,8)`;「更早 N 筆事件」toggle 由頂端移到**底端**(feed 式「載入更早」模式),展開後較舊事件接在下方,於 30rem 捲動框內。
- **低風險警示取消 toggle、預設常駐**:移除 `showLow` 折疊,low tier 直接以 compact 卡渲染於 medium 之後。量多時由卡片 30rem 高度上限 + 捲動處理(與使用者「超過就往下滑」的一致哲學)。清掉 SafetyAlertsPanel 的 showLow/ChevronDown/cn/useState 死碼;i18n 的 lowGroupExpand/Collapse 保留未用(無害)。

---

## v5 微調（2026-07-06）

使用者五項調整：

1. **窄版順序修正**：兩欄改為 LEFT=[敘事, 安全警示]、RIGHT=[待決, 時間軸]，使窄版（<52rem 單欄）攤平後為 敘事→安全→待決→時間軸（正確優先序，安全不再被時間軸壓在後面）；寬版左欄同時是「病況＋風險」評估欄。
2. **每張卡高度上限 30rem + 內部 scroll**（標題固定於上）——四張卡一致，任一卡再長也不會撐爆版面，整頁四卡可見。
3. **時間軸改新→舊**：finalize 由 `a.date.localeCompare(b.date)` 改為 `b.date.localeCompare(a.date)`，元件 `slice(0, 8)` 取最近 8 筆，較早的收合於底部。
4. **低風險預設顯示**（移除 toggle）——量多時靠卡片 30rem 高度上限 + scroll 消化。
5. **安全警示「依據」可點擊導航**：安全警示 schema 加 `sources`（來源清單 key）；prompt 附上 SOURCE LIST（重用 summary 的 `buildSourceCatalog`）要求模型引用；hook 建目錄 + `resolveSource` resolver；`SafetyAlertCard` 在「依據」標籤旁渲染 `SourceSup`（與敘事/待決卡同一元件），點擊導航至左側面板原始資源。查無 key → 未驗證標記（不丟棄）。與 summary 完全共用導航管線。
   - 依賴備註：safety use-case/hook 匯入 summary use-case 的 `buildSourceCatalog`（純函式）+ entity 的 `SummarySourceCatalogEntry` 型別。若日後嫌耦合，可抽到 shared 模組。

---

## v6 問題清單卡（2026-07-06）

新增第 6 張卡：**AI 推斷的問題清單**，跨資料型別綜合（不只就診 ICD 碼）。

- **Schema**：`MedicalSummaryAiResultSchema` 加 `problems`（label / icd? / basis? / kind / sources）；`SummaryProblem` resolved 型別 + `normaliseProblemKind`。
- **Prompt**：明確要求由「編碼診斷 + 異常檢驗型態 + 藥局調劑推得的病況（如青光眼藥水→青光眼、BPH 藥→良性攝護腺增生）+ 照護計畫 + 出院病摘」綜合推斷 active problem list；給 ICD、簡短依據詞（「5 次檢驗異常」「藥局調劑」）、kind、來源 key；去重、上限 ~12。
- **finalize**：resolve problem sources → sourceKeys（併入共用 sourceIndex，可導航）；trim icd/basis；normalise kind。
- **元件** `ProblemListCard`：每列 label + `ICD · 依據:xxx` + kind badge（照護計畫/病摘=藍「紀錄」感，其餘=琥珀「推斷」）+ 可導航 `SourceSup`（點擊→左側面板原始資源）。30rem 高度上限 + scroll。民眾版隱藏 ICD、標題改「健康狀況清單」。
- **版面**：RIGHT 欄頂（problems → decisions → timeline）；窄版攤平序 = 敘事→安全→問題→待決→時間軸。SummarySectionNav 加「問題」chip（計數 + 跳轉）。
- **快取相容**：summary cache namespace 由 `medsummary` → `medsummary2`（舊 shape 無 problems，直接忽略重生）；UI `result.problems ?? []` 防禦，舊快取不 crash。

---

## v7 照護計畫納入來源目錄（2026-07-06）

問題清單能引用「照護計畫」作為依據，但照護計畫本身不在 `buildSourceCatalog`，所以引用無法導航。修正：

- **catalog**：`SummaryCatalogInput` + `buildSourceCatalog` 加 `carePlans`（key 前綴 `K`，單字母避免與 C/P 混淆；display=title/category/description、date=period.start/created、org=author.display）。cap 15。`buildCoverageStats` 併入照護計畫的 org（院所計數更準）。
- **資料流**：`useClinicalData()` 本就回傳 `carePlans`，兩個 hook 的 `as SummaryCatalogInput` cast 自動帶入 → summary 與 safety 目錄都含 K 條目。
- **導航**：`leftTabForResourceType('CarePlan') → 'patient'`；`CarePlansCard` 每列抽成 `CarePlanListItem` 掛 `useResourceAnchor('CarePlan', id)`，點引用 → 病人資訊分頁閃爍定位。
- 問題清單/敘事/決定/安全任一卡引用照護計畫（K 鍵）皆可導航，非只命名於 basis 文字。

---

## v7.1 修正：左欄收合時來源導航無效（2026-07-06）

Bug：桌機把左欄收合成全寬（`collapsed === 'left'`，section `md:hidden`）後，點來源導航無效——目標卡仍掛載但 display:none，`scrollIntoView` 對隱藏元素 no-op，且面板不會自動展開。

修正（app/page.tsx）：既有的 nav 效果（原本只 `setMobileView('left')` 供手機）擴充為導航待處理時 `setCollapsed(c => c === 'left' ? null : c)` 先展開左欄。因為錨點的捲動有 50ms 延遲，展開的 re-render 會在捲動前完成 → 落在已可見的元素上。效果需移到 `collapsed` state 宣告之後（否則 deps 觸 TDZ）。瀏覽器實測：收合左欄→點引用→左欄復原＋切正確分頁＋閃爍定位，通過。

---

## v8 Audit 修正（2026-07-06）

全面 audit 後修正 11 項（hook 測試 harness 列中期）：

**臨床正確性（高）**
1. **問題清單移除 ICD**：LLM 產碼實測不穩定（同病人 N18/N18.3/N18.9），且無法驗證的碼不該看起來權威。schema/prompt/UI 全移除，問題只出名稱（如 第二型糖尿病）；可導航來源本身就是稽核。順帶解掉民眾版 prompt「不出碼」與 SHARED_RULES「給碼」的矛盾。
2. **「掃描 N 筆」改確定性**：模型自報數（實測 30/54/68 飄移）棄用，hook 以送入 SOURCE LIST 的 catalog 筆數覆寫。

**一致性/韌性（中）**
3. **模型偏好單向同步**：合一前的歷史 persisted 值可能不同步——Feature 掛 effect 以 summary 為準同步 safety（連帶正確地失效跨模型快取）；移除 `void safetyModel` 死碼。
4. **引用編號 = 渲染順序**：finalize 的 registerKey 改為 summary→problems→decisions，上標數字由上而下遞增。
5. **重新產生指示**：舊結果保留顯示時，敘事卡標題列加小 spinner（`updating` prop）。
6. **分區重試**：摘要/安全錯誤橫幅各加「重試」鈕，只重跑失敗的那個呼叫（不重扣成功側）。

**細節（低）**
7. **引用藥丸鍵盤可用**：sup 補 Enter/Space onKeyDown（非原生 button 不會合成 click）。
8. **PHI log guard**：parse 失敗的原始回應片段只在非 production 印出。
9.（併入 1）
10. **民眾版徽章**：「病摘」→「出院紀錄」（patient i18n 覆蓋）。
11. **共享目錄**：`getSourceCatalog`（WeakMap 以 bundle 參照 memo），summary/safety 兩 hook 共用一次建構。
12. Hook 層 renderHook harness：中期。

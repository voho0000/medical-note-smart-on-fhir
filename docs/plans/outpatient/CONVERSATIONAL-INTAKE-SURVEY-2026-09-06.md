# 對話式診前問診產品調查（2026-09-06）

> 問題：現在的對話式 AI 能否「一開始定義好任務，在跟病人問答中把需要的結構化答案取得」，例如心衰竭病人一律在對話中完成 KCCQ-12，而不必另外產生各式表單？
> 結論：**能，而且已有商業產品與同儕審查研究**。但「驗證量表」這一類要分開看：對話可以當引導，題目原文與選項不能改，否則就是另一個未驗證的工具。
> 姐妹文件：docs/plans/outpatient/PREVISIT-QUESTIONNAIRE-REQUIREMENTS-DRAFT-2026-09-06.md。本調查的結論是把該文件的「填寫介面」從表單改成「表單或對話都是 renderer，FHIR Questionnaire 仍是合約」。

---

## 1. 產品

| 產品 | 國別 | 做到什麼 | 驗證量表 | 結構化輸出 | 對我們的限制 |
|---|---|---|---|---|---|
| **Perspective AI** | 美 | 文字／語音對話式 intake，答案含糊就追問，急性風險即時升級給臨床人員 | PHQ-9、GAD-7、PC-PTSD-5、AUDIT-C、Columbia 在對話中施測 | 結構化摘要＋原始逐字稿進 EHR | 美國雲端、HIPAA 語境；無中文；無 KCCQ |
| **Epic Emmie（MyChart）** | 美 | 就診前在 MyChart 與病人對話，整理出給醫師的討論清單；讀病歷回答病人問題 | 未見 | 討論主題清單 | 只在 Epic 生態 |
| **Hippocratic AI** | 美 | 語音 agent：術前準備、慢病追蹤、出院後追蹤、診前篩檢；WellSpan 大腸鏡準備 pilot | 未見 | 非診斷任務為主 | 語音、英語、雲端 |
| **Phreesia** | 美 | 報到／intake 平台，PRO 問卷依作答調整後續題 | 有，但仍是**表單式**自適應 | 進 EHR | 不是自由對話；美國市場 |
| **Infermedica Intake API** | 波蘭 | 症狀與病史 intake，可嵌網頁／APP／chatbot／語音；LLM 摘要並標風險 | 未見 | API 回傳結構化 | 症狀導向，非 PROM |
| **Ubie AI問診** | 日 | 依作答自動生成下一題，答案轉成醫學用語與結構化資料；1,800 家機構，生成 AI 版進 100 家醫院 | 未見 | 直接填電子病歷 | **日文限定**；最接近亞洲健保情境的對照組 |
| **Simbie AI** | 美 | intake 與追蹤，把非結構化回答轉成 chart-ready 資料 | 未見 | 進 EMR | 規模與證據較薄 |
| Google AMIE | 美 | 研究系統，2026 年在基層門診做前瞻可行性研究 | — | — | 非產品；診斷導向 |
| Abridge、Dragon Copilot | 美 | 診間 ambient scribe | — | — | **沒有病人端診前功能**，排除 |
| 台灣 | — | 本次搜尋未找到成熟的對話式預問診產品 | — | — | 空缺即機會 |

---

## 2. 證據

| 研究 | 設計 | 結果 | 對我們的意義 |
|---|---|---|---|
| HopeBot（PLOS Digital Health 2025） | LLM 對話施測 PHQ-9 vs 自填，132 人，英國＋中國，within-subject | **ICC 0.91**，45% 分數完全相同；71% 更信任 chatbot | 短量表對話施測可達高一致，但這是 PHQ-9 不是 KCCQ |
| Mayo Clinic Arizona 心血管門診 intake pilot（2025-07 至 09） | 對話式 agent 做診前 intake：病史、服藥遵從、當前困擾 → 結構化摘要 | 幾乎全數完成，多數覺得直覺可信，醫師報告專注度與效率提升 | **心臟科情境已有可行性證據** |
| PROMBot-HSM-FA（ClinicalTrials.gov） | AF 電燒後 PRO 收集，WhatsApp chatbot | 採**規則式有限狀態機**，不是 LLM | 保守做法仍存在；量表施測用確定性流程是刻意選擇 |
| JPRO 2025 評論「新一代 LLM-PROM」 | 立場文章 | LLM-PROM 需多方利害關係人參與，並**對既有 PROM 做驗證** | 對話版 KCCQ 沒有等效驗證前不能當 KCCQ |
| 紙本 vs 電子 PROM 等效性 meta-analysis | 2007–2013 研究 | 紙本與電子等效 | 等效性只涵蓋「同題同選項換載體」，不涵蓋改寫成對話 |

---

## 3. 對「對話中完成 KCCQ-12」的具體判斷

1. **KCCQ 是版權量表**（Outcomes Instruments, LLC / Spertus）。臨床使用要登記，商業產品要授權；電子化遷移研究強調「最小改動」。讓 LLM 用自己的話問 KCCQ，等於製造未授權的衍生版本。
2. **對話可以做的**：解釋題意、確認 recall window 是「過去兩週」、病人答非所問時把口語對應回七點量表並**回讀確認**、記錄病人補充的敘述。
3. **對話不能做的**：改題幹、合併題目、跳題推測分數。
4. 所以正確架構是**schema-guided dialogue**：FHIR Questionnaire 是 schema，LLM 以 tool calling 逐題填 QuestionnaireResponse，每題的 text 與 answerOption 由 schema 提供，模型只負責對話包裝與答案對應。Perspective AI 的「在對話中跑驗證量表」實務上就是這種做法。
5. 沒回答完的題目退回表單補填，兩種 renderer 共用同一份 Questionnaire。

---

## 4. 對話式相對表單的成本與風險

| 面向 | 表單 | 對話 |
|---|---|---|
| 病人時間 | 短、可預期 | 較長；老年心衰病人語音可能更好，文字可能更差 |
| 每人成本 | 零 | 每次對話 LLM token；院內模型可吸收 |
| 可稽核性 | 答案即資料 | 需保留逐字稿＋對應結果，才能回溯「模型為什麼填 3」 |
| 法規 | 靜態工具 | 病人端對話 agent 比表單更接近 MOHW 2026-05-29 指引排除的 AI Agent System，pilot 定位要寫清楚是**受限任務、無自主行動、人工覆核** |
| 病安 | 無 | 模型誤填量表分數是新風險；急性訊號（胸痛、自殺意念）要有確定性升級規則 |
| 個資 | 同 | 逐字稿是更敏感的 PHI，儲存政策要另列 |

---

## 5. 對我們的建議

- **不採購**：現有產品沒有中文、沒有 NHI 雲端資料脈絡、多為美國雲端；Ubie 最像但日文限定。
- **自建 schema-guided dialogue**，放在醫析民眾模式：輸入 Questionnaire（含 SDC 預填），輸出 QuestionnaireResponse；對話與表單是同一合約的兩種 renderer。
- **pilot 順序**：先用通用核心（過敏、抽菸、懷孕、今日議程）測對話式，這些沒有版權與等效性問題；KCCQ 先表單，等拿到授權再做「對話引導、原題呈現」版本，並做一次自填 vs 對話的 ICC 驗證。
- **必備守門**：每題回讀確認、未答退回表單、急性關鍵字確定性升級、逐字稿與結果一起存。

---

## 來源

- Perspective AI：https://getperspective.ai/blog/ai-patient-intake-mental-health-practices-conversational-screening-2026 ；https://getperspective.ai/blog/ai-medical-intake-in-2026-how-practices-are-replacing-clipboards-with-conversational-forms
- Epic Emmie：https://www.epic.com/software/emmie/ ；https://healthsystemcio.com/2026/09/03/epic-emmie-published-results/
- Hippocratic AI：https://www.stork.ai/en/hippocratic-ai
- Phreesia：https://smarterway.ai/tools/phreesia
- Infermedica Intake API：https://infermedica.com/intake-api
- Ubie AI問診：https://intro.dr-ubie.com/products/aimon ；https://prtimes.jp/main/html/rd/p/000000198.000048083.html
- Simbie AI：https://www.simbie.ai/ai-patient-intake-automation/
- Google AMIE 前瞻研究：https://arxiv.org/abs/2603.08448
- HopeBot PHQ-9：https://journals.plos.org/digitalhealth/article?id=10.1371%2Fjournal.pdig.0001446
- Mayo Clinic Arizona 心血管 intake pilot：https://www.sciencedirect.com/science/article/pii/S294976122600057X
- PROMBot-HSM-FA：https://clinicaltrials.gov/study/NCT07237178
- JPRO LLM-PROM 評論：https://link.springer.com/article/10.1186/s41687-025-00867-4
- 紙本 vs 電子 PROM 等效 meta-analysis：https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4597451/
- KCCQ 授權：https://www.cvoutcomes.org/kccq-plan-select-page/ ；電子遷移：https://www.ispor.org/heor-resources/presentations-database/presentation/ispor-19th-annual-european-congress/linguistic-validation-and-electronic-migration-of-the-kansas-city-cardiomyopathy-questionnaire-kccq
- 市場分類：https://getperspective.ai/blog/ai-patient-intake-software-2026-9-platforms-compared-by-workflow

---

## 6. 台灣現況（2026-09-06 補查）

結論：**沒有任何台灣機構或公司做過「在對話中完成驗證量表」**。病人端 LLM 對話有三個真實案例，其餘都是醫師端生成 AI、規則式 LINE 機器人或衛教問答。

### 6.1 病人端 LLM 對話（最接近的三個）

| 機構 | 內容 | 技術 | 狀態 | 與我們的差距 |
|---|---|---|---|---|
| **北市聯醫 × 陽明交大「即時智慧問診系統」** | 病人就診前用語音向 AI 描述症狀，AI 依院方初診規範與標準問診流程追問，產出給醫師的資訊與初步檢查建議 | RAG＋LLM，開發 1.5 年 | 2025 年宣布泌尿科下半年上路，進入臨床測試驗證；規劃擴到腎臟科與慢性病 | 症狀導向問診，非 PROM；無跨院雲端資料；**台灣唯一公開的診前對話 intake 案例** |
| **北榮眼科「專業眼科醫療數位分身」** | 候診時掃 QR，AI 用生活化問題釐清病人對人工水晶體的優先考量，26 種選項縮到數個，整理需求摘要給醫師 | 陽明交大陳添福團隊 LLM，限定醫師審核教材，754 種對話情境逐一調整，7 個月 4 次調模 | 65 人實測約八成願再用；每診省 2–3 分鐘 | 是**院內自己人做的病人端對話＋摘要給醫師**，流程與我們幾乎同構，但主題是決策輔助不是病史 |
| **亞東醫院 AI 失智諮詢（與遠傳）** | 家屬輸入問題，AI 依失智共照中心教材生成回覆 | 生成式 AI | 2024 年上線 | 衛教問答，不收結構化資料 |

### 6.2 廠商

| 廠商 | 產品 | 病人端對話？ | 備註 |
|---|---|---|---|
| 華碩 | Clinical AI Assistant（北榮 2025-10 內外兒婦上線）、數位問卷、Sage 聊天機器人、Maestro＋Kairo 機器人 | 新聞稿寫「引導病患完成診前提問、自動生成病歷摘要」，但**未說明介面與是否對話式** | 北榮既有合作方，值得直接問華碩「診前提問」是什麼 |
| 宏碁智醫 | aiMed 智醫通 | 否，醫護語音轉結構化紀錄 | 醫師端 |
| 中國附醫 × 微軟 | 智海系統 gHi | 否，醫護口述轉病歷；EirBot 照護機器人 | 醫師端；「新病人面談問診」是醫師口述 |
| 奇美 | A+ 助理 | 否 | 醫師／藥師／護理端 |
| 台中榮總 | 週記／出院／住院摘要 | 否 | 醫師端 |
| 叡揚 iota C.ai（部立臺北醫院） | LINE 掛號到視訊問診 | 規則式流程機器人，非 LLM | 「問診」指視訊看診，不是病史收集 |
| 台灣大哥大 | AI 語音掛號、交班摘要、病程紀錄（部彰、屏東安泰） | 語音掛號而已 | 非病史 |
| 療心智能 HealthyMind Tech | DietMate：LINE 原生 agentic 慢病管理，宣稱 FHIR R4 | 慢病追蹤對話 | **台灣少見同時做 LINE agent＋FHIR 的新創**，可當技術對照或合作對象 |
| 大林慈濟「小慈」 | LINE 導診與衛教 | 規則式 | 2020 年 |

### 6.3 對我們的意義

1. 「病人端 LLM 對話 → 結構化摘要給醫師」在台灣**已有先例且就在北榮眼科**，法規與 IRB 路徑可直接沿用；可先向眼科團隊與陽明交大陳添福教授取經。
2. 北市聯醫證明「診前對話 intake」在台灣公立醫院可立案，但走的是症狀導向，不做 PROM，也沒有跨院資料。醫析的差異化正是雲端資料＋pack 驅動出題＋驗證量表。
3. 華碩的「診前提問」要問清楚，避免跟院內既有合作重工，或反過來把醫析當它的出題與閱讀端。
4. 台灣沒有人做對話式 PROM 施測，也沒有等效性研究；如果做，KCCQ 或通用核心的「自填 vs 對話」ICC 研究本身就是可發表的 pilot 產出。

### 6.4 補查來源

- 北市聯醫 AI 問診：https://udn.com/news/story/7266/8579410
- 北榮眼科數位分身：https://udn.com/news/story/6837/9633319
- 亞東 AI 失智諮詢：https://www.commonhealth.com.tw/article/90148
- 亞東智慧門診 2026：https://www.chinatimes.com/newspapers/20260621000388-260114
- 華碩 Clinical AI Assistant：https://www.cio.com.tw/asustek-wide-ai-leads-smart-healthcare-trend/ ；https://technews.tw/2025/12/04/asus-at-taiwan-healthcare-plus-expo-2025/
- 北榮＋華碩病歷助手：https://news.gbimonthly.com/tw/article/show.php?num=82167
- 宏碁智醫 aiMed：https://www.acer-medical.com/ch/solutions/aimed/
- 中國附醫智海：https://www.cmuh.cmu.edu.tw/NewsInfo/NewsArticle?no=8438
- 奇美 A+：https://www.ithome.com.tw/news/165914
- 台中榮總：https://www.cio.com.tw/111964/
- 叡揚 iota C.ai：https://www.gss.com.tw/content-page/257-eis105/3178-line-iota-c-ai
- 台灣大哥大：https://www.stufftaiwan.com/2026/06/15/
- 療心智能：https://www.healthymind-tech.com/
- 大林慈濟小慈：https://tw.linebiz.com/case-study/tzu-chi/
- 對照：中國 PreA RCT（Nature Medicine 2026，2,069 人，診療時間減 28.7%）：https://www.nature.com/articles/s41591-025-04176-7

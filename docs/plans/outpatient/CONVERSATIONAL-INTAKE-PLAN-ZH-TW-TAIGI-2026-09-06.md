# 中文／台語對話式臨床 Intake 規劃文件 v0.1

> 日期：2026-09-06（v0.1 同日修訂：**雲端 AI 可用，不限地端**）
> 性質：AI 產生的規劃初稿，供 pilot team 討論。**每一條都可以被推翻。**
> 前置文件：
> - docs/plans/outpatient/PREVISIT-QUESTIONNAIRE-REQUIREMENTS-DRAFT-2026-09-06.md（診前問卷需求）
> - docs/plans/outpatient/CONVERSATIONAL-INTAKE-SURVEY-2026-09-06.md（國內外產品與證據調查）
> - docs/plans/outpatient/DEPT-PREVISIT-SUMMARY-REQUIREMENTS-DRAFT-2026-09-06.md（科別摘要，答案的去處）
> 一句話定位：**用病人的語言（華語、台語、混講）把診前問卷「講」完，答案仍是同一份 FHIR QuestionnaireResponse。** 對話是 renderer，不是新資料模型。

---

## 1. 目標與非目標

### 1.1 目標
1. 病人以華語或台語**語音**或華語**文字**完成通用核心診前問卷與科別 PROM。
2. 每一題的答案落到既有 Questionnaire schema，醫師端顯示與 CDSS 消費零改動。
3. 老年、低識字、台語為主的病人完成率不低於表單版。
4. 語音與 LLM 可用雲端服務；PHI 上雲以「供應商零保留、資料不落地台灣以外、病人同意」為條件，地端保留為備援。
5. 產出可發表的等效性證據：自填表單 vs 對話施測。

### 1.2 非目標
- 不做診斷、不做分流建議、不做用藥建議。對話只收資料與釐清。
- 不做開放式閒聊；離題即拉回。
- 不自主寫回醫院病歷。
- 不改寫驗證量表題幹。
- 第一版不做客語與原住民語（列為 stretch）。

---

## 2. 使用者與情境

| 情境 | 使用者 | 語言 | 通道 | 前提 |
|---|---|---|---|---|
| S1 診間平板（主路徑） | 報到後候診病人，常為 60–85 歲心衰／高血壓病人 | 台語為主、華語次之、混講常見 | 平板語音＋大字按鈕 | medcloud 啟動，雲端資料已在 |
| S2 家屬代填 | 子女陪同 | 華語文字或語音 | 同上 | 答案標記「代答」 |
| S3 居家（Phase 1） | 預約後病人 | 華語文字為主 | 手機瀏覽器 | 預約 token；無雲端資料 |
| S4 護理協助 | 護理師幫聽不清的病人操作 | — | 同 S1 | 標記「協助填答」 |

設計原則：**S1 決定一切**。老人聽得懂、講得出、看得到，其他情境自然成立。

---

## 3. 語言策略

### 3.1 為什麼台語必須是語音
多數台語使用者**讀不了台文**（漢字／羅馬字），所以台語支援＝語音進、語音出。畫面文字一律華語大字，語音可切台語。

### 3.2 內部樞紐語言
```
台語語音 ──ASR──► 華語文字（或台語漢字）──► LLM（華語推理）──► 華語文字 ──TTS──► 台語語音
華語語音 ──ASR──► 華語文字 ─────────────────► LLM ─────────────► 華語文字 ──TTS──► 華語語音
華語文字 ─────────────────────────────────► LLM ─────────────► 華語文字（畫面）
```
- LLM 只處理華語文字，不需要「台語 LLM」。
- 題幹的台語**口語版**由人工預先寫好（不是即時翻譯），確保量表施測的一致性。
- 回讀確認用病人使用的語言。

### 3.3 混碼
Breeze-ASR-26 明確支援台語夾華語夾英語，這是台灣診間的常態（「我有食 aspirin」）。藥名、數字、日期是混碼最密集的地方，見 §6.6。

---

## 4. 系統架構

```
┌─ 通道層 ─────────────────────────────────────────────────────────┐
│ 平板 PWA（民眾模式）：麥克風、VAD、大字題幹、按鈕選項、TTS 播放      │
└──────────────┬───────────────────────────────────────────────────┘
               │ 音訊串流 / 文字
┌─ 語音層（雲端為主，可替換）──────────────────────────────────────┐
│ 台語：Yating 雲端 ASR／TTS（台灣機房）或自架 Breeze-ASR-26＋BreezyVoice │
│ 華語：Gemini Live／GPT-Realtime 語音對語音（含 function calling）      │
│      或 ASR＋LLM＋TTS 管線                                          │
│ 安全：自建關鍵字規則（急性訊號）；語音層任一供應商可換               │
└──────────────┬───────────────────────────────────────────────────┘
               │ 華語文字
┌─ 對話引擎（schema-guided dialogue）──────────────────────────────┐
│ 狀態機：一題一狀態；LLM 只在「問法包裝」「答案對應」「釐清」三處介入   │
│ LLM：Claude／Gemini 走現有 proxy（PII scrub 政策）；tvghbrain 備援   │
│ 輸出：QuestionnaireResponse item（含信心、原句、是否代答）           │
└──────────────┬───────────────────────────────────────────────────┘
               │
┌─ 出題與資料層（既有）────────────────────────────────────────────┐
│ Questionnaire registry（通用核心、KCCQ、STOP-BANG…）＋ SDC 預填      │
│ 組題器：科別 × 初/複診 × pack needs-data                            │
│ 抽取：QuestionnaireResponse → AllergyIntolerance / Observation      │
│ 儲存：院內網 store 或 Firestore（需求文件 §5 選項 A／B，待 R1）        │
└──────────────┬───────────────────────────────────────────────────┘
               │
┌─ 醫師端（既有）──────────────────────────────────────────────────┐
│ 科別摘要第 1 層：今日議程、量表分數、新增過敏／懷孕、病人說「不正確」  │
│ 附：逐字稿與每題原句，可展開稽核                                    │
└──────────────────────────────────────────────────────────────────┘
```

新寫的只有**語音層接線**與**對話引擎**。其餘沿用需求文件已定的架構。

---

## 5. 技術選型（v0.1：雲端優先）

### 5.1 關鍵事實：台語與華語走不同路
2026-09 查證結果：Google Chirp 3 只列 cmn-Hant-TW，Gemini Live 的 70 種語言與 GPT-Realtime-2 都**沒有列台語**，Azure 只有 zh-CN 方言音色的 nan-CN 閩南語預覽版。所以：

- **華語**：可用單一語音對語音模型（Gemini Live、GPT-Realtime），延遲低、不用自組管線。
- **台語**：雲端只有 **Yating**（台灣人工智慧實驗室，台灣機房，支援台語九聲調與混碼）；否則自架 Breeze-ASR-26＋BreezyVoice 26 在雲端 GPU 或院內。

### 5.2 選型表

| 元件 | 首選（雲端） | 備選 | 備註 |
|---|---|---|---|
| 台語 ASR | **Yating 即時 ASR API** | 自架 Breeze-ASR-26（HF 開源，雲端 GPU 或院內） | Yating 商用成熟、資料留台灣；Breeze 免費但要自己維運。**M0 兩者都測 WER** |
| 台語 TTS | **Yating TTS v2** | 自架 BreezyVoice 26 | 同上 |
| 華語語音對話 | **Gemini Live（3.1 Flash Live）** | GPT-Realtime-2 | 兩者皆支援 function calling，可直接跑 §6 的 answer_item 契約；Gemini 單價低很多 |
| 華語 ASR／TTS（管線式備援） | Google Chirp 3（cmn-Hant-TW）＋ Google TTS | Azure Speech zh-TW、Yating | 若語音對語音模型的中斷控制不好用，退回管線式 |
| LLM（答案對應、釐清、口語病史摘要） | **Claude 或 Gemini，走現有 Firebase proxy** | 院內 tvghbrain | 現有 proxy 已有 PII scrub 與 App Check；對話引擎的 tool calling 用同一套 |
| 安全過濾 | 自建確定性關鍵字規則 | Breeze Guard 26 | 急性升級不經 LLM |
| VAD／串流 | 華語：交給 Live API；台語：瀏覽器 VAD＋分段上傳 Yating | 全雙工 | 台語路徑第一版用「說完停 1.5 秒」 |
| 對話框架 | 自建狀態機＋tool calling | LangGraph | 不變 |
| 表單 renderer | LHC-Forms | — | 不變 |

### 5.3 兩條路徑的架構差異
```
華語：麥克風 ──WebRTC──► Gemini Live（聽＋想＋講，一個模型）──function call──► answer_item
台語：麥克風 ──分段──► Yating ASR ──文字──► Claude/Gemini（tool call）──文字──► Yating TTS ──► 喇叭
```
台語路徑多兩跳，延遲約多 1–2 秒；老人對話可接受，但回讀確認要設計成「等病人講完再播」，不做搶話。

### 5.4 雲端成本（M0 要實測，本文件不填數字）
每次對話成本 = 語音分鐘數 × ASR 單價 ＋ TTS 字元數 × 單價 ＋ LLM token。通用核心約 5 分鐘、10 題、每題兩回合；M0 跑 20 人後填入實際數字，並比對「自架 Breeze 的 GPU 月租」找出交叉點。

## 6. 對話引擎設計

### 6.1 核心原則：狀態機為骨，LLM 為肉
- 每題一個狀態，順序由組題器決定，LLM **不能**改順序、跳題、合題。
- LLM 只做三件事：
  1. **問法包裝**：把題幹用該語言的口語再講一次（量表題除外，量表用預寫口語版）。
  2. **答案對應**：把病人原句對應到 answerOption 或數值，附信心分數。
  3. **釐清**：信心低於門檻時，用選項回問（「你是講『有一點』還是『真嚴重』？」）。

### 6.2 每題的迴圈
```
播題 → 聽答 → ASR → 對應（LLM tool call: answer_item{linkId, value, confidence, quote}）
   ├─ confidence ≥ 0.85 → 回讀確認（「你講的是『有』，著無？」）→ 是 → 下一題
   ├─ 0.5–0.85 → 用選項回問一次 → 再對應
   └─ < 0.5 或連續兩次聽不懂 → 畫面出大字按鈕讓病人點 → 下一題
```
每題最多三回合，超過即退回按鈕。避免老人被困在對話裡。

### 6.3 回讀確認是硬規則
每一題都回讀，量表題尤其。這是對話版與表單版等效性的關鍵，也是稽核依據。

### 6.4 急性訊號升級
確定性規則，ASR 文字命中即觸發，不經 LLM：
- 心血管：胸痛、胸悶、喘不過氣、昏倒
- 精神：不想活、想不開
- 過敏：現在正在起疹、嘴唇腫
觸發 → 對話暫停 → 畫面與語音提示找護理師 → 護理站通知 → 記錄。

### 6.5 中斷與恢復
- 叫號中斷：保存進度，醫師端顯示「填到第 N 題」。
- 病人說「我不知道」「跳過」：記 `not-asked`／`unknown`，不猜。
- 家屬代答：一開始問「是本人還是家屬回答」，全程標記。

### 6.6 台語特有處理
| 問題 | 做法 |
|---|---|
| 數字（血壓、體重、年）台語讀法多樣 | ASR 後加數字正規化；回讀時用畫面大字顯示數字 |
| 藥名混碼（台語＋英文商品名） | 對應到雲端用藥清單做模糊比對，只回讀確認，不猜 |
| 「有影／無影」「會／袂」等否定句式 | 答案對應 prompt 附台語否定詞表；信心門檻對否定句提高 |
| 日期（舊曆、民國年） | 不問精確日期，問「最近一個月內有無」 |
| 方言差異（漳／泉、南北腔） | 靠 ASR 訓練集涵蓋；pilot 收集失敗案例 |

### 6.7 Prompt 契約（摘要）
- System：任務、允許動作（answer_item、clarify、skip、escalate）、禁止事項（不診斷、不建議、不改題）。
- 每題 context：linkId、題幹、answerOption、預填值（若有）、病人語言、是否代答。
- 輸出必須是 tool call，不接受自由文字。

---

## 7. 量表策略

| 量表 | 對話版可行性 | 動作 |
|---|---|---|
| 通用核心（過敏、抽菸、懷孕、他院就醫、今日議程） | **高**，自訂題無版權與等效問題 | Phase A 先做 |
| STOP-BANG | 高，4 題自答＋4 題預填 | Phase A |
| NYHA 自評 | 高 | Phase A |
| KCCQ-12 | **待授權**；電子遷移需最小改動 | Phase B：先取得 Outcomes Instruments 授權；確認是否有**台語語言驗證版**（很可能沒有，需做 linguistic validation：前譯、回譯、認知訪談） |
| PHQ-9／GAD-7（已在 calculator） | 高，且有 HopeBot 對話版證據 | Phase B |

台語版量表原則：題幹口語版**由人工寫、由臨床審**，存在 Questionnaire 的 item.text 翻譯擴充，不是 LLM 即時翻。

---

## 8. 資料、隱私、法規

| 項目 | 決定 |
|---|---|
| 音訊 | 預設**不保存**原始音訊；只留 ASR 文字。要留音訊做 WER 評估必須另取同意，且限 pilot |
| 逐字稿 | 與 QuestionnaireResponse 一起存院內網 store，保存期限與問卷相同 |
| 雲端語音（Yating／Gemini Live／OpenAI） | 可用，條件：供應商**零保留**或不用於訓練的合約條款、資料處理協議（DPA）、Yating 資料留台灣；Gemini／OpenAI 涉跨境傳輸，需個資法跨境評估與病人告知 |
| 雲端 LLM | 走現有 proxy 與 PII scrub 政策；對話文字含姓名時先脫敏再送 |
| 持久化政策 | 需求文件 §5 R1；雲端可用後 Firestore 選項 B 變得自然，但**供應商暫存**與**我們自己保存**是兩件事，都要明列 |
| MOHW 2026-05-29 指引 | 定位：**受限任務、無自主行動、答案由病人逐題確認、醫師覆核**；文件寫明不屬 AI Agent System 排除範圍的理由 |
| 醫材 | 不做診斷、不做分流，主張非醫材；但**急性升級**功能要說明是流程提醒而非臨床判斷 |
| IRB | 等效性研究需 IRB；北榮眼科數位分身已有路徑可沿用 |
| 同意 | 開始對話前語音＋畫面告知：AI 對話、資料用途、可隨時改用按鈕 |

---

## 9. 評估與驗證

### 9.1 技術指標
| 指標 | 方法 | 門檻（暫定） |
|---|---|---|
| ASR WER | 50 位老人台語、診間錄音、醫療詞彙集 | 台語 < 20%、華語 < 10% |
| 答案對應正確率 | 人工標註 300 題 | > 95%（回讀後） |
| 每題平均回合 | log | ≤ 1.5 |
| 退回按鈕率 | log | < 15% |
| 急性升級誤觸率 | log＋人工 | < 5% |

### 9.2 臨床與可用性
| 指標 | 方法 | 門檻 |
|---|---|---|
| 完成率 | 開始→完成 | ≥ 表單版 |
| 完成時間 | 中位數 | 通用核心 ≤ 5 分鐘 |
| 自填 vs 對話 ICC | within-subject，先表單後對話（或交叉） | ICC ≥ 0.85 |
| 老人可用性 | SUS 或 3 題口頭問卷 | SUS ≥ 70 |
| 醫師閱讀率 | 第 1 層問卷區塊展開比例 | 主要指標，目標 > 70% |
| 病安新發現 | 問卷新增雲端沒有的過敏／懷孕 | 記錄 |

### 9.3 Guard 紀律
每條確定性防線（急性關鍵字、否定句門檻、數字正規化）都要有計數器；pilot 後沒觸發的刪掉。

---

## 10. 分階段與里程碑

| 階段 | 內容 | 產出 | 依賴 |
|---|---|---|---|
| **M0 技術驗證（2–3 週）** | 接 Yating ASR／TTS 與 Gemini Live；20 位老人台語錄音同時測 Yating 與自架 Breeze 的 WER；Claude／Gemini tool calling 對應 20 題；記錄每次對話成本 | 技術可行性報告、WER、每次對話成本 | 雲端帳號與 DPA；不需 GPU |
| **M1 對話引擎（6 週）** | 狀態機、每題迴圈、回讀、退回按鈕、急性規則；通用核心華語文字版跑通 | 民眾模式內可用的 demo | Questionnaire registry（需求文件） |
| **M2 台語語音版（4 週）** | 接 Yating；台語口語題幹人工撰寫與臨床審；混碼與數字處理；華語版改接 Gemini Live 比較體驗 | 台語可用 demo | M0、M1 |
| **M3 診間 pilot（8 週）** | 心臟科 S1 情境，通用核心＋STOP-BANG＋NYHA；院內網 store；醫師端第 1 層 | 完成率、閱讀率、ICC 初步 | 需求文件 R1 儲存決策、IRB |
| **M4 量表擴充** | KCCQ 授權與台語驗證；PHQ-9；居家華語文字版 | 等效性論文投稿 | 授權、預約 token |

人力：對話引擎 1 人、語音接線 1 人、台語題幹與臨床審 1 位護理師＋1 位台語母語者、心臟科 PI。

---

## 11. 風險

| 風險 | 影響 | 對策 |
|---|---|---|
| 老人台語 ASR 在真實診間 WER 過高 | 對話不可用 | M0 先量；不達標就退回「台語 TTS 念題＋按鈕作答」，仍比純文字表單好 |
| 老人不習慣對機器講話 | 完成率低 | 護理協助模式；家屬代答；每題可按鈕 |
| KCCQ 沒有台語驗證版 | Phase B 延後 | 先做通用核心與 STOP-BANG；同步啟動語言驗證 |
| 候診時間不夠填完 | 部分完成 | 進度保存；醫師端顯示已填題 |
| LLM 對應錯誤未被回讀抓到 | 資料錯 | 量表題信心門檻拉高；ICC 研究量化 |
| 與華碩「診前提問」重工 | 政治 | 先問清楚華碩做什麼；醫析定位為出題與閱讀端 |
| 台語只有單一商用供應商（Yating） | 鎖定、漲價、停服 | 自架 Breeze 當熱備；語音層介面抽象化，M0 就兩者並測 |
| 大型雲端語音模型永遠不支援台語 | 華語與台語體驗落差 | 接受兩條路徑並存；台語路徑的延遲設計成可接受 |
| 雲端跨境傳輸法遵 | pilot 卡關 | 台語走 Yating（留台灣）；華語 Live API 若跨境有疑慮，退回 Yating 華語＋Claude proxy |
| 雲端資料未過卡就填 | 初診病史確認做不了 | S1 為主路徑，居家只填通用核心 |

---

## 12. 待決事項

| # | 問題 | 決策者 |
|---|---|---|
| D1 | 雲端帳號與 DPA：Yating 企業方案、Google／Anthropic 資料處理條款，誰簽、費用誰出 | 郭＋院方 |
| D1b | 華語路徑用 Gemini Live 語音對語音，或統一走 Yating＋Claude 管線以簡化法遵 | 郭 |
| D2 | 音訊是否保存供評估、保存多久 | 郭＋IRB |
| D3 | 台語題幹誰寫誰審 | 鄭（心臟科）＋護理 |
| D4 | 第一個 pilot 診：心衰特別門診還是一般心臟科 | 鄭 |
| D5 | 是否找陽明交大（眼科數位分身團隊、台語語音合成）合作 | 郭＋鄭 |
| D6 | 「急性升級」通知護理站的實際管道（平板響鈴？LINE？） | 鄭＋護理長 |
| D7 | 客語是否列入 M4 | 鄭 |

---

## 13. 與現有程式碼的接點

| 現有 | 用法 |
|---|---|
| 民眾模式（audience = patient） | 對話介面掛在這裡；medcloud 啟動時帶病人脈絡 |
| medical-calculator（PHQ-9、GAD-7、Epworth、scoring） | 量表計分沿用；新增 STOP-BANG、KCCQ、NYHA |
| CDSS pack needs-data | 組題器輸入 |
| AI hook factory、ModelDefinition contextLimit | 對話引擎的 LLM 呼叫走同一套；tool calling 契約新增 |
| Firebase proxy Functions（Gemini／GPT、PII scrub、App Check、CORS 先部署再讓 app 送） | LLM 與雲端語音的金鑰都放 proxy；新 header 先改 CORS |
| 地端 tvghbrain endpoint | 備援 LLM |
| 科別摘要第 1 層（規劃中） | 答案顯示 |
| 持久化政策（2026-09-04） | 需修訂：問卷＋逐字稿例外 |
| Guard 紀律（計數器、沒觸發就刪） | §9.3 |

---

## 14. 來源

- Breeze-ASR-26／BreezyVoice 26／Breeze Guard 26：https://www.koc.com.tw/archives/639154 ；https://huggingface.co/MediaTek-Research/Breeze-ASR-26
- Breeze-ASR-25：https://www.mediatek.com/zh-tw/press-room/mediatek-research-unveils-mr-breeze-asr-25-an-open-source-ai-model-for-taiwanese-speech
- Yating ASR／TTS：https://developer.yating.tw/zh-TW/doc/asr-ASR%20%E5%8D%B3%E6%99%82%E8%AA%9E%E9%9F%B3%E8%BD%89%E6%96%87%E5%AD%97 ；https://www.yating.tw/zh/index-zh/
- TAIDE 台語客語：https://news.pts.org.tw/article/693462 ；https://www.nstc.gov.tw/folksonomy/detail/d5a157bf-5aca-4ecf-83ce-012f351fd341?l=CH
- 陽明交大「鬥陣來開講」台語客語語音對話：https://crossing.cw.com.tw/article/17607
- 北榮眼科數位分身（法規與 IRB 先例）：https://udn.com/news/story/6837/9633319
- HopeBot 對話式 PHQ-9 ICC 0.91：https://journals.plos.org/digitalhealth/article?id=10.1371%2Fjournal.pdig.0001446
- Mayo 心血管門診對話 intake pilot：https://www.sciencedirect.com/science/article/pii/S294976122600057X
- KCCQ 授權：https://www.cvoutcomes.org/kccq-plan-select-page/
- LHC-Forms：https://lhncbc.github.io/lforms/
- Google Chirp 3 語言清單（無台語）：https://docs.cloud.google.com/speech-to-text/docs/models/chirp-3
- Gemini Live vs GPT-Realtime-2（70 語、價格）：https://apiscout.dev/guides/realtime-voice-ai-apis-comparison-2026 ；https://www.forasoft.com/learn/ai-for-video-engineering/articles-ai/speech-to-speech-realtime-api-gemini-live-seamless
- Azure nan-CN 閩南語預覽：https://techcommunity.microsoft.com/t5/ai-azure-ai-services-blog/introducing-more-multilingual-ai-voices-optimized-for/ba-p/4012832
- Yating 開發者文件與價格：https://developer.yating.tw/zh-TW/doc/tts-TTS%20%E8%AA%9E%E9%9F%B3%E5%90%88%E6%88%90v2 ；https://developer.yating.tw/en-US/pricing

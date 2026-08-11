# 健康存摺 AKI 警示與腎臟科交接閉環

日期：2026-07-30
狀態：POC 已實作；尚未經臨床驗證，不可直接用於照護決策或自動送出會診

## 結論先行

Park 等人的研究重點不是單獨顯示「AKI」三個字，而是把偵測結果接到一個低摩擦的臨床行動：醫師開啟病歷時看到 AKI 分期，少量點擊即可產生腎臟科會診。這個設計改變了追蹤與會診行為，並與較少重度 AKI、較快腎功能恢復相關。

本系統採用相同的閉環概念，但資料源是健康存摺，不是院內即時 EHR。因此 POC 的定位是：

1. 從病人授權的 FHIR Observation 找出可治理的血清 creatinine。
2. 依 KDIGO serum-creatinine 時間窗產生「AKI 訊號」，不是自動診斷。
3. 明確區分近期訊號與歷史事件。
4. 檢查訊號後有沒有 follow-up creatinine，避免事件被看見後沒有追蹤。
5. 整理成可複製的腎臟科交接草稿，由醫療人員核對後貼入院內流程。
6. 不自行送出會診、不寫回病歷、不開立檢驗或停藥。

## 原論文研究摘要

論文：Park S, Baek SH, Ahn S, et al. *Impact of Electronic Acute Kidney Injury (AKI) Alerts With Automated Nephrologist Consultation on Detection and Severity of AKI: A Quality Improvement Study.* American Journal of Kidney Diseases. 2018;71(1):9–19. DOI: [10.1053/j.ajkd.2017.06.008](https://doi.org/10.1053/j.ajkd.2017.06.008)

### 研究設計

- 韓國一所超過 1,000 床的三級教學醫院。
- 前後比較的品質改善研究，不是隨機試驗。
- 一般照護組 1,884 位 AKI 病人，警示組 1,309 位 AKI 病人。
- 2014-06-01 啟用 AKI 警示。
- 系統每晚批次掃描 AKI；隔天醫師開啟 EMR 時跳出 AKI 嚴重度與是否送出腎臟科會診的詢問。
- 點選同意後，系統自動產生會診內容；另可選擇補充內容後會診、稍後會診或不會診。
- 「漏掉的 AKI」定義為事件後沒有 follow-up creatinine。

原文的流程細節可見[文章全文頁面](https://www.researchgate.net/publication/318703766_Impact_of_Electronic_Acute_Kidney_Injury_AKI_Alerts_With_Automated_Nephrologist_Consultation_on_Detection_and_Severity_of_AKI_A_Quality_Improvement_Study)；摘要與主要結果可由[出版社頁面](https://www.sciencedirect.com/science/article/pii/S0272638617307886)核對。

### 主要結果

導入警示後：

- 漏掉 AKI 的 adjusted OR 0.40（95% CI 0.30–0.52）。
- 早期腎臟科會診的 adjusted OR 6.13（95% CI 4.80–7.82）。
- 重度 AKI 的 adjusted OR 0.75（95% CI 0.64–0.89）。
- AKI 恢復的 adjusted HR 1.70（95% CI 1.53–1.88）。
- 死亡率沒有顯著改善：adjusted HR 1.07（95% CI 0.68–1.68）。

### 如何解讀

這些結果支持「警示要接到明確行動」的設計，但不能把前後比較直接解讀成因果：

- 沒有隨機分派，介入前後可能還有未量測的照護差異。
- 單一大型教學醫院的會診資源與文化，不一定能外推到其他場域。
- 系統同時改變偵測、醫師行為與專科介入，無法拆出哪一部分造成效果。
- 死亡率沒有改善。

後續一項 6,030 人、多院區隨機試驗發現，單純 EHR pop-up 加 order set 並未降低 14 日 AKI 惡化、透析或死亡的複合結果，而且兩所非教學醫院出現值得警戒的異質性結果。這表示 AKI 警示不能在未驗證工作流程與場域安全性的情況下直接全面上線。[BMJ 2021 multicenter RCT](https://pmc.ncbi.nlm.nih.gov/articles/PMC8034420/)

2024 年系統性回顧則顯示，e-alert 較一致的效益是在流程面，例如增加 AKI 紀錄、腎臟科會診及降低警示後 NSAID 暴露；對死亡、住院天數與成本沒有穩定效益。[JAMA Network Open 2024 systematic review](https://jamanetwork.com/journals/jamanetworkopen/fullarticle/2822866)

因此本系統採取的產品原則是：**不要只做醒目的警示；要做可追蹤、可交接、有責任歸屬，而且可以被稽核的照護閉環。**

## 健康存摺資料的可用性與限制

健保署說明，健康存摺的門住診、用藥與檢驗等資料通常提供登入日起近三年內容，健保卡上傳資料每日更新；第三方 App 必須在民眾完成身分確認、選擇範圍並同意後，才能透過 SDK 取得資料。健康存摺也明確說明這些資料不是醫師法與醫療法所定義的病歷。[健保署健康存摺使用指南](https://myhealthbank.nhi.gov.tw/IHKE3000/IHKE3115S01)

這代表：

- 優點：可跨院、可看個人歷史趨勢、由病人授權，適合找出歷史事件與跨院追蹤缺口。
- 限制：不是床邊即時資料，資料可能延遲、缺漏或只有日期；院內給藥、尿量、生命徵象、透析與顯影劑資料可能不完整。
- 安全結論：健康存摺可做 AKI screening／handoff support，不能單獨承擔即時 AKI 診斷、排除或緊急處置。

## POC 已實作的規則

### 可接受輸入

- FHIR `Observation`
- `status` 為 `final`、`amended` 或 `corrected`
- 有有效 `id` 與 `effectiveDateTime`
- LOINC `2160-0`：Creatinine [Mass/volume] in Serum or Plasma
- UCUM `mg/dL`、`umol/L`／`µmol/L` 或 `mmol/L`
- 內部統一換算成 mg/dL；`1 mg/dL = 88.42 µmol/L`

不接受只靠文字名稱推斷的 creatinine，也不把尿液 creatinine `2161-8` 當成血清值。

### KDIGO creatinine 訊號

POC 使用 2012 KDIGO 已正式發布的 serum-creatinine 規則：

- 48 小時內上升 ≥0.3 mg/dL；或
- 7 日內升至基準值 ≥1.5 倍。

分期：

- 第 1 期：1.5–1.9 倍，或 48 小時內上升 ≥0.3 mg/dL。
- 第 2 期：2.0–2.9 倍。
- 第 3 期：≥3 倍，或已符合 AKI 且目前 creatinine ≥4.0 mg/dL。

正式依據：[KDIGO 2012 AKI Guideline](https://kdigo.org/wp-content/uploads/2016/10/KDIGO-2012-AKI-Guideline-English.pdf)，Chapter 2.1，Tables 1–2。

截至本文件日期，KDIGO 2026 AKI/AKD 更新仍是 public-review draft，尚未取代 2012 正式版本，因此 POC 不把草案規則當成正式臨床規則。[KDIGO AKI/AKD guideline page](https://kdigo.org/guidelines/acute-kidney-injury/)

### 基準值選擇

對每一筆目前值：

- 48 小時絕對變化使用視窗內最低的先前值。
- 7 日相對變化使用視窗內最低的先前值。
- 同一時間戳的兩筆資料不強行假設先後順序。
- 超過 7 日的歷史值不拿來觸發 KDIGO 急性時間窗。

這是一個刻意保守、可重現的 POC 方法。正式上線前，基準值策略必須由腎臟科、檢驗醫學與資料團隊共同驗證，特別是 CKD、轉院與入院前已發生 AKI 的情境。

### 目前的閉環行為

| 狀態 | 系統行為 |
|---|---|
| 無可治理的血清 creatinine | AKI 路徑不啟動，提醒缺資料不代表陰性 |
| 只有一筆 | 顯示無法比較，要求查找 48 小時／7 日內結果 |
| 至少兩筆、未觸發 | 顯示「現有資料未觸發」，明確說明不能排除 AKI |
| 7 日內觸發 | 高優先 AKI 訊號、分期、臨床確認、追蹤與用藥核對 |
| 超過 7 日的歷史觸發 | 標示歷史事件，不偽裝成目前緊急警示 |
| 訊號後無 creatinine | 顯示追蹤缺口，要求指定結果回看責任 |
| 有 AKI 訊號 | 產生可複製的腎臟科交接草稿 |

交接草稿包含：

- 健康存摺資料來源與「非完整法定病歷」聲明。
- 基準值、目前值、日期、48 小時變化、7 日比值與分期。
- 可見 eGFR、CKD 背景與 NSAID／用藥線索。
- 訊號後是否有 follow-up creatinine。
- 明列未自動取得的尿量、體重、即時生命徵象、體液狀態、院內給藥／顯影劑、透析與病因。
- 給腎臟科的明確問題。

## 尚未實作或不應由健康存摺單獨完成

- 尿量型 KDIGO AKI 偵測與分期。
- 透析／腎臟替代治療觸發第 3 期。
- 自動判斷 pre-renal、intrinsic 或 post-renal 病因。
- 自動判定「已恢復」。目前只呈現後續數值與相對基準值，不自動宣告 recovery。
- 自動停用 ACEI／ARB、利尿劑、SGLT2 inhibitor、NSAID 或其他藥物。
- 自動送出腎臟科會診、建立醫囑或寫回病歷。
- 以健康存摺資料取代急診、住院、檢驗或藥事系統。

## 建議的臨床驗證與上線順序

### Phase 0：規則與資料品質驗證

- 抽樣至少 200 個包含 creatinine 時序的個案。
- 由兩位臨床審查者盲審 AKI、分期、基準值與事件時間。
- 報告 sensitivity、specificity、PPV、NPV，以及基準值選擇錯誤。
- 個別分析 CKD、跨院、同日多筆、單位異常、缺時間與校正報告。

進入下一階段的建議門檻：

- 第 2–3 期 AKI sensitivity ≥95%。
- 第 2–3 期 PPV ≥90%。
- LOINC／單位錯配造成的嚴重誤警示為 0。

門檻需由院內治理委員會正式確認，以上數字是 POC 建議，不是外部標準。

### Phase 1：silent mode

- 系統背景運算但不向臨床人員顯示。
- 比對院內真實時間戳、尿量、透析與腎臟科判讀。
- 量測每 100 次匯入的警示數、重複警示數與資料延遲。

### Phase 2：小規模可見 pilot

- 先在明確的臨床場景與小團隊使用。
- 預設一次事件只顯示一個主警示，後續改用狀態更新，避免 alert fatigue。
- 第 1 期提供確認與追蹤；第 2–3 期或有高風險併發症時提高優先度。
- 會診草稿仍需人工核對與送出。

### Phase 3：品質改善評估

至少追蹤：

- AKI 訊號後有 follow-up creatinine 的比例與時間。
- 早期腎臟科評估比例與時間。
- 第 2–3 期進展比例。
- 藥物核對完成率與腎毒性暴露處置。
- 腎功能恢復（需先由臨床團隊固定定義）。
- 透析、住院天數、30 日再住院與死亡率。
- 每位臨床人員的警示負荷、忽略率與覆寫原因。
- 不必要檢驗、轉診與急診使用等 balancing measures。

評估設計優先考慮 interrupted time series、stepped-wedge 或 cluster-randomized rollout；避免只做單純前後平均值比較。

## 檔案位置

- AKI 演算法：private package `@voho0000/personalized-care`
- FHIR／健康存摺轉接：`features/clinical-decision-support/adapters/fhir-cdss-profile.ts`
- AKI 警示與閉環內容：private package `@voho0000/personalized-care`
- 會診交接 UI：`features/clinical-decision-support/renderers/ClinicalHandoffCard.tsx`
- 邊界測試：`__tests__/features/clinical-decision-support/aki-risk.test.ts`
- 整合測試：`__tests__/features/clinical-decision-support/aki-guidance.test.ts`

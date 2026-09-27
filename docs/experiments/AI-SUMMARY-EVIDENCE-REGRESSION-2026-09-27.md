# 內建 AI 摘要：引文修正的真實資料回歸比較

## 結論

本 PR 的引文核對、提示、來源導覽及重試保留修正，通過七位已授權開發病人的 **21 份真實醫院模型回應**重放比較。與 master 原版相比，21/21 份的臨床文字、用藥名稱與劑量、問題清單、檢查趨勢、時間軸及來源索引完全一致；另測 **105 種卡片重試情境**，臨床內容及引文均保留。

這證明本 PR 沒有改壞這批既有摘要內容；不代表模型原有的幻覺、語意錯引已消失。曾實驗的片段編號預處理仍有語意錯引，**不在本 PR 內**。本次也不改 prompt、模型、token 上限或重試策略，不增加任何模型請求。

## 資料與方法

- 來源為本機 `medcloud2-FHIR-bridge/data/patient1` 至 `patient7` 的授權原始 capture，透過橋接轉換器產生 FHIR；原始資料、FHIR、模型回應與逐筆比較結果不納入 Git。
- 再次由原始 capture 轉換確認：病人 1–6 的原始 Bundle 完全相同；病人 7 僅一筆 MedicationRequest 的衍生 status 由 active 變成 completed。這筆處方不在本次選入 clinicalData 或來源目錄中，故未改變摘要輸入。
- 使用既有實驗中真實 Tvghbrain 3.5 回應：每人三份，取原始提示組；病人 5、7 使用已統一提示與來源選取時間的校正版。
- 將**同一份原始模型回應**，交給 master 原版及本 PR 的相同卡片 parser、merge、strict grounding 與 finalizer。排除 `documentEvidence` 後，逐份以完整 JSON 雜湊檢查所有結果欄位相等；來源索引另行檢查。
- 這是本地處理修正的配對回歸測試，不是又做 21 次模型生成。不將模型重跑的隨機差異當成程式品質差異。
- 每份再重放五種手動卡片重試組合：摘要重點、用藥、問題清單、時間軸、檢查趨勢。引文狀態在第二次可由「空白已還原」轉為「完全吻合」，但來源鍵及原句必須保持一致。
- 同時比較七位的原版／新版提示建構結果，完全相同；此 PR 沒有修改生成 hook 或安全提醒 producer。

## 結果

| 檢查 | 結果 |
| --- | ---: |
| 七人、每人三份，臨床欄位全部相同 | 21/21 |
| 來源索引完全相同 | 21/21 |
| 卡片重試保留內容及引文 | 105/105 |
| 原版重建重試 draft 後保留引文 | 0/73 |
| 修正版重建重試 draft 後保留引文 | 73/73 |
| 原本已逐字吻合的引文 metadata | 28 |
| 僅空白差異，回填連續原文 | 5 |
| 原文找不到的引文 metadata，維持待核對 | 40 |
| 實際引用文件的敘述 | 25 |
| 文件缺引句／不吻合而顯示提醒的敘述 | 17 |

73 筆為模型填入的所有類型引文 metadata，包含它填在檢驗、門診等來源上的欄位；25／17 則限於 UI 實際引用 Composition 或 DocumentReference 的敘述，兩者分母不同。未用模糊比對更改數字、單位、否定或拼接段落；原本存在的內容問題保留提醒，不能算成「已修正醫療事實」。

## UI 與工程驗證

- 保留內容及可點開原文的來源連結；缺句、不吻合及舊資料未核對各有明確提示。逐字吻合也註明仍需確認是否支持該敘述。
- 摘要重點卡片現在把該句引文帶入來源導覽；時間軸上的文件引用也會提示待核對。
- 98 項相關單元測試通過，另有上述真實資料 opt-in replay 測試；修改檔案 lint 與完整 TypeScript 檢查通過。
- 相同元件修改已於瀏覽器 320、390、430、768、1024、1440 px 以合成資料檢查：提醒可閱讀、無水平溢出、原文可點開。真實病歷畫面不放入 PR。
- 獨立 worktree 正式建置通過。使用共享 node_modules，暫時將 Turbopack root 指向共同上層；這是本機工作目錄設定，完成後已恢復，不提交設定變更。

## 重現

先把比較用基準 commit 的 `src/core/use-cases/medical-summary/generate-medical-summary.use-case.ts` 匯出至忽略的本機 `.ts` 檔。設定 `MEDCLOUD_SUMMARY_BASELINE_PATH` 指向該檔，`MEDCLOUD_SUMMARY_REPLAY_DIR` 指向本機授權結果目錄，再執行：

```text
node node_modules/jest/bin/jest.js --runInBand --runTestsByPath __tests__/experiments/medical-summary-evidence-replay.test.ts
```

未設定這兩個環境變數時會跳過，不會讀病歷或呼叫模型。所需結果標籤為 `summary-adaptive-cohort-2026-09-27`（病人 1、2、3、4、6）與 `summary-adaptive-clock-fixed-2026-09-27`（病人 5、7），皆取 `baseline` 的 run1–3 及對應 input.json。

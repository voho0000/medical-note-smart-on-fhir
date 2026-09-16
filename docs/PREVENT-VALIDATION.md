# PREVENT-ASCVD 基礎模型與 ACC/AHA 2026

本地開發版，2026-09-16。健保給付卡仍為首要判讀；其下獨立顯示 PREVENT 與 ACC/AHA 建議。風險由 host 的唯一公式計算，治療規則位於 personalized-care 的 clinical-modules/prevent-lipid.ts。

## 來源與可追溯性

- 原始研究：Khan et al. Circulation 2024;149:430–449，https://pmc.ncbi.nlm.nih.gov/articles/PMC10910659/ ，doi:10.1161/CIRCULATIONAHA.123.067626。
- 性別、10／30 年分開的 logistic base ASCVD equation，含非線性轉換與交互作用；不是把 linear predictor 當成百分比。胆固醇 mg/dL 換算 mmol/L 使用 38.67。
- 係數轉錄時交叉參考 pyprevent 公開 `_base.py`（https://github.com/kingrc15/pyprevent/blob/main/prevent/_base.py），以本系統 dot-product 自行實作。原論文補充 XLSX 連結可找到，但本次下載被網站驗證頁取代，**未完成逐格原始 XLSX 核對**；不可宣稱完成所有係數原檔稽核。
- 論文列有 correction doi:10.1161/CIR.0000000000001230；本次出版商回覆 403，尚未讀到更正全文。現行官方計算器輸出用於下列独立核對。
- 官方網站：https://professional.heart.org/en/guidelines-and-statements/prevent-calculator 。僅輸入合成案例，未傳送病人資料。
- 治療規則直接對照 2026 ACC/AHA 指引 §4.2.3.7，doi:10.1161/CIR.0000000000001423（本地正式 PDF 第 39–40 頁）。

## 官方網站比較（2026-09-16）

共用 age 50、TC 240 mg/dL、HDL 55 mg/dL、SBP 160 mmHg、BMI 35，降壓藥 yes；選擇 ASCVD endpoint，UACR/HbA1c/ZIP 均不加入。

| 性別 | DM／smoking／statin | eGFR | 官方 10 年 | 官方 30 年 |
|---|---|---:|---:|---:|
| 女 | 全 no | 90 | 3.6% | 19.9% |
| 男 | 全 no | 90 | 4.9% | 23.6% |
| 女 | 全 yes | 45 | 25.0% | 52.3% |
| 男 | 全 yes | 45 | 23.7% | 48.6% |

另核對兩個分段案例：age 35、TC 150、HDL 90、SBP 100、eGFR 120、BMI 35，DM/smoking/statin/BP-treatment 全 no。女性 10／30 年 0.1%／0.6%；男性 0.2%／1.1%。均與官方顯示一致。

自動測試採官方顯示精度（小數一位）比較；相符不代表已完成完整模型臨床驗證或台灣校準。分層使用原始浮點數，不使用顯示四捨五入後數值。

## 邊界與範圍

30–79 歲提供 10 年、30–59 歲另提供 30 年風險。未知資料不當作否、零或正常值；超界不截斷到邊界。已知 CVD、亞臨床動脈粥樣硬化／LVEF<40%、遺傳性 CVD、ESKD、預期壽命不足一年停止本流程；亞臨床排除採血脂指引的較嚴條件。BMI 作為官方介面適用範圍檢核，並非 ASCVD 係數項。

ACC/AHA 分層 <3、3–<5、5–<10、≥10%。限 LDL 70–189 的一般初級預防治療路徑；ASCVD、LDL≥190、DM、CKD、HIV 先提示疾病專屬路徑。提供 statin 強度、降幅、治療目標及共同決策提示，不產生處方或自動加藥。CAC 僅提示選擇性評估，未實作完整 CAC 數值治療樹。

此版不包含 PREVENT total CVD、HF、UACR、HbA1c、SDI 擴充模型或治療效益模擬。國健署風險模型與 PREVENT 不混用。歷史數值保留日期並提示重新確認；不同採檢日期需醫師核對現況。

醫師輸入只留在記憶體，切換病人清除；缺資料或不適用時清除既有 computed score，避免沿用上一個結果。自動帶入來源保留於風險 fact fragments；不寫回病歷、不修改給付分級。

## 本次工程驗證

App 6 個相關測試套件 224 項、rules 5 個套件 69 項均通過；TypeScript、相關 ESLint、production build、lockfile 檢查通過。使用示範病人確認 NHI 第一、PREVENT 其後、94 歲與 ASCVD 排除、年齡／TC／eGFR 自動帶值及日期提示。已在 320、390、430、768、1024、1440 寬度檢查；PREVENT 區塊無水平溢位。流程 PDF 維持 22 頁，更新頁已目視檢查。以上為本地開發驗證，尚未推送或部署。

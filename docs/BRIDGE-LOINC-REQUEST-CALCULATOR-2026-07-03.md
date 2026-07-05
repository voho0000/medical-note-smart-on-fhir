# NHI-FHIR-Bridge 需求單:醫療計算機所需 Observation LOINC

- **日期**：2026-07-03
- **提出者**：MediPrisma（SMART on FHIR app）端
- **背景**：app 端新增 MDCalc 式醫療計算機，輸入值自動帶入病人 FHIR `Observation`。以下分析物是計算機需要、但目前 bundle 尚未穩定提供（或需確認）的項目。
- **查證聲明**：本文件所有 LOINC 已於 2026-07-03 逐一對 loinc.org 查證 Long Common Name / Component / Property / System，非 LLM 記憶生成。

---

## Part A —（先釐清）尿液 vs 血清肌酸酐

我原本以為這是缺口，實際查了 app 端後發現 **bridge 應該已經有正確區分**，這裡是想跟你們確認、不是報 bug：

| 分析物 | 檢體 | LOINC | Long Common Name（已查證） |
|---|---|---|---|
| 血清肌酸酐 | Serum/Plasma | `2160-0` | Creatinine [Mass/volume] in Serum or Plasma |
| 尿液肌酸酐 | Urine | `2161-8` | Creatinine [Mass/volume] in Urine |

`2161-8` 已經出現在 app 的尿液分類清單中，代表 bridge 有送這個碼。想確認三件事：

1. **尿液肌酸酐是否「穩定」以 `2161-8` 輸出**，不會有時 fallback 成 `2160-0` 或無 LOINC（只給文字）？
2. **`Observation.specimen` 欄位是否有帶**（尿液→urine、血液→serum/plasma）？app 端希望能用 `specimen` 當作血/尿的權威判斷依據，而不是只靠 LOINC 猜。
3. 同一次就診若血清與尿液肌酸酐並存，兩筆 Observation 是否各自帶正確的 `specimen` + LOINC？

> app 端現況：若尿液肌酸酐只有文字、沒有 LOINC，會和血清肌酸酐一起收斂到同一個 canonical，導致 FENa 分不出血/尿。只要 bridge 穩定送 `2161-8` + `specimen`，app 就能正確區分，不需要你們額外處理。

---

## Part B —（請協助對應/確認）計算機需要的 LOINC 清單

以下依「解鎖的計算機數量」排優先序。每項若健保有對應醫令碼，煩請 bridge 確認能以該 LOINC 輸出；若無資料來源，也請回覆，app 端會把對應計算機標為「需手動輸入」。

### 🔴 優先一：動脈血氣 ABG
> 解鎖：A-a gradient、氧合指數（P/F ratio）、Winters formula 對照、完整 SOFA 呼吸項

| 分析物 | 檢體 | LOINC | Long Common Name（已查證） | 常用單位 |
|---|---|---|---|---|
| pH（動脈） | Arterial | `2744-1` | pH of Arterial blood | （無單位） |
| PaCO₂ | Arterial | `2019-8` | Carbon dioxide [Partial pressure] in Arterial blood | mmHg |
| PaO₂ | Arterial | `2703-7` | Oxygen [Partial pressure] in Arterial blood | mmHg |
| HCO₃⁻（動脈） | Arterial | `1960-4` | Bicarbonate [Moles/volume] in Arterial blood | mmol/L |
| Base excess | Arterial | `1925-7` | Base excess in Arterial blood by calculation | mmol/L |
| SaO₂ | Arterial | `2708-6` | Oxygen saturation in Arterial blood | % |
| FiO₂ | Inhaled gas | `3150-0` | Inhaled oxygen concentration | %（吸入氧濃度） |

> ⚠ 注意：`1155x` 系列（11558-4 / 11557-6 / 11556-8）是「一般 Blood」不是動脈血，請勿使用；ABG 請用上面的動脈專屬碼。HCO₃⁻ 動脈值（`1960-4`）與生化 TCO₂（`2028-9`，app 已支援）是不同檢體/方法，需分開。

### 🔴 優先二：尿液電解質 / 化學
> 解鎖：FENa、FEUrea、尿液陰離子間隙、TTKG

| 分析物 | 檢體 | LOINC | Long Common Name（已查證） | 常用單位 |
|---|---|---|---|---|
| 尿液鈉 | Urine | `2955-3` | Sodium [Moles/volume] in Urine | mmol/L |
| 尿液鉀 | Urine | `2828-2` | Potassium [Moles/volume] in Urine | mmol/L |
| 尿液氯 | Urine | `2078-4` | Chloride [Moles/volume] in Urine | mmol/L |
| 尿液尿素氮 | Urine | `3095-7` | Urea nitrogen [Mass/volume] in Urine | mg/dL |
| 尿液肌酸酐 | Urine | `2161-8` | Creatinine [Mass/volume] in Urine | mg/dL |
| 尿液滲透壓 | Urine | `2695-5` | Osmolality of Urine | mOsm/kg |

### 🟠 優先三：滲透壓與代謝
> 解鎖：osmolar gap、HOMA-IR

| 分析物 | 檢體 | LOINC | Long Common Name（已查證） | 常用單位 |
|---|---|---|---|---|
| 血清滲透壓 | Ser/Plas | `2692-2` | Osmolality of Serum or Plasma | mOsm/kg |
| 胰島素 | Ser/Plas | `20448-7` | Insulin [Units/volume] in Serum or Plasma | µIU/mL |
| 乙醇（血中酒精） | Blood | `5640-8` | Ethanol [Mass/volume] in Blood | mg/dL（osmolar gap 選填） |

---

## 備註

- **單位不必強求**：app 端有單位自動換算層（mEq/L↔mmol/L、µmol/L↔mg/dL、g/L↔g/dL、10⁹/L↔10³/µL 等），只要 `valueQuantity.unit` 有帶即可，數值會自動換算成計算機所需單位。
- **FiO₂ / 尿液滲透壓 / 血清滲透壓 / 胰島素 / 乙醇** 可能非常規健保檢驗項目；若健保沒有對應醫令碼、也沒有其他資料來源，請直接回覆「無」，app 端不會期待這幾項自動帶入。
- 最想優先確認的是 **Part A（尿/血 crea 的 specimen 與穩定輸出）** 與 **優先二（尿液電解質）**，這兩塊 CP 值最高，直接解鎖 FENa/FEUrea 這類臨床高頻計算機。

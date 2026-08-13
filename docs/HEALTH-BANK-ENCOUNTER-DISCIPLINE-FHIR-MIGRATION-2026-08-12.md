# 健康抓抓 FHIR Encounter 醫療類別標準化變更需求

- 文件日期：2026-08-12
- 適用元件：健康抓抓／健康存摺資料轉 FHIR R4 轉換器
- 影響資源：`Encounter`
- 接收端：Mediprisma 與其他 FHIR R4 consumers
- 優先級：高

## 1. 最終交換契約

健康抓抓輸出的 Encounter 應將「就醫情境」與「醫療類別」分開表達：

```text
門診／住院／急診       → Encounter.class
牙科／中醫／其他類別   → Encounter.serviceType
```

本次確定採用：

1. 門診的 `Encounter.class` 維持標準 `AMB`。
2. 牙科使用 HL7 Service Type `88`（General Dental）。
3. 中醫使用 TW Core 官方就醫科別 CodeSystem 的 `60`（中醫科），版本 `2024-05-27`。
4. 不再輸出自訂 `clinical-service-domain`。
5. `Encounter.serviceType` 不輸出 `display` 或 `text`；接收端以 `system + code` 判定並自行國際化。
6. 舊的 `Encounter.type#dental-outpatient` 與 `tcm-outpatient` 不再作為主要交換契約。
7. UI 保留兩顆標籤：第一顆顯示就醫情境，第二顆顯示醫療體系；不合併成單一標籤。

## 2. FHIR／TW Core 依據

### 2.1 `CodeableConcept.text` 與 `Coding.display` 可以省略

FHIR R4 的 `CodeableConcept` 中：

- `coding`：`0..*`
- `text`：`0..1`

`Coding.display` 也是可選欄位。FHIR 並未規定人類可讀文字只能使用英文；本契約省略 `display` 與 `text`，由接收端依 terminology code 自行國際化。

參考：[FHIR R4 CodeableConcept](https://hl7.org/fhir/R4/datatypes.html#CodeableConcept)

### 2.2 `Encounter.serviceType` 使用位置正確

FHIR R4 定義 `Encounter.serviceType` 為 `0..1 CodeableConcept`，語意是 Encounter 提供的特定服務類型。牙科與中醫放在此欄位符合 FHIR R4 資料模型。

參考：[FHIR R4 Encounter](https://hl7.org/fhir/R4/encounter.html)

### 2.3 牙科 code

HL7 Service Type CodeSystem 正式定義：

```text
system  http://terminology.hl7.org/CodeSystem/service-type
code    88
display General Dental
```

本契約可省略 display，但 system 與 code 必須完全一致。

參考：[HL7 Service Type CodeSystem](https://terminology.hl7.org/7.0.1/CodeSystem-service-type.html)

### 2.4 中醫 code

TW Core 官方 CodeSystem 正式定義：

```text
system  https://twcore.mohw.gov.tw/ig/twcore/CodeSystem/medical-consultation-department-nhi-tw
version 2024-05-27
code    60
display 中醫科
status  active
```

本契約使用相同的 system、version 與 code，並省略 display。

參考：

- [TW Core 臺灣健保署就醫科別 CodeSystem](https://twcore.mohw.gov.tw/ig/twcore/CodeSystem-medical-consultation-department-nhi-tw.html)
- [TW Core Encounter](https://twcore.mohw.gov.tw/ig/twcore/StructureDefinition-Encounter-twcore.html)

這取代先前提議的自訂：

```text
https://nhi-fhir-bridge.github.io/CodeSystem/clinical-service-domain
#traditional-chinese-medicine
```

新版不得再輸出或依賴該自訂 code pair。

## 3. 必要輸出格式

以下使用 RFC 2119 用語：MUST（必須）、SHOULD（建議）、MAY（可選）。

### 3.1 門診 class

所有門診 Encounter MUST 維持：

```json
"class": {
  "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
  "code": "AMB",
  "display": "ambulatory"
}
```

### 3.2 牙科 serviceType

一般牙科 Encounter MUST 輸出：

```json
"serviceType": {
  "coding": [{
    "system": "http://terminology.hl7.org/CodeSystem/service-type",
    "code": "88"
  }]
}
```

要求：

- MUST 使用完全相同的 system URL。
- MUST 使用字串 code `88`。
- MUST NOT 依賴 `display` 或 `text` 傳遞牙科語意。
- 接收端 MUST 以 system＋code 判定牙科。
- 若來源明確提供牙科次專科，可另案採用 HL7 Service Type `87–94` 中對應的細分類；不得自行推測。

### 3.3 中醫 serviceType

中醫 Encounter MUST 輸出：

```json
"serviceType": {
  "coding": [{
    "system": "https://twcore.mohw.gov.tw/ig/twcore/CodeSystem/medical-consultation-department-nhi-tw",
    "version": "2024-05-27",
    "code": "60"
  }]
}
```

要求：

- MUST 使用完全相同且大小寫一致的 system URL。
- MUST 使用 version `2024-05-27`。
- MUST 使用字串 code `60`。
- MUST NOT 輸出自訂 `clinical-service-domain#traditional-chinese-medicine`。
- MUST NOT 依賴 `display` 或 `text` 傳遞中醫語意。
- 接收端 MUST 只靠 system＋code 即可辨識為中醫。
- 不可將 HL7 `Acupuncture` 或 `Chinese Herbal Medicine` 當成所有中醫 Encounter 的通用替代碼；它們只代表特定服務。

### 3.4 西醫與未知類別

- 不符合上述牙科或中醫 code pair 的 Encounter，不得因 `class = AMB` 就判定為牙科或中醫。
- 若來源明確具有其他標準科別 coding，SHOULD 原樣放入 `serviceType`。
- 若來源沒有可靠醫療類別，不得依院所名稱、ICD 診斷、display 或自然語言猜測。

## 4. 完整 Encounter 範例

### 4.1 牙科門診

```json
{
  "resourceType": "Encounter",
  "id": "dental-example",
  "status": "finished",
  "class": {
    "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
    "code": "AMB",
    "display": "ambulatory"
  },
  "serviceType": {
    "coding": [{
      "system": "http://terminology.hl7.org/CodeSystem/service-type",
      "code": "88"
    }]
  },
  "period": {
    "start": "2024-09-26T00:00:00+08:00"
  }
}
```

接收端預期呈現：`門診`＋`牙醫`。

### 4.2 中醫門診

```json
{
  "resourceType": "Encounter",
  "id": "tcm-example",
  "status": "finished",
  "class": {
    "system": "http://terminology.hl7.org/CodeSystem/v3-ActCode",
    "code": "AMB",
    "display": "ambulatory"
  },
  "serviceType": {
    "coding": [{
      "system": "https://twcore.mohw.gov.tw/ig/twcore/CodeSystem/medical-consultation-department-nhi-tw",
      "version": "2024-05-27",
      "code": "60"
    }]
  },
  "period": {
    "start": "2024-09-26T00:00:00+08:00"
  }
}
```

接收端預期呈現：`門診`＋`中醫`。

## 5. 舊 encounter-kind 遷移

目前舊版健康存摺轉換資料可能包含：

- `encounter-kind#dental-outpatient`
- `encounter-kind#tcm-outpatient`
- `encounter-kind#outpatient`

變更後：

- `Encounter.class` 是門診／住院／急診的主要依據。
- `Encounter.serviceType` 是牙科／中醫的主要依據。
- 新版 MUST NOT 要求接收端理解 `dental-outpatient` 或 `tcm-outpatient` 才能分類。
- 若需維持舊版相容性，MAY 暫時保留舊 coding，但同一 Encounter MUST 同時輸出本文件規定的 `serviceType`。
- 版本說明 MUST 公告舊 coding 的移除版本。

Mediprisma 的讀取端仍須支援既有資料，不因新版輸出契約而移除舊格式：

| 舊格式 | 讀取結果 | 新版可否繼續輸出 |
|---|---|---|
| `encounter-kind#dental-outpatient` | 牙醫 | 過渡期可；最終移除 |
| `encounter-kind#tcm-outpatient` | 中醫 | 過渡期可；最終移除 |
| `clinical-service-domain#traditional-chinese-medicine` | 中醫 | 不得由新版輸出；僅唯讀相容 |

上述相容性是接收端的讀取政策，不代表舊自訂碼重新成為對外交換標準。
沒有 coding 的 `type.text`、`coding.display` 或 `serviceType.text` 不作為醫療體系分類依據。

`claims`、`ic-card` 等資料管道屬 provenance，不得影響牙科／中醫判定；建議另以 `meta.source` 或 `Provenance` 表達。

## 6. Mediprisma 接收端契約

Mediprisma MUST 支援以下 exact code pairs：

| system | version | code | UI 類別 |
|---|---|---|---|
| `http://terminology.hl7.org/CodeSystem/service-type` | — | `88` | 牙醫 |
| `https://twcore.mohw.gov.tw/ig/twcore/CodeSystem/medical-consultation-department-nhi-tw` | `2024-05-27` | `60` | 中醫 |

相容讀取另包含：

- HL7 service-type `13`、`18` → 中醫。
- HL7 service-type `87–94` → 牙醫。
- SNOMED CT `722163006` → 牙醫。
- TW Core 就醫／診療科別 `40` → 牙醫。
- 舊 Encounter.type code `tcm-outpatient`、`dental-outpatient`。

並遵守：

- 以 `system + code` 判定；`version` 用於 terminology 版本識別，不以 display/text 判定。
- `class#AMB` 顯示門診 tag；醫療類別以另一顆 tag 顯示，不將 AMB 當成西醫 coding。
- zh-TW 顯示為 `門診`＋`西醫／中醫／牙醫`。
- en 顯示為 `Outpatient`＋`Western Medicine／Traditional Chinese Medicine／Dental`。
- 保留既有 TW Core、SNOMED CT、HL7 Service Type 與舊 bridge coding 的相容讀取能力。
- `clinical-service-domain#traditional-chinese-medicine` 僅保留唯讀相容，不得列入新版輸出契約。

## 7. 驗證要求

### 7.1 FHIR R4 結構

代表性 Encounter／Bundle MUST 使用 HL7 FHIR Validator，以 FHIR R4 `4.0.1` 驗證：

- `Encounter.status` 合法。
- `Encounter.class` 結構與 code 合法。
- `Encounter.serviceType` 是 R4 `CodeableConcept`。
- `serviceType` 沒有 `display` 與 `text` 仍能通過驗證。

### 7.2 Terminology／TW Core

- 牙科 MUST 驗證為 HL7 Service Type `88`。
- 中醫 MUST 驗證為 TW Core system `medical-consultation-department-nhi-tw`、version `2024-05-27`、code `60`。
- 若 Encounter 宣告 TW Core profile，MUST 使用 TW Core 1.0.0 package 驗證，不可只加入 `meta.profile` 就宣稱相容。

## 8. 驗收測試

以下案例 MUST 全部通過：

| class | serviceType system | version | code | display/text | 預期 |
|---|---|---|---|---|---|
| `AMB` | HL7 service-type | — | `88` | 皆省略 | 門診＋牙醫 |
| `AMB` | TW Core consultation department | `2024-05-27` | `60` | 皆省略 | 門診＋中醫 |
| `AMB` | SNOMED CT | — | `722163006` | 皆省略 | 門診＋牙醫 |
| `AMB` | TW Core consultation department | `2024-05-27` | 未知 code | 皆省略 | 不得判定中醫 |
| `AMB` | 錯誤 system | `2024-05-27` | `60` | 皆省略 | 不得判定中醫 |
| `AMB` | 無 `serviceType` | — | — | — | 門診＋西醫（最後 fallback） |

另須確認：

1. 修改或移除 display 不會改變分類結果。
2. system 或 code 任一錯誤時不會因文字相似而誤判。
3. 既有牙科／中醫舊 Bundle 仍能在相容期正常顯示。
4. 同時包含 SNOMED 與 HL7 dental coding 時只分類一次，交換 coding 順序結果不變。
5. `dental-outpatient`、`tcm-outpatient` 與 transitional custom TCM code 均有回歸測試鎖定。

## 9. 健康抓抓交付項目

請提供：

1. 更新後的牙科、中醫、西醫代表性 Bundle。
2. FHIR R4 Validator 結果與 CI 測試紀錄。
3. 若宣告 TW Core profile，另提供 TW Core 1.0.0 validation 結果。
4. 舊 `encounter-kind` coding 的相容期與移除版本。
5. 版本更新說明，明確記錄中醫已由自訂碼改為 TW Core 官方 code `60`。

完成上述項目後，牙科與中醫分類可在不依賴 display、text 或專案自訂 CodeSystem 的情況下，穩定地由標準 FHIR terminology 交換與呈現。

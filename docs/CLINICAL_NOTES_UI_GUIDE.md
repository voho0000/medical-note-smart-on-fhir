# 病歷記錄功能使用說明 | Clinical Notes Feature Guide

## 📋 功能概述 | Feature Overview

### 繁體中文
病歷記錄功能已整合至「就診紀錄」卡片中。當您點擊任何一次門診、住院或急診記錄時，系統會自動展開該次就診的詳細資訊，包括：
- 檢查檢驗結果
- 用藥記錄
- 處置記錄
- **病歷記錄**（門診記錄、住院記錄、急診記錄等）

### English
The Clinical Notes feature is integrated into the "Visit History" card. When you click on any outpatient, inpatient, or emergency visit record, the system automatically expands to show detailed information for that visit, including:
- Test and examination results
- Medication records
- Procedure records
- **Clinical notes** (outpatient notes, inpatient notes, emergency notes, etc.)

---

## 🎯 使用流程 | User Flow

### 繁體中文

#### 步驟 1：查看就診列表
在左側面板中，選擇「就診紀錄」標籤，您會看到所有就診記錄的列表。

#### 步驟 2：點擊展開就診詳情
點擊任何一筆就診記錄，系統會展開顯示該次就診的詳細資訊。

#### 步驟 3：查看病歷記錄
在展開的詳情中，向下滾動即可看到「病歷記錄」區塊。

#### 步驟 4：展開病歷內容
點擊任何一筆病歷記錄，可以展開查看完整的病歷內容。

### English

#### Step 1: View Visit List
In the left panel, select the "Visit History" tab to see a list of all visit records.

#### Step 2: Expand Visit Details
Click on any visit record to expand and view detailed information for that visit.

#### Step 3: View Clinical Notes
In the expanded details, scroll down to see the "Clinical Notes" section.

#### Step 4: Expand Note Content
Click on any clinical note to expand and view the complete note content.

---

## 🎨 UI 效果展示 | UI Effect Demonstration

### 繁體中文

```
┌─────────────────────────────────────────────────────┐
│ 就診紀錄                                             │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ 門診 | 2024-01-12 14:30                     │   │
│ │ 內科門診                                     │   │
│ │ 主治醫師：王大明                             │   │
│ │                                             │   │
│ │ 主訴：發燒、咳嗽                             │   │
│ │ 診斷：上呼吸道感染                           │   │
│ │                                             │   │
│ │ ▼ 查看詳情                                   │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ 展開後的詳細資訊                             │   │
│ ├─────────────────────────────────────────────┤   │
│ │                                             │   │
│ │ 檢查檢驗                                     │   │
│ │ • 白血球計數 - 12,000/μL (偏高)             │   │
│ │ • C反應蛋白 - 2.5 mg/dL (偏高)              │   │
│ │                                             │   │
│ │ 用藥                                         │   │
│ │ • 阿莫西林膠囊 500mg                         │   │
│ │   用法：每日三次，飯後服用                   │   │
│ │ • 退燒藥 500mg                               │   │
│ │   用法：發燒時服用，每次間隔4-6小時          │   │
│ │                                             │   │
│ │ 處置                                         │   │
│ │ • 靜脈注射                                   │   │
│ │   執行時間：2024-01-12 14:45                │   │
│ │                                             │   │
│ │ 病歷記錄 ✨                                  │   │
│ │ ┌───────────────────────────────────────┐ │   │
│ │ │ 📄 門診記錄 | 2024-01-12 14:30        │ │   │
│ │ │ 內科 - 王大明醫師                      │ │   │
│ │ │ ▶ 點擊展開查看詳細內容                 │ │   │
│ │ └───────────────────────────────────────┘ │   │
│ │                                             │   │
│ │ 點擊後展開：                                 │   │
│ │ ┌───────────────────────────────────────┐ │   │
│ │ │ 📄 門診記錄 | 2024-01-12 14:30        │ │   │
│ │ │ 內科 - 王大明醫師                      │ │   │
│ │ │ ▼ 收起                                 │ │   │
│ │ ├───────────────────────────────────────┤ │   │
│ │ │                                       │ │   │
│ │ │ 主訴 (Chief Complaint)                │ │   │
│ │ │ 患者主訴發燒三天，伴隨咳嗽及喉嚨痛。   │ │   │
│ │ │                                       │ │   │
│ │ │ 現病史 (Present Illness)              │ │   │
│ │ │ 患者於三天前開始出現發燒症狀，體溫最高 │ │   │
│ │ │ 達38.5°C，伴隨乾咳及喉嚨疼痛。無流鼻涕 │ │   │
│ │ │ 或呼吸困難。曾自行服用退燒藥，症狀暫時 │ │   │
│ │ │ 緩解後再次發作。                       │ │   │
│ │ │                                       │ │   │
│ │ │ 理學檢查 (Physical Examination)       │ │   │
│ │ │ • 體溫：38.2°C                        │ │   │
│ │ │ • 血壓：120/80 mmHg                   │ │   │
│ │ │ • 心跳：88 次/分                      │ │   │
│ │ │ • 呼吸：18 次/分                      │ │   │
│ │ │ • 咽喉：輕度紅腫                      │ │   │
│ │ │ • 肺部：呼吸音清晰，無囉音             │ │   │
│ │ │                                       │ │   │
│ │ │ 診斷 (Diagnosis)                      │ │   │
│ │ │ 上呼吸道感染 (Upper Respiratory Tract │ │   │
│ │ │ Infection)                            │ │   │
│ │ │                                       │ │   │
│ │ │ 處置計畫 (Treatment Plan)             │ │   │
│ │ │ 1. 處方抗生素治療                      │ │   │
│ │ │ 2. 症狀治療（退燒、止咳）              │ │   │
│ │ │ 3. 建議多休息、多喝水                  │ │   │
│ │ │ 4. 三天後回診追蹤                      │ │   │
│ │ │                                       │ │   │
│ │ └───────────────────────────────────────┘ │   │
│ │                                             │   │
│ │ ▲ 收起詳情                                   │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### English

```
┌─────────────────────────────────────────────────────┐
│ Visit History                                       │
├─────────────────────────────────────────────────────┤
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ Outpatient | 2024-01-12 14:30               │   │
│ │ Internal Medicine Clinic                    │   │
│ │ Physician: Dr. Wang                         │   │
│ │                                             │   │
│ │ Chief Complaint: Fever, Cough               │   │
│ │ Diagnosis: Upper Respiratory Infection      │   │
│ │                                             │   │
│ │ ▼ View Details                              │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
│ ┌─────────────────────────────────────────────┐   │
│ │ Expanded Details                            │   │
│ ├─────────────────────────────────────────────┤   │
│ │                                             │   │
│ │ Tests & Examinations                        │   │
│ │ • WBC Count - 12,000/μL (High)              │   │
│ │ • CRP - 2.5 mg/dL (High)                    │   │
│ │                                             │   │
│ │ Medications                                 │   │
│ │ • Amoxicillin 500mg                         │   │
│ │   Dosage: Three times daily, after meals    │   │
│ │ • Antipyretic 500mg                         │   │
│ │   Dosage: When fever, 4-6 hours interval    │   │
│ │                                             │   │
│ │ Procedures                                  │   │
│ │ • IV Injection                              │   │
│ │   Performed: 2024-01-12 14:45               │   │
│ │                                             │   │
│ │ Clinical Notes ✨                            │   │
│ │ ┌───────────────────────────────────────┐ │   │
│ │ │ 📄 Outpatient Note | 2024-01-12 14:30 │ │   │
│ │ │ Internal Medicine - Dr. Wang          │ │   │
│ │ │ ▶ Click to expand                     │ │   │
│ │ └───────────────────────────────────────┘ │   │
│ │                                             │   │
│ │ After clicking:                             │   │
│ │ ┌───────────────────────────────────────┐ │   │
│ │ │ 📄 Outpatient Note | 2024-01-12 14:30 │ │   │
│ │ │ Internal Medicine - Dr. Wang          │ │   │
│ │ │ ▼ Collapse                            │ │   │
│ │ ├───────────────────────────────────────┤ │   │
│ │ │                                       │ │   │
│ │ │ Chief Complaint                       │ │   │
│ │ │ Patient presents with fever for 3 days│ │   │
│ │ │ accompanied by cough and sore throat. │ │   │
│ │ │                                       │ │   │
│ │ │ Present Illness                       │ │   │
│ │ │ Patient developed fever 3 days ago,   │ │   │
│ │ │ with maximum temperature of 38.5°C,   │ │   │
│ │ │ accompanied by dry cough and throat   │ │   │
│ │ │ pain. No rhinorrhea or dyspnea. Took  │ │   │
│ │ │ antipyretics with temporary relief.   │ │   │
│ │ │                                       │ │   │
│ │ │ Physical Examination                  │ │   │
│ │ │ • Temperature: 38.2°C                 │ │   │
│ │ │ • BP: 120/80 mmHg                     │ │   │
│ │ │ • HR: 88 bpm                          │ │   │
│ │ │ • RR: 18 /min                         │ │   │
│ │ │ • Throat: Mild erythema               │ │   │
│ │ │ • Lungs: Clear breath sounds, no rales│ │   │
│ │ │                                       │ │   │
│ │ │ Diagnosis                             │ │   │
│ │ │ Upper Respiratory Tract Infection     │ │   │
│ │ │                                       │ │   │
│ │ │ Treatment Plan                        │ │   │
│ │ │ 1. Antibiotic therapy prescribed      │ │   │
│ │ │ 2. Symptomatic treatment (antipyretic,│ │   │
│ │ │    antitussive)                       │ │   │
│ │ │ 3. Advised rest and hydration         │ │   │
│ │ │ 4. Follow-up in 3 days                │ │   │
│ │ │                                       │ │   │
│ │ └───────────────────────────────────────┘ │   │
│ │                                             │   │
│ │ ▲ Collapse Details                          │   │
│ └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 🔍 病歷記錄類型 | Clinical Note Types

### 繁體中文

系統支援兩種類型的病歷記錄：

#### 1. 文件引用 (DocumentReference)
- 📄 圖示：藍色文件圖標
- 用途：儲存病歷文件（PDF、文本等）
- 內容：可能包含 Base64 編碼的文件內容或外部連結

#### 2. 結構化記錄 (Composition)
- 📝 圖示：紫色代碼圖標
- 用途：結構化的病歷記錄
- 內容：包含多個章節（主訴、現病史、理學檢查、診斷、處置計畫等）

### English

The system supports two types of clinical notes:

#### 1. Document Reference
- 📄 Icon: Blue document icon
- Purpose: Store clinical documents (PDF, text, etc.)
- Content: May contain Base64-encoded document content or external links

#### 2. Composition
- 📝 Icon: Purple code icon
- Purpose: Structured clinical records
- Content: Contains multiple sections (Chief Complaint, Present Illness, Physical Exam, Diagnosis, Treatment Plan, etc.)

---

## 📊 資料顯示規則 | Data Display Rules

### 繁體中文

#### 自動關聯
- 系統會根據 `encounterRef` 自動將病歷記錄關聯到對應的就診
- 只顯示與該次就診相關的病歷記錄

#### 排序規則
- 病歷記錄按日期降序排列（最新的在最上面）
- 同一次就診可能有多筆病歷記錄

#### 顯示條件
- 如果該次就診沒有關聯的病歷記錄，則不顯示「病歷記錄」區塊
- 如果 FHIR 服務器未提供 DocumentReference 或 Composition 資源，則所有就診都不會顯示病歷記錄

### English

#### Automatic Association
- The system automatically associates clinical notes with visits based on `encounterRef`
- Only displays clinical notes related to that specific visit

#### Sorting Rules
- Clinical notes are sorted by date in descending order (newest first)
- A single visit may have multiple clinical notes

#### Display Conditions
- If a visit has no associated clinical notes, the "Clinical Notes" section is not displayed
- If the FHIR server does not provide DocumentReference or Composition resources, no visits will display clinical notes

---

## 🎨 UI 元素說明 | UI Element Description

### 繁體中文

#### 病歷記錄卡片
- **標題列**：顯示文件類型圖標、標題、日期
- **標籤**：顯示類別（如「門診」、「住院」等）
- **作者**：顯示撰寫醫師姓名
- **展開按鈕**：點擊可展開/收起詳細內容
- **內容區**：顯示病歷的完整內容或章節

#### 互動效果
- **懸停效果**：滑鼠移到卡片上時會有輕微的背景色變化
- **展開動畫**：點擊展開時有平滑的過渡動畫
- **圖標變化**：展開/收起時圖標會從 ▶ 變為 ▼

### English

#### Clinical Note Card
- **Header**: Displays document type icon, title, date
- **Tags**: Shows category (e.g., "Outpatient", "Inpatient", etc.)
- **Author**: Displays physician name
- **Expand Button**: Click to expand/collapse detailed content
- **Content Area**: Displays complete note content or sections

#### Interactive Effects
- **Hover Effect**: Slight background color change when mouse hovers over card
- **Expand Animation**: Smooth transition animation when expanding
- **Icon Change**: Icon changes from ▶ to ▼ when expanding/collapsing

---

## 🔧 技術實現 | Technical Implementation

### 繁體中文

#### 資料來源
- FHIR 資源類型：`DocumentReference` 和 `Composition`
- API 端點：
  - `GET /DocumentReference?patient={patientId}&_sort=-date&_count=100`
  - `GET /Composition?patient={patientId}&_sort=-date&_count=100`

#### 關鍵組件
- `VisitHistoryCard`: 主卡片組件
- `VisitItem`: 就診項目組件
- `NoteItem`: 病歷記錄項組件
- `useClinicalNotes`: 病歷資料處理 Hook
- `useEncounterDetails`: 就診詳情關聯 Hook

### English

#### Data Source
- FHIR Resource Types: `DocumentReference` and `Composition`
- API Endpoints:
  - `GET /DocumentReference?patient={patientId}&_sort=-date&_count=100`
  - `GET /Composition?patient={patientId}&_sort=-date&_count=100`

#### Key Components
- `VisitHistoryCard`: Main card component
- `VisitItem`: Visit item component
- `NoteItem`: Clinical note item component
- `useClinicalNotes`: Clinical notes data processing Hook
- `useEncounterDetails`: Visit details association Hook

---

## 📝 使用注意事項 | Usage Notes

### 繁體中文

1. **資料可用性**
   - 病歷記錄的顯示取決於 FHIR 服務器是否提供相關資源
   - 如果服務器未提供 DocumentReference 或 Composition，將不會顯示病歷記錄

2. **權限控制**
   - 確保您有權限訪問病歷記錄
   - 某些敏感資訊可能需要額外的授權

3. **效能考量**
   - 系統會自動快取已載入的資料
   - 大量病歷記錄可能需要較長的載入時間

### English

1. **Data Availability**
   - Clinical notes display depends on whether the FHIR server provides relevant resources
   - If the server does not provide DocumentReference or Composition, clinical notes will not be displayed

2. **Access Control**
   - Ensure you have permission to access clinical notes
   - Some sensitive information may require additional authorization

3. **Performance Considerations**
   - The system automatically caches loaded data
   - Large volumes of clinical notes may require longer loading times

---

## 🆘 常見問題 | FAQ

### 繁體中文

**Q: 為什麼我看不到病歷記錄？**
A: 可能的原因：
1. FHIR 服務器未提供 DocumentReference 或 Composition 資源
2. 該次就診沒有關聯的病歷記錄
3. 您沒有訪問權限

**Q: 病歷記錄可以下載嗎？**
A: 目前版本僅支援線上查看，未來版本將支援下載功能。

**Q: 如何搜尋特定的病歷記錄？**
A: 目前需要手動展開就診記錄查看，未來版本將加入搜尋功能。

### English

**Q: Why can't I see clinical notes?**
A: Possible reasons:
1. FHIR server does not provide DocumentReference or Composition resources
2. The visit has no associated clinical notes
3. You don't have access permission

**Q: Can clinical notes be downloaded?**
A: The current version only supports online viewing. Download functionality will be added in future versions.

**Q: How to search for specific clinical notes?**
A: Currently, you need to manually expand visit records to view. Search functionality will be added in future versions.

---

## 📅 更新日誌 | Changelog

### v1.0.0 (2024-01-12)

#### 繁體中文
- ✅ 初始版本發布
- ✅ 支援 DocumentReference 和 Composition 兩種病歷類型
- ✅ 自動關聯病歷記錄到對應就診
- ✅ 支援展開/收起查看詳細內容
- ✅ 支援多章節顯示（Composition）
- ✅ 響應式設計，支援各種螢幕尺寸

#### English
- ✅ Initial release
- ✅ Support for DocumentReference and Composition note types
- ✅ Automatic association of notes with visits
- ✅ Support for expanding/collapsing detailed content
- ✅ Support for multi-section display (Composition)
- ✅ Responsive design for various screen sizes

---

## 📧 聯絡資訊 | Contact Information

### 繁體中文
如有任何問題或建議，請聯絡開發團隊。

### English
For any questions or suggestions, please contact the development team.

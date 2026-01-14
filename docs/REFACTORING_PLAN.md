# Data Selection 重構計劃

## 🎯 目標
將 data selection 功能重構以符合：
- Clean Code 原則
- SOLID 原則
- Single Source of Truth (SSOT)
- Clean Architecture
- Vertical Slice Architecture

## ✅ 已完成

### 1. 統一 FHIR 類型定義 (SSOT)
**問題：** FHIR 類型定義分散在多個地方
- `src/shared/types/fhir.types.ts` - 完整的 FHIR R4 類型
- `src/application/hooks/clinical-context/types.ts` - 簡化版重複定義
- `src/core/categories/lab-reports.category.ts` - 本地接口定義

**解決方案：**
- ✅ 重構 `clinical-context/types.ts` 使用 re-export 共享類型
- ✅ 更新 `lab-reports.category.ts` 使用共享 FHIR 類型
- ✅ 移除重複的接口定義

**影響檔案：**
- `src/application/hooks/clinical-context/types.ts`
- `src/core/categories/lab-reports.category.ts`

### 2. 統一其他 Category 檔案的類型使用 ✅
**已更新的檔案：**
- ✅ `src/core/categories/imaging-reports.category.ts` - 使用共享 DiagnosticReport & Observation
- ✅ `src/core/categories/procedures.category.ts` - 使用共享 Procedure
- ✅ `src/core/categories/vital-signs.category.ts` - 使用共享 Observation
- ✅ `src/core/categories/conditions.category.ts` - 使用共享 Condition
- ✅ `src/core/categories/medications.category.ts` - 使用共享 MedicationRequest
- ✅ `src/core/categories/allergies.category.ts` - 使用共享 AllergyIntolerance

**結果：** 所有 category 檔案現在都使用 `@/src/shared/types/fhir.types.ts` 的類型

### 3. 提取共用工具函數 (DRY 原則) ✅
**問題：** 多個 category 檔案中有重複的邏輯
- 時間範圍過濾邏輯重複 4 次
- "取得最新項目" 邏輯重複 3 次
- CodeableConcept 文字提取邏輯分散各處

**解決方案：**
- ✅ 創建 `src/core/utils/date-filter.utils.ts`
  - `isWithinTimeRange()`: 統一時間範圍過濾
  - `getMostRecentDate()`: 取得最近日期
- ✅ 創建 `src/core/utils/data-grouping.utils.ts`
  - `getLatestByName()`: 通用的取得最新項目函數
  - `getCodeableConceptText()`: 提取 CodeableConcept 文字

**影響檔案：**
- ✅ 更新 `lab-reports.category.ts` 使用共用工具
- ✅ 更新 `imaging-reports.category.ts` 使用共用工具
- ✅ 更新 `procedures.category.ts` 使用共用工具
- ✅ 更新 `vital-signs.category.ts` 使用共用工具

**成果：**
- 減少約 150 行重複代碼
- 統一行為邏輯
- 更容易維護和測試

## 📋 待完成（未來改進）

### 4. 改進架構分層 (Clean Architecture)

**當前狀態：** 已有良好的基礎架構
- ✅ Domain Layer: entities 和 interfaces 已定義
- ✅ Application Layer: hooks 職責明確
- ✅ Shared utilities: 共用工具已提取
- ⏳ Infrastructure Layer: repository 層已存在但可進一步改進

**當前問題（非緊急）：**
- Clinical context hooks 直接操作 FHIR 數據（可接受，因為是 React hooks）
- 可以考慮更明確的 domain entities（當前使用 FHIR types 作為 domain types）
- 業務邏輯和數據訪問已通過 registry pattern 分離

**建議改進：**

```
src/
├── core/                          # Domain Layer
│   ├── entities/                  # Domain Entities (業務實體)
│   │   ├── clinical-context.entity.ts
│   │   └── clinical-data.entity.ts
│   ├── interfaces/                # Abstractions
│   │   └── data-category.interface.ts
│   └── services/                  # Domain Services
│       └── translation.service.ts
│
├── application/                   # Application Layer
│   ├── hooks/                     # Use Cases (React Hooks)
│   │   ├── use-clinical-context.hook.ts
│   │   └── clinical-context/      # Context-specific use cases
│   │       ├── useReportsContext.ts
│   │       └── useVitalSignsContext.ts
│   └── mappers/                   # Data Mappers
│       └── clinical-data.mapper.ts
│
├── infrastructure/                # Infrastructure Layer
│   ├── repositories/              # Data Access
│   │   └── fhir-clinical-data.repository.ts
│   └── adapters/                  # External Adapters
│
└── shared/                        # Shared Kernel
    └── types/
        └── fhir.types.ts          # FHIR R4 Types (SSOT)
```

### 4. 提取 FHIR 映射邏輯

**當前問題：**
- FHIR 到 domain 的轉換邏輯散落在各個 hooks 中
- 違反 Single Responsibility Principle

**建議：**
創建專門的 mapper 服務：
```typescript
// src/application/mappers/fhir-to-domain.mapper.ts
export class FhirToDomainMapper {
  static mapObservation(fhir: FhirObservation): DomainObservation
  static mapDiagnosticReport(fhir: FhirDiagnosticReport): DomainReport
  // ...
}
```

### 5. 改進依賴注入 (Dependency Inversion Principle)

**當前問題：**
- Hooks 直接依賴具體實現
- 難以測試和替換實現

**建議：**
```typescript
// 定義抽象接口
interface IClinicalDataRepository {
  getObservations(filters: Filters): Promise<Observation[]>
  getDiagnosticReports(filters: Filters): Promise<DiagnosticReport[]>
}

// Hook 依賴抽象而非具體實現
function useClinicalContext(repository: IClinicalDataRepository) {
  // ...
}
```

### 6. 改進 Category Registry (Open/Closed Principle)

**當前狀態：** ✅ 已經做得不錯
- Registry pattern 允許動態註冊新 category
- 符合 Open/Closed Principle

**可能的改進：**
- 考慮使用 factory pattern 創建 category instances
- 添加 category validation

## 🔧 實施建議

### 階段 1: 類型統一 (已完成 50%)
1. ✅ 統一 FHIR 類型定義
2. ⏳ 更新所有 category 檔案
3. ⏳ 驗證類型一致性

### 階段 2: 架構重組
1. 創建清晰的 domain entities
2. 提取 mapper 邏輯到專門的服務
3. 重構 hooks 使用新的架構

### 階段 3: 測試和驗證
1. 添加單元測試
2. 驗證功能完整性
3. 性能測試

## 📝 注意事項

1. **向後兼容性：** 使用 re-export 保持現有代碼可用
2. **漸進式重構：** 一次重構一個模塊，避免大規模破壞
3. **測試覆蓋：** 每次重構後確保功能正常

## 🎓 設計原則應用

### SOLID 原則
- ✅ **S**ingle Responsibility: 每個 hook 只負責一個職責
- ✅ **O**pen/Closed: Registry pattern 允許擴展
- ⏳ **L**iskov Substitution: 需要定義清晰的接口
- ✅ **I**nterface Segregation: 分離的 props 接口
- ⏳ **D**ependency Inversion: 需要引入抽象層

### Clean Architecture
- ✅ Domain Layer: Entities 和 Interfaces 已定義
- ⏳ Application Layer: Hooks 需要更清晰的職責劃分
- ⏳ Infrastructure Layer: 需要明確的 repository 層

### SSOT
- ✅ FHIR 類型統一在 `shared/types/fhir.types.ts`
- ✅ Category 定義統一在 registry
- ✅ Translation 統一在 translation service

## 🚀 下一步行動

1. 完成所有 category 檔案的類型統一
2. 創建 FHIR mapper 服務
3. 重構 clinical context hooks 使用 mapper
4. 添加單元測試
5. 文檔更新

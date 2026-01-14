# 多醫院資料整合指南

## 📋 概述

本系統現在支援多個醫院的不同資料格式整合。透過 **Domain Entities** 和 **Data Mapper** 架構，可以輕鬆接入使用不同資料格式的醫院（FHIR、HL7、自定義 API 等）。

## 🏗️ 架構設計

### 核心概念

```
醫院 A (FHIR) ──→ FHIR Mapper ──┐
                                 │
醫院 B (自定義) ──→ 自定義 Mapper ──┼──→ Domain Entities ──→ 應用程式
                                 │
醫院 C (HL7) ──→ HL7 Mapper ────┘
```

### 三層架構

1. **Domain Layer (核心層)**
   - Domain Entities: 定義業務實體（與資料來源無關）
   - Mapper Interface: 定義轉換契約

2. **Infrastructure Layer (基礎設施層)**
   - Data Mappers: 實作各醫院的資料轉換邏輯
   - 每個醫院一個 Mapper

3. **Application Layer (應用層)**
   - 使用 Domain Entities
   - 不需要知道資料來源

## 📁 檔案結構

```
src/
├── core/
│   ├── entities/                    # Domain Entities
│   │   └── clinical-data.entity.ts  # 所有臨床資料實體定義
│   │
│   └── interfaces/
│       └── data-mapper.interface.ts  # Mapper 契約和 Registry
│
├── infrastructure/
│   └── fhir/
│       └── mappers/
│           └── fhir.mapper.ts           # FhirMapper (實作 IDataMapper)
│
└── shared/
    └── types/
        └── fhir.types.ts             # FHIR 特定類型（僅供 FHIR mapper 使用）
```

## 🚀 如何接入新醫院

### 步驟 1: 創建 Mapper 類別

```typescript
// src/infrastructure/mappers/hospital-x-data.mapper.ts

import type { IDataMapper } from '@/src/core/interfaces/data-mapper.interface'
import type { ObservationEntity } from '@/src/core/entities/observation.entity'
// ... 其他 imports

export class HospitalXDataMapper implements IDataMapper {
  readonly sourceType = 'hospital-x'
  
  mapObservation(source: HospitalXObservation): ObservationEntity {
    return {
      id: source.customId,
      code: source.testCode,
      displayName: source.testName,
      status: this.mapStatus(source.status),
      effectiveDate: new Date(source.date),
      value: {
        value: source.result,
        unit: source.unit
      },
      sourceSystem: 'hospital-x',
      sourceId: source.customId
    }
  }
  
  // 實作其他必要的 map 方法...
  
  private mapStatus(customStatus: string): string {
    // 將醫院特定的狀態碼轉換為標準狀態
    const statusMap: Record<string, string> = {
      'F': 'final',
      'P': 'preliminary',
      'C': 'cancelled'
    }
    return statusMap[customStatus] || 'unknown'
  }
}
```

### 步驟 2: 註冊 Mapper

```typescript
// src/infrastructure/mappers/index.ts

import { dataMapperRegistry } from '@/src/core/interfaces/data-mapper.interface'
import { fhirDataMapper } from './fhir-data.mapper'
import { HospitalXDataMapper } from './hospital-x-data.mapper'

// 註冊所有 mappers
dataMapperRegistry.register(fhirDataMapper)
dataMapperRegistry.register(new HospitalXDataMapper())

export { dataMapperRegistry }
```

### 步驟 3: 在應用中使用

```typescript
// 在 repository 或 service 中
import { dataMapperRegistry } from '@/src/infrastructure/mappers'

class ClinicalDataService {
  async fetchObservations(hospitalId: string, patientId: string) {
    // 1. 根據醫院 ID 取得對應的 mapper
    const mapper = dataMapperRegistry.getMapper(hospitalId)
    
    if (!mapper) {
      throw new Error(`No mapper found for hospital: ${hospitalId}`)
    }
    
    // 2. 從該醫院的 API 取得原始資料
    const rawData = await this.fetchFromHospitalAPI(hospitalId, patientId)
    
    // 3. 使用 mapper 轉換為 domain entities
    const observations = rawData.map(item => mapper.mapObservation(item))
    
    return observations
  }
}
```

## 💡 實際範例

### 範例 1: FHIR 醫院 (已實作)

```typescript
// 使用 FHIR mapper
const fhirMapper = dataMapperRegistry.getMapper('fhir')
const observation = fhirMapper.mapObservation(fhirResource)

// observation 現在是 ObservationEntity 類型
console.log(observation.displayName)  // 標準化的顯示名稱
console.log(observation.value)        // 標準化的值
```

### 範例 2: 自定義格式醫院

假設某醫院使用以下格式：

```json
{
  "檢驗編號": "LAB001",
  "檢驗項目代碼": "HB",
  "檢驗項目名稱": "血紅素",
  "檢驗結果": 14.5,
  "單位": "g/dL",
  "檢驗日期": "2024-01-14",
  "狀態": "完成"
}
```

創建對應的 mapper：

```typescript
export class CustomHospitalMapper implements IDataMapper {
  readonly sourceType = 'custom-hospital'
  
  mapObservation(source: any): ObservationEntity {
    return {
      id: source.檢驗編號,
      code: source.檢驗項目代碼,
      displayName: source.檢驗項目名稱,
      status: source.狀態 === '完成' ? 'final' : 'preliminary',
      effectiveDate: new Date(source.檢驗日期),
      value: {
        value: source.檢驗結果,
        unit: source.單位
      },
      sourceSystem: 'custom-hospital',
      sourceId: source.檢驗編號
    }
  }
}
```

## 🎯 最佳實踐

### 1. 狀態碼標準化

建議定義標準狀態碼對照表：

```typescript
const STANDARD_STATUS = {
  FINAL: 'final',
  PRELIMINARY: 'preliminary',
  CANCELLED: 'cancelled',
  ENTERED_IN_ERROR: 'entered-in-error',
  UNKNOWN: 'unknown'
} as const

// 在 mapper 中使用
private mapStatus(customStatus: string): string {
  const mapping: Record<string, string> = {
    '完成': STANDARD_STATUS.FINAL,
    '暫定': STANDARD_STATUS.PRELIMINARY,
    '取消': STANDARD_STATUS.CANCELLED
  }
  return mapping[customStatus] || STANDARD_STATUS.UNKNOWN
}
```

### 2. 錯誤處理

```typescript
mapObservation(source: any): ObservationEntity {
  try {
    // 驗證必要欄位
    if (!source.id || !source.code) {
      throw new Error('Missing required fields')
    }
    
    return {
      id: source.id,
      code: source.code,
      displayName: source.name || 'Unknown',
      // ... 其他欄位
    }
  } catch (error) {
    console.error('Error mapping observation:', error)
    // 返回最小可用的實體或重新拋出錯誤
    throw error
  }
}
```

### 3. 日期處理

```typescript
private parseDate(dateString: string | undefined): Date | undefined {
  if (!dateString) return undefined
  
  try {
    const date = new Date(dateString)
    return isNaN(date.getTime()) ? undefined : date
  } catch {
    return undefined
  }
}
```

### 4. 單位標準化

```typescript
private standardizeUnit(unit: string): string {
  const unitMap: Record<string, string> = {
    'gm/dl': 'g/dL',
    'GM/DL': 'g/dL',
    'mmol/l': 'mmol/L',
    // ... 更多對照
  }
  return unitMap[unit.toLowerCase()] || unit
}
```

## 🔧 測試

### 單元測試範例

```typescript
import { HospitalXDataMapper } from './hospital-x-data.mapper'

describe('HospitalXDataMapper', () => {
  const mapper = new HospitalXDataMapper()
  
  it('should map observation correctly', () => {
    const source = {
      customId: 'OBS001',
      testCode: 'HB',
      testName: 'Hemoglobin',
      result: 14.5,
      unit: 'g/dL',
      date: '2024-01-14',
      status: 'F'
    }
    
    const result = mapper.mapObservation(source)
    
    expect(result.id).toBe('OBS001')
    expect(result.code).toBe('HB')
    expect(result.displayName).toBe('Hemoglobin')
    expect(result.status).toBe('final')
    expect(result.value?.value).toBe(14.5)
    expect(result.value?.unit).toBe('g/dL')
    expect(result.sourceSystem).toBe('hospital-x')
  })
})
```

## 📊 優勢

### 1. 解耦合
- 應用層不需要知道資料來源格式
- 更換資料來源不影響業務邏輯

### 2. 可擴展
- 新增醫院只需實作一個 Mapper
- 不需要修改現有代碼

### 3. 可維護
- 每個醫院的轉換邏輯獨立
- 容易測試和除錯

### 4. 類型安全
- TypeScript 確保 Mapper 實作完整
- Domain Entities 提供統一的類型定義

## 🚨 注意事項

1. **必要欄位**: 確保所有 Domain Entity 的必要欄位都有值
2. **資料驗證**: 在 Mapper 中驗證輸入資料的有效性
3. **錯誤處理**: 適當處理轉換過程中的錯誤
4. **效能考量**: 大量資料轉換時注意效能
5. **版本管理**: 醫院 API 版本變更時更新對應的 Mapper

## 📚 相關文檔

- [Domain Entities](../src/core/entities/) - 所有 Domain Entity 定義
- [Data Mapper Interface](../src/core/interfaces/data-mapper.interface.ts) - Mapper 契約
- [FHIR Mapper](../src/infrastructure/mappers/fhir-data.mapper.ts) - FHIR 實作範例
- [Example Mapper](../src/infrastructure/mappers/example-hospital-data.mapper.ts) - 自定義格式範例

## 🎓 總結

透過這個架構，系統可以：
- ✅ 支援多個醫院的不同資料格式
- ✅ 保持業務邏輯的獨立性
- ✅ 輕鬆擴展新的資料來源
- ✅ 維持高度的類型安全
- ✅ 符合 Clean Architecture 原則

當需要接入新醫院時，只需：
1. 創建新的 Mapper 類別
2. 實作轉換邏輯
3. 註冊到 Registry
4. 完成！

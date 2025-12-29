# 🎯 架構改進完成

## ✅ 修正的架構問題

### 問題：models.ts 放錯位置
**原位置**: `features/medical-note/constants/models.ts`  
**問題**: 這個檔案被多個 features 使用，不應該放在特定 feature 下

**新位置**: `src/shared/constants/ai-models.constants.ts` ✅  
**原因**: 這是共用的常數定義，應該在 Shared Layer

---

## 📊 受影響的檔案

### 已更新的 Import 路徑 (4 個檔案)

1. ✅ `features/medical-note/components/ApiKeyField.tsx`
2. ✅ `features/medical-note/components/GptPanel.tsx`
3. ✅ `features/medical-note/providers/NoteProvider.tsx`
4. ✅ `features/clinical-insights/Feature.tsx`

**舊路徑**: `@/features/medical-note/constants/models`  
**新路徑**: `@/src/shared/constants/ai-models.constants`

---

## 🏗️ 正確的 Clean Architecture 結構

```
src/
├── core/                              # 核心業務邏輯層
│   ├── entities/
│   ├── interfaces/
│   └── use-cases/
│
├── infrastructure/                    # 基礎設施層
│   ├── fhir/
│   └── ai/
│
├── application/                       # 應用層
│   ├── hooks/
│   │   └── use-ai-query.hook.ts      ⭐ (renamed from useGptQuery)
│   └── providers/
│       ├── patient.provider.tsx
│       ├── clinical-data.provider.tsx
│       ├── api-key.provider.tsx
│       └── data-selection.provider.tsx
│
└── shared/                            # 共用層
    ├── constants/
    │   ├── ai-models.constants.ts    ⭐ 移到這裡！
    │   └── data-selection.constants.ts
    ├── config/
    │   └── env.config.ts
    └── utils/
        ├── date.utils.ts
        ├── storage.utils.ts
        └── id.utils.ts

features/                              # Presentation Layer
├── medical-note/                      # UI 元件和 feature-specific 狀態
│   ├── components/
│   ├── context/
│   ├── providers/
│   └── Feature.tsx
├── medical-chat/
├── clinical-summary/
└── clinical-insights/
```

---

## 🎯 架構原則

### Shared Layer 應該包含：
✅ **跨 feature 使用的常數** (如 AI 模型列表)  
✅ **共用的工具函數** (如日期處理、ID 生成)  
✅ **環境配置** (如 API URLs)  
✅ **型別定義** (如果跨多個 features 使用)

### Feature Layer 應該包含：
✅ **UI 元件** (React Components)  
✅ **Feature-specific Context** (如 AsrContext, GptResponseContext)  
✅ **Feature-specific Providers** (如 NoteProvider)  
✅ **Feature 入口** (Feature.tsx)

### 不應該在 Feature Layer：
❌ **跨 feature 共用的常數**  
❌ **業務邏輯** (應在 Core Layer)  
❌ **外部服務實作** (應在 Infrastructure Layer)  
❌ **全域狀態管理** (應在 Application Layer)

---

## ✅ 改進後的好處

### 1. 更清晰的依賴關係
- `features/` 可以依賴 `src/shared/`
- `features/` 之間不應該互相依賴
- 避免循環依賴

### 2. 更好的可維護性
- 共用常數集中管理
- 修改一處，所有地方生效
- 易於找到和更新

### 3. 更符合 Clean Architecture
- Shared Layer 包含所有共用資源
- Feature Layer 只包含 UI 相關程式碼
- 層級職責更明確

---

## 📝 命名規範

### Shared Constants 命名：
- `ai-models.constants.ts` - AI 模型定義
- `data-selection.constants.ts` - 資料選擇常數
- `fhir-resources.constants.ts` - FHIR 資源類型（如需要）

### 使用 `.constants.ts` 後綴：
- 明確表示這是常數定義
- 與其他檔案類型區分
- 符合命名慣例

---

## 🎉 總結

**架構改進完成** ✅

- ✅ `models.ts` 已移到正確位置
- ✅ 所有引用已更新
- ✅ 空的 `constants/` 目錄已移除
- ✅ 符合 Clean Architecture 原則
- ✅ 依賴關係更清晰

**現在的架構更加合理和可維護！** 🚀

# 架構更新說明

## 最新架構改進（2026-01）

### 可插拔架構（Pluggable Architecture）

我們實作了完整的可插拔架構，讓開發者可以輕鬆新增、替換或移除功能。

#### 左側 Panel（臨床摘要）

**Registry 配置**：`src/shared/config/feature-registry.ts`

- **Tab 配置**：`LEFT_PANEL_TABS` 陣列定義所有 tabs
- **功能配置**：`CLINICAL_SUMMARY_FEATURES` 陣列定義所有功能
- **動態渲染**：`LeftPanelLayout.tsx` 從 registry 讀取並渲染

**新增功能步驟**：
1. 建立功能元件
2. 在 `feature-registry.ts` 註冊
3. 完成！無需修改 Layout

**範例**：
```typescript
{
  id: 'my-feature',
  name: 'My Feature',
  component: MyFeatureCard,
  tab: 'patient',
  order: 3,
  enabled: true,
}
```

#### 右側 Panel（AI 功能）

**Registry 配置**：`src/shared/config/right-panel-registry.ts`

- **功能配置**：`RIGHT_PANEL_FEATURES` 陣列
- **元件映射**：`RightPanelLayout.tsx` 中的 `FEATURE_COMPONENTS`
- **Provider 管理**：統一的 `RightPanelProviders` wrapper

**新增功能步驟**：
1. 建立功能元件
2. 在 `right-panel-registry.ts` 註冊
3. 在 `FEATURE_COMPONENTS` 加入映射
4. 完成！

**範例**：
```typescript
{
  id: 'my-feature',
  name: 'My Feature',
  tabLabel: 'myFeature',
  component: () => null,
  order: 4,
  enabled: true,
}
```

### 貢獻者文件

- **左側 Panel**：`docs/CONTRIBUTING_LEFT_PANEL.md`
- **右側 Panel**：`docs/CONTRIBUTING_RIGHT_PANEL.md`

這些文件提供詳細的開發指南，包括：
- 如何新增功能
- 如何替換現有功能
- 如何新增 Tab
- 如何使用臨床資料
- 完整範例

### 架構優勢

1. **低耦合**：功能之間互不依賴
2. **高內聚**：每個功能自包含
3. **易擴展**：透過 registry 輕鬆新增功能
4. **易維護**：清楚的結構和文件
5. **型別安全**：完整的 TypeScript 支援

### 適用場景

這個架構特別適合：
- **Fork 專案**：同事可以保留左側臨床資料，替換右側功能
- **客製化**：醫院可以根據需求新增專屬功能
- **實驗性功能**：可以輕鬆啟用/停用功能測試
- **多團隊開發**：不同團隊可以獨立開發功能

### 技術細節

**Registry 模式**：
- 集中管理所有功能配置
- 支援動態註冊和停用
- 提供輔助函數（getEnabledFeatures, getFeaturesForTab 等）

**Provider 模式**：
- 統一管理狀態
- 避免 prop drilling
- 支援功能間的資料共享

**Feature-based 組織**：
- 每個功能獨立資料夾
- 包含元件、hooks、types
- 易於理解和維護

# 2026-04-18 变更记录

## 网络代理设置拆分为独立分区

**时间**: 00:12

### 改了什么

1. 新增独立的 `网络` 设置分区，把代理开关、代理地址、`noProxy` 和请求超时从 `General` 中移走。
2. 更新 settings section 类型、section 常量、设置页渲染和侧栏导航，让 `network` 成为正式路由分区。
3. 新建 [`src/renderer/src/components/assistant-ui/settings/network-section.tsx`](D:/a_github/first_pi_agent/src/renderer/src/components/assistant-ui/settings/network-section.tsx)，统一承载网络相关表单。
4. `General` 页只保留默认行为、模型路由和时区，不再混入网络配置。

### 为什么改

- 代理配置属于独立的网络能力，单独成组更清楚。
- `General` 页继续承载默认行为会更聚焦，设置结构也更稳定。

### 涉及文件

- `src/renderer/src/components/assistant-ui/settings/types.ts`
- `src/renderer/src/components/assistant-ui/settings/constants.ts`
- `src/renderer/src/components/assistant-ui/settings/network-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/general-section.tsx`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/sidebar.tsx`
- `src/renderer/src/App.tsx`
- `docs/changes/2026-04-18/changes.md`

### 结果

- 网络代理现在是单独一页设置。
- `General` 页的职责更干净，设置导航也能直接表达网络能力的位置。

# 2026-04-15 设置页日志时间跟随时区

> 更新时间：2026-04-15 13:45:34

## 这次改了什么

- 把设置页“数据与系统”里的日志更新时间接到用户设置时区
- 把同页归档线程的“最后更新于”也接到同一套时区解析
- 日志正文预览里常见时间字段会按当前设置时区格式化，覆盖 `app.log` 的 ISO 时间和 `audit.log` 的毫秒时间戳
- 抽出共享的时区格式化入口，避免设置页继续各自手写 `toLocaleString`

## 为什么改

- 之前设置页时区只影响“通用”里的提示文案，系统页时间展示还是跟系统时区走
- 同一页里日志元信息、归档时间和日志正文时间口径分裂，切换时区后体验不一致
- 现在系统页所有关键时间展示统一跟随设置时区

## 涉及文件

- `src/shared/timezone.ts`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`
- `src/renderer/src/components/assistant-ui/settings/constants.ts`
- `src/renderer/src/components/assistant-ui/settings/archived-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/system-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/logs-section.tsx`
- `docs/changes/2026-04-15/settings-timezone-log-sync.md`

## 第 2 轮：回退后恢复

### 时间

- `2026-04-15 15:47:55`

### 这次改了什么

- 恢复 `SystemSection` 的 `timeZone` 透传
- 恢复归档时间按设置时区格式化
- 恢复日志卡片的更新时间按设置时区格式化
- 恢复日志正文里常见时间字段的时区转换
- 恢复共享的 `formatTimeInZone` 入口

### 为什么改

- 上一轮时区联动改动被回退后，系统页时间重新回到系统时区
- 这次把同一组改动按原路径恢复，系统页时间口径重新统一

### 涉及文件

- `src/shared/timezone.ts`
- `src/renderer/src/components/assistant-ui/settings/archived-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/system-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/logs-section.tsx`
- `docs/changes/2026-04-15/settings-timezone-log-sync.md`

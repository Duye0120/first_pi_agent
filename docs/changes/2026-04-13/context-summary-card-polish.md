# Context 卡片 UI 與文案整理

> 更新时间：2026-04-13 14:38:03

## 這次做了什麼

- 調整 context 展開卡片右上角圓環，拿掉外層那個奇怪的圓角底座，直接保留乾淨圓環。
- 把 context 卡片幾個區塊標題收短：
  - `窗口明细` → `窗口详情`
  - `续接摘要` → `续接线索`
  - `任务推进` → `后续`
  - `辅助信息` → `补充`
- 底部 compact 區改成更像操作列的寫法，避免看起來像又疊一塊鬆散卡片。
- 幾句說明文案一起縮短，少一點繞路講法。

## 為什麼要改

- 使用者明確指出右上角圓環外框很怪。
- 底部說明與續接區塊太鬆、太散，視覺節奏不乾淨。
- 文案太囉唆，不夠直白。

## 改到哪些檔案

- `src/renderer/src/components/assistant-ui/context-summary-trigger.tsx`

## 驗證

- `2026-04-13 14:38:03`
  `npx tsc --noEmit --pretty false --project src/renderer/tsconfig.json`

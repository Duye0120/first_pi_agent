# 2026-04-14 移除 Button 与 Badge 的硬编码橘色阴影

**新增时间**：2026-04-14

## 改了什么
去掉了 `src/renderer/src/components/ui/button.tsx` 和 `src/renderer/src/components/ui/badge.tsx` 中 `default` 和 `destructive` variant 下的硬编码橘色及红色盒阴影 (`rgba(249,115,22,X)`)。
统一用 `shadow-[var(--color-control-shadow)]` 替代。

## 为什么改
通过用户界面截图反馈发现，深色模式下的个别按钮和标签（如“添加自定义提供商”和“OpenAI Compatible”徽标）因为被默认赋予了带有固定透明度设定的发亮橘色/红色高亮阴影，导致四周看起来有奇怪的深色与亮色毛边发光边界，这严重破坏了整体的深色暗系调色板。
依据 `AGENTS.md` 规范里“谨慎使用边框”“深浅色应当妥善处理阴影，去除过沉或者不协调阴影”的标准，将全局层级阴影与 CSS 变量对齐。

## 影响的文件
- `src/renderer/src/components/ui/button.tsx`
- `src/renderer/src/components/ui/badge.tsx`

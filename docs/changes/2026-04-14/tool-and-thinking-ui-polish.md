# 思考与工具调用 UI 样式优化

**日期:** 2026-04-14
**时间:** 15:45:00

## 改了什么
去除了聊天区思考（Thinking）和工具调用（Tool Fallback）原本厚重的外层边框、背景色和阴影，调整为了基于颜色分层、留白和缩进（左侧边线）的更轻量级设计。

1. **`reasoning.tsx`**：
   - 移除了 `<Collapsible>` 根节点上的 `border`, `bg`, `shadow`, `rounded-[14px]`。
   - Trigger 从宽度 100% 带有hover底色的整块卡片，改为了紧凑结构（`w-auto`）。
   - 图标背景从原先的硬编码色值，调整为更加语义化且柔和的 `slate` 和 `purple` 系列透明度叠加。
   - 展开时的 Content 采用左侧贯穿的 2px 浅色柔和细线（`border-l-2`）作为视觉引导缩进，取代了原本的内层灰底色盒子。

2. **`tool-fallback.tsx`**：
   - 同样移除了根节点和嵌套 `Content`/`Args`/`Result`/`Error` 的包裹边框与阴影，去除了大量的 `bg-white/70` 和 `rounded-[10px]`。
   - 采用与 `reasoning.tsx` 一致的底层逻辑：使用文字色差和左侧竖线缩进，来明确参数、详情以及错误信息的层次。
   - 清理了冗余包裹状态，与 Chela 更偏好留白减负的设计基调保持统一。

## 为什么改
用户反馈“尤其是思考的那个部分，带上边框实在是太丑了”。
现有的 UI 给每一个小型状态控件加上了嵌套描边（`border` + `shadow` + `bg`），在连续调用多步工具和反复思考时，会产生大量堆叠的“盒子感”，让阅读心智负担大幅增加。
这严重违背了在 `AGENTS.md` 中的设计规范：“UI 设计默认谨慎使用 border... 不要习惯性给开关、轻量按钮、标签、小型状态控件额外再套一层描边容器”。
通过彻底“去边框化”并改为信息层级缩进的做法，减轻了界面中“线”的作用，提升了轻盈感。

## 改到哪些文件
- `src/renderer/src/components/assistant-ui/reasoning.tsx`
- `src/renderer/src/components/ui/tool-fallback.tsx`

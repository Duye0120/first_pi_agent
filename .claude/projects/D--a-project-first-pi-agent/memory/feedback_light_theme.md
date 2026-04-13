---
name: light-theme-preference
description: User wants light theme by default, with customizable colors via CSS variables for future theming
type: feedback
---

默认浅色主题，不要深色系。包括终端和代码块也要亮色。后期要支持用户自定义颜色。

**Why:** 用户偏好浅色系 UI，深色不是他想要的方向，整体视觉要统一。

**How to apply:** 所有 UI 设计和实现以浅色为默认，包括终端和代码块（不要用深底）。颜色全部走 CSS 变量，不硬编码，统一走主题系统。

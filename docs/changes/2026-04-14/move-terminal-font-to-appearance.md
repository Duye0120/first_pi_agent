# 2026-04-14 终端字体设置项迁移

**新增时间**：2026-04-14

## 改了什么
将设置面板中的“终端字号”和“终端字体”控制项，从“终端” (Terminal) 面板迁移到了“外观” (Appearance) 面板中。
同时调整了 `constants.ts` 中的描述，不再暗示终端配置独占字体选项，而是统一将字体与字号相关设置归口到外观选项卡中。

## 为什么改
根据用户反馈与截图，发现终端字体为空导致无法显示文本（打开终端啥都没有），且期望能直接在全局的“外观”配置中找到各种字体相关设定，免去在多个不同 Tab 间切换的心智负担。为了提升可用性与统一性，将与显示直接相关的配置收敛到了 `AppearanceSection`。

## 影响的文件
- `src/renderer/src/components/assistant-ui/settings/appearance-section.tsx` - 新增了“终端字体”和“终端字号”的表单项。
- `src/renderer/src/components/assistant-ui/settings/terminal-section.tsx` - 移除了重复的终端字体控制项。
- `src/renderer/src/components/assistant-ui/settings/constants.ts` - 修正了左侧 Tab 导航的说明文案以反映设置项的重新划分。

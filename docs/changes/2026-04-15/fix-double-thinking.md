# 2026-04-15
## 修复 AssistantRunningNotice 和 Reasoning 组件的视觉重复问题
- 问题：原来 \AssistantRunningNotice\ (显示为带有边框和灰色背景的 \正在思考...\) 会在 \Reasoning\ 组件之前显示。当 \Reasoning\ 开始流式输出时，\AssistantRunningNotice\ 卸载而 \Reasoning\ 挂载，造成了视觉上的生硬切换，用户感觉
出现了两个思考中。
- 解决：修改了 \AssistantRunningNotice\ 和 \AssistantCancelledNotice\，移除原有的外框样式，让它与 \Reasoning\ 折叠按钮收起时的 UI 结构 (即无边框、紫色的 Loader 图标徽标配上字体的样式) 保持一致。使得这两种 Loading 状态在视觉上表现为一个连贯的组件状态变化，而不再是两个各自不同的标签框跳跃变化。
- 影响文件：\src/renderer/src/components/assistant-ui/thread.tsx\


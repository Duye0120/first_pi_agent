# 2026-04-14
## 增加分支版本切换器 (Branch Picker)
- 需求描述：当用户使用了
重新生成或通过编辑并重新发送功能修改消息时，系统会生成同一消息在不同时间轴下的多个版本。用户希望能够有一个直观的版本切换器 (像 \< 1 / 2 >\)
- 解决：引入了 \@assistant-ui/react\ 内置的 \BranchPickerPrimitive\ 支持，在原有的消息动作工具栏 (\ActionBar\) 中增加了 \<MessageBranchPicker>\。
- 修改位置：
  - 更新了 \src/renderer/src/components/assistant-ui/thread.tsx\。
  - 为 \AssistantMessage\ 和 \UserMessage\ 同时配备了分支版本切换器。
  - 通过注入幽灵样式的按钮，完美契合并统一了之前的工具栏视觉风格。


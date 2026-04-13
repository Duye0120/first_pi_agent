# talk-normal 整合到系统 prompt

> 更新时间：2026-04-13 14:46:00

## 这次做了什么

- 把 `talk-normal` 的核心规则整合进系统 prompt 组装层。
- 位置放在 `constitution` 层，优先级紧跟平台宪法之后。
- 目前是默认启用，不需要额外 UI 开关。

## 为什么这样接

- `talk-normal` 本质上就是一段系统提示词，最适合接在 prompt 组装层。
- 这样做不需要改 renderer，不会影响现有聊天 UI、切页或工具调用链。
- 比起塞到前端或临时拼接 user prompt，这种接法更稳定，也更容易以后做开关。

## 涉及文件

- `src/main/prompt-control-plane.ts`
- `src/main/context/engine.ts`
- `docs/changes/2026-04-13/talk-normal-integration.md`

## 规则摘要

- 直接回答，少废话
- 不重述问题
- 避免“不是 X，而是 Y”这类否定式对比
- 简单问题短答，复杂问题结构化但保持紧凑
- 不要用“总结一下 / 如果你愿意我还可以”这类尾句

## 验证

- 这轮先做静态接入，后续配合真实聊天继续观察输出风格

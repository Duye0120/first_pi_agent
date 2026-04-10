# 设置页补充时区配置

> 更新时间：2026-04-10 10:38:00

## 这次改了什么

- 在设置 → 常规里新增了时区配置：
  - 支持 **跟随系统**
  - 支持从统一下拉里选择常见时区，不再让用户手填
- 主进程里新增统一时区工具，给以下链路共用：
  - ambient context 当前时间
  - `get_time` 工具
  - scheduler 每日任务判定
  - reflection “今天” 的日期归属
- 设置文案补了一句，明确后续定时任务 / 心跳会直接吃这套时区。
- 顺手把时区控件收成和其它设置一致的同款下拉，避免一行里混两套 UI。
- 继续把输入框、下拉和有底色的选择控件收成一套 Chela 控件语言：弱描边、贝壳面背景、橙色选中态、轻阴影。
- 修正下拉菜单里 hover / selected 串成两套色系的问题：hover 改回同一套暖橙层级，checked + highlighted 时保持选中色，不再跳成冷色块。

## 为什么要改

之前项目里是 **本机本地时间 + UTC 存储/日期判断混用**。

这样会带来两个坑：

1. 用户明明在东八区，但某些时间逻辑还是按 UTC 切日，凌晨时段很容易错天。
2. 后面要做心跳和定时任务配置时，如果没有统一时区入口，所有模块都得各自补换算，特别容易乱。

这次先把 **“设置里显式选时区”** 这层地基补上，后面再接心跳和任务面板就顺了。

## 改到哪些文件

- `src/shared/contracts.ts`
- `src/shared/timezone.ts`
- `src/main/settings.ts`
- `src/main/ambient-context.ts`
- `src/main/tools/get-time.ts`
- `src/main/scheduler.ts`
- `src/main/reflection/service.ts`
- `src/renderer/src/components/assistant-ui/settings/general-section.tsx`
- `src/renderer/src/components/assistant-ui/settings/constants.ts`
- `src/renderer/src/components/assistant-ui/settings-view.tsx`

## 后续建议

- 下一步可以单开一个“定时任务 / 心跳”设置区，把这些配置显式列出来：
  - 时区
  - 是否启用
  - 执行频率 / 每日时间
  - 最近一次触发时间
  - 下次触发时间
  - 失败重试 / 静默模式

# 2026-04-08 16:01 Compact Summarizer Run Upgrade

## 本次做了什么

- 把 `src/main/context/service.ts` 里的 compact 摘要生成升级成“模型优先、规则兜底”
- 新增 compact summarizer 调用：
  - 复用当前配置的模型条目与 API Key
  - 用 `completeSimple` 生成结构化 JSON 摘要
  - 输出字段固定为 `summary / currentTask / currentState / decisions / openLoops / nextActions / risks`
- 如果模型调用失败、返回非 JSON、或字段不合法，就自动退回到原来的规则式摘要逻辑

## 为什么改

- 之前虽然已经把规则式摘要质量提了一档，但本质上还是 heuristics
- 这对 continuity 的下限够用，但离“像一条独立 compact run”还差一点
- 现在这条链有了真正的 summarizer 调用，摘要质量会更接近真实工作现场；同时兜底还在，不会因为 provider 问题把 compact 整条链做脆

## 涉及文件

- `src/main/context/service.ts`

## 验证

- `2026-04-08 16:01:15` 运行 `pnpm exec tsc --noEmit -p tsconfig.json`
- `2026-04-08 16:01:15` 运行 `pnpm exec tsc --noEmit -p tsconfig.renderer.json`

## 说明

- 这轮还没有把 compact summarizer 单独接到 UI 流式步骤展示里
- 现在的实现是：
  - 模型摘要生成成功：采用模型结果
  - 模型摘要生成失败：回退规则式摘要
- 也就是说，compact 已经开始像一条真正的 context/memory run，但还保留了工程上的稳妥兜底

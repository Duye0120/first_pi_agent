# Context Service 拆分收口（snapshot / budget）

> 时间：2026-04-12 18:35:00
> 触发原因：继续优先打通底层架构，把 `context/service` 从超大单文件拆成清晰分层，避免 `session continuity`、`context summary`、`budget trim` 继续耦合在一起。
> 本次变更：
> - 新增 `src/main/context/snapshot.ts`，承接 context summary、session continuity snapshot、manual/auto compact、snapshot prompt 等持久化与压缩主链路。
> - 新增 `src/main/context/budget.ts`，承接 `createTransformContext()` 及预算分配、短寒暄淘汰、tool result 截断等运行时上下文裁剪逻辑。
> - 更新 `src/main/context/service.ts`，降为 facade，只负责对外 re-export，避免调用方继续依赖大而全实现文件。
> - 清理 `src/main/context/snapshot.ts` 中遗留的预算裁剪逻辑与 `AgentMessage` 依赖，明确 snapshot / budget 边界。
> 为什么这样改：
> - `snapshot` 负责“线程如何续上”，`budget` 负责“上下文如何裁掉”，这是两条不同职责链路，不该继续混写。
> - 保留 `service.ts` 作为稳定入口，可以先完成底层解耦，不打断现有调用方。
> 涉及文件：`src/main/context/service.ts`、`src/main/context/snapshot.ts`、`src/main/context/budget.ts`

## 本轮结果

- context 相关底层能力现在按 `snapshot` 与 `budget` 分层，边界比原来稳定很多。
- `src/main/context/service.ts` 已经退回成组合出口，后续继续重构时不必批量改调用点。
- `session continuity` 与 `context trim` 的职责拆开后，下一步继续抽 policy / orchestration 会更顺。

## 备注

- 本轮只做架构收口与代码拆分，没有额外执行 `build` / `check`。

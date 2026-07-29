# Scene Scheduled Webhook Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:superpowers-subagent-driven-development (recommended) or superpowers:superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在新增/编辑场景中支持多选定时执行 Webhook 服务，并完成前端状态、校验、请求契约和本地 Mock 回显。

**Architecture:** 在 `SceneRecord`/`SceneFormInput` 中增加场景级数组字段，抽屉以受控状态渲染 Checkbox，并在开启、删除、步骤推进和提交时统一修正选择集合。真实后端不在范围内，前端 Mock 只承担本地演示契约。

**Tech Stack:** React、TypeScript、Radix Checkbox、Tailwind CSS、Node test、Vite Mock

---

### Task 1: 锁定前端交互与 Mock 契约

**Files:**
- Modify: `pa-eval-frontend/src/tests/scene-experiments/scene-management-source.test.ts`
- Modify: `pa-eval-frontend/src/tests/scene-experiments/mock-contract.test.ts`

- [ ] 增加失败测试，断言场景字段、Checkbox、多选、分步骤校验、提交净化和摘要展示。
- [ ] 运行定向测试，确认因功能尚未实现而失败。

### Task 2: 实现场景字段与 Webhook 多选交互

**Files:**
- Modify: `pa-eval-frontend/src/modules/scene-experiments/types.ts`
- Modify: `pa-eval-frontend/src/modules/scene-experiments/components/scene-form-drawer.tsx`

- [ ] 为场景模型增加 `supportsScheduledExecution` 与 `defaultScheduledWebhookIds`。
- [ ] 从场景记录初始化并回显定时执行配置。
- [ ] 开启时自动选择首个评估器和 Webhook，关闭时保留选择集合。
- [ ] 在 Webhook 列表中使用 Checkbox 展示多选框。
- [ ] 删除已选服务时修正集合，步骤推进和提交时校验至少选择一项。
- [ ] 在确认创建摘要中展示定时执行配置。

### Task 3: 补齐本地 Mock 演示数据

**Files:**
- Modify: `pa-eval-frontend/mock/scene-experiment-seed.ts`
- Modify: `pa-eval-frontend/mock/scene-experiments.ts`

- [ ] 为种子场景增加定时执行字段。
- [ ] 创建 Mock 场景时原样保存新增字段。
- [ ] 不增加真实后端、数据库或迁移逻辑。

### Task 4: 验证

**Files:**
- Verify only

- [ ] 运行场景测试并确认全部通过。
- [ ] 运行 `npm run typecheck`。
- [ ] 对本次文件运行 ESLint。
- [ ] 运行 `npm run build` 和 `git diff --check`。
- [ ] 在桌面与移动视口验收多选显示、校验、关闭恢复和删除修正。

> 本计划不执行 `git commit`、`git push` 或创建 PR。

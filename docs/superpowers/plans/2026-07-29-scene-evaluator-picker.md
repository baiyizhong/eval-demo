# Scene Evaluator Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:superpowers-subagent-driven-development (recommended) or superpowers:superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在新增/编辑场景中提供仅包含当前项目有效评估器的可搜索多选列表，并在提交时清理无效历史绑定。

**Architecture:** 保留运行试验使用的既有项目评估器查询，新增场景专用有效过滤函数。场景抽屉负责查询和提交净化，模块私有选择组件负责名称本地搜索和复选框交互。

**Tech Stack:** React 19、TypeScript、React Query、Tailwind CSS v4、shadcn/ui Input/Checkbox、Node test runner、Vite Mock。

---

### Task 1: 有效评估器数据契约

**Files:**

- Modify: `pa-eval-frontend/src/modules/tasks/api/evaluator-api.ts`
- Modify: `pa-eval-frontend/mock/_data.ts`
- Modify: `pa-eval-frontend/mock/evaluators.ts`
- Modify: `pa-eval-frontend/src/tests/scene-experiments/project-evaluator-filter.test.ts`

- [x] 为 `TaskEvaluatorRecord` 增加 `enabled: boolean`，并为 Mock 评估器补齐状态。
- [x] 预置一条停用评估器，确保列表过滤可被验证。
- [x] 为有效项目过滤和分页查询添加失败测试。
- [x] 实现 `filterActiveProjectEvaluators` 与 `listActiveProjectEvaluators`。
- [x] 运行 `node --test src/tests/scene-experiments/project-evaluator-filter.test.ts` 并确认通过。

### Task 2: 可搜索多选组件

**Files:**

- Create: `pa-eval-frontend/src/modules/scene-experiments/components/experiment-evaluator-step.tsx`
- Modify: `pa-eval-frontend/src/tests/scene-experiments/scene-management-source.test.ts`

- [x] 添加失败测试，要求组件包含名称搜索、Checkbox、多选回调和两类空状态。
- [x] 实现纯函数 `filterEvaluatorsByName`，执行 trim、忽略大小写的名称包含匹配。
- [x] 实现受控 `ExperimentEvaluatorStep`，展示名称、类型、版本和输出变量。
- [x] 运行场景管理聚焦测试并确认通过。

### Task 3: 接入场景表单并清理无效 ID

**Files:**

- Modify: `pa-eval-frontend/src/modules/scene-experiments/components/scene-form-drawer.tsx`
- Modify: `pa-eval-frontend/src/tests/scene-experiments/scene-management-source.test.ts`

- [x] 添加失败测试，要求场景表单使用 `listActiveProjectEvaluators`、净化历史 ID 并渲染新组件。
- [x] 将场景表单查询切换为场景专用有效查询。
- [x] 让展示、校验、摘要和提交统一使用有效 ID。
- [x] 用 `ExperimentEvaluatorStep` 替换原卡片网格，保留定时执行至少一项约束。
- [x] 确认运行试验组件仍使用 `listProjectEvaluators`。

### Task 4: 验证

**Files:**

- Modify only files required by verification defects.

- [x] 运行 `node --test src/tests/scene-experiments/*.test.ts`。
- [x] 运行 `npm run typecheck`。
- [x] 对本次相关文件运行定向 ESLint。
- [x] 运行 `npm run build`。
- [x] 运行 `git diff --check` 并确认未修改后端、`langfuse/` 或 `dify/`。
- [x] 在新增场景中验证搜索、多选、停用过滤和响应式布局；编辑场景复用同一组件与数据流，并由源码契约测试覆盖历史 ID 清理。

## Plan Self-Review

- 场景选择与运行试验查询保持明确边界。
- 有效状态、搜索规则和历史 ID 清理均有对应任务。
- 没有后端或数据库改动。
- 自动提交步骤按项目规约省略。

# 人工标注保存并下一条 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保存当前单条评分后，从整个标注队列自动进入一条 `PENDING` 数据。

**Architecture:** 在 annotation API helper 中封装全队列下一条未标注查询，单条标注页的 `saveNext` 分支调用该 helper。普通顶部分页导航保持不变，保存后跳转使用独立的未标注 URL 上下文。

**Tech Stack:** React、TypeScript、React Query、React Router、Node test runner

---

### Task 1: 新增下一条未标注查询 helper

**Files:**
- Modify: `pa-eval-frontend/src/modules/app-evaluation/api/annotation-api.ts`
- Create: `pa-eval-frontend/src/tests/app-evaluation/annotation-save-next-pending.test.ts`

- [ ] 编写失败测试，断言列表请求参数为 `page=1`、`pageSize=1`、`status=['PENDING']`。
- [ ] 编写失败测试，断言空列表返回 `null`。
- [ ] 运行测试确认 helper 尚不存在。
- [ ] 实现 `getNextPendingProjectAnnotationItem()`，返回第一条数据或 `null`。
- [ ] 运行测试确认通过。

### Task 2: 接入单条标注页

**Files:**
- Modify: `pa-eval-frontend/src/modules/app-evaluation/views/annotation-item-annotate.tsx`
- Modify: `pa-eval-frontend/src/tests/app-evaluation/annotation-save-next-pending.test.ts`

- [ ] 增加源码行为断言，要求 `saveNext` 调用新 helper，且不再调用普通导航 helper查找保存后的下一项。
- [ ] 增加断言，要求跳转 URL 设置 `page=1` 和 `status=PENDING`。
- [ ] 修改 `handleSubmit()` 的 `saveNext` 分支。
- [ ] 无下一条时显示队列全部完成提示。

### Task 3: 验证

**Files:**
- Verify: `pa-eval-frontend/src/modules/app-evaluation/api/annotation-api.ts`
- Verify: `pa-eval-frontend/src/modules/app-evaluation/views/annotation-item-annotate.tsx`
- Verify: `pa-eval-frontend/src/tests/app-evaluation/annotation-save-next-pending.test.ts`

- [ ] 运行新增测试和现有人工标注相关测试。
- [ ] 运行 `npm run typecheck`。
- [ ] 运行 `npm run build`。
- [ ] 对本次修改文件运行 ESLint，并执行 `git diff --check`。

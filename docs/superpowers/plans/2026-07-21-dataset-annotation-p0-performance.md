# 数据集与人工标注 P0 性能优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:superpowers-subagent-driven-development (recommended) or superpowers:superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在公开接口、筛选、排序、精确计数、同步批量评分语义和导出格式不变的前提下，消除数据集与人工标注 P0 链路的全量内存加载、深 OFFSET 和逐条 SQL。

**Architecture:** PostgreSQL 查询采用轻量候选集与当前页详情两阶段模式；全范围操作使用内部 keyset cursor分块扫描；批量评分和 Trace任务使用批量准备、受控并发及集合 SQL。导出保持原 Job契约，通过两遍分块扫描计算元信息并流式写文件。

**Tech Stack:** Python 3.11、FastAPI、psycopg、PostgreSQL、ClickHouse、pytest、uv、Ruff

---

### Task 1: Dataset 导出使用 keyset cursor

**Files:**
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Test: `pa-eval-backend/tests/test_datasets.py`

- [ ] 新增失败测试，连续批次必须使用 `updated_at/created_at/id` seek条件，SQL不得包含 `COUNT` 或 `OFFSET`，并断言全量无重无漏且顺序不变。
- [ ] 运行 `uv run pytest tests/test_datasets.py -q`，确认新测试因现有 page/OFFSET实现失败。
- [ ] 新增 `list_dataset_items_export_batch_for_user(..., cursor, batch_size)`，查询条件使用三字段降序 keyset并返回下一 cursor。
- [ ] 将 `iter_dataset_items_for_export` 改为循环调用 cursor批次接口；保留 item payload和导出顺序。
- [ ] 运行 Dataset测试确认通过，不提交代码。

### Task 2: Annotation Item 两阶段分页

**Files:**
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Modify: `pa-eval-backend/app/annotations.py`
- Test: `pa-eval-backend/tests/test_annotations.py`

- [ ] 新增失败测试：count/candidate SQL不允许包含 latency/cost/Score JSON LATERAL；详情 SQL只能接收当前页 Item ID。
- [ ] 新增筛选等价测试，覆盖 keyword、status、objectType、assignee、时间、hasScores、metadata/input/output及原排序。
- [ ] 运行目标测试确认失败。
- [ ] 拆出轻量 `_annotation_item_candidate_select_sql`，按筛选需要连接 source，`hasScores`使用 `EXISTS`。
- [ ] 第一阶段执行精确 count和当前页 ID；第二阶段复用详情查询且限制 `aqi.id = ANY(page_ids)`，按候选顺序恢复结果。
- [ ] 将当前页缺失 Trace source enrichment切换为批量 `list_trace_sources`。
- [ ] 运行 Annotation列表测试和完整 `tests/test_annotations.py`。

### Task 3: 全范围 Annotation cursor扫描与批量预览

**Files:**
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Modify: `pa-eval-backend/app/annotations.py`
- Test: `pa-eval-backend/tests/test_annotations.py`

- [ ] 新增失败测试：60k语义数据预览只能按固定批次读取，返回 metrics和前 N samples与旧实现一致。
- [ ] 新增 source筛选测试，确保每批 enrichment后使用原 `_filter_annotation_items`，不改变命中范围。
- [ ] 实现 `iter_annotation_queue_items_for_user` keyset批次迭代器，顺序为 `updatedAt/createdAt/id DESC`。
- [ ] 实现分块 scope/filter扫描帮助函数，支持只累计 metrics、samples或目标 ID。
- [ ] 将 batch-preview切换为该帮助函数，运行目标测试。

### Task 4: 同步批量评分批量化

**Files:**
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Modify: `pa-eval-backend/app/annotations.py`
- Test: `pa-eval-backend/tests/test_annotations.py`

- [ ] 新增失败测试：expected count和大批量确认失败时不得调用任何写接口。
- [ ] 新增部分成功测试：Item任一 Score失败则不完成；成功/失败结果保持目标顺序。
- [ ] 新增 SQL数量测试：Item完成必须使用一个 `UPDATE ... id = ANY(...)`，不得逐 Item连接 PostgreSQL。
- [ ] 第一遍使用 cursor扫描得到精确目标 ID并完成全部校验。
- [ ] 分批调用 `prepare_annotation_score_payloads_batch_for_user`，API Key只读取一次；通过现有 `_write_annotation_score_requests`受控并发写入。
- [ ] 根据 failure中的 annotationItemId聚合 Item结果，并调用新的 `complete_annotation_queue_items_for_user`集合更新。
- [ ] 保持原响应字段、部分成功和顺序，运行目标测试。

### Task 5: Annotation 导出分块流式化

**Files:**
- Modify: `pa-eval-backend/app/annotation_exports.py`
- Modify: `pa-eval-backend/app/annotations.py`
- Test: `pa-eval-backend/tests/test_annotation_exports.py`

- [ ] 新增失败测试：导出数据源只能批量迭代，禁止接收完整 Item列表；生成 ZIP成员、manifest、列、行顺序与旧实现相同。
- [ ] 在 `annotation_exports.py`增加增量 archive writer，支持 CSV/TXT/XLSX逐批写行。
- [ ] 第一遍 cursor扫描计算精确 metrics和 split metadata keys；第二遍按批查询 Score/source并写 archive。
- [ ] 移除超过500条时整 Queue Score回退，所有 Score查询限制当前批范围。
- [ ] preview复用分块扫描，只保留 preview rows。
- [ ] 运行 annotation export及 annotation相关测试。

### Task 6: Trace 标注任务集合复制 Score与 assignment

**Files:**
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Test: `pa-eval-backend/tests/test_annotations.py`

- [ ] 新增失败测试：500个 Item历史 Score查询为一次，复制为一次集合 INSERT，assignment为一次批量 UPSERT。
- [ ] 实现 `_copy_existing_annotation_scores_for_items`，使用候选 values/unnest和窗口排序选择每个 object/config最新 Score。
- [ ] 将 `_assign_annotation_queue_items`改为批量 values UPSERT，保持 assignment planner结果。
- [ ] `create_trace_annotation_task_for_user`按现有批次调用集合函数，保持事务和确定性 Score ID。
- [ ] 保留单 Item包装函数兼容现有调用，运行 Annotation测试。

### Task 7: 性能基准与完整验证

**Files:**
- Create: `pa-eval-backend/scripts/benchmark_dataset_annotation_p0.py`
- Create: `pa-eval-backend/tests/test_dataset_annotation_benchmark.py`

- [ ] 建立同一项目、60,020条 Dataset/Annotation数据的只读基准，输出接口/核心方法冷查询中位数和P95。
- [ ] 在只读 HEAD worktree运行修改前基准，在当前工作区运行修改后基准，使用相同参数和轮次。
- [ ] 验证 Annotation第一页、深分页、preview峰值内存、Dataset导出首/中/末批及批量 SQL数量。
- [ ] 运行 `uv run pytest -q`，要求0失败。
- [ ] 运行 `uv run ruff check app tests scripts/benchmark_dataset_annotation_p0.py`。
- [ ] 运行 `git diff --check`并确认未修改 `langfuse/`、未写入密钥、未执行 commit。

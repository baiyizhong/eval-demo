# 项目数据保留天数原生列修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:superpowers-subagent-driven-development (recommended) or superpowers:superpowers-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 PA Eval 后端创建、更新和查询项目时统一使用 `projects.retention_days`，并让新建项目默认持久化 14 天。

**Architecture:** 保留现有 FastAPI 路由和 PostgreSQL 访问方式，只调整 `LangfuseDatabaseReader` 的项目 SQL 与响应映射。metadata 继续承载 PA 描述和审计扩展，但不再承载数据保留天数；已有 metadata 值不迁移、不清理且不读取。

**Tech Stack:** Python 3.12、FastAPI、Pydantic、psycopg 3、pytest、uv

---

## 文件结构

- 修改 `pa-eval-backend/app/langfuse_db.py`：项目列表、详情、创建、更新、归档返回查询原生列，并从原生列生成 API 响应。
- 修改 `pa-eval-backend/tests/test_projects.py`：增加可记录项目 SQL 的异步游标替身和原生列回归测试。
- 保留 `pa-eval-backend/app/projects.py`：现有 `retentionDays` 1～30 校验和请求映射无需改变。

### Task 1：为项目响应映射补失败测试

**Files:**
- Test: `pa-eval-backend/tests/test_projects.py`

- [ ] **Step 1：添加只读取原生列的测试**

为 `LangfuseDatabaseReader._to_project_payload` 构造同时包含
`retention_days=7` 和 `metadata.paEval.retentionDays=30` 的行，断言响应为 7；再构造
`retention_days=None` 的行，断言响应为 14。

- [ ] **Step 2：运行测试并确认 RED**

Run: `uv run pytest tests/test_projects.py -k "project_payload_uses_native_retention_days" -v`

Expected: FAIL，当前实现返回 metadata 中的 30 或忽略 `retention_days`。

- [ ] **Step 3：最小修改响应映射**

将映射逻辑改为：

```python
retention_days = row.get("retention_days")
...
"retentionDays": retention_days if retention_days is not None else 14,
```

删除从 `metadata.paEval.retentionDays` 取值的逻辑。

- [ ] **Step 4：运行定向测试并确认 GREEN**

Run: `uv run pytest tests/test_projects.py -k "project_payload_uses_native_retention_days" -v`

Expected: PASS。

### Task 2：为创建和更新原生列补失败测试

**Files:**
- Test: `pa-eval-backend/tests/test_projects.py`
- Modify: `pa-eval-backend/app/langfuse_db.py`

- [ ] **Step 1：增加记录 SQL 的项目游标替身**

游标替身覆盖组织查询、项目详情查询、项目 `INSERT`、项目 `UPDATE` 和成员关系写入，记录
SQL 与参数，并返回包含 `retention_days` 的项目行。

- [ ] **Step 2：增加创建项目测试并确认 RED**

分别调用 `create_project_for_user`：传入 `retentionDays=7` 时断言 INSERT 参数
`retention_days == 7`；未传时断言为 14；两种情况均断言 metadata 的 `paEval` 中没有
`retentionDays`。

Run: `uv run pytest tests/test_projects.py -k "create_project_writes_native_retention_days" -v`

Expected: FAIL，当前 INSERT 不包含原生列且 metadata 包含该键。

- [ ] **Step 3：实现创建写入原生列并确认 GREEN**

项目 INSERT 改为：

```sql
INSERT INTO projects (id, name, org_id, retention_days, metadata)
VALUES (%(id)s, %(name)s, %(org_id)s, %(retention_days)s, %(metadata)s)
```

参数使用 `payload.get("retentionDays", 14)`；创建 metadata 时移除
`retentionDays`。

Run: `uv run pytest tests/test_projects.py -k "create_project_writes_native_retention_days" -v`

Expected: PASS。

- [ ] **Step 4：增加更新项目测试并确认 RED**

传入 `retentionDays=21` 时断言 UPDATE 参数为 21；未传时断言使用当前行中的
`retention_days`，从而保持原值；断言更新 metadata 不写入新 retention 键，并保留已有
旧 metadata 键不变。

Run: `uv run pytest tests/test_projects.py -k "update_project_writes_native_retention_days" -v`

Expected: FAIL，当前 UPDATE 不包含原生列。

- [ ] **Step 5：实现更新写入原生列并确认 GREEN**

UPDATE 的 `SET` 增加 `retention_days = %(retention_days)s`，参数使用：

```python
payload.get("retentionDays", current.get("retention_days"))
```

更新 metadata 的补丁中移除 `retentionDays`。

Run: `uv run pytest tests/test_projects.py -k "update_project_writes_native_retention_days" -v`

Expected: PASS。

### Task 3：补齐所有项目查询的原生列并回归验证

**Files:**
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Test: `pa-eval-backend/tests/test_projects.py`

- [ ] **Step 1：增加查询 SQL 失败测试**

调用 `list_projects`、`list_projects_for_user` 和 `get_project_for_user`，断言项目查询选择
`p.retention_days`；创建、更新和归档的 `RETURNING` 也断言包含 `retention_days`。

- [ ] **Step 2：运行测试并确认 RED**

Run: `uv run pytest tests/test_projects.py -k "project_queries_select_native_retention_days" -v`

Expected: FAIL，当前 SELECT/RETURNING 未返回该列。

- [ ] **Step 3：补齐查询字段**

在所有传给 `_to_project_payload` 的项目查询和 RETURNING 中加入
`p.retention_days` 或 `retention_days`，包括项目列表、用户项目列表、项目详情、内部项目
详情、创建、更新、归档/恢复返回。

- [ ] **Step 4：运行项目测试**

Run: `uv run pytest tests/test_projects.py -v`

Expected: 全部 PASS。

- [ ] **Step 5：运行后端完整测试**

Run: `uv run pytest`

Expected: 全部 PASS；如有与本次无关的既有失败，记录具体测试和错误，不修改无关代码。

- [ ] **Step 6：静态检查与 diff 检查**

Run: `uv run ruff check app tests/test_projects.py`

Expected: 无错误。

Run: `git diff --check`

Expected: 无空白错误。检查 `git diff`，确认没有修改 `langfuse/`，也没有数据库迁移。

根据项目规则，本计划不执行 `git commit`、`git push` 或创建 PR。

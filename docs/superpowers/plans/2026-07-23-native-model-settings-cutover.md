# Native Model Settings Cutover Implementation Plan

> **For agentic workers:** Execute inline with TDD; do not commit or push because repository rules prohibit automatic commits.

**Goal:** 删除两张 PA 模型设置影子表，同时保持现有 API、DTO、权限和交互不变。

**Architecture:** 在线读写全部使用 Langfuse Public API，默认模型扩展保存原生连接 ID。旧表只由一次性同步工具读取，Alembic 在同步覆盖完整后删除并支持 downgrade 重建。

**Tech Stack:** Python 3.11、FastAPI、httpx、psycopg、Alembic、pytest、uv、Langfuse Public API。

## Global Constraints

- 不修改 `langfuse/` 和 `dify/`。
- 不直接写 Langfuse 原生表。
- 数据库变更必须 Alembic 可回滚。
- 不执行 commit、push 或 PR。

---

### Task 1: 原生资源契约与加密兼容

**Files:**
- Modify: `pa-eval-backend/app/config.py`
- Modify: `pa-eval-backend/app/langfuse/public_client.py`
- Create: `pa-eval-backend/app/langfuse/encryption.py`
- Test: `pa-eval-backend/tests/test_langfuse_encryption.py`
- Test: `pa-eval-backend/tests/test_langfuse_public_client.py`

- [ ] 先写 AES-256-GCM Langfuse 密文兼容测试与单资源 GET 测试并确认失败。
- [ ] 实现 `decrypt_langfuse_secret(ciphertext, key)` 与 `get_model(model_id)`。
- [ ] 运行上述测试并确认通过。

### Task 2: 在线读写切换

**Files:**
- Modify: `pa-eval-backend/app/langfuse_db.py`
- Create: `pa-eval-backend/tests/test_native_model_settings.py`
- Modify: `pa-eval-backend/tests/test_project_model_settings.py`

- [ ] 先写原生查询、空 Secret 更新、连接 ID 变更、模型同名/异名替换和补偿测试并确认失败。
- [ ] 将八个模型设置方法切换到 Public API；只保留默认模型扩展的本地事务。
- [ ] 删除在线模块对两张旧表的所有 SQL 引用并运行定向测试。

### Task 3: 数据同步和删表迁移

**Files:**
- Create: `pa-eval-backend/app/model_settings_migration.py`
- Create: `pa-eval-backend/scripts/sync_native_model_settings.py`
- Create: `pa-eval-backend/migrations/versions/20260723_0017_drop_model_setting_shadow_tables.py`
- Create: `pa-eval-backend/tests/test_model_settings_migration.py`
- Create: `pa-eval-backend/tests/test_model_settings_contract_migration.py`
- Modify: `pa-eval-backend/tests/test_pa_migration_schema.py`

- [ ] 先写同步幂等、默认引用回填、覆盖预检、upgrade/downgrade 结构测试并确认失败。
- [ ] 实现一次性 Public API 同步和成功映射记录。
- [ ] 实现带锁、覆盖检查和可回滚重建的 0017 迁移。
- [ ] 运行迁移相关测试并确认通过。

### Task 4: 全量验证

- [ ] 运行 `uv run pytest -q`。
- [ ] 运行 `uv run ruff check app tests scripts migrations`。
- [ ] 运行前端 typecheck/build 与模型设置 API 测试。
- [ ] 静态扫描在线模块不再引用旧表，检查 git diff 不包含 `langfuse/` 或 `dify/` 修改。

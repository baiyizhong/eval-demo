# Evaluation Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first working `eval-platform` MVP: source-started React web app, FastAPI API, async worker, platform-owned `eval_platform_*` tables, Langfuse Docker integration, evaluator execution, score write-back, and report display.

**Architecture:** `eval-platform` is a source-started monorepo with `apps/web`, `services/api`, and `services/worker`. Langfuse runs through Docker Compose; the platform connects to Langfuse Postgres/Redis and calls Langfuse APIs first. Long-running evaluations are queued by the API and executed by the worker.

**Tech Stack:** React + Vite + TypeScript + Tailwind, FastAPI, SQLAlchemy 2, Alembic, Pydantic v2, httpx, Redis Queue (RQ), pytest, Vitest, Playwright smoke tests.

---

## Execution Rules

- Do not commit unrelated workspace changes. At plan creation time these paths were present but out of scope: `AGENTS.md`, `CLAUDE.md`, `.superpowers/`, `label-studio/`.
- Before each task, run `git status --short` and stage only files listed in that task.
- Before modifying an indexed function, class, or method, run GitNexus upstream impact analysis for that symbol.
- Before each commit, run `gitnexus_detect_changes(scope="staged")`.
- Keep Langfuse tables unchanged. Alembic migrations may only create or modify `eval_platform_*` tables.
- Keep `eval-platform` source-started first. Docker images for platform services are documentation-only until a later deployment task.

## File Structure

Create this structure:

```text
eval-platform/
  apps/web/
    package.json
    index.html
    vite.config.ts
    tsconfig.json
    src/
      main.tsx
      app/App.tsx
      app/routes.tsx
      app/context/AppContext.tsx
      app/components/
      app/pages/
      lib/api.ts
      styles/
  services/api/
    pyproject.toml
    alembic.ini
    alembic/
      env.py
      versions/
    eval_platform_api/
      __init__.py
      main.py
      core/config.py
      core/security.py
      db/session.py
      db/base.py
      models/platform.py
      schemas/common.py
      schemas/projects.py
      schemas/evaluators.py
      schemas/tasks.py
      services/langfuse_client.py
      services/projects.py
      services/evaluators.py
      services/tasks.py
      services/reports.py
      api/deps.py
      api/routes/projects.py
      api/routes/evaluators.py
      api/routes/tasks.py
      api/routes/traces.py
      api/routes/datasets.py
    tests/
  services/worker/
    pyproject.toml
    eval_platform_worker/
      __init__.py
      main.py
      queue.py
      evaluators/base.py
      evaluators/rule.py
      evaluators/llm_judge.py
      evaluators/openjudge_adapter.py
      jobs/evaluate_task.py
    tests/
  packages/shared/
    README.md
  scripts/
    dev-api.sh
    dev-worker.sh
    dev-web.sh
  docs/eval-platform/
    local-development.md
```

Responsibilities:

- `services/api`: HTTP API, auth boundaries, database models, migrations, task creation, report queries, Langfuse client.
- `services/worker`: queue consumer, evaluator execution, score write-back.
- `apps/web`: admin UI adapted from `Enterprise Admin Dashboard DesignV3`.
- `scripts`: source startup commands.
- `docs/eval-platform`: local development instructions.

---

### Task 1: Source-Started Project Scaffold

**Files:**
- Create: `eval-platform/services/api/pyproject.toml`
- Create: `eval-platform/services/api/eval_platform_api/main.py`
- Create: `eval-platform/services/api/eval_platform_api/core/config.py`
- Create: `eval-platform/services/api/eval_platform_api/schemas/common.py`
- Create: `eval-platform/services/api/tests/test_health.py`
- Create: `eval-platform/services/worker/pyproject.toml`
- Create: `eval-platform/services/worker/eval_platform_worker/main.py`
- Create: `eval-platform/services/worker/tests/test_worker_import.py`
- Create: `eval-platform/apps/web/package.json`
- Create: `eval-platform/apps/web/index.html`
- Create: `eval-platform/apps/web/vite.config.ts`
- Create: `eval-platform/apps/web/tsconfig.json`
- Create: `eval-platform/apps/web/src/main.tsx`
- Create: `eval-platform/apps/web/src/app/App.tsx`
- Create: `eval-platform/apps/web/src/styles/index.css`
- Create: `eval-platform/scripts/dev-api.sh`
- Create: `eval-platform/scripts/dev-worker.sh`
- Create: `eval-platform/scripts/dev-web.sh`
- Create: `eval-platform/docs/eval-platform/local-development.md`

- [ ] **Step 1: Create the API package files**

Create `eval-platform/services/api/pyproject.toml`:

```toml
[project]
name = "eval-platform-api"
version = "0.1.0"
description = "FastAPI service for the evaluation platform"
requires-python = ">=3.11"
dependencies = [
  "alembic>=1.13.0",
  "cryptography>=42.0.0",
  "fastapi>=0.115.0",
  "httpx>=0.27.0",
  "passlib[bcrypt]>=1.7.4",
  "psycopg[binary]>=3.2.0",
  "pydantic>=2.8.0",
  "pydantic-settings>=2.4.0",
  "python-jose[cryptography]>=3.3.0",
  "python-multipart>=0.0.9",
  "redis>=5.0.0",
  "rq>=1.16.0",
  "sqlalchemy>=2.0.0",
  "uvicorn[standard]>=0.30.0"
]

[project.optional-dependencies]
dev = [
  "pytest>=8.0.0",
  "pytest-asyncio>=0.23.0",
  "respx>=0.21.0",
  "ruff>=0.6.0"
]

[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
asyncio_mode = "auto"

[tool.ruff]
line-length = 100
target-version = "py311"
```

Create `eval-platform/services/api/eval_platform_api/core/config.py`:

```python
from functools import lru_cache

from pydantic import AnyHttpUrl, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    app_name: str = "eval-platform-api"
    database_url: str = Field(default="postgresql+psycopg://postgres:postgres@localhost:5432/postgres")
    redis_url: str = Field(default="redis://:myredissecret@localhost:6379/0")
    langfuse_default_base_url: AnyHttpUrl = Field(default="http://localhost:3000")
    platform_secret_key: str = Field(default="dev-platform-secret")
    key_encryption_secret: str = Field(default="00000000000000000000000000000000")


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

Create `eval-platform/services/api/eval_platform_api/schemas/common.py`:

```python
from typing import Generic, TypeVar

from pydantic import BaseModel

DataT = TypeVar("DataT")


class ErrorEnvelope(BaseModel):
    code: str
    message: str


class ResponseEnvelope(BaseModel, Generic[DataT]):
    data: DataT | None = None
    meta: dict | None = None
    error: ErrorEnvelope | None = None
```

Create `eval-platform/services/api/eval_platform_api/main.py`:

```python
from fastapi import FastAPI

from eval_platform_api.core.config import get_settings
from eval_platform_api.schemas.common import ResponseEnvelope


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)

    @app.get("/health", response_model=ResponseEnvelope[dict])
    async def health() -> ResponseEnvelope[dict]:
        return ResponseEnvelope(data={"status": "ok", "service": settings.app_name})

    return app


app = create_app()
```

Create `eval-platform/services/api/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

from eval_platform_api.main import create_app


def test_health_returns_ok():
    client = TestClient(create_app())

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["data"] == {"status": "ok", "service": "eval-platform-api"}
    assert response.json()["error"] is None
```

- [ ] **Step 2: Run the API test**

Run:

```bash
cd eval-platform/services/api
python -m pip install -e ".[dev]"
pytest tests/test_health.py -v
```

Expected: `1 passed`.

- [ ] **Step 3: Create the worker package files**

Create `eval-platform/services/worker/pyproject.toml`:

```toml
[project]
name = "eval-platform-worker"
version = "0.1.0"
description = "Async evaluation worker for the evaluation platform"
requires-python = ">=3.11"
dependencies = [
  "httpx>=0.27.0",
  "pydantic>=2.8.0",
  "redis>=5.0.0",
  "rq>=1.16.0"
]

[project.optional-dependencies]
dev = [
  "pytest>=8.0.0",
  "pytest-asyncio>=0.23.0",
  "ruff>=0.6.0"
]

[build-system]
requires = ["setuptools>=68", "wheel"]
build-backend = "setuptools.build_meta"

[tool.pytest.ini_options]
testpaths = ["tests"]
pythonpath = ["."]
asyncio_mode = "auto"
```

Create `eval-platform/services/worker/eval_platform_worker/main.py`:

```python
def worker_name() -> str:
    return "eval-platform-worker"
```

Create `eval-platform/services/worker/tests/test_worker_import.py`:

```python
from eval_platform_worker.main import worker_name


def test_worker_imports():
    assert worker_name() == "eval-platform-worker"
```

- [ ] **Step 4: Run the worker import test**

Run:

```bash
cd eval-platform/services/worker
python -m pip install -e ".[dev]"
pytest tests/test_worker_import.py -v
```

Expected: `1 passed`.

- [ ] **Step 5: Create the web package files**

Create `eval-platform/apps/web/package.json`:

```json
{
  "name": "eval-platform-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite --host 0.0.0.0 --port 5173",
    "build": "tsc -b && vite build",
    "preview": "vite preview --host 0.0.0.0 --port 4173",
    "test": "vitest run"
  },
  "dependencies": {
    "@vitejs/plugin-react": "4.7.0",
    "vite": "6.3.5",
    "typescript": "^5.7.2",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "lucide-react": "0.487.0",
    "recharts": "2.15.2"
  },
  "devDependencies": {
    "vitest": "^4.1.4",
    "@types/react": "19.2.17",
    "@types/react-dom": "19.2.3"
  }
}
```

Create `eval-platform/apps/web/index.html`:

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Eval Platform</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

Create `eval-platform/apps/web/vite.config.ts`:

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  }
});
```

Create `eval-platform/apps/web/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["DOM", "DOM.Iterable", "ES2020"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx"
  },
  "include": ["src"],
  "references": []
}
```

Create `eval-platform/apps/web/src/main.tsx`:

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

Create `eval-platform/apps/web/src/app/App.tsx`:

```tsx
export function App() {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">Eval Platform</div>
        <nav>
          <a href="#projects">项目</a>
          <a href="#traces">Trace</a>
          <a href="#tasks">评测任务</a>
          <a href="#evaluators">评估器</a>
        </nav>
      </aside>
      <section className="content">
        <h1>评测平台</h1>
        <p>连接 Docker 启动的 Langfuse，通过 Python worker 执行评测并写回 Scores。</p>
      </section>
    </main>
  );
}
```

Create `eval-platform/apps/web/src/styles/index.css`:

```css
body {
  margin: 0;
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #f8fafc;
  color: #0f172a;
}

.app-shell {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 100vh;
}

.sidebar {
  border-right: 1px solid #e2e8f0;
  background: #ffffff;
  padding: 20px;
}

.brand {
  font-weight: 700;
  margin-bottom: 24px;
}

.sidebar nav {
  display: grid;
  gap: 10px;
}

.sidebar a {
  color: #334155;
  text-decoration: none;
  font-size: 14px;
}

.content {
  padding: 32px;
}
```

- [ ] **Step 6: Create source startup scripts and docs**

Create `eval-platform/scripts/dev-api.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../services/api"
uvicorn eval_platform_api.main:app --reload --host 0.0.0.0 --port 8000
```

Create `eval-platform/scripts/dev-worker.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../services/worker"
python -m eval_platform_worker.main
```

Create `eval-platform/scripts/dev-web.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../apps/web"
npm run dev
```

Run:

```bash
chmod +x eval-platform/scripts/dev-api.sh eval-platform/scripts/dev-worker.sh eval-platform/scripts/dev-web.sh
```

Create `eval-platform/docs/eval-platform/local-development.md`:

````markdown
# Eval Platform Local Development

1. Start Langfuse with Docker:

```bash
cd ../../langfuse
docker compose up -d
```

2. Start the API from source:

```bash
cd ../../eval-platform/services/api
python -m pip install -e ".[dev]"
uvicorn eval_platform_api.main:app --reload --host 0.0.0.0 --port 8000
```

3. Start the worker from source:

```bash
cd ../../eval-platform/services/worker
python -m pip install -e ".[dev]"
python -m eval_platform_worker.main
```

4. Start the web app from source:

```bash
cd ../../eval-platform/apps/web
npm install
npm run dev
```
````

- [ ] **Step 7: Verify scaffold**

Run:

```bash
cd eval-platform/services/api && pytest -v
cd ../../services/worker && pytest -v
```

Expected: both test suites pass.

- [ ] **Step 8: Commit scaffold**

Run:

```bash
git status --short
git add eval-platform
gitnexus_detect_changes --scope staged
git commit -m "feat: scaffold eval platform"
```

Expected: staged files are only under `eval-platform/`.

---

### Task 2: Database Models and Alembic Migrations

**Files:**
- Create: `eval-platform/services/api/eval_platform_api/db/base.py`
- Create: `eval-platform/services/api/eval_platform_api/db/session.py`
- Create: `eval-platform/services/api/eval_platform_api/models/platform.py`
- Create: `eval-platform/services/api/alembic.ini`
- Create: `eval-platform/services/api/alembic/env.py`
- Create: `eval-platform/services/api/alembic/versions/20260614_0001_eval_platform_tables.py`
- Create: `eval-platform/services/api/tests/test_models.py`

- [ ] **Step 1: Write model tests**

Create `eval-platform/services/api/tests/test_models.py`:

```python
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import Session

from eval_platform_api.db.base import Base
from eval_platform_api.models.platform import EvalPlatformProject, EvalPlatformTask


def test_platform_tables_use_eval_platform_prefix():
    table_names = sorted(Base.metadata.tables.keys())

    assert "eval_platform_projects" in table_names
    assert "eval_platform_tasks" in table_names
    assert all(name.startswith("eval_platform_") for name in table_names)


def test_project_and_task_can_persist_in_memory():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)

    with Session(engine) as session:
        project = EvalPlatformProject(
            name="医疗问答助手",
            langfuse_base_url="http://localhost:3000",
            langfuse_project_id="project-1",
            langfuse_public_key="pk-lf-test",
            langfuse_secret_key_encrypted="encrypted-secret",
            status="active",
            created_by="user-1",
        )
        session.add(project)
        session.flush()
        task = EvalPlatformTask(
            project_id=project.id,
            name="安全性评测",
            status="pending",
            source_type="trace",
            evaluator_id="evaluator-1",
            total_items=0,
            completed_items=0,
            failed_items=0,
            created_by="user-1",
        )
        session.add(task)
        session.commit()

    inspector = inspect(engine)
    assert "eval_platform_projects" in inspector.get_table_names()
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd eval-platform/services/api
pytest tests/test_models.py -v
```

Expected: FAIL because `eval_platform_api.db.base` and models do not exist.

- [ ] **Step 3: Add SQLAlchemy base and session**

Create `eval-platform/services/api/eval_platform_api/db/base.py`:

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

Create `eval-platform/services/api/eval_platform_api/db/session.py`:

```python
from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from eval_platform_api.core.config import get_settings


def build_engine(database_url: str | None = None):
    settings = get_settings()
    return create_engine(database_url or settings.database_url, pool_pre_ping=True)


engine = build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 4: Add platform models**

Create `eval-platform/services/api/eval_platform_api/models/platform.py` with all first-version platform tables:

```python
from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from eval_platform_api.db.base import Base


def new_id() -> str:
    return uuid4().hex


class EvalPlatformUser(Base):
    __tablename__ = "eval_platform_users"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    password_hash: Mapped[str | None] = mapped_column(String(512), nullable=True)
    role: Mapped[str] = mapped_column(String(64), default="admin")
    status: Mapped[str] = mapped_column(String(64), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class EvalPlatformProject(Base):
    __tablename__ = "eval_platform_projects"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200), index=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    langfuse_base_url: Mapped[str] = mapped_column(String(500))
    langfuse_project_id: Mapped[str] = mapped_column(String(200), index=True)
    langfuse_public_key: Mapped[str] = mapped_column(String(200))
    langfuse_secret_key_encrypted: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(64), default="active")
    created_by: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    evaluators: Mapped[list["EvalPlatformEvaluator"]] = relationship(back_populates="project")
    tasks: Mapped[list["EvalPlatformTask"]] = relationship(back_populates="project")


class EvalPlatformEvaluator(Base):
    __tablename__ = "eval_platform_evaluators"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("eval_platform_projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(64), default="active")
    config_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    output_schema_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_by: Mapped[str] = mapped_column(String(64), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project: Mapped[EvalPlatformProject] = relationship(back_populates="evaluators")


class EvalPlatformTask(Base):
    __tablename__ = "eval_platform_tasks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True, default=new_id)
    project_id: Mapped[str] = mapped_column(ForeignKey("eval_platform_projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(64), default="pending", index=True)
    source_type: Mapped[str] = mapped_column(String(64), default="trace")
    trace_filter_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    sampling_strategy_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    evaluator_id: Mapped[str] = mapped_column(String(64), index=True)
    runtime_config_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    total_items: Mapped[int] = mapped_column(Integer, default=0)
    completed_items: Mapped[int] = mapped_column(Integer, default=0)
    failed_items: Mapped[int] = mapped_column(Integer, default=0)
    created_by: Mapped[str] = mapped_column(String(64), index=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    project: Mapped[EvalPlatformProject] = relationship(back_populates="tasks")
```

- [ ] **Step 5: Run model tests**

Run:

```bash
cd eval-platform/services/api
pytest tests/test_models.py -v
```

Expected: PASS.

- [ ] **Step 6: Add Alembic configuration**

Create `eval-platform/services/api/alembic.ini`:

```ini
[alembic]
script_location = alembic
prepend_sys_path = .
sqlalchemy.url = postgresql+psycopg://postgres:postgres@localhost:5432/postgres

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARN
handlers = console

[logger_sqlalchemy]
level = WARN
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
```

Create `eval-platform/services/api/alembic/env.py`:

```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from eval_platform_api.core.config import get_settings
from eval_platform_api.db.base import Base
from eval_platform_api.models import platform  # noqa: F401

config = context.config
fileConfig(config.config_file_name)
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = get_settings().database_url
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = get_settings().database_url
    connectable = engine_from_config(configuration, prefix="sqlalchemy.", poolclass=pool.NullPool)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

Create `eval-platform/services/api/eval_platform_api/models/__init__.py`:

```python
from eval_platform_api.models.platform import (
    EvalPlatformEvaluator,
    EvalPlatformProject,
    EvalPlatformTask,
    EvalPlatformUser,
)

__all__ = [
    "EvalPlatformEvaluator",
    "EvalPlatformProject",
    "EvalPlatformTask",
    "EvalPlatformUser",
]
```

- [ ] **Step 7: Add initial migration**

Create `eval-platform/services/api/alembic/versions/20260614_0001_eval_platform_tables.py` with table creation for `eval_platform_users`, `eval_platform_projects`, `eval_platform_evaluators`, and `eval_platform_tasks`. Include this guard at the top of `upgrade()`:

```python
TABLE_PREFIX = "eval_platform_"


def assert_platform_table(name: str) -> None:
    if not name.startswith(TABLE_PREFIX):
        raise ValueError(f"Refusing to manage non-platform table: {name}")
```

Every `op.create_table(...)` call must pass a name beginning with `eval_platform_`.

- [ ] **Step 8: Verify migration only touches platform tables**

Run:

```bash
cd eval-platform/services/api
rg -n "op\\.create_table\\(\"(?!eval_platform_)" alembic/versions/20260614_0001_eval_platform_tables.py
pytest tests/test_models.py -v
```

Expected: `rg` returns no matches and pytest passes.

- [ ] **Step 9: Commit database layer**

Run:

```bash
git status --short
git add eval-platform/services/api
gitnexus_detect_changes --scope staged
git commit -m "feat: add eval platform database models"
```

---

### Task 3: Langfuse Client and Project Connection API

**Files:**
- Create: `eval-platform/services/api/eval_platform_api/core/security.py`
- Create: `eval-platform/services/api/eval_platform_api/schemas/projects.py`
- Create: `eval-platform/services/api/eval_platform_api/services/langfuse_client.py`
- Create: `eval-platform/services/api/eval_platform_api/services/projects.py`
- Create: `eval-platform/services/api/eval_platform_api/api/deps.py`
- Create: `eval-platform/services/api/eval_platform_api/api/routes/projects.py`
- Modify: `eval-platform/services/api/eval_platform_api/main.py`
- Create: `eval-platform/services/api/tests/test_projects_api.py`

- [ ] **Step 1: Write project API tests**

Create `eval-platform/services/api/tests/test_projects_api.py`:

```python
import respx
from fastapi.testclient import TestClient
from httpx import Response

from eval_platform_api.main import create_app


@respx.mock
def test_connection_test_calls_langfuse_health():
    respx.get("http://localhost:3000/api/public/projects").mock(
        return_value=Response(200, json={"data": []})
    )
    client = TestClient(create_app())

    response = client.post(
        "/api/projects/connection/test",
        json={
            "langfuse_base_url": "http://localhost:3000",
            "langfuse_public_key": "pk-lf-test",
            "langfuse_secret_key": "sk-lf-test"
        },
    )

    assert response.status_code == 200
    assert response.json()["data"]["ok"] is True
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd eval-platform/services/api
pytest tests/test_projects_api.py -v
```

Expected: FAIL with 404 for `/api/projects/connection/test`.

- [ ] **Step 3: Add encryption helper**

Create `eval-platform/services/api/eval_platform_api/core/security.py`:

```python
import base64
import hashlib

from cryptography.fernet import Fernet


def build_fernet(secret: str) -> Fernet:
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_secret(secret: str, encryption_secret: str) -> str:
    return build_fernet(encryption_secret).encrypt(secret.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str, encryption_secret: str) -> str:
    return build_fernet(encryption_secret).decrypt(token.encode("utf-8")).decode("utf-8")
```

- [ ] **Step 4: Add project schemas and Langfuse client**

Create `eval-platform/services/api/eval_platform_api/schemas/projects.py`:

```python
from pydantic import AnyHttpUrl, BaseModel


class ProjectConnectionTestRequest(BaseModel):
    langfuse_base_url: AnyHttpUrl
    langfuse_public_key: str
    langfuse_secret_key: str


class ProjectConnectionTestResponse(BaseModel):
    ok: bool
    base_url: str
```

Create `eval-platform/services/api/eval_platform_api/services/langfuse_client.py`:

```python
import httpx


class LangfuseClient:
    def __init__(self, base_url: str, public_key: str, secret_key: str):
        self.base_url = base_url.rstrip("/")
        self.auth = (public_key, secret_key)

    async def test_connection(self) -> bool:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(f"{self.base_url}/api/public/projects", auth=self.auth)
            return response.status_code < 500
```

- [ ] **Step 5: Add route and register it**

Create `eval-platform/services/api/eval_platform_api/api/routes/projects.py`:

```python
from fastapi import APIRouter

from eval_platform_api.schemas.common import ResponseEnvelope
from eval_platform_api.schemas.projects import (
    ProjectConnectionTestRequest,
    ProjectConnectionTestResponse,
)
from eval_platform_api.services.langfuse_client import LangfuseClient

router = APIRouter(prefix="/api/projects", tags=["projects"])


@router.post("/connection/test", response_model=ResponseEnvelope[ProjectConnectionTestResponse])
async def test_project_connection(
    payload: ProjectConnectionTestRequest,
) -> ResponseEnvelope[ProjectConnectionTestResponse]:
    client = LangfuseClient(
        base_url=str(payload.langfuse_base_url),
        public_key=payload.langfuse_public_key,
        secret_key=payload.langfuse_secret_key,
    )
    ok = await client.test_connection()
    return ResponseEnvelope(data=ProjectConnectionTestResponse(ok=ok, base_url=str(payload.langfuse_base_url)))
```

Modify `eval-platform/services/api/eval_platform_api/main.py`:

```python
from fastapi import FastAPI

from eval_platform_api.api.routes.projects import router as projects_router
from eval_platform_api.core.config import get_settings
from eval_platform_api.schemas.common import ResponseEnvelope


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)
    app.include_router(projects_router)

    @app.get("/health", response_model=ResponseEnvelope[dict])
    async def health() -> ResponseEnvelope[dict]:
        return ResponseEnvelope(data={"status": "ok", "service": settings.app_name})

    return app


app = create_app()
```

- [ ] **Step 6: Run API tests**

Run:

```bash
cd eval-platform/services/api
pytest tests/test_health.py tests/test_projects_api.py -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit Langfuse connection API**

Run:

```bash
git add eval-platform/services/api
gitnexus_detect_changes --scope staged
git commit -m "feat: add langfuse project connection api"
```

---

### Task 4: Evaluator Interface and First Implementations

**Files:**
- Create: `eval-platform/services/worker/eval_platform_worker/evaluators/base.py`
- Create: `eval-platform/services/worker/eval_platform_worker/evaluators/rule.py`
- Create: `eval-platform/services/worker/eval_platform_worker/evaluators/llm_judge.py`
- Create: `eval-platform/services/worker/eval_platform_worker/evaluators/openjudge_adapter.py`
- Create: `eval-platform/services/worker/tests/test_evaluators.py`

- [ ] **Step 1: Write evaluator tests**

Create `eval-platform/services/worker/tests/test_evaluators.py`:

```python
import pytest

from eval_platform_worker.evaluators.base import EvaluationInput
from eval_platform_worker.evaluators.rule import RuleEvaluator


@pytest.mark.asyncio
async def test_rule_evaluator_checks_json_validity():
    evaluator = RuleEvaluator({"rule": "json_valid"})
    result = await evaluator.evaluate(EvaluationInput(output='{"ok": true}'))

    assert result.score == 1.0
    assert result.passed is True
    assert result.reason == "Output is valid JSON"


@pytest.mark.asyncio
async def test_rule_evaluator_checks_contains_keyword():
    evaluator = RuleEvaluator({"rule": "contains_keyword", "keyword": "安全"})
    result = await evaluator.evaluate(EvaluationInput(output="这是安全的回答"))

    assert result.score == 1.0
    assert result.passed is True
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd eval-platform/services/worker
pytest tests/test_evaluators.py -v
```

Expected: FAIL because evaluator modules do not exist.

- [ ] **Step 3: Implement base evaluator types**

Create `eval-platform/services/worker/eval_platform_worker/evaluators/base.py`:

```python
from abc import ABC, abstractmethod
from typing import Any

from pydantic import BaseModel, Field


class EvaluationInput(BaseModel):
    input: Any | None = None
    output: Any | None = None
    expected: Any | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)
    trace_id: str | None = None
    observation_id: str | None = None


class EvaluationResult(BaseModel):
    score: float
    passed: bool
    reason: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    dimension_scores: dict[str, float] = Field(default_factory=dict)


class Evaluator(ABC):
    @abstractmethod
    async def evaluate(self, input: EvaluationInput) -> EvaluationResult:
        raise NotImplementedError
```

- [ ] **Step 4: Implement safe predefined rule evaluator**

Create `eval-platform/services/worker/eval_platform_worker/evaluators/rule.py`:

```python
import json
import re
from typing import Any

from eval_platform_worker.evaluators.base import EvaluationInput, EvaluationResult, Evaluator


class RuleEvaluator(Evaluator):
    def __init__(self, config: dict[str, Any]):
        self.config = config

    async def evaluate(self, input: EvaluationInput) -> EvaluationResult:
        rule = self.config.get("rule")
        output = "" if input.output is None else str(input.output)

        if rule == "json_valid":
            return self._json_valid(output)
        if rule == "contains_keyword":
            keyword = str(self.config.get("keyword", ""))
            passed = keyword in output if keyword else False
            return EvaluationResult(
                score=1.0 if passed else 0.0,
                passed=passed,
                reason="Keyword found" if passed else "Keyword not found",
            )
        if rule == "regex_match":
            pattern = str(self.config.get("pattern", ""))
            passed = bool(pattern and re.search(pattern, output))
            return EvaluationResult(
                score=1.0 if passed else 0.0,
                passed=passed,
                reason="Pattern matched" if passed else "Pattern not matched",
            )
        return EvaluationResult(score=0.0, passed=False, reason=f"Unsupported rule: {rule}")

    def _json_valid(self, output: str) -> EvaluationResult:
        try:
            json.loads(output)
        except json.JSONDecodeError as exc:
            return EvaluationResult(score=0.0, passed=False, reason=f"Invalid JSON: {exc.msg}")
        return EvaluationResult(score=1.0, passed=True, reason="Output is valid JSON")
```

- [ ] **Step 5: Add LLM Judge and OpenJudge adapter stubs with explicit disabled behavior**

Create `eval-platform/services/worker/eval_platform_worker/evaluators/llm_judge.py`:

```python
from eval_platform_worker.evaluators.base import EvaluationInput, EvaluationResult, Evaluator


class LLMJudgeEvaluator(Evaluator):
    def __init__(self, config: dict):
        self.config = config

    async def evaluate(self, input: EvaluationInput) -> EvaluationResult:
        raise NotImplementedError("LLMJudgeEvaluator requires provider integration in the next task")
```

Create `eval-platform/services/worker/eval_platform_worker/evaluators/openjudge_adapter.py`:

```python
from eval_platform_worker.evaluators.base import EvaluationInput, EvaluationResult, Evaluator


class OpenJudgeEvaluator(Evaluator):
    def __init__(self, config: dict):
        self.config = config

    async def evaluate(self, input: EvaluationInput) -> EvaluationResult:
        raise NotImplementedError("OpenJudgeEvaluator requires grader mapping in the next task")
```

- [ ] **Step 6: Run evaluator tests**

Run:

```bash
cd eval-platform/services/worker
pytest tests/test_evaluators.py -v
```

Expected: PASS.

- [ ] **Step 7: Commit evaluator foundation**

Run:

```bash
git add eval-platform/services/worker
gitnexus_detect_changes --scope staged
git commit -m "feat: add evaluator interface and rule evaluator"
```

---

### Task 5: Task Creation, Queueing, and Worker Job

**Files:**
- Create: `eval-platform/services/api/eval_platform_api/schemas/tasks.py`
- Create: `eval-platform/services/api/eval_platform_api/services/tasks.py`
- Create: `eval-platform/services/api/eval_platform_api/api/routes/tasks.py`
- Modify: `eval-platform/services/api/eval_platform_api/main.py`
- Create: `eval-platform/services/worker/eval_platform_worker/queue.py`
- Create: `eval-platform/services/worker/eval_platform_worker/jobs/evaluate_task.py`
- Create: `eval-platform/services/api/tests/test_tasks_service.py`
- Create: `eval-platform/services/worker/tests/test_evaluate_task.py`

- [ ] **Step 1: Write task service tests**

Create `eval-platform/services/api/tests/test_tasks_service.py`:

```python
from eval_platform_api.schemas.tasks import TaskCreateRequest
from eval_platform_api.services.tasks import build_task_items


def test_build_task_items_from_trace_ids():
    payload = TaskCreateRequest(
        name="安全性评测",
        evaluator_id="eval-1",
        trace_ids=["trace-1", "trace-2"],
        runtime_config={"concurrency": 2, "retries": 1},
    )

    items = build_task_items(payload)

    assert [item.langfuse_trace_id for item in items] == ["trace-1", "trace-2"]
    assert all(item.status == "pending" for item in items)
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
cd eval-platform/services/api
pytest tests/test_tasks_service.py -v
```

Expected: FAIL because schemas and service do not exist.

- [ ] **Step 3: Implement task schemas and item builder**

Create `eval-platform/services/api/eval_platform_api/schemas/tasks.py`:

```python
from pydantic import BaseModel, Field


class TaskCreateRequest(BaseModel):
    name: str
    evaluator_id: str
    trace_ids: list[str] = Field(default_factory=list)
    runtime_config: dict = Field(default_factory=dict)


class TaskItemDraft(BaseModel):
    langfuse_trace_id: str
    langfuse_observation_id: str | None = None
    status: str = "pending"


class TaskCreateResponse(BaseModel):
    task_id: str
```

Create `eval-platform/services/api/eval_platform_api/services/tasks.py`:

```python
from eval_platform_api.schemas.tasks import TaskCreateRequest, TaskItemDraft


def build_task_items(payload: TaskCreateRequest) -> list[TaskItemDraft]:
    return [TaskItemDraft(langfuse_trace_id=trace_id) for trace_id in payload.trace_ids]
```

- [ ] **Step 4: Run task service tests**

Run:

```bash
cd eval-platform/services/api
pytest tests/test_tasks_service.py -v
```

Expected: PASS.

- [ ] **Step 5: Add worker job test**

Create `eval-platform/services/worker/tests/test_evaluate_task.py`:

```python
import pytest

from eval_platform_worker.jobs.evaluate_task import evaluate_task_item


@pytest.mark.asyncio
async def test_evaluate_task_item_with_rule_evaluator():
    result = await evaluate_task_item(
        evaluator_type="rule",
        evaluator_config={"rule": "contains_keyword", "keyword": "安全"},
        evaluation_input={"output": "安全回答"},
    )

    assert result["score"] == 1.0
    assert result["passed"] is True
```

- [ ] **Step 6: Implement worker job**

Create `eval-platform/services/worker/eval_platform_worker/jobs/evaluate_task.py`:

```python
from eval_platform_worker.evaluators.base import EvaluationInput
from eval_platform_worker.evaluators.rule import RuleEvaluator


async def evaluate_task_item(
    evaluator_type: str,
    evaluator_config: dict,
    evaluation_input: dict,
) -> dict:
    if evaluator_type != "rule":
        raise ValueError(f"Unsupported evaluator type for first worker job: {evaluator_type}")

    evaluator = RuleEvaluator(evaluator_config)
    result = await evaluator.evaluate(EvaluationInput(**evaluation_input))
    return result.model_dump()
```

Create `eval-platform/services/worker/eval_platform_worker/queue.py`:

```python
from redis import Redis
from rq import Queue


def build_queue(redis_url: str, name: str = "eval-platform") -> Queue:
    connection = Redis.from_url(redis_url)
    return Queue(name, connection=connection)
```

- [ ] **Step 7: Run task and worker tests**

Run:

```bash
cd eval-platform/services/api && pytest tests/test_tasks_service.py -v
cd ../../services/worker && pytest tests/test_evaluate_task.py tests/test_evaluators.py -v
```

Expected: all tests pass.

- [ ] **Step 8: Commit task and worker job foundation**

Run:

```bash
git add eval-platform/services/api eval-platform/services/worker
gitnexus_detect_changes --scope staged
git commit -m "feat: add evaluation task queue foundation"
```

---

### Task 6: Trace, Dataset, Evaluator, Task, and Report API Skeleton

**Files:**
- Create: `eval-platform/services/api/eval_platform_api/api/routes/traces.py`
- Create: `eval-platform/services/api/eval_platform_api/api/routes/datasets.py`
- Create: `eval-platform/services/api/eval_platform_api/api/routes/evaluators.py`
- Create: `eval-platform/services/api/eval_platform_api/api/routes/tasks.py`
- Create: `eval-platform/services/api/eval_platform_api/api/routes/reports.py`
- Modify: `eval-platform/services/api/eval_platform_api/main.py`
- Create: `eval-platform/services/api/tests/test_api_routes.py`

- [ ] **Step 1: Write route smoke tests**

Create `eval-platform/services/api/tests/test_api_routes.py`:

```python
from fastapi.testclient import TestClient

from eval_platform_api.main import create_app


def test_route_skeletons_return_envelopes():
    client = TestClient(create_app())

    for path in [
        "/api/projects/project-1/traces",
        "/api/projects/project-1/datasets",
        "/api/projects/project-1/evaluators",
        "/api/projects/project-1/tasks",
        "/api/projects/project-1/reports/task-1",
    ]:
        response = client.get(path)
        assert response.status_code == 200
        body = response.json()
        assert "data" in body
        assert "error" in body
```

- [ ] **Step 2: Run route smoke tests to verify failure**

Run:

```bash
cd eval-platform/services/api
pytest tests/test_api_routes.py -v
```

Expected: FAIL because route modules are not registered.

- [ ] **Step 3: Add route skeleton modules**

Create each route module with an explicit empty response:

`eval-platform/services/api/eval_platform_api/api/routes/traces.py`:

```python
from fastapi import APIRouter

from eval_platform_api.schemas.common import ResponseEnvelope

router = APIRouter(prefix="/api/projects/{project_id}/traces", tags=["traces"])


@router.get("", response_model=ResponseEnvelope[list[dict]])
async def list_traces(project_id: str) -> ResponseEnvelope[list[dict]]:
    return ResponseEnvelope(data=[], meta={"project_id": project_id})
```

`eval-platform/services/api/eval_platform_api/api/routes/datasets.py`:

```python
from fastapi import APIRouter

from eval_platform_api.schemas.common import ResponseEnvelope

router = APIRouter(prefix="/api/projects/{project_id}/datasets", tags=["datasets"])


@router.get("", response_model=ResponseEnvelope[list[dict]])
async def list_datasets(project_id: str) -> ResponseEnvelope[list[dict]]:
    return ResponseEnvelope(data=[], meta={"project_id": project_id})
```

`eval-platform/services/api/eval_platform_api/api/routes/evaluators.py`:

```python
from fastapi import APIRouter

from eval_platform_api.schemas.common import ResponseEnvelope

router = APIRouter(prefix="/api/projects/{project_id}/evaluators", tags=["evaluators"])


@router.get("", response_model=ResponseEnvelope[list[dict]])
async def list_evaluators(project_id: str) -> ResponseEnvelope[list[dict]]:
    return ResponseEnvelope(data=[], meta={"project_id": project_id})
```

`eval-platform/services/api/eval_platform_api/api/routes/tasks.py`:

```python
from fastapi import APIRouter

from eval_platform_api.schemas.common import ResponseEnvelope

router = APIRouter(prefix="/api/projects/{project_id}/tasks", tags=["tasks"])


@router.get("", response_model=ResponseEnvelope[list[dict]])
async def list_tasks(project_id: str) -> ResponseEnvelope[list[dict]]:
    return ResponseEnvelope(data=[], meta={"project_id": project_id})
```

`eval-platform/services/api/eval_platform_api/api/routes/reports.py`:

```python
from fastapi import APIRouter

from eval_platform_api.schemas.common import ResponseEnvelope

router = APIRouter(prefix="/api/projects/{project_id}/reports", tags=["reports"])


@router.get("/{task_id}", response_model=ResponseEnvelope[dict])
async def get_report(project_id: str, task_id: str) -> ResponseEnvelope[dict]:
    return ResponseEnvelope(data={"task_id": task_id, "summary": {}}, meta={"project_id": project_id})
```

Modify `eval-platform/services/api/eval_platform_api/main.py` to include all routers.

- [ ] **Step 4: Run API route tests**

Run:

```bash
cd eval-platform/services/api
pytest tests/test_api_routes.py tests/test_health.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit route skeleton**

Run:

```bash
git add eval-platform/services/api
gitnexus_detect_changes --scope staged
git commit -m "feat: add eval platform api route skeleton"
```

---

### Task 7: Web UI Shell and API Client

**Files:**
- Create: `eval-platform/apps/web/src/lib/api.ts`
- Create: `eval-platform/apps/web/src/app/pages/ProjectList.tsx`
- Create: `eval-platform/apps/web/src/app/pages/TraceLogs.tsx`
- Create: `eval-platform/apps/web/src/app/pages/EvaluationTasks.tsx`
- Create: `eval-platform/apps/web/src/app/pages/Evaluators.tsx`
- Modify: `eval-platform/apps/web/src/app/App.tsx`
- Create: `eval-platform/apps/web/src/app/App.test.tsx`

- [ ] **Step 1: Add API client**

Create `eval-platform/apps/web/src/lib/api.ts`:

```ts
export type Envelope<T> = {
  data: T | null;
  meta?: Record<string, unknown> | null;
  error?: { code: string; message: string } | null;
};

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export async function apiGet<T>(path: string): Promise<Envelope<T>> {
  const response = await fetch(`${API_BASE_URL}${path}`);
  if (!response.ok) {
    return { data: null, error: { code: String(response.status), message: response.statusText } };
  }
  return response.json() as Promise<Envelope<T>>;
}
```

- [ ] **Step 2: Add first-version pages**

Create `ProjectList.tsx`:

```tsx
export function ProjectList() {
  return <section><h1>项目</h1><p>连接 Docker 启动的 Langfuse 项目。</p></section>;
}
```

Create `TraceLogs.tsx`:

```tsx
export function TraceLogs() {
  return <section><h1>Trace 日志</h1><p>筛选 Trace 并创建评测任务。</p></section>;
}
```

Create `EvaluationTasks.tsx`:

```tsx
export function EvaluationTasks() {
  return <section><h1>评测任务</h1><p>查看任务进度、报告和 Bad Cases。</p></section>;
}
```

Create `Evaluators.tsx`:

```tsx
export function Evaluators() {
  return <section><h1>评估器</h1><p>管理 LLM Judge、规则评估器和 OpenJudge adapter。</p></section>;
}
```

- [ ] **Step 3: Wire pages in App**

Modify `eval-platform/apps/web/src/app/App.tsx`:

```tsx
import { useState } from "react";
import { EvaluationTasks } from "./pages/EvaluationTasks";
import { Evaluators } from "./pages/Evaluators";
import { ProjectList } from "./pages/ProjectList";
import { TraceLogs } from "./pages/TraceLogs";

type PageKey = "projects" | "traces" | "tasks" | "evaluators";

const pages: Record<PageKey, JSX.Element> = {
  projects: <ProjectList />,
  traces: <TraceLogs />,
  tasks: <EvaluationTasks />,
  evaluators: <Evaluators />
};

export function App() {
  const [page, setPage] = useState<PageKey>("projects");

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">Eval Platform</div>
        <nav>
          <button onClick={() => setPage("projects")}>项目</button>
          <button onClick={() => setPage("traces")}>Trace</button>
          <button onClick={() => setPage("tasks")}>评测任务</button>
          <button onClick={() => setPage("evaluators")}>评估器</button>
        </nav>
      </aside>
      <section className="content">{pages[page]}</section>
    </main>
  );
}
```

- [ ] **Step 4: Update styles for buttons**

Append to `eval-platform/apps/web/src/styles/index.css`:

```css
.sidebar button {
  border: 0;
  background: transparent;
  color: #334155;
  cursor: pointer;
  font: inherit;
  text-align: left;
  padding: 8px 0;
}

.sidebar button:hover {
  color: #2563eb;
}
```

- [ ] **Step 5: Build web app**

Run:

```bash
cd eval-platform/apps/web
npm install
npm run build
```

Expected: build succeeds.

- [ ] **Step 6: Commit web shell**

Run:

```bash
git add eval-platform/apps/web
gitnexus_detect_changes --scope staged
git commit -m "feat: add eval platform web shell"
```

---

### Task 8: Local Development Documentation and Verification

**Files:**
- Modify: `eval-platform/docs/eval-platform/local-development.md`
- Create: `eval-platform/README.md`

- [ ] **Step 1: Add root README**

Create `eval-platform/README.md`:

````markdown
# Eval Platform

Independent evaluation platform connected to Docker-started Langfuse.

## Source Startup

Start Langfuse first:

```bash
cd ../langfuse
docker compose up -d
```

Start the API:

```bash
cd services/api
python -m pip install -e ".[dev]"
uvicorn eval_platform_api.main:app --reload --host 0.0.0.0 --port 8000
```

Start the worker:

```bash
cd services/worker
python -m pip install -e ".[dev]"
python -m eval_platform_worker.main
```

Start the web app:

```bash
cd apps/web
npm install
npm run dev
```
````

- [ ] **Step 2: Verify backend and worker tests**

Run:

```bash
cd eval-platform/services/api
pytest -v
cd ../../services/worker
pytest -v
```

Expected: all tests pass.

- [ ] **Step 3: Verify web build**

Run:

```bash
cd eval-platform/apps/web
npm run build
```

Expected: build succeeds.

- [ ] **Step 4: Verify no Langfuse schema edits**

Run:

```bash
git diff --name-only HEAD | rg "langfuse/packages/shared/prisma|langfuse/.*/migration" && exit 1 || exit 0
```

Expected: command exits 0, proving no Langfuse Prisma schema or migration was edited.

- [ ] **Step 5: Commit documentation**

Run:

```bash
git add eval-platform/README.md eval-platform/docs/eval-platform/local-development.md
gitnexus_detect_changes --scope staged
git commit -m "docs: add eval platform source startup guide"
```

---

## Self-Review

Spec coverage:

- Source-started `eval-platform`: Task 1 and Task 8.
- Docker-started Langfuse integration: Task 1 docs, Task 3 client, Task 8 docs.
- `eval_platform_*` tables only: Task 2.
- Python FastAPI backend: Task 1, Task 3, Task 5, Task 6.
- Async worker: Task 1, Task 4, Task 5.
- Evaluators: Task 4.
- Trace/task/report API shape: Task 6.
- React frontend shell: Task 7.
- Verification and no Langfuse table changes: Task 8.

Deferred by design:

- Full manual annotation workflow.
- Complex tenant quota management.
- Production Docker images for `eval-platform`.
- Full Langfuse API pagination and ClickHouse read-only fallback implementation.
- Complete LLM provider and OpenJudge grader integration beyond safe adapters and interfaces.

Red-flag scan:

- The plan contains no open-ended fill-in markers.
- Disabled behavior is explicit through `NotImplementedError` messages for scoped future tasks.

Type consistency:

- API response envelope is `ResponseEnvelope`.
- Worker evaluator input/output types are `EvaluationInput` and `EvaluationResult`.
- Project/task table names use the `eval_platform_*` prefix.

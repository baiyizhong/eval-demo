# Eval Platform Local Development

Run these commands from the repository root unless noted.

1. Start Langfuse with Docker:

```bash
cd langfuse
docker compose up -d
```

2. Start the API from source:

```bash
cd eval-platform/services/api
python -m pip install -e ".[dev]"
uvicorn eval_platform_api.main:app --reload --host 0.0.0.0 --port 8000
```

3. Start the worker from source:

```bash
cd eval-platform/services/worker
python -m pip install -e ".[dev]"
python -m eval_platform_worker.main
```

The worker command currently performs a scaffold import/run check and exits. A long-running queue
consumer will be added in the worker queue task.

4. Start the web app from source:

```bash
cd eval-platform/apps/web
npm install
npm run dev
```

## Verification

Run the API tests:

```bash
cd eval-platform/services/api
pytest -v
```

Run the worker tests:

```bash
cd eval-platform/services/worker
pytest -v
```

Build the web app:

```bash
cd eval-platform/apps/web
npm run build
```

Confirm no Langfuse Prisma schema or migration files changed:

```bash
git diff --name-only HEAD | rg "langfuse/packages/shared/prisma|langfuse/.*/migration" && exit 1 || exit 0
```

# Eval Platform

Independent evaluation platform connected to Docker-started Langfuse.

## Source Startup

Run each command block below from the `eval-platform/` directory in a separate terminal.

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

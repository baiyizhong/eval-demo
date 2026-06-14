# Eval Platform Local Development

Run these commands from the repository root.

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

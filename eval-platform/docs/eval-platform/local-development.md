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

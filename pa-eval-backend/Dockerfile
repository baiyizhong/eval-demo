FROM node:24-bookworm-slim AS pi-base
RUN apt-get update \
  && apt-get install -y --no-install-recommends bash ca-certificates git ripgrep \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent

FROM python:3.12-slim
COPY --from=pi-base /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=pi-base /usr/local/bin/pi /usr/local/bin/pi
COPY --from=pi-base /usr/local/bin/node /usr/local/bin/node
RUN apt-get update \
  && apt-get install -y --no-install-recommends ripgrep git \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN pip install --no-cache-dir uv && uv sync --frozen --no-dev
COPY app ./app
COPY migrations ./migrations

RUN mkdir -p /var/lib/pa-eval/skills /tmp/pa-eval-skill
VOLUME ["/var/lib/pa-eval/skills"]

ENV PA_EVAL_SKILL_ROOT=/var/lib/pa-eval/skills
ENV PA_EVAL_PI_BINARY=pi
ENV PA_EVAL_PI_WORKDIR=/tmp/pa-eval-skill

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

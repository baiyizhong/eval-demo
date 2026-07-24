"""统一日志配置。

- 按 Settings 配置级别、目录、保留天数（按天轮转）。
- 支持文本与 JSON 两种格式；JSON 用于生产，文本用于本地开发。
- 注入 tx_id / method / path / status / duration_ms 等上下文字段。
"""

from __future__ import annotations

import json
import logging
import os
from logging.handlers import TimedRotatingFileHandler
from typing import Any

from app.config import Settings
from app.tx_context import current_tx_id


class TxContextFilter(logging.Filter):
    """将 contextvars 中的 txId 注入到每条日志记录。"""

    # 文本格式中会被引用的扩展字段，缺失时给默认值避免 KeyError
    EXTRA_FIELDS = {
        "tx_id": "",
        "method": "",
        "path": "",
        "status": "",
        "duration_ms": "",
        "user_id": "",
        "project_id": "",
        "job_id": "",
    }

    def filter(self, record: logging.LogRecord) -> bool:
        record.tx_id = current_tx_id()
        for field, default in self.EXTRA_FIELDS.items():
            if not hasattr(record, field):
                setattr(record, field, default)
        return True


class JsonFormatter(logging.Formatter):
    """轻量 JSON 日志格式，不依赖第三方库。"""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "tx_id": getattr(record, "tx_id", ""),
        }
        for field in (
            "method",
            "path",
            "status",
            "duration_ms",
            "user_id",
            "project_id",
            "job_id",
        ):
            value = getattr(record, field, None)
            if value is not None:
                payload[field] = value
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def _build_formatter(json_enabled: bool) -> logging.Formatter:
    if json_enabled:
        return JsonFormatter(datefmt="%Y-%m-%dT%H:%M:%S%z")
    return logging.Formatter(
        fmt="%(asctime)s %(levelname)-7s [%(name)s] tx=%(tx_id)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S%z",
    )


def setup_logging(settings: Settings) -> None:
    """根据 Settings 初始化 root logger，幂等。"""

    level = getattr(logging, settings.pa_eval_log_level.upper(), logging.INFO)
    formatter = _build_formatter(settings.pa_eval_log_json_enabled)
    tx_filter = TxContextFilter()

    root = logging.getLogger()
    # 幂等：重复调用先清理已注册的 handler，避免重复输出
    for handler in list(root.handlers):
        root.removeHandler(handler)
    root.setLevel(level)

    stream_handler = logging.StreamHandler()
    stream_handler.setLevel(level)
    stream_handler.setFormatter(formatter)
    stream_handler.addFilter(tx_filter)
    root.addHandler(stream_handler)

    log_dir = settings.pa_eval_log_dir
    if log_dir:
        os.makedirs(log_dir, exist_ok=True)
        file_path = os.path.join(log_dir, settings.pa_eval_log_file_name)
        file_handler = TimedRotatingFileHandler(
            file_path,
            when="midnight",
            backupCount=settings.pa_eval_log_retention_days,
            encoding="utf-8",
        )
        file_handler.suffix = "%Y-%m-%d"
        file_handler.setLevel(level)
        file_handler.setFormatter(formatter)
        file_handler.addFilter(tx_filter)
        root.addHandler(file_handler)

    # uvicorn 的 access log 走自己的 logger，对齐级别与格式
    for noisy in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(noisy)
        logger.setLevel(level)
        logger.addFilter(tx_filter)

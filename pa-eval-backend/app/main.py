import logging
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.annotations import (
    router as annotations_router,
    start_trace_bulk_job_worker,
)
from app.admin_users import router as admin_users_router
from app.audit import (
    admin_router,
    audit_http_request,
    audit_router,
)
from app.auto_evaluations import router as auto_evaluations_router
from app.auth import router as auth_router
from app.config import get_settings
from app.data_access import (
    close_data_access_resources,
    get_data_access_pool_settings,
    start_data_access_resources,
)
from app.datasets import router as datasets_router
from app.errors import BusinessError
from app.evaluators import router as evaluators_router
from app.observability import router as observability_router
from app.organizations import router as organizations_router
from app.projects import router as projects_router
from app.response import failure, success
from app.scheduled_jobs import (
    router as scheduled_jobs_router,
    start_scheduled_job_scheduler,
)
from app.logging_config import setup_logging
from app.tx_context import bind_tx_id, new_tx_id, reset_tx_id
from app.users import router as user_router


logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    settings = get_settings()
    pool_settings = get_data_access_pool_settings()
    setup_logging(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        scheduler = None
        trace_bulk_worker = None
        await start_data_access_resources(settings, pool_settings)
        try:
            scheduler = start_scheduled_job_scheduler(settings)
            trace_bulk_worker = start_trace_bulk_job_worker(settings)
            yield
        finally:
            try:
                if trace_bulk_worker is not None:
                    await trace_bulk_worker.stop()
            finally:
                try:
                    if scheduler is not None:
                        await scheduler.stop()
                finally:
                    await close_data_access_resources()

    app = FastAPI(title="PA Eval Backend", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(auth_router)
    app.include_router(organizations_router)
    app.include_router(projects_router)
    app.include_router(evaluators_router)
    app.include_router(auto_evaluations_router)
    app.include_router(datasets_router)
    app.include_router(annotations_router)
    app.include_router(observability_router)
    app.include_router(scheduled_jobs_router)
    app.include_router(admin_router)
    app.include_router(admin_users_router)
    app.include_router(audit_router)
    app.include_router(user_router)

    @app.middleware("http")
    async def request_context(request: Request, call_next: Any) -> Any:
        tx_id = request.headers.get("X-Request-Id") or new_tx_id()
        token = bind_tx_id(tx_id)
        request.state.tx_id = tx_id
        start = time.perf_counter()
        try:
            response: Any = await call_next(request)
            response.headers["X-Request-Id"] = tx_id
            logger.info(
                "%s %s -> %s %dms",
                request.method,
                request.url.path,
                response.status_code,
                int((time.perf_counter() - start) * 1000),
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": int((time.perf_counter() - start) * 1000),
                },
            )
            return response
        finally:
            reset_tx_id(token)

    @app.middleware("http")
    async def audit_write_requests(request: Request, call_next: Any) -> Any:
        response = await call_next(request)
        await audit_http_request(
            request,
            status_code=response.status_code,
            settings=settings,
        )
        return response

    @app.get("/health")
    async def health() -> dict[str, Any]:
        return success({"status": "ok"})

    @app.exception_handler(BusinessError)
    async def business_error_handler(
        request: Request,
        exc: BusinessError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content=failure(exc.code, exc.message),
        )

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=failure(1001, "请求参数错误"),
        )

    return app


app = create_app()

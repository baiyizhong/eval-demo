from typing import Any
from contextlib import asynccontextmanager

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
from app.users import router as user_router


def create_app() -> FastAPI:
    settings = get_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        scheduler = start_scheduled_job_scheduler(settings)
        trace_bulk_worker = start_trace_bulk_job_worker(settings)
        try:
            yield
        finally:
            await trace_bulk_worker.stop()
            await scheduler.stop()

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

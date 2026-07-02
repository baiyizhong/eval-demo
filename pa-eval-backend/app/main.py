from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.errors import BusinessError
from app.organizations import router as organizations_router
from app.projects import router as projects_router
from app.response import failure, success


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="PA Eval Backend")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(organizations_router)
    app.include_router(projects_router)

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

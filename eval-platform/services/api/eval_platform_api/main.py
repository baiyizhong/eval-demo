from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from eval_platform_api.api.routes.projects import router as projects_router
from eval_platform_api.core.config import get_settings
from eval_platform_api.schemas.common import ResponseEnvelope


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)
    app.include_router(projects_router)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        _request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        errors = [
            {key: value for key, value in error.items() if key != "input"}
            for error in exc.errors()
        ]
        return JSONResponse(
            status_code=422,
            content=jsonable_encoder({"detail": errors}),
        )

    @app.get("/health", response_model=ResponseEnvelope[dict])
    async def health() -> ResponseEnvelope[dict]:
        return ResponseEnvelope(data={"status": "ok", "service": settings.app_name})

    return app


app = create_app()

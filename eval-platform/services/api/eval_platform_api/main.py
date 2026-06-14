from fastapi import FastAPI

from eval_platform_api.core.config import get_settings
from eval_platform_api.schemas.common import ResponseEnvelope


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name)

    @app.get("/health", response_model=ResponseEnvelope[dict])
    async def health() -> ResponseEnvelope[dict]:
        return ResponseEnvelope(data={"status": "ok", "service": settings.app_name})

    return app


app = create_app()

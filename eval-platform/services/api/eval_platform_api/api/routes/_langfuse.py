from eval_platform_api.core.config import Settings
from eval_platform_api.schemas.common import ErrorEnvelope, ResponseEnvelope
from eval_platform_api.services.langfuse_client import LangfuseClient


def build_configured_langfuse_client(settings: Settings) -> LangfuseClient | None:
    secret = (
        settings.langfuse_secret_key.get_secret_value()
        if settings.langfuse_secret_key is not None
        else ""
    )
    public_key = settings.langfuse_public_key or ""
    if not public_key.strip() or not secret.strip():
        return None

    return LangfuseClient(
        base_url=str(settings.langfuse_default_base_url),
        public_key=public_key,
        secret_key=secret,
    )


def langfuse_not_configured_response() -> ResponseEnvelope:
    return ResponseEnvelope(
        error=ErrorEnvelope(
            code="langfuse_not_configured",
            message="Langfuse API credentials are not configured.",
        )
    )


def langfuse_request_failed_response() -> ResponseEnvelope:
    return ResponseEnvelope(
        error=ErrorEnvelope(
            code="langfuse_request_failed",
            message="Unable to read data from Langfuse API.",
        )
    )

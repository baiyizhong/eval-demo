import anyio
import httpx

from app.config import Settings
from app.langfuse_client import LangfuseAdminClient


def test_langfuse_client_reuses_http_connection_pool(monkeypatch) -> None:
    instances = []

    class FakeAsyncClient:
        def __init__(self, **kwargs) -> None:
            self.kwargs = kwargs
            self.closed = False
            instances.append(self)

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args) -> None:
            await self.aclose()

        async def request(self, method, path, **kwargs) -> httpx.Response:
            request = httpx.Request(method, f"http://langfuse.test{path}")
            return httpx.Response(200, request=request, json={"id": "score-1"})

        async def aclose(self) -> None:
            self.closed = True

    monkeypatch.setattr("app.langfuse_client.httpx.AsyncClient", FakeAsyncClient)
    client = LangfuseAdminClient(Settings(langfuse_base_url="http://langfuse.test"))

    async def _run() -> None:
        await client.create_score("pk", "sk", {"id": "score-1"})
        await client.create_score("pk", "sk", {"id": "score-2"})
        await client.aclose()

    anyio.run(_run)

    assert len(instances) == 1
    assert instances[0].closed is True

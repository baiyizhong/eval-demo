import httpx


class LangfuseClient:
    def __init__(self, base_url: str, public_key: str, secret_key: str):
        self.base_url = base_url.rstrip("/")
        self.auth = (public_key, secret_key)

    async def test_connection(self) -> bool:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                response = await client.get(
                    f"{self.base_url}/api/public/projects",
                    auth=self.auth,
                )
            except httpx.RequestError:
                return False

            return response.is_success

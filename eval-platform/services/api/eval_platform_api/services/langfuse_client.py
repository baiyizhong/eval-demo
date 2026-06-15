import httpx


class LangfuseAPIError(Exception):
    def __init__(self, message: str, status_code: int | None = None):
        super().__init__(message)
        self.status_code = status_code


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

    async def list_projects(self) -> list[dict]:
        payload = await self._get_public_api("projects")
        data = payload.get("data", [])
        if not isinstance(data, list):
            raise LangfuseAPIError("Langfuse projects response was not a list.")
        return data

    async def create_project(self, *, name: str, metadata: dict | None = None) -> dict:
        body: dict = {"name": name}
        if metadata:
            body["metadata"] = metadata

        payload = await self._post_public_api("projects", json=body)
        if not isinstance(payload, dict) or not payload.get("id"):
            raise LangfuseAPIError("Langfuse project create response was invalid.")
        return payload

    async def list_traces(
        self,
        *,
        limit: int = 50,
        page: int = 1,
        order_by: str = "timestamp.desc",
        fields: str = "core",
    ) -> dict:
        return await self._get_public_api(
            "traces",
            params={
                "limit": limit,
                "page": page,
                "orderBy": order_by,
                "fields": fields,
            },
        )

    async def get_trace_summary(self) -> dict:
        payload = await self.list_traces(limit=1, page=1)
        traces = payload.get("data", [])
        meta = payload.get("meta", {})
        if not isinstance(traces, list):
            traces = []
        if not isinstance(meta, dict):
            meta = {}

        total_items = meta.get("totalItems") or meta.get("total_items") or len(traces)
        try:
            trace_count = int(total_items)
        except (TypeError, ValueError):
            trace_count = len(traces)

        first_trace = traces[0] if traces and isinstance(traces[0], dict) else {}
        return {
            "trace_count": trace_count,
            "last_active_at": first_trace.get("timestamp"),
        }

    async def _get_public_api(self, path: str, params: dict | None = None) -> dict:
        return await self._request_public_api("GET", path, params=params)

    async def _post_public_api(self, path: str, json: dict | None = None) -> dict:
        return await self._request_public_api("POST", path, json=json)

    async def _request_public_api(
        self,
        method: str,
        path: str,
        *,
        params: dict | None = None,
        json: dict | None = None,
    ) -> dict:
        async with httpx.AsyncClient(timeout=10) as client:
            try:
                response = await client.request(
                    method,
                    f"{self.base_url}/api/public/{path}",
                    auth=self.auth,
                    params={key: value for key, value in (params or {}).items() if value is not None},
                    json=json,
                )
            except httpx.RequestError as exc:
                raise LangfuseAPIError("Unable to reach Langfuse API.") from exc

        error_message = "Langfuse API request failed."
        if not response.is_success:
            try:
                error_payload = response.json()
            except ValueError:
                error_payload = {}
            if isinstance(error_payload, dict):
                message = error_payload.get("message") or error_payload.get("error")
                if isinstance(message, str) and message.strip():
                    error_message = message
            raise LangfuseAPIError(error_message, response.status_code)

        try:
            payload = response.json()
        except ValueError as exc:
            raise LangfuseAPIError("Langfuse API returned invalid JSON.") from exc

        if not isinstance(payload, dict):
            raise LangfuseAPIError("Langfuse API returned an invalid response.")

        return payload

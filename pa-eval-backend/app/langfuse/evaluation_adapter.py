"""Langfuse Public API adapter for evaluator management.

Langfuse-native evaluators (LLM_AS_JUDGE / CODE) are routed through the typed
``LangfusePublicClient``. PA-only evaluators (WORKFLOW / SDK) remain managed by
the existing reader on PA extension tables and are merged into list results.
"""

from typing import Any, Protocol


class _ProjectClientProvider(Protocol):
    async def project_public_client_for_user(
        self,
        project_id: str,
        user_id: str,
    ) -> Any: ...


class _PaEvaluatorProvider(Protocol):
    async def list_pa_evaluators_for_user(self, user_id: str) -> list[dict[str, Any]]: ...


class LangfuseEvaluationAdapter:
    def __init__(
        self,
        project_clients: _ProjectClientProvider,
        pa_evaluator_reader: _PaEvaluatorProvider,
    ) -> None:
        self._project_clients = project_clients
        self._pa_reader = pa_evaluator_reader

    async def list_evaluators(
        self,
        user_id: str,
        *,
        keyword: str | None = None,
    ) -> list[dict[str, Any]]:
        """List evaluators via the reader (read-only ClickHouse + PA tables).

        Langfuse evaluators are read from eval_templates via the reader's
        existing read-only query path (AGENTS.md permits read joins on native
        tables). PA-only evaluators come from PA extension tables.
        """
        from app.langfuse_db import LangfuseDatabaseReader

        if isinstance(self._pa_reader, LangfuseDatabaseReader):
            evaluators = await self._pa_reader.list_evaluators_for_user(user_id)
        else:
            evaluators = await self._pa_reader.list_pa_evaluators_for_user(user_id)
        if keyword:
            needle = keyword.lower()
            evaluators = [
                ev for ev in evaluators
                if any(
                    isinstance(ev.get(field), str) and needle in ev[field].lower()
                    for field in ("name", "type", "provider", "description")
                )
            ]
        return evaluators

    async def create_langfuse_evaluator(
        self,
        project_id: str,
        user_id: str,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        from app.langfuse_db import _to_public_evaluator_payload

        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            created = await client.create_evaluator(
                _to_public_evaluator_payload(payload)
            )
            return created

    async def delete_langfuse_evaluator(
        self,
        project_id: str,
        user_id: str,
        evaluator_id: str,
    ) -> None:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            await client.delete_evaluator(evaluator_id)

    async def get_langfuse_evaluator(
        self,
        project_id: str,
        user_id: str,
        evaluator_id: str,
    ) -> dict[str, Any]:
        client = await self._project_clients.project_public_client_for_user(
            project_id, user_id
        )
        async with client:
            return await client.get_evaluator(evaluator_id)

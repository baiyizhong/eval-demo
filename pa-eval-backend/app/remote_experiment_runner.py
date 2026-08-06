from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Literal
from uuid import uuid4

import httpx
from fastapi import APIRouter, BackgroundTasks, Header, HTTPException
from pydantic import BaseModel, Field


router = APIRouter(tags=["remote-experiment-runner"])


class CallbackSpec(BaseModel):
    url: str
    method: str = "POST"
    headers: dict[str, str] = Field(default_factory=dict)


class PaRunnerPayload(BaseModel):
    pa_experiment_group_id: str = Field(alias="paExperimentGroupId")
    pa_report_id: str = Field(alias="paReportId")
    pa_scene_id: str | None = Field(default=None, alias="paSceneId")
    pa_experiment_name: str = Field(alias="paExperimentName")
    langfuse_run_name: str = Field(alias="langfuseRunName")
    run_parameters: dict[str, Any] = Field(default_factory=dict, alias="runParameters")
    remote_runner: dict[str, Any] = Field(default_factory=dict, alias="remoteRunner")
    evaluator_ids: list[str] = Field(default_factory=list, alias="evaluatorIds")
    callback: CallbackSpec


class PaRemoteExperimentRequest(BaseModel):
    project_id: str = Field(alias="projectId")
    dataset_id: str = Field(alias="datasetId")
    dataset_name: str = Field(alias="datasetName")
    callback: CallbackSpec
    payload: PaRunnerPayload


class PaCallbackPayload(BaseModel):
    status: Literal["RUNNING", "COMPLETED", "FAILED"]
    external_run_id: str = Field(alias="externalRunId")
    langfuse_run_name: str = Field(alias="langfuseRunName")
    message: str = ""


@dataclass(frozen=True)
class RunnerSettings:
    bearer_token: str
    langfuse_host: str
    langfuse_public_key: str
    langfuse_secret_key: str
    callback_timeout_seconds: float
    visibility_timeout_seconds: float


def load_settings() -> RunnerSettings:
    return RunnerSettings(
        bearer_token=os.getenv("PA_RUNNER_BEARER_TOKEN", ""),
        langfuse_host=os.getenv("LANGFUSE_HOST")
        or os.getenv("LANGFUSE_BASE_URL")
        or "http://127.0.0.1:3000",
        langfuse_public_key=os.getenv("LANGFUSE_PUBLIC_KEY", ""),
        langfuse_secret_key=os.getenv("LANGFUSE_SECRET_KEY", ""),
        callback_timeout_seconds=float(
            os.getenv("PA_RUNNER_CALLBACK_TIMEOUT_SECONDS", "20")
        ),
        visibility_timeout_seconds=float(
            os.getenv("PA_RUNNER_LANGFUSE_VISIBILITY_TIMEOUT_SECONDS", "60")
        ),
    )


@router.get("/pa/remote-experiment-runs/health")
async def health() -> dict[str, Any]:
    return {"status": "ok"}


@router.post("/pa/remote-experiment-runs")
async def run_remote_experiment(
    request: PaRemoteExperimentRequest,
    background_tasks: BackgroundTasks,
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    settings = load_settings()
    if not settings.bearer_token:
        raise HTTPException(500, "PA_RUNNER_BEARER_TOKEN is not configured")
    if authorization != f"Bearer {settings.bearer_token}":
        raise HTTPException(401, "Invalid runner token")
    if not settings.langfuse_public_key or not settings.langfuse_secret_key:
        raise HTTPException(500, "Langfuse credentials are not configured")

    external_run_id = f"pa-remote-run-{uuid4().hex}"
    background_tasks.add_task(
        execute_experiment_and_callback,
        request,
        external_run_id,
        settings,
    )
    return {
        "accepted": True,
        "externalRunId": external_run_id,
        "langfuseRunName": request.payload.langfuse_run_name,
        "status": "QUEUED",
    }


async def execute_experiment_and_callback(
    request: PaRemoteExperimentRequest,
    external_run_id: str,
    settings: RunnerSettings,
) -> None:
    try:
        await post_pa_callback(
            request.callback,
            PaCallbackPayload(
                status="RUNNING",
                externalRunId=external_run_id,
                langfuseRunName=request.payload.langfuse_run_name,
                message="Remote runner accepted the experiment.",
            ),
            settings,
        )
        expected_count = await count_langfuse_dataset_items(request, settings)
        await asyncio.to_thread(run_langfuse_sdk_experiment, request)
        await wait_for_dataset_run_items(
            request=request,
            settings=settings,
            expected_count=max(1, expected_count),
        )
        await post_pa_callback(
            request.callback,
            PaCallbackPayload(
                status="COMPLETED",
                externalRunId=external_run_id,
                langfuseRunName=request.payload.langfuse_run_name,
                message="Remote runner completed the Langfuse experiment.",
            ),
            settings,
        )
    except Exception as exc:
        await post_pa_callback(
            request.callback,
            PaCallbackPayload(
                status="FAILED",
                externalRunId=external_run_id,
                langfuseRunName=request.payload.langfuse_run_name,
                message=safe_error_message(exc),
            ),
            settings,
        )


def run_langfuse_sdk_experiment(request: PaRemoteExperimentRequest) -> None:
    """Run the PA-triggered experiment on a Langfuse-hosted dataset."""

    from langfuse import get_client

    langfuse = get_client()
    dataset = langfuse.get_dataset(request.dataset_name)

    def task(*, item: Any, **_kwargs: Any) -> Any:
        return run_application(
            item_input=getattr(item, "input", None),
            expected_output=getattr(item, "expected_output", None),
            metadata={
                "paExperimentGroupId": request.payload.pa_experiment_group_id,
                "paReportId": request.payload.pa_report_id,
                "paSceneId": request.payload.pa_scene_id,
                "remoteRunner": request.payload.remote_runner,
            },
            run_parameters=request.payload.run_parameters,
        )

    dataset.run_experiment(
        name=request.payload.langfuse_run_name,
        description=f"PA remote experiment: {request.payload.pa_experiment_name}",
        task=task,
    )
    flush = getattr(langfuse, "flush", None)
    if callable(flush):
        flush()


def run_application(
    *,
    item_input: Any,
    expected_output: Any,
    metadata: dict[str, Any],
    run_parameters: dict[str, Any],
) -> Any:
    """Replace this function with the application/service being evaluated."""

    del metadata, run_parameters
    return {
        "answer": item_input,
        "expectedOutputEcho": expected_output,
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds"),
    }


async def count_langfuse_dataset_items(
    request: PaRemoteExperimentRequest,
    settings: RunnerSettings,
) -> int:
    total = 0
    page = 1
    while True:
        response = await langfuse_public_request(
            settings,
            "GET",
            "/api/public/dataset-items",
            params={
                "datasetName": request.dataset_name,
                "page": page,
                "limit": 100,
            },
        )
        items = response.get("data") if isinstance(response.get("data"), list) else []
        total += len(items)
        if len(items) < 100:
            return total
        page += 1


async def wait_for_dataset_run_items(
    *,
    request: PaRemoteExperimentRequest,
    settings: RunnerSettings,
    expected_count: int,
) -> None:
    deadline = asyncio.get_running_loop().time() + settings.visibility_timeout_seconds
    latest_count = 0
    while asyncio.get_running_loop().time() < deadline:
        response = await langfuse_public_request(
            settings,
            "GET",
            "/api/public/dataset-run-items",
            params={
                "datasetId": request.dataset_id,
                "runName": request.payload.langfuse_run_name,
                "page": 1,
                "limit": 100,
            },
            allow_not_found=True,
        )
        items = response.get("data") if isinstance(response.get("data"), list) else []
        latest_count = len(items)
        if latest_count >= expected_count:
            return
        await asyncio.sleep(1)
    raise RuntimeError(
        f"Langfuse dataset run items were not visible: "
        f"expected {expected_count}, got {latest_count}"
    )


async def langfuse_public_request(
    settings: RunnerSettings,
    method: str,
    path: str,
    *,
    params: dict[str, Any] | None = None,
    allow_not_found: bool = False,
) -> dict[str, Any]:
    auth = (settings.langfuse_public_key, settings.langfuse_secret_key)
    async with httpx.AsyncClient(
        base_url=settings.langfuse_host.rstrip("/"),
        timeout=settings.callback_timeout_seconds,
    ) as client:
        response = await client.request(method, path, params=params, auth=auth)
    if allow_not_found and response.status_code == 404:
        return {"data": []}
    response.raise_for_status()
    payload = response.json() if response.content else {}
    return payload if isinstance(payload, dict) else {"data": payload}


async def post_pa_callback(
    callback: CallbackSpec,
    payload: PaCallbackPayload,
    settings: RunnerSettings,
) -> None:
    async with httpx.AsyncClient(timeout=settings.callback_timeout_seconds) as client:
        response = await client.request(
            callback.method,
            callback.url,
            headers={"content-type": "application/json", **callback.headers},
            json=payload.model_dump(by_alias=True),
        )
    response.raise_for_status()


def safe_error_message(exc: Exception) -> str:
    message = str(exc).strip()
    return message[:500] if message else exc.__class__.__name__

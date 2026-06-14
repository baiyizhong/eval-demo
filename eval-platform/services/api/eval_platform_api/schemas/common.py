from typing import Generic, TypeVar

from pydantic import BaseModel

DataT = TypeVar("DataT")


class ErrorEnvelope(BaseModel):
    code: str
    message: str


class ResponseEnvelope(BaseModel, Generic[DataT]):
    data: DataT | None = None
    meta: dict | None = None
    error: ErrorEnvelope | None = None

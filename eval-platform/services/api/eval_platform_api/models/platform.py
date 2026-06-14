from datetime import datetime
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from eval_platform_api.db.base import Base


def uuid_hex() -> str:
    return uuid4().hex


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class EvalPlatformUser(TimestampMixin, Base):
    __tablename__ = "eval_platform_users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uuid_hex)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(64), nullable=False, default="member")
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="active")


class EvalPlatformProject(TimestampMixin, Base):
    __tablename__ = "eval_platform_projects"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uuid_hex)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    langfuse_base_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    langfuse_project_id: Mapped[str] = mapped_column(String(255), nullable=False)
    langfuse_public_key: Mapped[str] = mapped_column(String(255), nullable=False)
    langfuse_secret_key_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="active")
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    settings: Mapped[dict | None] = mapped_column(JSON)

    evaluators: Mapped[list["EvalPlatformEvaluator"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )
    tasks: Mapped[list["EvalPlatformTask"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class EvalPlatformEvaluator(TimestampMixin, Base):
    __tablename__ = "eval_platform_evaluators"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uuid_hex)
    project_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("eval_platform_projects.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    evaluator_type: Mapped[str] = mapped_column(String(64), nullable=False, default="llm")
    provider: Mapped[str | None] = mapped_column(String(128))
    model: Mapped[str | None] = mapped_column(String(255))
    prompt: Mapped[str | None] = mapped_column(Text)
    config: Mapped[dict | None] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="active")
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)

    project: Mapped[EvalPlatformProject] = relationship(back_populates="evaluators")
    tasks: Mapped[list["EvalPlatformTask"]] = relationship(back_populates="evaluator")


class EvalPlatformTask(TimestampMixin, Base):
    __tablename__ = "eval_platform_tasks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uuid_hex)
    project_id: Mapped[str] = mapped_column(
        String(32), ForeignKey("eval_platform_projects.id", ondelete="CASCADE"), nullable=False
    )
    evaluator_id: Mapped[str | None] = mapped_column(
        String(32), ForeignKey("eval_platform_evaluators.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(64), nullable=False, default="pending")
    source_type: Mapped[str] = mapped_column(String(64), nullable=False)
    source_config: Mapped[dict | None] = mapped_column(JSON)
    total_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    completed_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_items: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    result_summary: Mapped[dict | None] = mapped_column(JSON)
    error_message: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)

    project: Mapped[EvalPlatformProject] = relationship(back_populates="tasks")
    evaluator: Mapped[EvalPlatformEvaluator | None] = relationship(back_populates="tasks")

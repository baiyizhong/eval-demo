"""Static regression guard: route files must not write Langfuse native tables.

This test scans PA route files to ensure they never invoke reader methods that
perform direct INSERT/UPDATE/DELETE against Langfuse native business tables.
Native-table writes must go through the typed ``LangfusePublicClient`` via
adapter layers.

The denylist below maps Langfuse native table names to regex patterns that
match SQL mutation statements. Route files (``app/*.py`` that define routers)
are scanned for inline SQL mutations against these tables.
"""

import re
from pathlib import Path

import pytest


# Langfuse native business tables that must never receive direct SQL writes
# from PA route or adapter code. PA extension tables (pa_*) are exempt.
NATIVE_TABLE_DENYLIST: frozenset[str] = frozenset(
    {
        "datasets",
        "dataset_items",
        "dataset_runs",
        "dataset_run_items",
        "annotation_queues",
        "annotation_queue_items",
        "annotation_queue_assignments",
        "score_configs",
        "scores",
        "eval_templates",
        "organizations",
        "organization_memberships",
        "projects",
        "project_memberships",
        "membership_invitations",
        "traces",
        "observations",
    }
)

# SQL mutation patterns to detect
_MUTATION_PATTERNS = [
    re.compile(r"\bINSERT\s+INTO\s+(\w+)", re.IGNORECASE),
    re.compile(r"\bUPDATE\s+(\w+)\s+", re.IGNORECASE),
    re.compile(r"\bDELETE\s+FROM\s+(\w+)", re.IGNORECASE),
]

# Route / adapter files that must be free of native-table SQL mutations
_SCANNED_DIRS = [
    Path(__file__).resolve().parent.parent / "app" / "langfuse",
]

# Helper / Extension files that are permitted to contain SQL (reader, workers, etc.)
_EXEMPT_FILES = {
    "langfuse_db.py",  # Reader — contains legacy methods, not route code
    "langfuse_clickhouse.py",  # ClickHouse reader/writer — read + CH writes
}


def _find_native_mutations(directory: Path) -> list[tuple[str, int, str, str]]:
    """Return (file, line, table, statement) for native table SQL mutations."""
    violations: list[tuple[str, int, str, str]] = []
    for py_file in sorted(directory.rglob("*.py")):
        if py_file.name in _EXEMPT_FILES:
            continue
        text = py_file.read_text(encoding="utf-8")
        for match in re.finditer(
            r'"""(?:.|\n)*?"""|\'\'\'(?:.|\n)*?\'\'\'|f"(?:[^"\\]|\\.)*"|"(?:[^"\\]|\\.)*"',
            text,
        ):
            pass  # skip string detection heuristic; do line-by-line instead
        for line_no, line in enumerate(text.splitlines(), start=1):
            stripped = line.strip()
            # Skip comments
            if stripped.startswith("#"):
                continue
            for pattern in _MUTATION_PATTERNS:
                m = pattern.search(stripped)
                if m:
                    table = m.group(1).lower()
                    if table in NATIVE_TABLE_DENYLIST:
                        violations.append(
                            (str(py_file.name), line_no, table, stripped[:120])
                        )
    return violations


def test_no_native_table_mutations_in_adapter_files() -> None:
    """Adapter and route-support files must not write native business tables."""
    violations: list[tuple[str, int, str, str]] = []
    for directory in _SCANNED_DIRS:
        violations.extend(_find_native_mutations(directory))
    if violations:
        formatted = "\n".join(
            f"  {file}:{line} → {table}: {stmt}"
            for file, line, table, stmt in violations
        )
        pytest.fail(
            f"Found {len(violations)} direct SQL mutation(s) against Langfuse "
            f"native business tables in adapter code:\n{formatted}"
        )


# Reader methods that are known to write native tables and must NOT be called
# from route files. New calls to these methods from route code is a regression.
_FORBIDDEN_READER_METHODS = frozenset[str](
    {
        "list_score_configs_for_user",
        "create_score_config_for_user",
        "update_score_config_for_user",
        "set_score_config_archived_for_user",
        "ensure_default_score_config_for_user",
        "create_annotation_queue_for_user",
        "update_annotation_queue_for_user",
        "delete_annotation_queue_for_user",
        "create_trace_annotation_task_for_user",
        "is_annotation_queue_name_available_for_user",
        "create_annotation_queue_item_for_user",
        "delete_annotation_queue_items_for_user",
        "create_dataset_for_user",
        "update_dataset_for_user",
        "delete_dataset_for_user",
        "create_dataset_item_for_user",
        "update_dataset_item_for_user",
        "archive_dataset_item_for_user",
        "delete_dataset_item_for_user",
        "is_dataset_name_available_for_user",
        "create_langfuse_evaluator",
        "create_organization_member",
        "update_organization_member",
        "delete_organization_member",
        "create_project_member_for_user",
        "update_project_member_for_user",
        "delete_project_member_for_user",
        "archive_project_for_user",
        "restore_project_for_user",
    }
)

_ROUTE_FILES = [
    Path(__file__).resolve().parent.parent / "app" / "annotations.py",
    Path(__file__).resolve().parent.parent / "app" / "auto_evaluations.py",
    Path(__file__).resolve().parent.parent / "app" / "datasets.py",
    Path(__file__).resolve().parent.parent / "app" / "projects.py",
    Path(__file__).resolve().parent.parent / "app" / "organizations.py",
    Path(__file__).resolve().parent.parent / "app" / "evaluators.py",
    Path(__file__).resolve().parent.parent / "app" / "observability.py",
]


@pytest.mark.parametrize("route_file", _ROUTE_FILES, ids=lambda p: p.name)
def test_route_files_do_not_inline_mutate_native_tables(route_file: Path) -> None:
    """Route files must not inline SQL mutations against native business tables."""
    violations = _find_native_mutations(route_file.parent)
    violations = [
        violation for violation in violations
        if violation[0] == route_file.name
    ]
    if violations:
        formatted = "\n".join(
            f"  {file}:{line} -> {table}: {stmt}"
            for file, line, table, stmt in violations
        )
        pytest.fail(
            f"{route_file.name} contains direct SQL mutation(s) against "
            f"Langfuse native business tables:\n{formatted}"
        )


@pytest.mark.parametrize("route_file", _ROUTE_FILES, ids=lambda p: p.name)
def test_route_files_do_not_call_forbidden_native_write_methods(
    route_file: Path,
) -> None:
    """Route files must not call reader methods that write native tables."""
    text = route_file.read_text(encoding="utf-8")
    # Remove comments to avoid false positives
    lines = [
        line for line in text.splitlines()
        if not line.strip().startswith("#")
    ]
    clean_text = "\n".join(lines)
    violations: list[str] = []
    for method in _FORBIDDEN_READER_METHODS:
        # Look for reader.<method>( calls
        pattern = re.compile(rf"\breader\.{re.escape(method)}\s*\(")
        if pattern.search(clean_text):
            violations.append(method)
    if violations:
        pytest.fail(
            f"{route_file.name} calls forbidden reader write method(s): "
            f"{', '.join(violations)}. Use the adapter instead."
        )

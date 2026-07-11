import random
from typing import Literal

AnnotationAssignmentStrategy = Literal["average", "random", "weighted"]


def normalize_assignment_strategy(
    assignee_ids: list[str],
    strategy: str | None,
) -> AnnotationAssignmentStrategy:
    if len(assignee_ids) <= 1:
        return "average"
    if strategy in {"average", "random", "weighted"}:
        return strategy  # type: ignore[return-value]
    return "average"


def normalize_assignment_weights(
    assignee_ids: list[str],
    weights: dict[str, int | float] | None,
) -> dict[str, int]:
    source = weights or {}
    return {
        assignee_id: max(1, int(source.get(assignee_id) or 1))
        for assignee_id in assignee_ids
    }


def plan_annotation_assignments(
    item_ids: list[str],
    assignee_ids: list[str],
    strategy: AnnotationAssignmentStrategy,
    weights: dict[str, int | float],
    existing_counts: dict[str, int],
) -> list[tuple[str, str]]:
    ordered_assignees = list(dict.fromkeys(assignee_ids))
    if not item_ids or not ordered_assignees:
        return []

    if len(ordered_assignees) == 1:
        return [(item_id, ordered_assignees[0]) for item_id in item_ids]

    if strategy == "random":
        return [
            (item_id, random.choice(ordered_assignees))  # noqa: S311
            for item_id in item_ids
        ]

    if strategy == "weighted":
        return _weighted_assignments(
            item_ids, ordered_assignees, weights, existing_counts
        )

    return _average_assignments(item_ids, ordered_assignees, existing_counts)


def _average_assignments(
    item_ids: list[str],
    assignee_ids: list[str],
    existing_counts: dict[str, int],
) -> list[tuple[str, str]]:
    counts = {
        assignee_id: existing_counts.get(assignee_id, 0) for assignee_id in assignee_ids
    }
    assignments: list[tuple[str, str]] = []

    for item_id in item_ids:
        assignee_id = min(assignee_ids, key=lambda user_id: (counts[user_id], user_id))
        assignments.append((item_id, assignee_id))
        counts[assignee_id] += 1

    return assignments


def _weighted_assignments(
    item_ids: list[str],
    assignee_ids: list[str],
    weights: dict[str, int | float],
    existing_counts: dict[str, int],
) -> list[tuple[str, str]]:
    normalized_weights = normalize_assignment_weights(assignee_ids, weights)
    sequence = [
        assignee_id
        for assignee_id in assignee_ids
        for _ in range(normalized_weights[assignee_id])
    ]
    offset = sum(existing_counts.get(assignee_id, 0) for assignee_id in assignee_ids)

    return [
        (item_id, sequence[(offset + index) % len(sequence)])
        for index, item_id in enumerate(item_ids)
    ]

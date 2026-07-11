from app.annotation_assignment import plan_annotation_assignments


def test_single_assignee_receives_all_new_items() -> None:
    assignments = plan_annotation_assignments(
        item_ids=["item-1", "item-2", "item-3"],
        assignee_ids=["user-1"],
        strategy="average",
        weights={},
        existing_counts={},
    )

    assert assignments == [
        ("item-1", "user-1"),
        ("item-2", "user-1"),
        ("item-3", "user-1"),
    ]


def test_average_assignment_balances_against_existing_counts() -> None:
    assignments = plan_annotation_assignments(
        item_ids=["item-1", "item-2", "item-3", "item-4"],
        assignee_ids=["user-1", "user-2"],
        strategy="average",
        weights={},
        existing_counts={"user-1": 2, "user-2": 0},
    )

    assert assignments == [
        ("item-1", "user-2"),
        ("item-2", "user-2"),
        ("item-3", "user-1"),
        ("item-4", "user-2"),
    ]


def test_weighted_assignment_repeats_users_by_weight() -> None:
    assignments = plan_annotation_assignments(
        item_ids=["item-1", "item-2", "item-3", "item-4", "item-5", "item-6"],
        assignee_ids=["user-1", "user-2"],
        strategy="weighted",
        weights={"user-1": 2, "user-2": 1},
        existing_counts={},
    )

    assert assignments == [
        ("item-1", "user-1"),
        ("item-2", "user-1"),
        ("item-3", "user-2"),
        ("item-4", "user-1"),
        ("item-5", "user-1"),
        ("item-6", "user-2"),
    ]

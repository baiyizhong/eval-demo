from datetime import UTC, datetime

from scripts.seed_langfuse_traces import build_events


def test_seed_trace_create_timestamps_are_today() -> None:
    now = datetime(2026, 7, 8, 12, 30, tzinfo=UTC)

    events = build_events(48, now=now)
    trace_events = [event for event in events if event["type"] == "trace-create"]

    assert len(trace_events) == 48
    assert all(
        datetime.fromisoformat(event["body"]["timestamp"].replace("Z", "+00:00")).date()
        == now.date()
        for event in trace_events
    )

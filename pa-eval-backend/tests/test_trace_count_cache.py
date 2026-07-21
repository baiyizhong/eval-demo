from app.trace_count_cache import TraceCountCache


def test_trace_count_cache_expires_entries() -> None:
    now = [100.0]
    cache = TraceCountCache(
        ttl_seconds=30,
        max_entries=10,
        clock=lambda: now[0],
    )

    cache.set("filter-a", 12)
    assert cache.get("filter-a") == 12

    now[0] = 130.0
    assert cache.get("filter-a") is None


def test_trace_count_cache_evicts_least_recently_used_entry() -> None:
    cache = TraceCountCache(ttl_seconds=30, max_entries=2, clock=lambda: 100.0)
    cache.set("filter-a", 1)
    cache.set("filter-b", 2)
    assert cache.get("filter-a") == 1

    cache.set("filter-c", 3)

    assert cache.get("filter-a") == 1
    assert cache.get("filter-b") is None
    assert cache.get("filter-c") == 3

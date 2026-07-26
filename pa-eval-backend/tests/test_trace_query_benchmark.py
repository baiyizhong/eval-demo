from scripts.benchmark_trace_list_query import summarize


def test_benchmark_summary_reports_median_p95_and_range() -> None:
    summary = summarize([10.0, 20.0, 30.0, 40.0, 50.0])

    assert summary == {
        "minMs": 10.0,
        "medianMs": 30.0,
        "p95Ms": 50.0,
        "maxMs": 50.0,
    }

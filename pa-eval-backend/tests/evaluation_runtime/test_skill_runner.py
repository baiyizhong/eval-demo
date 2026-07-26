import pytest

from app.errors import BusinessError
from app.evaluation_runtime.skill_runner import (
    SkillEvaluationInput,
    _parse_skill_results,
)


def _make_msg(text: str) -> dict:
    return {"text": text}


def test_parse_single_result() -> None:
    text = '[{"sampleId":"s1","scores":[{"name":"acc","value":0.8,"comment":"ok"}],"passed":true,"reason":"good"}]'
    results = _parse_skill_results([_make_msg(text)], {"s1"})
    assert len(results) == 1
    assert results[0].sample_id == "s1"
    assert results[0].passed is True
    assert results[0].scores[0]["name"] == "acc"


def test_parse_multiple_results() -> None:
    text = '''[
        {"sampleId":"s1","scores":[{"name":"acc","value":0.9}],"passed":true,"reason":""},
        {"sampleId":"s2","scores":[{"name":"acc","value":0.3}],"passed":false,"reason":"bad"}
    ]'''
    results = _parse_skill_results([_make_msg(text)], {"s1", "s2"})
    assert len(results) == 2
    by_id = {r.sample_id: r for r in results}
    assert by_id["s1"].passed is True
    assert by_id["s2"].passed is False


def test_parse_markdown_code_block() -> None:
    text = '''```json
[{"sampleId":"s1","scores":[],"passed":true,"reason":""}]
```'''
    results = _parse_skill_results([_make_msg(text)], {"s1"})
    assert len(results) == 1


def test_parse_single_object_not_array() -> None:
    text = '{"sampleId":"s1","scores":[],"passed":true,"reason":""}'
    results = _parse_skill_results([_make_msg(text)], {"s1"})
    assert len(results) == 1


def test_parse_filters_unknown_sample_ids() -> None:
    text = '[{"sampleId":"s1","scores":[],"passed":true,"reason":""},{"sampleId":"other","scores":[],"passed":true,"reason":""}]'
    results = _parse_skill_results([_make_msg(text)], {"s1"})
    assert len(results) == 1
    assert results[0].sample_id == "s1"


def test_parse_empty_output_raises() -> None:
    with pytest.raises(BusinessError):
        _parse_skill_results([_make_msg("no json here")], {"s1"})


def test_parse_passed_string() -> None:
    text = '[{"sampleId":"s1","scores":[],"passed":"false","reason":""}]'
    results = _parse_skill_results([_make_msg(text)], {"s1"})
    assert results[0].passed is False


def test_parse_passed_defaults_false() -> None:
    text = '[{"sampleId":"s1","scores":[],"reason":""}]'
    results = _parse_skill_results([_make_msg(text)], {"s1"})
    assert results[0].passed is False


def test_skill_evaluation_input_defaults() -> None:
    item = SkillEvaluationInput(sample_id="s1")
    assert item.trace_id is None
    assert item.input == ""
    assert item.messages is None
    assert item.metadata == {}

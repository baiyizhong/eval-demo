import csv
import io
import json
import re
from pathlib import Path
from xml.etree import ElementTree
from zipfile import ZipFile

from fastapi.testclient import TestClient

from app import annotation_exports
from app.annotation_exports import (
    EXCEL_CELL_LIMIT,
    build_annotation_export_preview,
    generate_annotation_export_archive,
    score_to_label,
)
from app.annotations import _default_annotation_export_base_name
from app.auth_context import CurrentUserContext, get_current_user_context
from app.config import Settings, get_settings
from app.langfuse_clickhouse import get_langfuse_clickhouse_reader
from app.langfuse_db import LangfuseDatabaseReader, get_langfuse_db_reader
from app.main import app


def test_score_to_label_uses_category_label() -> None:
    score_config = {
        "id": "cfg-1",
        "name": "准确性",
        "dataType": "CATEGORICAL",
        "categories": [{"label": "通过", "value": 1}],
    }
    score = {"configId": "cfg-1", "value": 1, "stringValue": ""}

    assert score_to_label(score_config, score) == "通过"


def test_score_to_label_returns_empty_for_unmatched_category() -> None:
    score_config = {
        "id": "cfg-1",
        "name": "准确性",
        "dataType": "CATEGORICAL",
        "categories": [{"label": "通过", "value": 1}],
    }
    score = {"configId": "cfg-1", "value": 2, "stringValue": ""}

    assert score_to_label(score_config, score) == ""


def test_default_annotation_export_name_uses_batch_export_rule() -> None:
    base_name = _default_annotation_export_base_name(
        {"name": "客服标注"}, total_count=12
    )

    assert base_name.startswith("客服标注_")
    assert base_name.endswith("_批量导出")
    assert "-12-" not in base_name
    assert re.search(r"_\d{12}_批量导出$", base_name)
    assert not re.search(r"_\d{8}-\d{6}_批量导出$", base_name)


def test_score_to_label_fallbacks_for_boolean_numeric_and_text() -> None:
    assert score_to_label({"dataType": "BOOLEAN"}, {"value": True}) == "True"
    assert score_to_label({"dataType": "BOOLEAN"}, {"value": False}) == "False"
    assert score_to_label({"dataType": "NUMERIC"}, {"value": 42}) == "42"
    assert (
        score_to_label(
            {"dataType": "TEXT"},
            {"value": None, "stringValue": "人工备注"},
        )
        == "人工备注"
    )


def test_preview_expands_top_level_metadata_keys() -> None:
    payload = build_annotation_export_preview(
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        items=[
            _item("item-1", metadata={"channel": "app", "nested": {"a": 1}}),
            _item("item-2", metadata={"region": "华东"}),
        ],
        score_configs=[],
        preview_limit=20,
        split_metadata=True,
    )

    assert payload["metadataKeys"] == ["channel", "nested", "region"]
    assert payload["previewItems"][0]["metadata.channel"] == "app"
    assert payload["previewItems"][0]["metadata.nested"] == '{"a": 1}'


def test_preview_rows_include_metadata_keys_outside_preview_slice() -> None:
    payload = build_annotation_export_preview(
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        items=[
            _item("item-1", metadata={"channel": "app"}),
            _item("item-2", metadata={"region": "华东"}),
        ],
        score_configs=[],
        preview_limit=1,
        split_metadata=True,
    )

    assert payload["metadataKeys"] == ["channel", "region"]
    assert payload["previewItems"][0]["metadata.region"] == ""


def test_preview_split_metadata_treats_non_dict_metadata_as_empty() -> None:
    payload = build_annotation_export_preview(
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        items=[
            _item("item-1", metadata="raw-metadata"),
            _item("item-2", metadata={"region": "华东"}),
        ],
        score_configs=[],
        preview_limit=20,
        split_metadata=True,
    )

    assert payload["metadataKeys"] == ["region"]
    assert payload["previewItems"][0]["metadata.region"] == ""


def test_duplicate_score_names_get_unique_human_readable_headers(
    tmp_path: Path,
) -> None:
    score_configs = [
        {
            "id": "cfg-1",
            "name": "准确性",
            "dataType": "CATEGORICAL",
            "categories": [{"label": "通过", "value": 1}],
        },
        {
            "id": "cfg-2",
            "name": "准确性",
            "dataType": "CATEGORICAL",
            "categories": [{"label": "不通过", "value": 0}],
        },
    ]
    item = _item(
        "item-1",
        scores=[
            {"configId": "cfg-1", "value": 1, "stringValue": ""},
            {"configId": "cfg-2", "value": 0, "stringValue": ""},
        ],
    )

    payload = build_annotation_export_preview(
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        items=[item],
        score_configs=score_configs,
        preview_limit=20,
        split_metadata=False,
    )

    row = payload["previewItems"][0]
    assert row["准确性"] == "通过"
    assert row["准确性 (2)"] == "不通过"
    assert "score.准确性" not in row

    archive_path = generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name="客服标注-1-20260711-160000",
        export_format="csv",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 1, "completed": 1, "pending": 0},
        score_configs=score_configs,
        items=[item],
        split_metadata=False,
    )

    with ZipFile(archive_path) as archive:
        csv_text = archive.read("客服标注-1-20260711-160000.csv").decode("utf-8-sig")
        export_row = next(csv.DictReader(io.StringIO(csv_text)))
        assert export_row["准确性"] == "通过"
        assert export_row["准确性 (2)"] == "不通过"
        assert "score.准确性" not in export_row


def test_score_name_collision_with_base_header_is_suffixed(
    tmp_path: Path,
) -> None:
    score_configs = [
        {
            "id": "cfg-1",
            "name": "id",
            "dataType": "CATEGORICAL",
            "categories": [{"label": "评分ID列", "value": 1}],
        }
    ]
    item = _item(
        "item-1",
        scores=[{"configId": "cfg-1", "value": 1, "stringValue": ""}],
    )

    payload = build_annotation_export_preview(
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        items=[item],
        score_configs=score_configs,
        preview_limit=20,
        split_metadata=False,
    )

    row = payload["previewItems"][0]
    assert row["id"] == "item-1"
    assert row["id (2)"] == "评分ID列"

    archive_path = generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name="客服标注-1-20260711-160000",
        export_format="csv",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 1, "completed": 1, "pending": 0},
        score_configs=score_configs,
        items=[item],
        split_metadata=False,
    )

    with ZipFile(archive_path) as archive:
        csv_text = archive.read("客服标注-1-20260711-160000.csv").decode("utf-8-sig")
        export_row = next(csv.DictReader(io.StringIO(csv_text)))
        assert export_row["id"] == "item-1"
        assert export_row["id (2)"] == "评分ID列"


def test_score_name_collision_with_metadata_header_is_suffixed(
    tmp_path: Path,
) -> None:
    score_configs = [
        {
            "id": "cfg-1",
            "name": "metadata.region",
            "dataType": "CATEGORICAL",
            "categories": [{"label": "评分区域列", "value": 1}],
        }
    ]
    item = _item(
        "item-1",
        metadata={"region": "华东"},
        scores=[{"configId": "cfg-1", "value": 1, "stringValue": ""}],
    )

    payload = build_annotation_export_preview(
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        items=[item],
        score_configs=score_configs,
        preview_limit=20,
        split_metadata=True,
    )

    row = payload["previewItems"][0]
    assert row["metadata.region"] == "华东"
    assert row["metadata.region (2)"] == "评分区域列"

    archive_path = generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name="客服标注-1-20260711-160000",
        export_format="csv",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 1, "completed": 1, "pending": 0},
        score_configs=score_configs,
        items=[item],
        split_metadata=True,
    )

    export_row = _csv_export_row(archive_path, "客服标注-1-20260711-160000.csv")
    assert export_row["metadata.region"] == "华东"
    assert export_row["metadata.region (2)"] == "评分区域列"


def test_generate_csv_zip_contains_manifest_and_csv(tmp_path: Path) -> None:
    archive_path = generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name="客服标注-1-20260711-160000",
        export_format="csv",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 1, "completed": 1, "pending": 0},
        score_configs=[],
        items=[_item("item-1")],
        split_metadata=False,
    )

    with ZipFile(archive_path) as archive:
        assert "manifest.json" in archive.namelist()
        assert "客服标注-1-20260711-160000.csv" in archive.namelist()
        manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
        assert manifest["splitMetadata"] is False
        assert manifest["exportFormat"] == "csv"
        assert manifest["fileName"] == "客服标注-1-20260711-160000.csv"
        assert manifest["metadataKeys"] == []


def test_generate_csv_starts_with_bom_and_escapes_formula_cells(
    tmp_path: Path,
) -> None:
    archive_path = generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name="客服标注-1-20260711-160000",
        export_format="csv",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 1, "completed": 1, "pending": 0},
        score_configs=[],
        items=[_item("item-1", input_value="=SUM(1,1)")],
        split_metadata=False,
    )

    csv_bytes = _archive_entry_bytes(archive_path, "客服标注-1-20260711-160000.csv")
    assert csv_bytes.startswith(b"\xef\xbb\xbf")

    csv_text = csv_bytes.decode("utf-8-sig")
    row = next(csv.DictReader(io.StringIO(csv_text)))
    assert row["input"] == "'=SUM(1,1)"


def test_generate_csv_escapes_formula_headers(tmp_path: Path) -> None:
    archive_path = generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name="客服标注-1-20260711-160000",
        export_format="csv",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 1, "completed": 1, "pending": 0},
        score_configs=[
            {"id": "cfg-1", "name": "=危险指标", "dataType": "TEXT"},
        ],
        items=[
            _item(
                "item-1",
                scores=[
                    {
                        "configId": "cfg-1",
                        "value": None,
                        "stringValue": "ok",
                    }
                ],
            )
        ],
        split_metadata=False,
    )

    csv_text = _archive_entry_bytes(
        archive_path,
        "客服标注-1-20260711-160000.csv",
    ).decode("utf-8-sig")
    header = next(csv.reader(io.StringIO(csv_text)))
    assert header[-1] == "'=危险指标"


def test_generate_archive_streams_rows_without_building_detail_row_list(
    tmp_path: Path,
    monkeypatch,
) -> None:
    def fail_build_detail_rows(*args, **kwargs):
        raise AssertionError("archive generation should stream detail rows")

    monkeypatch.setattr(
        annotation_exports,
        "_build_detail_rows",
        fail_build_detail_rows,
    )

    archive_path = annotation_exports.generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name="客服标注-1-20260711-160000",
        export_format="csv",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 2, "completed": 2, "pending": 0},
        score_configs=[],
        items=[
            _item("item-1", input_value="x" * 40000),
            _item("item-2", input_value="y" * 40000),
        ],
        split_metadata=False,
    )

    csv_text = _archive_entry_bytes(
        archive_path,
        "客服标注-1-20260711-160000.csv",
    ).decode("utf-8-sig")
    rows = list(csv.DictReader(io.StringIO(csv_text)))
    assert [row["id"] for row in rows] == ["item-1", "item-2"]


def test_generate_txt_zip_contains_json_lines(tmp_path: Path) -> None:
    archive_path = generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name="客服标注-1-20260711-160000",
        export_format="txt",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 1, "completed": 1, "pending": 0},
        score_configs=[],
        items=[_item("item-1")],
        split_metadata=False,
    )

    txt = _archive_entry_bytes(
        archive_path,
        "客服标注-1-20260711-160000.txt",
    ).decode("utf-8")
    lines = txt.splitlines()
    assert len(lines) == 1
    assert json.loads(lines[0])["id"] == "item-1"


def test_generate_xlsx_truncates_long_cells(tmp_path: Path) -> None:
    long_text = "x" * (EXCEL_CELL_LIMIT + 100)
    archive_path = generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name="客服标注-1-20260711-160000",
        export_format="xlsx",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 1, "completed": 1, "pending": 0},
        score_configs=[{"id": "cfg-1", "name": "准确性", "dataType": "TEXT"}],
        items=[_item("item-1", input_value=long_text)],
        split_metadata=False,
    )

    with ZipFile(archive_path) as archive:
        xlsx_name = "客服标注-1-20260711-160000.xlsx"
        with ZipFile(archive.open(xlsx_name)) as workbook:
            sheet_xml = workbook.read("xl/worksheets/sheet3.xml").decode("utf-8")
            input_text = _worksheet_cell_text(sheet_xml, header="input")

            assert len(input_text) == EXCEL_CELL_LIMIT
            assert input_text == "x" * EXCEL_CELL_LIMIT


def test_generate_xlsx_removes_invalid_xml_control_chars(tmp_path: Path) -> None:
    archive_path = generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name="客服标注-1-20260711-160000",
        export_format="xlsx",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 1, "completed": 1, "pending": 0},
        score_configs=[],
        items=[_item("item-1", input_value="a\x00b")],
        split_metadata=False,
    )

    with ZipFile(archive_path) as archive:
        xlsx_name = "客服标注-1-20260711-160000.xlsx"
        with ZipFile(archive.open(xlsx_name)) as workbook:
            sheet_xml = workbook.read("xl/worksheets/sheet3.xml").decode("utf-8")
            input_text = _worksheet_cell_text(sheet_xml, header="input")

    assert input_text == "ab"
    assert "\x00" not in sheet_xml


def test_generate_xlsx_contains_three_sheets_and_score_header_style(
    tmp_path: Path,
) -> None:
    archive_path = generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name="客服标注-1-20260711-160000",
        export_format="xlsx",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 1, "completed": 1, "pending": 0},
        score_configs=[{"id": "cfg-1", "name": "准确性", "dataType": "TEXT"}],
        items=[_item("item-1")],
        split_metadata=False,
    )

    with ZipFile(archive_path) as archive:
        with ZipFile(archive.open("客服标注-1-20260711-160000.xlsx")) as workbook:
            workbook_xml = workbook.read("xl/workbook.xml").decode("utf-8")
            styles_xml = workbook.read("xl/styles.xml").decode("utf-8")
            detail_xml = workbook.read("xl/worksheets/sheet3.xml").decode("utf-8")

    assert 'name="基本信息"' in workbook_xml
    assert 'name="评分指标"' in workbook_xml
    assert 'name="数据明细"' in workbook_xml
    assert "FFFFF2CC" in styles_xml
    assert 's="1"' in detail_xml


def test_generate_xlsx_score_sheet_includes_numeric_range_config(
    tmp_path: Path,
) -> None:
    archive_path = generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name="客服标注-1-20260711-160000",
        export_format="xlsx",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 1, "completed": 1, "pending": 0},
        score_configs=[
            {
                "id": "cfg-1",
                "name": "人工质量评分",
                "dataType": "NUMERIC",
                "minValue": 0,
                "maxValue": 5,
                "categories": [],
            }
        ],
        items=[_item("item-1")],
        split_metadata=False,
    )

    with ZipFile(archive_path) as archive:
        with ZipFile(archive.open("客服标注-1-20260711-160000.xlsx")) as workbook:
            score_sheet_xml = workbook.read("xl/worksheets/sheet2.xml").decode("utf-8")

    config_text = _worksheet_cell_text(score_sheet_xml, header="分类配置")
    assert json.loads(config_text) == {"minValue": 0, "maxValue": 5}


def test_generate_archive_sanitizes_base_file_name(tmp_path: Path) -> None:
    archive_path = generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name='CON:../坏/名字*?<>|"',
        export_format="csv",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 1, "completed": 1, "pending": 0},
        score_configs=[],
        items=[_item("item-1")],
        split_metadata=False,
    )

    assert archive_path.parent == tmp_path
    assert archive_path.name.endswith(".zip")
    assert len(archive_path.stem) <= 120
    unsafe_chars = set('/\\:*?"<>|')
    with ZipFile(archive_path) as archive:
        for entry_name in archive.namelist():
            if entry_name == "manifest.json":
                continue
            assert not any(char in entry_name for char in unsafe_chars)
            assert ".." not in entry_name


def test_generate_archive_limits_safe_base_file_name_length(tmp_path: Path) -> None:
    archive_path = generate_annotation_export_archive(
        output_dir=tmp_path,
        base_file_name="a" * 200,
        export_format="csv",
        queue={"id": "queue-1", "name": "客服标注", "description": ""},
        metrics={"total": 1, "completed": 1, "pending": 0},
        score_configs=[],
        items=[_item("item-1")],
        split_metadata=False,
    )

    assert len(archive_path.stem) == 120


def test_previews_annotation_export_with_selected_scope() -> None:
    fake_reader = FakeAnnotationExportReader()
    override_export_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/export-preview",
            json={
                "scope": "selected",
                "itemIds": ["item-1"],
                "previewLimit": 20,
                "splitMetadata": True,
            },
        )
    finally:
        clear_export_overrides()

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["metrics"] == {"total": 1, "completed": 1, "pending": 0}
    assert data["metadataKeys"] == ["channel"]
    assert [item["id"] for item in data["previewItems"]] == ["item-1"]


def test_previews_large_annotation_export_enriches_only_preview_items() -> None:
    class LargeAnnotationExportReader(FakeAnnotationExportReader):
        async def list_annotation_queue_items_for_user(
            self,
            project_id: str,
            queue_id: str,
            user_id: str,
        ) -> list[dict]:
            self.calls.append("list_items")
            return [
                {
                    **_item(f"item-{index:04d}", metadata={}, input_value={}),
                    "projectId": project_id,
                    "queueId": queue_id,
                    "objectId": f"trace-{index:04d}",
                    "objectType": "TRACE",
                    "source": {
                        "objectId": f"trace-{index:04d}",
                        "objectType": "TRACE",
                        "title": f"trace-{index:04d}",
                        "input": {},
                        "output": {},
                        "metadata": {},
                        "traceId": f"trace-{index:04d}",
                        "observationId": "",
                        "sessionId": "",
                        "userId": "",
                        "latencyMs": 0,
                        "costUsd": 0,
                        "createdAt": "2026-07-11T08:00:00.000Z",
                    },
                    "createdAt": "2026-07-11T08:00:00.000Z",
                    "updatedAt": "2026-07-11T08:00:00.000Z",
                }
                for index in range(1000)
            ]

    fake_reader = LargeAnnotationExportReader()
    fake_trace_reader = FakeAnnotationExportTraceReader()
    override_export_reader(fake_reader, trace_reader=fake_trace_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/export-preview",
            json={
                "scope": "filtered",
                "previewLimit": 5,
                "splitMetadata": False,
            },
        )
    finally:
        clear_export_overrides()

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["metrics"] == {"total": 1000, "completed": 1000, "pending": 0}
    assert [item["id"] for item in data["previewItems"]] == [
        f"item-{index:04d}" for index in range(5)
    ]
    assert fake_trace_reader.calls == []
    assert fake_trace_reader.source_calls == [
        ("project-1", [f"trace-{index:04d}" for index in range(5)])
    ]


def test_creates_large_annotation_export_job_before_background_item_scan(
    tmp_path: Path,
) -> None:
    class LargeAnnotationExportReader(FakeAnnotationExportReader):
        async def list_annotation_queue_items_for_user(
            self,
            project_id: str,
            queue_id: str,
            user_id: str,
        ) -> list[dict]:
            self.calls.append("list_items")
            return [
                {
                    **_item(f"item-{index:04d}"),
                    "projectId": project_id,
                    "queueId": queue_id,
                    "objectId": f"trace-{index:04d}",
                    "objectType": "TRACE",
                    "createdAt": "2026-07-11T08:00:00.000Z",
                    "updatedAt": "2026-07-11T08:00:00.000Z",
                }
                for index in range(1000)
            ]

    fake_reader = LargeAnnotationExportReader()
    fake_trace_reader = FakeAnnotationExportTraceReader()
    override_export_reader(
        fake_reader,
        trace_reader=fake_trace_reader,
        export_dir=tmp_path,
    )

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/export-jobs",
            json={
                "scope": "filtered",
                "format": "csv",
                "splitMetadata": False,
                "fileName": "大队列导出.zip",
            },
        )
    finally:
        clear_export_overrides()

    assert response.status_code == 200
    assert fake_reader.calls.index("create_export_job") < fake_reader.calls.index(
        "list_items"
    )
    assert fake_trace_reader.calls == []


def test_rejects_empty_selected_annotation_export_job() -> None:
    fake_reader = FakeAnnotationExportReader()
    override_export_reader(fake_reader)

    try:
        response = TestClient(app).post(
            "/api/projects/project-1/annotation-queues/queue-1/export-jobs",
            json={"scope": "selected", "format": "xlsx", "itemIds": []},
        )
    finally:
        clear_export_overrides()

    assert response.status_code == 400
    assert response.json()["code"] == 1030


def test_creates_and_gets_annotation_export_job(tmp_path: Path) -> None:
    fake_reader = FakeAnnotationExportReader()
    override_export_reader(fake_reader, export_dir=tmp_path)

    try:
        client = TestClient(app)
        create_response = client.post(
            "/api/projects/project-1/annotation-queues/queue-1/export-jobs",
            json={
                "scope": "filtered",
                "format": "csv",
                "splitMetadata": True,
                "fileName": "自定义/人工标注导出.zip",
            },
        )
        get_response = client.get(
            "/api/projects/project-1/annotation-queues/queue-1/export-jobs/export-job-1"
        )
    finally:
        clear_export_overrides()

    assert create_response.status_code == 200
    created_job = create_response.json()["data"]
    assert created_job["id"] == "export-job-1"
    assert created_job["format"] == "csv"
    assert fake_reader.created_job["fileName"] == "自定义-人工标注导出"
    assert "filePath" not in created_job
    assert fake_reader.created_job["filters"] == {
        "keyword": "",
        "status": [],
        "objectType": [],
        "completedBy": [],
        "assigneeIds": [],
        "createdAtFrom": "",
        "createdAtTo": "",
        "completedAtFrom": "",
        "completedAtTo": "",
        "hasScores": None,
        "metadataFilter": None,
        "metadataFilters": [],
        "inputFilters": [],
        "outputFilters": [],
        "itemIds": [],
    }
    assert fake_reader.export_job["status"] == "SUCCEEDED"
    generated_path = Path(fake_reader.export_job["filePath"])
    assert generated_path.is_file()
    assert generated_path.name == "自定义-人工标注导出.zip"
    assert generated_path.suffix == ".zip"

    assert get_response.status_code == 200
    fetched_job = get_response.json()["data"]
    assert fetched_job["projectId"] == "project-1"
    assert "filePath" not in fetched_job


def test_rejects_download_when_annotation_export_job_not_completed() -> None:
    fake_reader = FakeAnnotationExportReader()
    fake_reader.export_job = fake_reader.job_payload(status="RUNNING")
    override_export_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/export-jobs/export-job-1/download"
        )
    finally:
        clear_export_overrides()

    assert response.status_code == 409
    assert response.json()["code"] == 1033


def test_rejects_download_when_annotation_export_file_is_missing(tmp_path: Path) -> None:
    fake_reader = FakeAnnotationExportReader()
    fake_reader.export_job = fake_reader.job_payload(
        status="SUCCEEDED",
        file_path=str(tmp_path / "missing.zip"),
    )
    override_export_reader(fake_reader)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/export-jobs/export-job-1/download"
        )
    finally:
        clear_export_overrides()

    assert response.status_code == 404
    assert response.json()["code"] == 1034


def test_rejects_download_when_annotation_export_file_is_outside_root(
    tmp_path: Path,
) -> None:
    outside_file = tmp_path / "outside.zip"
    outside_file.write_bytes(b"not really a zip")
    export_root = tmp_path / "exports"
    fake_reader = FakeAnnotationExportReader()
    fake_reader.export_job = fake_reader.job_payload(
        status="SUCCEEDED",
        file_name=outside_file.name,
        file_path=str(outside_file),
    )
    override_export_reader(fake_reader, export_dir=export_root)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/export-jobs/export-job-1/download"
        )
    finally:
        clear_export_overrides()

    assert response.status_code == 404
    assert response.json()["code"] == 1034


def test_downloads_completed_annotation_export_zip_inside_root(tmp_path: Path) -> None:
    export_root = tmp_path / "exports"
    zip_path = export_root / "project-1" / "annotation-exports" / "客服标注.zip"
    zip_path.parent.mkdir(parents=True)
    zip_bytes = b"PK\x03\x04annotation export"
    zip_path.write_bytes(zip_bytes)
    fake_reader = FakeAnnotationExportReader()
    fake_reader.export_job = fake_reader.job_payload(
        status="SUCCEEDED",
        file_name=zip_path.name,
        file_path=str(zip_path),
    )
    override_export_reader(fake_reader, export_dir=export_root)

    try:
        response = TestClient(app).get(
            "/api/projects/project-1/annotation-queues/queue-1/export-jobs/export-job-1/download"
        )
    finally:
        clear_export_overrides()

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert response.content == zip_bytes


class FakeAnnotationExportReader:
    def __init__(self) -> None:
        self.export_job: dict | None = None
        self.created_job: dict | None = None
        self.calls: list[str] = []

    async def get_annotation_queue_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
    ) -> dict:
        self.calls.append("get_queue")
        return {
            "id": queue_id,
            "projectId": project_id,
            "name": "客服标注",
            "description": "",
            "scoreConfigs": [
                {
                    "id": "score-1",
                    "name": "准确性",
                    "dataType": "NUMERIC",
                    "categories": [],
                }
            ],
        }

    async def list_annotation_queue_items_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
    ) -> list[dict]:
        self.calls.append("list_items")
        return [
            {
                **_item(
                    "item-1",
                    metadata={"channel": "app"},
                    scores=[{"configId": "score-1", "value": 5, "stringValue": ""}],
                ),
                "projectId": project_id,
                "queueId": queue_id,
                "objectId": "trace-1",
                "objectType": "TRACE",
                "createdAt": "2026-07-11T08:00:00.000Z",
                "updatedAt": "2026-07-11T08:10:00.000Z",
            },
            {
                **_item("item-2", metadata={"region": "华东"}),
                "projectId": project_id,
                "queueId": queue_id,
                "objectId": "trace-2",
                "objectType": "TRACE",
                "status": "PENDING",
                "createdAt": "2026-07-11T08:01:00.000Z",
                "updatedAt": "2026-07-11T08:01:00.000Z",
            },
        ]

    async def create_annotation_export_job_for_user(
        self,
        project_id: str,
        queue_id: str,
        user_id: str,
        *,
        scope: str,
        export_format: str,
        filters: dict,
        item_ids: list[str],
        split_metadata: bool,
        file_name: str,
    ) -> dict:
        self.calls.append("create_export_job")
        self.created_job = {
            "scope": scope,
            "format": export_format,
            "filters": filters,
            "itemIds": item_ids,
            "splitMetadata": split_metadata,
            "fileName": file_name,
        }
        self.export_job = self.job_payload(
            project_id=project_id,
            queue_id=queue_id,
            scope=scope,
            export_format=export_format,
            metadata={
                "filters": filters,
                "itemIds": item_ids,
                "splitMetadata": split_metadata,
                "defaultFileName": file_name,
            },
            file_name=file_name,
        )
        return dict(self.export_job)

    async def get_annotation_export_job_for_user(
        self,
        project_id: str,
        queue_id: str,
        job_id: str,
        user_id: str,
    ) -> dict:
        self.calls.append("get_export_job")
        return dict(
            self.export_job
            or self.job_payload(project_id=project_id, queue_id=queue_id, job_id=job_id)
        )

    async def mark_annotation_export_job_running(
        self,
        project_id: str,
        queue_id: str,
        job_id: str,
    ) -> None:
        self.calls.append("mark_export_running")
        if self.export_job:
            self.export_job["status"] = "RUNNING"

    async def mark_annotation_export_job_succeeded(
        self,
        project_id: str,
        queue_id: str,
        job_id: str,
        *,
        total_count: int,
        file_name: str,
        file_path: str,
        file_size: int,
    ) -> None:
        self.calls.append("mark_export_succeeded")
        if self.export_job:
            self.export_job.update(
                {
                    "status": "SUCCEEDED",
                    "totalCount": total_count,
                    "exportedCount": total_count,
                    "fileName": file_name,
                    "filePath": file_path,
                    "fileSize": file_size,
                }
            )

    async def mark_annotation_export_job_failed(
        self,
        project_id: str,
        queue_id: str,
        job_id: str,
        error_message: str,
    ) -> None:
        self.calls.append("mark_export_failed")
        if self.export_job:
            self.export_job.update(
                {"status": "FAILED", "errorMessage": error_message}
            )

    def job_payload(
        self,
        *,
        project_id: str = "project-1",
        queue_id: str = "queue-1",
        job_id: str = "export-job-1",
        scope: str = "filtered",
        export_format: str = "csv",
        status: str = "PENDING",
        metadata: dict | None = None,
        file_name: str = "客服标注-2-20260711-160000",
        file_path: str = "",
    ) -> dict:
        return {
            "id": job_id,
            "projectId": project_id,
            "queueId": queue_id,
            "scope": scope,
            "format": export_format,
            "status": status,
            "totalCount": 0,
            "exportedCount": 0,
            "fileName": file_name,
            "filePath": file_path,
            "fileSize": 0,
            "errorMessage": "",
            "metadata": metadata or {},
            "createdAt": "2026-07-11T08:00:00.000Z",
            "updatedAt": "2026-07-11T08:00:00.000Z",
            "expiresAt": "2026-07-18T08:00:00.000Z",
        }


class FakeAnnotationExportTraceReader:
    def __init__(self) -> None:
        self.calls: list[tuple[str, str]] = []
        self.source_calls: list[tuple[str, list[str]]] = []

    async def get_trace(self, project_id: str, trace_id: str) -> dict:
        self.calls.append((project_id, trace_id))
        return {}

    async def list_trace_sources(
        self,
        project_id: str,
        trace_ids: list[str],
    ) -> dict[str, dict]:
        self.source_calls.append((project_id, trace_ids))
        return {
            trace_id: {
                "traceId": trace_id,
                "projectId": project_id,
                "name": trace_id,
                "sessionId": f"session-{trace_id}",
                "userId": f"user-{trace_id}",
                "createdAt": "2026-07-11T08:00:00.000Z",
                "input": {"q": trace_id},
                "output": {"a": trace_id},
                "metadata": {"trace": trace_id},
            }
            for trace_id in trace_ids
        }


def override_export_reader(
    fake_reader: FakeAnnotationExportReader,
    *,
    trace_reader: FakeAnnotationExportTraceReader | None = None,
    export_dir: Path | None = None,
) -> None:
    async def _override() -> LangfuseDatabaseReader:
        return fake_reader  # type: ignore[return-value]

    app.dependency_overrides[get_langfuse_db_reader] = _override
    app.dependency_overrides[get_langfuse_clickhouse_reader] = lambda: (
        trace_reader or FakeAnnotationExportTraceReader()
    )
    app.dependency_overrides[get_current_user_context] = lambda: CurrentUserContext(
        user_id="user-1",
        email="octocat@example.com",
        login="octocat",
    )
    if export_dir is not None:
        app.dependency_overrides[get_settings] = lambda: Settings(
            pa_eval_export_storage_dir=str(export_dir)
        )


def clear_export_overrides() -> None:
    app.dependency_overrides.clear()


def _item(
    item_id: str,
    *,
    metadata: object | None = None,
    input_value: object | None = None,
    scores: list[dict] | None = None,
) -> dict:
    return {
        "id": item_id,
        "status": "COMPLETED",
        "assignee": {"id": "user-1", "name": "李雷", "email": "li@example.com"},
        "completedBy": {"id": "user-1", "name": "李雷", "email": "li@example.com"},
        "source": {
            "traceId": "trace-1",
            "observationId": "obs-1",
            "sessionId": "session-1",
            "userId": "end-user-1",
            "input": input_value if input_value is not None else {"q": "退款"},
            "output": {"a": "请在订单详情申请"},
            "metadata": metadata if metadata is not None else {},
        },
        "scores": scores or [],
    }


def _archive_entry_bytes(archive_path: Path, entry_name: str) -> bytes:
    with ZipFile(archive_path) as archive:
        return archive.read(entry_name)


def _csv_export_row(archive_path: Path, entry_name: str) -> dict[str, str]:
    csv_text = _archive_entry_bytes(archive_path, entry_name).decode("utf-8-sig")
    return next(csv.DictReader(io.StringIO(csv_text)))


def _worksheet_cell_text(sheet_xml: str, *, header: str) -> str:
    namespace = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    root = ElementTree.fromstring(sheet_xml)
    rows = root.findall(".//x:sheetData/x:row", namespace)
    header_cells = rows[0].findall("x:c", namespace)
    data_cells = rows[1].findall("x:c", namespace)
    headers = [_cell_text(cell, namespace) for cell in header_cells]
    column_index = headers.index(header)
    return _cell_text(data_cells[column_index], namespace)


def _cell_text(cell: ElementTree.Element, namespace: dict[str, str]) -> str:
    return "".join(
        text_node.text or "" for text_node in cell.findall(".//x:t", namespace)
    )

import csv
import io
import json
import re
import zipfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape, quoteattr

EXCEL_CELL_LIMIT = 32767
EXPORT_FORMATS = {"xlsx", "csv", "txt"}
EXPORT_STATUS_DONE = {"SUCCEEDED", "FAILED"}
MAX_SAFE_FILE_NAME_LENGTH = 120

_DETAIL_BASE_COLUMNS = [
    ("id", "id"),
    ("status", "status"),
    ("assignee.id", "assigneeId"),
    ("assignee.name", "assigneeName"),
    ("assignee.email", "assigneeEmail"),
    ("completedBy.id", "completedById"),
    ("completedBy.name", "completedByName"),
    ("completedBy.email", "completedByEmail"),
    ("source.traceId", "traceId"),
    ("source.observationId", "observationId"),
    ("source.sessionId", "sessionId"),
    ("source.userId", "userId"),
    ("source.input", "input"),
    ("source.output", "output"),
]


def score_to_label(score_config: dict[str, Any], score: dict[str, Any] | None) -> str:
    if not score:
        return ""
    data_type = score_config.get("dataType") or score_config.get("data_type")
    categories = score_config.get("categories") or []
    value = score.get("value")
    string_value = score.get("stringValue") or score.get("string_value") or ""
    if data_type in {"CATEGORICAL", "BOOLEAN", "NUMERIC"}:
        for category in categories:
            if category.get("value") == value:
                return str(category.get("label") or "")
    if data_type == "CATEGORICAL":
        return ""
    if data_type == "BOOLEAN":
        if value is True or value == 1:
            return "True"
        if value is False or value == 0:
            return "False"
    if data_type == "TEXT":
        return str(string_value)
    if value is None:
        return ""
    return str(value)


def build_annotation_export_preview(
    *,
    queue: dict[str, Any],
    items: list[dict[str, Any]],
    score_configs: list[dict[str, Any]],
    preview_limit: int,
    split_metadata: bool,
) -> dict[str, Any]:
    metadata_keys = _collect_metadata_keys(items) if split_metadata else []
    detail_rows = _build_detail_rows(
        items[:preview_limit],
        score_configs,
        split_metadata,
        metadata_keys=metadata_keys,
    )

    return {
        "queue": queue,
        "metrics": _build_metrics(items),
        "scoreConfigs": score_configs,
        "metadataKeys": metadata_keys,
        "previewItems": detail_rows,
    }


def generate_annotation_export_archive(
    *,
    output_dir: Path,
    base_file_name: str,
    export_format: str,
    queue: dict[str, Any],
    metrics: dict[str, Any],
    score_configs: list[dict[str, Any]],
    items: list[dict[str, Any]],
    split_metadata: bool,
) -> Path:
    if export_format not in EXPORT_FORMATS:
        raise ValueError(f"Unsupported export format: {export_format}")

    output_dir.mkdir(parents=True, exist_ok=True)
    safe_base_file_name = _safe_file_name(base_file_name)
    archive_path = output_dir / f"{safe_base_file_name}.zip"
    data_file_name = f"{safe_base_file_name}.{export_format}"
    metadata_keys = _collect_metadata_keys(items) if split_metadata else []
    detail_rows = _build_detail_rows(
        items,
        score_configs,
        split_metadata,
        metadata_keys=metadata_keys,
    )
    detail_headers = _build_detail_headers(metadata_keys, score_configs, split_metadata)
    manifest = {
        "queue": queue,
        "metrics": metrics,
        "scoreConfigs": score_configs,
        "metadataKeys": metadata_keys,
        "splitMetadata": split_metadata,
        "exportFormat": export_format,
        "fileName": data_file_name,
        "generatedAt": datetime.now(UTC).isoformat(),
    }

    if export_format == "csv":
        data_payload: str | bytes = _render_csv(detail_headers, detail_rows)
    elif export_format == "txt":
        data_payload = _render_txt(detail_rows)
    else:
        data_payload = _render_xlsx(
            queue,
            metrics,
            score_configs,
            detail_headers,
            detail_rows,
        )

    with zipfile.ZipFile(archive_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr(
            "manifest.json",
            json.dumps(manifest, ensure_ascii=False, default=str, indent=2),
        )
        archive.writestr(data_file_name, data_payload)

    return archive_path


def _build_detail_rows(
    items: list[dict[str, Any]],
    score_configs: list[dict[str, Any]],
    split_metadata: bool,
    *,
    metadata_keys: list[str] | None = None,
) -> list[dict[str, str]]:
    metadata_keys = metadata_keys if metadata_keys is not None else _collect_metadata_keys(items)
    detail_headers_without_scores = _build_detail_headers(
        metadata_keys,
        score_configs=[],
        split_metadata=split_metadata,
    )
    score_columns = _score_column_names(
        score_configs,
        reserved_headers=detail_headers_without_scores,
    )
    rows = []

    for item in items:
        source = item.get("source") or {}
        assignee = item.get("assignee") or {}
        completed_by = item.get("completedBy") or item.get("completed_by") or {}
        raw_metadata = source.get("metadata") or {}
        metadata = raw_metadata if isinstance(raw_metadata, dict) else {}
        scores_by_config = {
            score.get("configId") or score.get("config_id"): score
            for score in item.get("scores") or []
        }
        row = {
            "id": _stringify(item.get("id")),
            "status": _stringify(item.get("status")),
            "assigneeId": _stringify(assignee.get("id")),
            "assigneeName": _stringify(assignee.get("name")),
            "assigneeEmail": _stringify(assignee.get("email")),
            "completedById": _stringify(completed_by.get("id")),
            "completedByName": _stringify(completed_by.get("name")),
            "completedByEmail": _stringify(completed_by.get("email")),
            "traceId": _stringify(source.get("traceId") or source.get("trace_id")),
            "observationId": _stringify(
                source.get("observationId") or source.get("observation_id")
            ),
            "sessionId": _stringify(source.get("sessionId") or source.get("session_id")),
            "userId": _stringify(source.get("userId") or source.get("user_id")),
            "input": _stringify(source.get("input")),
            "output": _stringify(source.get("output")),
        }

        if split_metadata:
            for key in metadata_keys:
                row[f"metadata.{key}"] = _stringify(metadata.get(key))
        else:
            row["metadata"] = _stringify(raw_metadata)

        for config, column_name in zip(score_configs, score_columns, strict=True):
            config_id = config.get("id") or config.get("configId") or config.get("config_id")
            row[column_name] = score_to_label(config, scores_by_config.get(config_id))

        rows.append(row)

    return rows


def _collect_metadata_keys(items: list[dict[str, Any]]) -> list[str]:
    keys: set[str] = set()
    for item in items:
        source = item.get("source") or {}
        metadata = source.get("metadata") or {}
        if isinstance(metadata, dict):
            keys.update(str(key) for key in metadata)
    return sorted(keys)


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, default=str)


def _excel_safe(value: Any) -> str:
    return _stringify(value)[:EXCEL_CELL_LIMIT]


def _build_metrics(items: list[dict[str, Any]]) -> dict[str, int]:
    completed = sum(1 for item in items if item.get("status") == "COMPLETED")
    pending = sum(1 for item in items if item.get("status") != "COMPLETED")
    return {"total": len(items), "completed": completed, "pending": pending}


def _score_column_names(
    score_configs: list[dict[str, Any]],
    *,
    reserved_headers: list[str],
) -> list[str]:
    used_headers = set(reserved_headers)
    names = []
    for score_config in score_configs:
        base_name = _stringify(score_config.get("name") or score_config.get("id") or "score")
        base_name = base_name or "score"
        column_name = _next_available_header(base_name, used_headers)
        used_headers.add(column_name)
        names.append(column_name)
    return names


def _next_available_header(base_name: str, used_headers: set[str]) -> str:
    if base_name not in used_headers:
        return base_name
    suffix = 2
    while f"{base_name} ({suffix})" in used_headers:
        suffix += 1
    return f"{base_name} ({suffix})"


def _build_detail_headers(
    metadata_keys: list[str],
    score_configs: list[dict[str, Any]],
    split_metadata: bool,
) -> list[str]:
    headers = [key for _, key in _DETAIL_BASE_COLUMNS]
    if split_metadata:
        headers.extend(f"metadata.{key}" for key in metadata_keys)
    else:
        headers.append("metadata")
    headers.extend(_score_column_names(score_configs, reserved_headers=headers))
    return headers


def _render_csv(fieldnames: list[str], rows: list[dict[str, str]]) -> str:
    output = io.StringIO()
    header_writer = csv.writer(output)
    header_writer.writerow([_csv_safe(fieldname) for fieldname in fieldnames])
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writerows(
        {fieldname: _csv_safe(row.get(fieldname, "")) for fieldname in fieldnames}
        for row in rows
    )
    return "\ufeff" + output.getvalue()


def _render_txt(rows: list[dict[str, str]]) -> str:
    return "".join(
        f"{json.dumps(row, ensure_ascii=False, default=str)}\n" for row in rows
    )


def _render_xlsx(
    queue: dict[str, Any],
    metrics: dict[str, Any],
    score_configs: list[dict[str, Any]],
    detail_headers: list[str],
    detail_rows: list[dict[str, str]],
) -> bytes:
    basic_info_rows = _build_basic_info_rows(queue, metrics)
    score_config_rows = _build_score_config_rows(score_configs)
    detail_sheet_rows = [detail_headers]
    detail_sheet_rows.extend(
        [[row.get(header, "") for header in detail_headers] for row in detail_rows]
    )
    first_score_column = _first_score_column(detail_headers, score_configs)
    sheet_specs = [
        ("基本信息", basic_info_rows, None),
        ("评分指标", score_config_rows, None),
        ("数据明细", detail_sheet_rows, first_score_column),
    ]

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _content_types_xml(len(sheet_specs)))
        archive.writestr("_rels/.rels", _ROOT_RELS_XML)
        archive.writestr("xl/workbook.xml", _workbook_xml(sheet_specs))
        archive.writestr("xl/_rels/workbook.xml.rels", _workbook_rels_xml(len(sheet_specs)))
        archive.writestr("xl/styles.xml", _STYLES_XML)
        for index, (_, rows, highlighted_from) in enumerate(sheet_specs, start=1):
            archive.writestr(
                f"xl/worksheets/sheet{index}.xml",
                _build_sheet_xml(rows, highlighted_from=highlighted_from),
            )

    return buffer.getvalue()


def _build_basic_info_rows(
    queue: dict[str, Any],
    metrics: dict[str, Any],
) -> list[list[str]]:
    return [
        ["字段", "值"],
        ["队列ID", _stringify(queue.get("id"))],
        ["队列名称", _stringify(queue.get("name"))],
        ["队列描述", _stringify(queue.get("description"))],
        ["总数", _stringify(metrics.get("total"))],
        ["已完成", _stringify(metrics.get("completed"))],
        ["待处理", _stringify(metrics.get("pending"))],
    ]


def _build_score_config_rows(score_configs: list[dict[str, Any]]) -> list[list[str]]:
    rows = [["指标ID", "指标名称", "数据类型", "分类配置"]]
    for config in score_configs:
        data_type = _stringify(config.get("dataType") or config.get("data_type"))
        rows.append(
            [
                _stringify(config.get("id")),
                _stringify(config.get("name")),
                data_type,
                _stringify(_score_config_options(config, data_type)),
            ]
        )
    return rows


def _score_config_options(config: dict[str, Any], data_type: str) -> Any:
    if data_type == "NUMERIC":
        return {
            "minValue": _first_present(config, "minValue", "min_value"),
            "maxValue": _first_present(config, "maxValue", "max_value"),
        }
    return config.get("categories") or []


def _first_present(config: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in config:
            return config.get(key)
    return None


def _first_score_column(
    headers: list[str],
    score_configs: list[dict[str, Any]],
) -> int | None:
    if not score_configs:
        return None
    return len(headers) - len(score_configs) + 1


def _build_sheet_xml(
    rows: list[list[Any]],
    *,
    highlighted_from: int | None = None,
) -> str:
    xml_rows = []
    for row_index, row in enumerate(rows, start=1):
        cells = []
        for column_index, value in enumerate(row, start=1):
            ref = f"{_excel_column_name(column_index)}{row_index}"
            style = (
                ' s="1"'
                if row_index == 1
                and highlighted_from is not None
                and column_index >= highlighted_from
                else ""
            )
            cells.append(
                f'<c r="{ref}" t="inlineStr"{style}><is><t>'
                f"{escape(_xml_text_safe(value))}</t></is></c>"
            )
        xml_rows.append(f'<row r="{row_index}">{"".join(cells)}</row>')

    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(xml_rows)}</sheetData>'
        "</worksheet>"
    )


def _excel_column_name(index: int) -> str:
    result = ""
    while index:
        index, remainder = divmod(index - 1, 26)
        result = chr(65 + remainder) + result
    return result


def _xml_text_safe(value: Any) -> str:
    return _remove_invalid_xml_chars(_excel_safe(value))


def _remove_invalid_xml_chars(value: str) -> str:
    return "".join(char for char in value if _is_valid_xml_char(char))


def _is_valid_xml_char(char: str) -> bool:
    codepoint = ord(char)
    return (
        codepoint in {0x09, 0x0A, 0x0D}
        or 0x20 <= codepoint <= 0xD7FF
        or 0xE000 <= codepoint <= 0xFFFD
        or 0x10000 <= codepoint <= 0x10FFFF
    )


def _safe_file_name(file_name: str) -> str:
    sanitized = re.sub(r'[\x00-\x1f\x7f\\/:*?"<>|]+', "-", file_name)
    sanitized = sanitized.replace("..", "")
    sanitized = sanitized.strip(".- ") or "annotation-export"
    return sanitized[:MAX_SAFE_FILE_NAME_LENGTH].rstrip(".- ") or "annotation-export"


def _csv_safe(value: Any) -> str:
    text = _stringify(value)
    stripped = text.lstrip()
    if stripped.startswith(("=", "+", "-", "@")):
        return f"'{text}"
    return text


def _content_types_xml(sheet_count: int) -> str:
    sheet_overrides = "".join(
        (
            f'  <Override PartName="/xl/worksheets/sheet{index}.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.'
            'spreadsheetml.worksheet+xml"/>\n'
        )
        for index in range(1, sheet_count + 1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n'
        '  <Default Extension="rels" '
        'ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n'
        '  <Default Extension="xml" ContentType="application/xml"/>\n'
        '  <Override PartName="/xl/workbook.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.'
        'spreadsheetml.sheet.main+xml"/>\n'
        '  <Override PartName="/xl/styles.xml" '
        'ContentType="application/vnd.openxmlformats-officedocument.'
        'spreadsheetml.styles+xml"/>\n'
        f"{sheet_overrides}"
        "</Types>"
    )


def _workbook_xml(sheet_specs: list[tuple[str, list[list[str]], int | None]]) -> str:
    sheets = "".join(
        f'    <sheet name={quoteattr(name)} sheetId="{index}" r:id="rId{index}"/>\n'
        for index, (name, _, _) in enumerate(sheet_specs, start=1)
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">\n'
        f"  <sheets>\n{sheets}  </sheets>\n"
        "</workbook>"
    )


def _workbook_rels_xml(sheet_count: int) -> str:
    worksheet_rels = "".join(
        (
            f'  <Relationship Id="rId{index}" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/'
            f'relationships/worksheet" Target="worksheets/sheet{index}.xml"/>\n'
        )
        for index in range(1, sheet_count + 1)
    )
    style_rel_id = sheet_count + 1
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/'
        'relationships">\n'
        f"{worksheet_rels}"
        f'  <Relationship Id="rId{style_rel_id}" '
        'Type="http://schemas.openxmlformats.org/officeDocument/2006/'
        'relationships/styles" Target="styles.xml"/>\n'
        "</Relationships>"
    )


_ROOT_RELS_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""

_STYLES_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fills count="3">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <cellXfs count="2">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="0" fillId="2" borderId="0" xfId="0" applyFill="1"/>
  </cellXfs>
</styleSheet>"""

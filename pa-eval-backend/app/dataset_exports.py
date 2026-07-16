import csv
import json
import re
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape

from app.langfuse_db import LangfuseDatabaseReader

EXPORT_COLUMNS = [
    ("id", "id"),
    ("status", "status"),
    ("input", "input"),
    ("expectedOutput", "expectedOutput"),
    ("metadata", "metadata"),
    ("sourceTraceId", "sourceTraceId"),
    ("sourceObservationId", "sourceObservationId"),
    ("createdAt", "createdAt"),
    ("updatedAt", "updatedAt"),
]


async def generate_dataset_export_file(
    *,
    reader: LangfuseDatabaseReader,
    project_id: str,
    dataset_id: str,
    job_id: str,
    user_id: str,
    export_format: str,
    storage_dir: str,
) -> None:
    try:
        await reader.mark_dataset_export_job_running(project_id, dataset_id, job_id)
        dataset = await reader.get_dataset_for_user(project_id, dataset_id, user_id)
        items = await reader.list_dataset_items_for_user(project_id, dataset_id, user_id)
        output_dir = Path(storage_dir).expanduser().resolve() / project_id / dataset_id
        output_dir.mkdir(parents=True, exist_ok=True)

        exported_at = datetime.now().strftime("%Y%m%d")
        dataset_name = str(dataset.get("name") or dataset_id or "dataset")
        file_name = _safe_file_name(f"{dataset_name}{exported_at}.{export_format}")
        file_path = output_dir / file_name

        if export_format == "csv":
            _write_csv(file_path, items)
        elif export_format == "txt":
            _write_txt(file_path, items)
        elif export_format == "xlsx":
            _write_xlsx(file_path, items)
        else:
            raise ValueError(f"Unsupported export format: {export_format}")

        await reader.mark_dataset_export_job_succeeded(
            project_id,
            dataset_id,
            job_id,
            total_count=len(items),
            file_name=file_name,
            file_path=str(file_path),
            file_size=file_path.stat().st_size,
        )
    except Exception as exc:
        await reader.mark_dataset_export_job_failed(
            project_id,
            dataset_id,
            job_id,
            "数据集导出失败，请稍后重试",
        )
        raise exc


def _write_csv(file_path: Path, items: list[dict[str, Any]]) -> None:
    with file_path.open("w", encoding="utf-8-sig", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=[label for label, _ in EXPORT_COLUMNS])
        writer.writeheader()
        for item in items:
            writer.writerow(_to_export_row(item))


def _write_txt(file_path: Path, items: list[dict[str, Any]]) -> None:
    with file_path.open("w", encoding="utf-8") as output:
        for item in items:
            output.write(json.dumps(_to_export_row(item), ensure_ascii=False))
            output.write("\n")


def _write_xlsx(file_path: Path, items: list[dict[str, Any]]) -> None:
    rows = [[label for label, _ in EXPORT_COLUMNS]]
    rows.extend(
        [[row[label] for label, _ in EXPORT_COLUMNS] for row in map(_to_export_row, items)]
    )
    sheet = _build_sheet_xml(rows)

    with zipfile.ZipFile(file_path, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", _CONTENT_TYPES_XML)
        archive.writestr("_rels/.rels", _ROOT_RELS_XML)
        archive.writestr("xl/workbook.xml", _WORKBOOK_XML)
        archive.writestr("xl/_rels/workbook.xml.rels", _WORKBOOK_RELS_XML)
        archive.writestr("xl/worksheets/sheet1.xml", sheet)


def _to_export_row(item: dict[str, Any]) -> dict[str, str]:
    return {label: _stringify(item.get(key)) for label, key in EXPORT_COLUMNS}


def _stringify(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    return json.dumps(value, ensure_ascii=False, default=str)


def _safe_file_name(file_name: str) -> str:
    sanitized = re.sub(r"[\x00-\x1f\x7f/\\:*?\"<>|]+", "-", file_name)
    sanitized = re.sub(r"\s+", " ", sanitized).strip(".- ")
    return sanitized or "dataset-export"


def _build_sheet_xml(rows: list[list[str]]) -> str:
    xml_rows = []
    for row_index, row in enumerate(rows, start=1):
        cells = []
        for column_index, value in enumerate(row, start=1):
            ref = f"{_excel_column_name(column_index)}{row_index}"
            cells.append(
                f'<c r="{ref}" t="inlineStr"><is><t>{escape(value)}</t></is></c>'
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


_CONTENT_TYPES_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>"""

_ROOT_RELS_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>"""

_WORKBOOK_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Dataset Items" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>"""

_WORKBOOK_RELS_XML = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>"""

from typing import Any


_SAMPLE_ROOT_ALIASES = {
    "input": "input",
    "output": "output",
    "expectedoutput": "expectedOutput",
    "expected_output": "expectedOutput",
    "context": "context",
    "metadata": "metadata",
    "trace": "trace",
    "observation": "observation",
    "datasetitem": "datasetItem",
    "dataset_item": "datasetItem",
}


def normalize_sample_mapping_template(value: Any) -> Any:
    if not isinstance(value, str):
        return value

    template = value.strip()
    if not template:
        return value

    if "{{" in template and "}}" in template:
        return _normalize_mustache_template(template)

    if template.startswith("{") and template.endswith("}"):
        expression = template[1:-1].strip()
        normalized = _normalize_sample_path_expression(expression)
        return f"{{{{ {normalized} }}}}" if normalized else value

    normalized = _normalize_sample_path_expression(template)
    return f"{{{{ {normalized} }}}}" if normalized else value


def normalize_sample_mapping(
    mapping: dict[str, Any] | None,
    input_variables: list[str] | None = None,
) -> dict[str, Any]:
    if not isinstance(mapping, dict):
        mapping = {}
    normalized = {
        key: normalize_sample_mapping_template(value)
        for key, value in mapping.items()
    }
    for variable in input_variables or []:
        if variable not in normalized:
            normalized[variable] = normalize_sample_mapping_template(variable)
    return normalized


def _normalize_mustache_template(template: str) -> str:
    result = template
    offset = 0
    while True:
        start = result.find("{{", offset)
        if start < 0:
            return result
        end = result.find("}}", start)
        if end < 0:
            return result
        expression = result[start + 2 : end].strip()
        normalized = _normalize_sample_path_expression(expression)
        if normalized:
            replacement = f"{{{{ {normalized} }}}}"
            result = f"{result[:start]}{replacement}{result[end + 2:]}"
            offset = start + len(replacement)
        else:
            offset = end + 2


def _normalize_sample_path_expression(expression: str) -> str | None:
    path = expression.strip().strip(".")
    if not path:
        return None

    if path.startswith("sample."):
        path = path.removeprefix("sample.")

    parts = [part for part in path.split(".") if part]
    if not parts:
        return None

    root = _SAMPLE_ROOT_ALIASES.get(parts[0].replace("-", "_").lower())
    if root is None:
        return None

    return ".".join(["sample", root, *parts[1:]])

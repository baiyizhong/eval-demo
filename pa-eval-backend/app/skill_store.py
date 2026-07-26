import io
import re
import shutil
import tarfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

import yaml

from app.errors import BusinessError

SKILL_NAME_PATTERN = re.compile(r"^[a-z0-9-]+$")
MAX_SKILL_NAME_LENGTH = 64
_SKILL_MD = "SKILL.md"


class SkillStore:
    def __init__(self, skill_root: str, builtin_dir: str | None = None) -> None:
        self._root = Path(skill_root)
        self._builtin_dir = (
            Path(builtin_dir) if builtin_dir else self._root / "_builtin"
        )

    def _validate_skill_name(self, name: str) -> None:
        if (
            not name
            or len(name) > MAX_SKILL_NAME_LENGTH
            or not SKILL_NAME_PATTERN.match(name)
        ):
            raise BusinessError(4001, f"无效的 skill 名称: {name}")
        if ".." in name or "/" in name or "\\" in name:
            raise BusinessError(4001, "skill 名称包含非法字符")

    def _project_dir(self, project_id: str) -> Path:
        return self._root / project_id

    def _builtin_skill_dir(self, name: str) -> Path | None:
        path = self._builtin_dir / name
        return path if path.is_dir() else None

    def _project_skill_dir(self, project_id: str, name: str) -> Path | None:
        path = self._project_dir(project_id) / name
        return path if path.is_dir() else None

    def _read_skill_md(self, skill_dir: Path) -> str:
        skill_md_path = skill_dir / _SKILL_MD
        if not skill_md_path.is_file():
            raise BusinessError(4002, f"skill 目录缺少 {_SKILL_MD}")
        return skill_md_path.read_text(encoding="utf-8")

    @staticmethod
    def _parse_frontmatter(content: str) -> tuple[dict[str, object], str]:
        if not content.startswith("---"):
            return {}, content
        parts = content.split("---", 2)
        if len(parts) < 3:
            return {}, content
        try:
            frontmatter = yaml.safe_load(parts[1]) or {}
        except yaml.YAMLError as exc:
            raise BusinessError(4002, f"SKILL.md frontmatter 解析失败: {exc}") from exc
        if not isinstance(frontmatter, dict):
            raise BusinessError(4002, "SKILL.md frontmatter 必须是字典")
        return frontmatter, parts[2].strip()

    def _skill_payload(
        self,
        name: str,
        skill_dir: Path,
        source: str,
    ) -> dict[str, object]:
        content = self._read_skill_md(skill_dir)
        frontmatter, body = self._parse_frontmatter(content)
        stat = skill_dir.stat()
        return {
            "name": name,
            "description": str(frontmatter.get("description") or ""),
            "source": source,
            "variables": list(frontmatter.get("variables") or []),
            "skillMd": content,
            "body": body,
            "updatedAt": datetime.fromtimestamp(
                stat.st_mtime, tz=timezone.utc
            ).isoformat(),
        }

    def list_skills(self, project_id: str) -> list[dict[str, object]]:
        skills: list[dict[str, object]] = []
        seen_names: set[str] = set()

        builtin_base = self._builtin_dir
        if builtin_base.is_dir():
            for entry in sorted(builtin_base.iterdir()):
                if not entry.is_dir():
                    continue
                if not (entry / _SKILL_MD).is_file():
                    continue
                name = entry.name
                if name in seen_names:
                    continue
                seen_names.add(name)
                try:
                    skills.append(
                        self._skill_payload(name, entry, source="BUILTIN")
                    )
                except BusinessError:
                    continue

        project_base = self._project_dir(project_id)
        if project_base.is_dir():
            for entry in sorted(project_base.iterdir()):
                if not entry.is_dir():
                    continue
                if not (entry / _SKILL_MD).is_file():
                    continue
                name = entry.name
                if name in seen_names:
                    continue
                seen_names.add(name)
                try:
                    skills.append(
                        self._skill_payload(name, entry, source="PROJECT")
                    )
                except BusinessError:
                    continue

        return skills

    def get_skill_detail(
        self, project_id: str, name: str
    ) -> dict[str, object]:
        self._validate_skill_name(name)
        project_dir = self._project_skill_dir(project_id, name)
        if project_dir is not None:
            return self._skill_payload(name, project_dir, source="PROJECT")
        builtin_dir = self._builtin_skill_dir(name)
        if builtin_dir is not None:
            return self._skill_payload(name, builtin_dir, source="BUILTIN")
        raise BusinessError(4004, f"skill 不存在: {name}")

    def skill_path(self, project_id: str, name: str) -> Path:
        self._validate_skill_name(name)
        project_dir = self._project_skill_dir(project_id, name)
        if project_dir is not None:
            return project_dir
        builtin_dir = self._builtin_skill_dir(name)
        if builtin_dir is not None:
            return builtin_dir
        raise BusinessError(4004, f"skill 不存在: {name}")

    def skill_dirs_for_project(self, project_id: str) -> list[Path]:
        dirs: list[Path] = []
        project_base = self._project_dir(project_id)
        if project_base.is_dir():
            dirs.append(project_base)
        if self._builtin_dir.is_dir():
            dirs.append(self._builtin_dir)
        return dirs

    def upload_skill(
        self,
        project_id: str,
        name: str,
        file_bytes: bytes,
        filename: str,
        overwrite: bool = False,
    ) -> dict[str, object]:
        self._validate_skill_name(name)
        target_dir = self._project_dir(project_id) / name
        if target_dir.exists():
            if not overwrite:
                raise BusinessError(4009, f"skill 已存在: {name}")
            shutil.rmtree(target_dir)

        extracted = self._extract_archive(file_bytes, filename)
        try:
            self._validate_extracted_skill(extracted, name)
            target_dir.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(extracted), str(target_dir))
        finally:
            if extracted.exists():
                shutil.rmtree(extracted, ignore_errors=True)

        return self._skill_payload(name, target_dir, source="PROJECT")

    def delete_skill(self, project_id: str, name: str) -> None:
        self._validate_skill_name(name)
        project_dir = self._project_skill_dir(project_id, name)
        if project_dir is None:
            if self._builtin_skill_dir(name) is not None:
                raise BusinessError(4003, "预置 skill 不可删除")
            raise BusinessError(4004, f"skill 不存在: {name}")
        shutil.rmtree(project_dir)

    def _extract_archive(self, file_bytes: bytes, filename: str) -> Path:
        temp_dir = Path(_generate_temp_dir())
        temp_dir.mkdir(parents=True, exist_ok=True)

        lower_name = filename.lower()
        if lower_name.endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(file_bytes)) as archive:
                _safe_extract_zip(archive, temp_dir)
        elif lower_name.endswith((".tar.gz", ".tgz")):
            with tarfile.open(fileobj=io.BytesIO(file_bytes), mode="r:gz") as archive:
                _safe_extract_tar(archive, temp_dir)
        else:
            shutil.rmtree(temp_dir, ignore_errors=True)
            raise BusinessError(4001, "仅支持 .zip 或 .tar.gz 格式")

        return _find_skill_root(temp_dir)

    def _validate_extracted_skill(
        self, skill_dir: Path, expected_name: str
    ) -> None:
        skill_md = skill_dir / _SKILL_MD
        if not skill_md.is_file():
            raise BusinessError(4002, f"压缩包缺少 {_SKILL_MD}")
        content = skill_md.read_text(encoding="utf-8")
        frontmatter, _ = self._parse_frontmatter(content)
        fm_name = str(frontmatter.get("name") or "").strip()
        if fm_name != expected_name:
            raise BusinessError(
                4002,
                f"SKILL.md name({fm_name})与请求 name({expected_name})不一致",
            )


def _generate_temp_dir() -> str:
    import uuid

    return f"/tmp/pa-eval-skill-upload-{uuid.uuid4().hex}"


def _is_within_directory(directory: Path, target: Path) -> bool:
    try:
        directory.resolve().relative_to(target.resolve())
        return False
    except ValueError:
        pass
    try:
        target.resolve().relative_to(directory.resolve())
        return True
    except ValueError:
        return False


def _safe_extract_zip(archive: zipfile.ZipFile, target: Path) -> None:
    for member in archive.namelist():
        member_path = (target / member).resolve()
        if not _is_within_directory(target, member_path.parent):
            continue
        archive.extract(member, target)


def _safe_extract_tar(archive: tarfile.TarFile, target: Path) -> None:
    for member in archive.getmembers():
        member_path = (target / member.name).resolve()
        if not _is_within_directory(target, member_path.parent):
            continue
        archive.extract(member, target)


def _find_skill_root(extracted_dir: Path) -> Path:
    if (extracted_dir / _SKILL_MD).is_file():
        return extracted_dir
    for child in extracted_dir.iterdir():
        if child.is_dir() and (child / _SKILL_MD).is_file():
            return child
    raise BusinessError(4002, f"压缩包中未找到 {_SKILL_MD}")

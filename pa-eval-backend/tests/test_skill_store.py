import io
import tarfile
import zipfile
from pathlib import Path

import pytest

from app.errors import BusinessError
from app.skill_store import SkillStore


SKILL_MD_TEMPLATE = """---
name: {name}
description: test skill
---

# Test Skill

 evaluates samples.
"""


def _make_zip(name: str) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr(
            f"{name}/SKILL.md",
            SKILL_MD_TEMPLATE.format(name=name),
        )
    return buffer.getvalue()


def _make_targz(name: str) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        import io as _io

        data = SKILL_MD_TEMPLATE.format(name=name).encode("utf-8")
        info = tarfile.TarInfo(name=f"{name}/SKILL.md")
        info.size = len(data)
        archive.addfile(info, _io.BytesIO(data))
    return buffer.getvalue()


@pytest.fixture()
def skill_store(tmp_path: Path) -> SkillStore:
    root = tmp_path / "skills"
    builtin = root / "_builtin"
    builtin.mkdir(parents=True)
    (builtin / "builtin-skill").mkdir()
    (builtin / "builtin-skill" / "SKILL.md").write_text(
        SKILL_MD_TEMPLATE.format(name="builtin-skill"),
        encoding="utf-8",
    )
    return SkillStore(skill_root=str(root), builtin_dir=str(builtin))


def test_list_skills_merges_builtin_and_project(skill_store: SkillStore) -> None:
    project_dir = Path(skill_store._root) / "proj-1"
    (project_dir / "custom-skill").mkdir(parents=True)
    (project_dir / "custom-skill" / "SKILL.md").write_text(
        SKILL_MD_TEMPLATE.format(name="custom-skill"),
        encoding="utf-8",
    )
    skills = skill_store.list_skills("proj-1")
    names = [s["name"] for s in skills]
    assert "builtin-skill" in names
    assert "custom-skill" in names


def test_get_skill_detail_builtin(skill_store: SkillStore) -> None:
    detail = skill_store.get_skill_detail("proj-1", "builtin-skill")
    assert detail["source"] == "BUILTIN"
    assert detail["name"] == "builtin-skill"


def test_get_skill_detail_not_found(skill_store: SkillStore) -> None:
    with pytest.raises(BusinessError):
        skill_store.get_skill_detail("proj-1", "nonexistent")


def test_validate_skill_name_rejects_traversal(skill_store: SkillStore) -> None:
    with pytest.raises(BusinessError):
        skill_store._validate_skill_name("../etc")
    with pytest.raises(BusinessError):
        skill_store._validate_skill_name("a/b")
    with pytest.raises(BusinessError):
        skill_store._validate_skill_name("UPPER")
    with pytest.raises(BusinessError):
        skill_store._validate_skill_name("")


def test_upload_skill_zip(skill_store: SkillStore) -> None:
    zip_bytes = _make_zip("my-skill")
    result = skill_store.upload_skill(
        project_id="proj-1",
        name="my-skill",
        file_bytes=zip_bytes,
        filename="my-skill.zip",
    )
    assert result["name"] == "my-skill"
    assert result["source"] == "PROJECT"
    assert (
        Path(skill_store._root) / "proj-1" / "my-skill" / "SKILL.md"
    ).is_file()


def test_upload_skill_targz(skill_store: SkillStore) -> None:
    targz_bytes = _make_targz("tgz-skill")
    result = skill_store.upload_skill(
        project_id="proj-1",
        name="tgz-skill",
        file_bytes=targz_bytes,
        filename="tgz-skill.tar.gz",
    )
    assert result["name"] == "tgz-skill"


def test_upload_skill_rejects_unsupported_format(skill_store: SkillStore) -> None:
    with pytest.raises(BusinessError):
        skill_store.upload_skill(
            project_id="proj-1",
            name="bad-skill",
            file_bytes=b"x",
            filename="bad.exe",
        )


def test_upload_skill_rejects_name_mismatch(skill_store: SkillStore) -> None:
    zip_bytes = _make_zip("actual-name")
    with pytest.raises(BusinessError):
        skill_store.upload_skill(
            project_id="proj-1",
            name="wrong-name",
            file_bytes=zip_bytes,
            filename="x.zip",
        )


def test_upload_skill_overwrite(skill_store: SkillStore) -> None:
    zip_bytes_v1 = _make_zip("ov-skill")
    skill_store.upload_skill(
        project_id="proj-1",
        name="ov-skill",
        file_bytes=zip_bytes_v1,
        filename="v1.zip",
    )
    with pytest.raises(BusinessError):
        skill_store.upload_skill(
            project_id="proj-1",
            name="ov-skill",
            file_bytes=_make_zip("ov-skill"),
            filename="v2.zip",
            overwrite=False,
        )
    result = skill_store.upload_skill(
        project_id="proj-1",
        name="ov-skill",
        file_bytes=_make_zip("ov-skill"),
        filename="v2.zip",
        overwrite=True,
    )
    assert result["name"] == "ov-skill"


def test_delete_skill_project(skill_store: SkillStore) -> None:
    zip_bytes = _make_zip("del-skill")
    skill_store.upload_skill(
        project_id="proj-1",
        name="del-skill",
        file_bytes=zip_bytes,
        filename="del.zip",
    )
    skill_store.delete_skill("proj-1", "del-skill")
    with pytest.raises(BusinessError):
        skill_store.get_skill_detail("proj-1", "del-skill")


def test_delete_skill_builtin_rejected(skill_store: SkillStore) -> None:
    with pytest.raises(BusinessError):
        skill_store.delete_skill("proj-1", "builtin-skill")

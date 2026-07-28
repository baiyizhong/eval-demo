import pytest

from app.langfuse.encryption import decrypt_langfuse_secret


def test_decrypts_langfuse_aes_256_gcm_ciphertext() -> None:
    ciphertext = (
        "111111111111111111111111:"
        "d47d5e9eb4f95721ead0a3feeb661d:"
        "1f3536c46524839776511d3703c816dd"
    )

    assert decrypt_langfuse_secret(ciphertext, "00" * 32) == "provider-secret"


@pytest.mark.parametrize("key", ["", "00", "zz" * 32])
def test_rejects_invalid_langfuse_encryption_key(key: str) -> None:
    with pytest.raises(ValueError, match="ENCRYPTION_KEY"):
        decrypt_langfuse_secret("11:22:33", key)


def test_rejects_corrupted_ciphertext_without_exposing_it() -> None:
    with pytest.raises(ValueError, match="无法解密") as exc_info:
        decrypt_langfuse_secret("11:22:33", "00" * 32)

    assert "11:22:33" not in str(exc_info.value)

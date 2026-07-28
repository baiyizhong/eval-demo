from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def decrypt_langfuse_secret(ciphertext: str, encryption_key: str) -> str:
    """Decrypt Langfuse's iv:ciphertext:tag AES-256-GCM envelope."""
    if len(encryption_key) != 64:
        raise ValueError("Langfuse ENCRYPTION_KEY 必须是 64 位十六进制字符串")
    try:
        key = bytes.fromhex(encryption_key)
    except ValueError as exc:
        raise ValueError("Langfuse ENCRYPTION_KEY 必须是 64 位十六进制字符串") from exc
    if len(key) != 32:
        raise ValueError("Langfuse ENCRYPTION_KEY 必须是 64 位十六进制字符串")

    try:
        iv_hex, encrypted_hex, tag_hex = ciphertext.split(":")
        iv = bytes.fromhex(iv_hex)
        encrypted = bytes.fromhex(encrypted_hex)
        tag = bytes.fromhex(tag_hex)
        return AESGCM(key).decrypt(iv, encrypted + tag, None).decode("utf-8")
    except (UnicodeDecodeError, ValueError, InvalidTag) as exc:
        raise ValueError("Langfuse LLM 连接密钥无法解密") from exc

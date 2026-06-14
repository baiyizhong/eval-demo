import base64
import hashlib

from cryptography.fernet import Fernet


def build_fernet(secret: str) -> Fernet:
    digest = hashlib.sha256(secret.encode("utf-8")).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_secret(secret: str, encryption_secret: str) -> str:
    return build_fernet(encryption_secret).encrypt(secret.encode("utf-8")).decode("utf-8")


def decrypt_secret(token: str, encryption_secret: str) -> str:
    return build_fernet(encryption_secret).decrypt(token.encode("utf-8")).decode("utf-8")

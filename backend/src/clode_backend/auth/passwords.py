from __future__ import annotations

import base64
import hashlib
import hmac
import secrets


PASSWORD_ALGORITHM = "pbkdf2_sha256"
PASSWORD_ITERATIONS = 210_000


def looks_like_password_hash(value: str) -> bool:
    return str(value or "").startswith(f"{PASSWORD_ALGORITHM}$")


def hash_password(password: str, *, iterations: int = PASSWORD_ITERATIONS) -> str:
    secret = str(password or "")
    if not secret:
        raise ValueError("Password cannot be empty.")

    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256",
        secret.encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    return f"{PASSWORD_ALGORITHM}${iterations}${salt}${base64.b64encode(digest).decode('ascii')}"


def verify_password(password: str, encoded_hash: str) -> bool:
    try:
        algorithm, iterations_raw, salt, digest_b64 = str(encoded_hash or "").split("$", 3)
        if algorithm != PASSWORD_ALGORITHM:
            return False
        iterations = int(iterations_raw)
        expected = base64.b64decode(digest_b64.encode("ascii"))
    except Exception:
        return False

    candidate = hashlib.pbkdf2_hmac(
        "sha256",
        str(password or "").encode("utf-8"),
        salt.encode("utf-8"),
        iterations,
    )
    return hmac.compare_digest(candidate, expected)

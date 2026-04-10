from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    database_url: str
    project_root: Path
    allowed_origins: tuple[str, ...]
    session_ttl_hours: int

    @property
    def sqlite_path(self) -> Path:
        if not self.database_url.startswith("sqlite:///"):
            raise RuntimeError("SQLite path requested for non-sqlite database URL.")
        return Path(self.database_url.replace("sqlite:///", "", 1))


def load_settings() -> Settings:
    project_root = Path(__file__).resolve().parents[3]
    default_db = project_root / "backend" / "var" / "clode.db"
    def read_env(primary_name: str, legacy_name: str, default: str) -> str:
        return str(os.getenv(primary_name) or os.getenv(legacy_name) or default)

    database_url = read_env("CLODE_DATABASE_URL", "AGENT_DATABASE_URL", f"sqlite:///{default_db.as_posix()}")
    allowed_origins = tuple(
        origin.strip()
        for origin in read_env(
            "CLODE_ALLOWED_ORIGINS",
            "AGENT_ALLOWED_ORIGINS",
            "http://127.0.0.1:8082,http://localhost:8082,http://127.0.0.1:8080,http://localhost:8080,null",
        ).split(",")
        if origin.strip()
    )
    return Settings(
        host=read_env("CLODE_BACKEND_HOST", "AGENT_BACKEND_HOST", "127.0.0.1"),
        port=int(read_env("CLODE_BACKEND_PORT", "AGENT_BACKEND_PORT", "8787")),
        database_url=database_url,
        project_root=project_root,
        allowed_origins=allowed_origins,
        session_ttl_hours=int(read_env("CLODE_SESSION_TTL_HOURS", "AGENT_SESSION_TTL_HOURS", "168")),
    )


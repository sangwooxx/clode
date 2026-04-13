from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import tempfile


@dataclass(frozen=True)
class Settings:
    host: str
    port: int
    database_url: str
    database_seed_path: Path | None
    allow_demo_seed_import: bool
    project_root: Path
    allowed_origins: tuple[str, ...]
    session_ttl_hours: int
    is_vercel: bool

    @property
    def sqlite_path(self) -> Path:
        if not self.database_url.startswith("sqlite:///"):
            raise RuntimeError("SQLite path requested for non-sqlite database URL.")
        return Path(self.database_url.replace("sqlite:///", "", 1))

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite:///")

    @property
    def is_postgres(self) -> bool:
        normalized = self.database_url.lower()
        return normalized.startswith("postgresql://") or normalized.startswith("postgres://")


def load_settings() -> Settings:
    project_root = Path(__file__).resolve().parents[3]
    default_db = project_root / "backend" / "var" / "clode.db"
    default_seed_db = project_root / "backend" / "seed" / "clode-demo.db"

    def read_env(primary_name: str, legacy_name: str, default: str) -> str:
        return str(os.getenv(primary_name) or os.getenv(legacy_name) or default)

    is_vercel = bool(str(os.getenv("VERCEL") or os.getenv("VERCEL_ENV") or "").strip())
    configured_database_url = str(
        os.getenv("CLODE_DATABASE_URL")
        or os.getenv("AGENT_DATABASE_URL")
        or os.getenv("DATABASE_URL")
        or ""
    ).strip()
    configured_seed_path = str(os.getenv("CLODE_DATABASE_SEED_PATH") or os.getenv("AGENT_DATABASE_SEED_PATH") or "").strip()
    allow_demo_seed_import = str(
        os.getenv("CLODE_ENABLE_DEMO_SEED_IMPORT")
        or os.getenv("AGENT_ENABLE_DEMO_SEED_IMPORT")
        or ""
    ).strip().lower() in {"1", "true", "yes", "on"}

    if configured_database_url:
        database_url = configured_database_url
    elif is_vercel:
        database_url = f"sqlite:///{(Path(tempfile.gettempdir()) / 'clode.db').as_posix()}"
    else:
        database_url = f"sqlite:///{default_db.as_posix()}"

    database_seed_path = None
    if configured_seed_path:
        database_seed_path = Path(configured_seed_path)
    elif is_vercel and allow_demo_seed_import:
        if default_seed_db.exists():
            database_seed_path = default_seed_db
        elif default_db.exists():
            database_seed_path = default_db

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
        database_seed_path=database_seed_path,
        allow_demo_seed_import=allow_demo_seed_import,
        project_root=project_root,
        allowed_origins=allowed_origins,
        session_ttl_hours=int(read_env("CLODE_SESSION_TTL_HOURS", "AGENT_SESSION_TTL_HOURS", "168")),
        is_vercel=is_vercel,
    )


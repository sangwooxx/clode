from __future__ import annotations

from agent_backend.config import Settings
from agent_backend.db.connection import connect


class RepositoryBase:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def connect(self):
        return connect(self.settings)

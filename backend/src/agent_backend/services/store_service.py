from __future__ import annotations

from typing import Any

from agent_backend.repositories.store_repository import StoreRepository


class StoreService:
    def __init__(self, repository: StoreRepository) -> None:
        self.repository = repository

    def list_stores(self) -> list[str]:
        return self.repository.list_names()

    def get_store(self, store_name: str) -> Any | None:
        return self.repository.get(store_name)

    def save_store(self, store_name: str, payload: Any) -> Any:
        return self.repository.save(store_name, payload)

    def delete_store(self, store_name: str) -> None:
        self.repository.delete(store_name)

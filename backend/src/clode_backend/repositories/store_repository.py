from __future__ import annotations

import json
from typing import Any

from clode_backend.repositories.base import RepositoryBase


class StoreRepository(RepositoryBase):
    def list_names(self) -> list[str]:
        with self.connect() as connection:
            rows = connection.execute(
                "SELECT store_name FROM store_documents ORDER BY store_name ASC"
            ).fetchall()
        return [row["store_name"] for row in rows]

    def get(self, store_name: str) -> Any | None:
        with self.connect() as connection:
            row = connection.execute(
                "SELECT payload_json FROM store_documents WHERE store_name = ?",
                (store_name,),
            ).fetchone()
        if not row:
            return None
        return json.loads(row["payload_json"])

    def save(self, store_name: str, payload: Any) -> Any:
        payload_json = json.dumps(payload, ensure_ascii=False)
        with self.connect() as connection:
            connection.execute(
                """
                INSERT INTO store_documents (store_name, payload_json, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(store_name) DO UPDATE SET
                    payload_json = excluded.payload_json,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (store_name, payload_json),
            )
            connection.commit()
        return payload

    def delete(self, store_name: str) -> None:
        with self.connect() as connection:
            connection.execute("DELETE FROM store_documents WHERE store_name = ?", (store_name,))
            connection.commit()


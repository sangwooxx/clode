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

    def get(self, store_name: str, *, connection=None) -> Any | None:
        if connection is None:
            with self.connect() as local_connection:
                row = local_connection.execute(
                    "SELECT payload_json FROM store_documents WHERE store_name = ?",
                    (store_name,),
                ).fetchone()
        else:
            row = connection.execute(
                "SELECT payload_json FROM store_documents WHERE store_name = ?",
                (store_name,),
            ).fetchone()
        if not row:
            return None
        return json.loads(row["payload_json"])

    def save(self, store_name: str, payload: Any, *, connection=None) -> Any:
        payload_json = json.dumps(payload, ensure_ascii=False)
        if connection is None:
            with self.connect() as local_connection:
                local_connection.execute(
                    """
                    INSERT INTO store_documents (store_name, payload_json, updated_at)
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                    ON CONFLICT(store_name) DO UPDATE SET
                        payload_json = excluded.payload_json,
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (store_name, payload_json),
                )
                local_connection.commit()
        else:
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
        return payload

    def delete(self, store_name: str, *, connection=None) -> None:
        if connection is None:
            with self.connect() as local_connection:
                local_connection.execute("DELETE FROM store_documents WHERE store_name = ?", (store_name,))
                local_connection.commit()
            return
        connection.execute("DELETE FROM store_documents WHERE store_name = ?", (store_name,))


from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class StoreDocument:
    store_name: str
    payload: Any
    updated_at: str

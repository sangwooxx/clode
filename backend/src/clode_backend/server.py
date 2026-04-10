from __future__ import annotations

from clode_backend.app import create_server
from clode_backend.config import load_settings


def run() -> None:
    settings = load_settings()
    server = create_server()
    print(f"Clode backend listening on http://{settings.host}:{settings.port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


from __future__ import annotations

from typing import Any

from clode_backend.auth.rbac import effective_permissions, normalize_role


def build_public_user(user: dict[str, Any] | None) -> dict[str, Any] | None:
    if not user:
        return None

    role = normalize_role(user.get("role"))
    is_active = bool(user.get("is_active", True))

    return {
        "id": user["id"],
        "name": user["name"],
        "displayName": user["name"],
        "username": user["username"],
        "email": user.get("email", ""),
        "role": role,
        "status": "active" if is_active else "inactive",
        "is_active": is_active,
        "permissions": effective_permissions(role, user.get("permissions")),
        "canApproveVacations": bool(user.get("can_approve_vacations")),
        "created_at": user.get("created_at", ""),
        "updated_at": user.get("updated_at", ""),
        "last_login_at": user.get("last_login_at", ""),
    }

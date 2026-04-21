from __future__ import annotations

from typing import Any


VIEW_IDS = (
    "dashboardView",
    "contractsView",
    "hoursView",
    "invoicesView",
    "employeesView",
    "planningView",
    "workwearView",
    "vacationsView",
    "settingsView",
)

MANAGE_IDS = (
    "contractsManage",
    "hoursManage",
    "invoicesManage",
    "employeesManage",
    "planningManage",
    "workwearManage",
    "vacationsManage",
    "settingsManage",
)

PERMISSION_IDS = VIEW_IDS + MANAGE_IDS

VIEW_TO_MANAGE = {
    "contractsView": "contractsManage",
    "hoursView": "hoursManage",
    "invoicesView": "invoicesManage",
    "employeesView": "employeesManage",
    "planningView": "planningManage",
    "workwearView": "workwearManage",
    "vacationsView": "vacationsManage",
    "settingsView": "settingsManage",
}

STORE_READ_PERMISSIONS = {
    "contracts": "contractsView",
    "contracts_deleted": "contractsView",
    "employees": "employeesView",
    "hours": "hoursView",
    "work_cards": "hoursView",
    "invoices": "invoicesView",
    "vacations": "vacationsView",
    "planning": "planningView",
    "workwear_issues": "workwearView",
    "workwear_catalog": "workwearView",
    "audit_logs": "settingsView",
    "notifications": "dashboardView",
    "settings": "settingsView",
}

STORE_WRITE_PERMISSIONS = {
    "contracts": "contractsManage",
    "contracts_deleted": "contractsManage",
    "employees": "employeesManage",
    "hours": "hoursManage",
    "work_cards": "hoursManage",
    "invoices": "invoicesManage",
    "vacations": "vacationsManage",
    "planning": "planningManage",
    "workwear_issues": "workwearManage",
    "workwear_catalog": "workwearManage",
    "audit_logs": "settingsManage",
    "settings": "settingsManage",
}

ROLE_ALIASES = {
    "administrator": "admin",
    "admin": "admin",
    "księgowość": "ksiegowosc",
    "ksiegowosc": "ksiegowosc",
    "kierownik": "kierownik",
    "kadry": "kierownik",
    "read-only": "read-only",
    "readonly": "read-only",
    "użytkownik": "read-only",
    "uzytkownik": "read-only",
}

ROLE_DEFAULT_PERMISSIONS = {
    "admin": {permission_id: True for permission_id in PERMISSION_IDS},
    "ksiegowosc": {
        "dashboardView": True,
        "contractsView": True,
        "hoursView": True,
        "invoicesView": True,
        "invoicesManage": True,
    },
    "kierownik": {
        "dashboardView": True,
        "contractsView": True,
        "hoursView": True,
        "invoicesView": True,
        "employeesView": True,
        "planningView": True,
        "workwearView": True,
        "vacationsView": True,
        "hoursManage": True,
        "employeesManage": True,
        "planningManage": True,
        "workwearManage": True,
        "vacationsManage": True,
    },
    "read-only": {
        "dashboardView": True,
        "contractsView": True,
        "invoicesView": True,
    },
}


def normalize_role(role: str | None) -> str:
    normalized = str(role or "").strip().lower()
    return ROLE_ALIASES.get(normalized, "read-only")


def default_permissions_for_role(role: str | None) -> dict[str, bool]:
    canonical_role = normalize_role(role)
    defaults = ROLE_DEFAULT_PERMISSIONS.get(canonical_role, ROLE_DEFAULT_PERMISSIONS["read-only"])
    normalized = {permission_id: bool(defaults.get(permission_id, False)) for permission_id in PERMISSION_IDS}
    _promote_manage_permissions(normalized)
    return normalized


def effective_permissions(role: str | None, explicit_permissions: dict[str, Any] | None = None) -> dict[str, bool]:
    canonical_role = normalize_role(role)
    if canonical_role == "admin":
        return {permission_id: True for permission_id in PERMISSION_IDS}

    merged = default_permissions_for_role(canonical_role)
    for permission_id, allowed in (explicit_permissions or {}).items():
        if permission_id not in PERMISSION_IDS:
            continue
        merged[permission_id] = bool(allowed)
    _promote_manage_permissions(merged)
    return merged


def can_access_view(role: str | None, permissions: dict[str, Any] | None, view_id: str) -> bool:
    if view_id == "homeView":
        return True
    return bool(effective_permissions(role, permissions).get(view_id, False))


def can_manage_view(role: str | None, permissions: dict[str, Any] | None, view_id: str) -> bool:
    manage_permission = VIEW_TO_MANAGE.get(view_id)
    if not manage_permission:
        return normalize_role(role) == "admin"
    return bool(effective_permissions(role, permissions).get(manage_permission, False))


def can_access_store(role: str | None, permissions: dict[str, Any] | None, store_name: str) -> bool:
    return can_read_store(role, permissions, store_name)


def can_read_store(role: str | None, permissions: dict[str, Any] | None, store_name: str) -> bool:
    required_view = STORE_READ_PERMISSIONS.get(store_name)
    if not required_view:
        return normalize_role(role) == "admin"
    return can_access_view(role, permissions, required_view)


def can_write_store(role: str | None, permissions: dict[str, Any] | None, store_name: str) -> bool:
    required_permission = STORE_WRITE_PERMISSIONS.get(store_name)
    if not required_permission:
        return normalize_role(role) == "admin"
    return bool(effective_permissions(role, permissions).get(required_permission, False))


def _promote_manage_permissions(permissions: dict[str, bool]) -> None:
    for view_id, manage_id in VIEW_TO_MANAGE.items():
        if permissions.get(manage_id):
            permissions[view_id] = True

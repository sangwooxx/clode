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


ROLE_ALIASES = {
    "administrator": "admin",
    "admin": "admin",
    "księgowość": "księgowość",
    "ksiegowosc": "księgowość",
    "kierownik": "kierownik",
    "kadry": "kierownik",
    "read-only": "read-only",
    "readonly": "read-only",
    "użytkownik": "read-only",
    "uzytkownik": "read-only",
}


ROLE_DEFAULT_PERMISSIONS = {
    "admin": {view_id: True for view_id in VIEW_IDS},
    "księgowość": {
        "dashboardView": True,
        "contractsView": True,
        "hoursView": True,
        "invoicesView": True,
        "employeesView": False,
        "planningView": False,
        "workwearView": False,
        "vacationsView": False,
        "settingsView": False,
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
        "settingsView": False,
    },
    "read-only": {
        "dashboardView": True,
        "contractsView": True,
        "hoursView": False,
        "invoicesView": True,
        "employeesView": False,
        "planningView": False,
        "workwearView": False,
        "vacationsView": False,
        "settingsView": False,
    },
}


STORE_PERMISSIONS = {
    "contracts": "contractsView",
    "contracts_deleted": "contractsView",
    "employees": "employeesView",
    "hours": "hoursView",
    "invoices": "invoicesView",
    "vacations": "vacationsView",
    "planning": "planningView",
    "workwear_issues": "workwearView",
    "workwear_catalog": "workwearView",
    "audit_logs": "settingsView",
    "notifications": "dashboardView",
    "settings": "settingsView",
}


def normalize_role(role: str | None) -> str:
    normalized = str(role or "").strip().lower()
    return ROLE_ALIASES.get(normalized, "read-only")


def default_permissions_for_role(role: str | None) -> dict[str, bool]:
    canonical_role = normalize_role(role)
    defaults = ROLE_DEFAULT_PERMISSIONS.get(canonical_role, ROLE_DEFAULT_PERMISSIONS["read-only"])
    return {view_id: bool(defaults.get(view_id, False)) for view_id in VIEW_IDS}


def effective_permissions(role: str | None, explicit_permissions: dict[str, Any] | None = None) -> dict[str, bool]:
    canonical_role = normalize_role(role)
    if canonical_role == "admin":
        return {view_id: True for view_id in VIEW_IDS}

    merged = default_permissions_for_role(canonical_role)
    for view_id, allowed in (explicit_permissions or {}).items():
        if view_id not in VIEW_IDS:
            continue
        merged[view_id] = bool(allowed)
    merged["settingsView"] = False
    return merged


def can_access_view(role: str | None, permissions: dict[str, Any] | None, view_id: str) -> bool:
    if view_id == "homeView":
        return True
    return bool(effective_permissions(role, permissions).get(view_id, False))


def can_access_store(role: str | None, permissions: dict[str, Any] | None, store_name: str) -> bool:
    required_view = STORE_PERMISSIONS.get(store_name)
    if not required_view:
        return normalize_role(role) == "admin"
    return can_access_view(role, permissions, required_view)

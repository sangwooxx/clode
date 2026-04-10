from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class Contract:
    id: str
    contract_number: str
    name: str
    investor: str
    signed_date: str
    end_date: str
    contract_value: float
    status: str
    created_at: str
    updated_at: str
    deleted_at: str | None = None


@dataclass
class Employee:
    id: str
    name: str
    first_name: str
    last_name: str
    position: str
    status: str
    employment_date: str
    employment_end_date: str
    street: str
    city: str
    phone: str
    medical_exam_valid_until: str


@dataclass
class Invoice:
    id: str
    contract_id: str | None
    contract_name: str
    invoice_type: str
    issue_date: str
    invoice_number: str
    counterparty_name: str
    category_or_description: str
    cost_category: str
    notes: str
    amount_net: float
    amount_vat: float
    amount_gross: float
    vat_rate: float
    due_date: str
    payment_date: str
    payment_status: str
    created_at: str
    updated_at: str
    created_by: str
    updated_by: str
    is_deleted: bool = False


@dataclass
class HoursMonth:
    id: str
    month_key: str
    month_label: str
    selected: bool
    visible_investments: list[str] = field(default_factory=list)
    finance: dict[str, float] = field(default_factory=dict)


@dataclass
class TimeEntry:
    id: str
    month_key: str
    employee_id: str | None
    employee_name: str
    contract_id: str | None
    contract_name: str
    hours: float
    cost_amount: float


@dataclass
class VacationBalance:
    employee_name: str
    base_days: float
    carryover_days: float
    extra_days: float


@dataclass
class VacationRequest:
    id: str
    employee_name: str
    request_type: str
    start_date: str
    end_date: str
    days: float
    status: str
    requested_by: str
    notes: str
    created_at: str


@dataclass
class PlanningAssignment:
    id: str
    assignment_date: str
    employee_id: str | None
    employee_name: str
    contract_id: str | None
    contract_name: str
    note: str


@dataclass
class WorkwearIssue:
    id: str
    employee_name: str
    issue_date: str
    item_id: str
    item_name: str
    size: str
    quantity: float
    notes: str


@dataclass
class User:
    id: str
    name: str
    username: str
    email: str
    password_hash: str
    role: str
    status: str
    is_active: bool
    created_at: str
    updated_at: str
    last_login_at: str = ""
    permissions: dict[str, Any] = field(default_factory=dict)
    can_approve_vacations: bool = False


@dataclass
class AuthSession:
    id: str
    user_id: str
    session_token_hash: str
    created_at: str
    expires_at: str
    last_seen_at: str
    revoked_at: str | None = None


@dataclass
class AuditLog:
    id: str
    timestamp: str
    module: str
    action: str
    subject: str
    details: str
    user_id: str
    user_name: str


@dataclass
class Notification:
    id: str
    created_at: str
    notification_type: str
    title: str
    message: str
    meta_json: dict[str, Any] = field(default_factory=dict)
    read: bool = False

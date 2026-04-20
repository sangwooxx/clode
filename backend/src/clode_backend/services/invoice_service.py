from __future__ import annotations

from typing import Any
from uuid import uuid4

from clode_backend.auth.rbac import normalize_role
from clode_backend.auth.sessions import utc_now_iso
from clode_backend.repositories.contract_repository import ContractRepository
from clode_backend.repositories.invoice_repository import InvoiceRepository
from clode_backend.shared_contracts import ContractValidationError, validate_shared_contract
from clode_backend.validation.contracts import normalize_contract_status, normalize_cost_category
from clode_backend.validation.invoices import (
    normalize_invoice_type,
    normalize_payment_status,
    number,
    text,
    validate_iso_date,
)


class InvoiceServiceError(RuntimeError):
    def __init__(self, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code


class InvoiceService:
    def __init__(self, repository: InvoiceRepository, contract_repository: ContractRepository) -> None:
        self.repository = repository
        self.contract_repository = contract_repository

    def ensure_read_access(self, current_user: dict[str, Any] | None) -> None:
        if not current_user:
            raise InvoiceServiceError("Brak aktywnej sesji.", status_code=401)
        if normalize_role(current_user.get("role")) not in {"admin", normalize_role("ksiegowosc"), "kierownik", "read-only"}:
            raise InvoiceServiceError("Brak uprawnień do podglądu faktur.", status_code=403)

    def ensure_write_access(self, current_user: dict[str, Any] | None) -> None:
        if not current_user:
            raise InvoiceServiceError("Brak aktywnej sesji.", status_code=401)
        if normalize_role(current_user.get("role")) not in {"admin", normalize_role("ksiegowosc")}:
            raise InvoiceServiceError("Brak uprawnień do edycji faktur.", status_code=403)

    def list_invoices(self, filters: dict[str, Any], current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_read_access(current_user)
        normalized_filters = self._normalize_filters(filters)
        items = self.repository.list_filtered(normalized_filters)
        stats = self.repository.aggregate_stats(normalized_filters)
        summary = self.repository.aggregate_summary(normalized_filters)
        available_years = self.repository.list_years(
            contract_id=normalized_filters.get("contract_id", ""),
            unassigned=bool(normalized_filters.get("unassigned")),
        )
        available_months = self.repository.list_months(
            contract_id=normalized_filters.get("contract_id", ""),
            unassigned=bool(normalized_filters.get("unassigned")),
            year=normalized_filters.get("year", ""),
        )
        return {
            "items": items,
            "stats": stats,
            "summary": summary,
            "available_years": available_years,
            "available_months": available_months,
            "filters": normalized_filters,
        }

    def get_invoice(self, invoice_id: str, current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_read_access(current_user)
        invoice = self.repository.get_by_id(invoice_id)
        if not invoice:
            raise InvoiceServiceError("Nie znaleziono faktury.", status_code=404)
        return invoice

    def create_invoice(self, payload: dict[str, Any], current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        normalized = self._normalize_payload(payload, current_user=current_user)
        return self.repository.insert(normalized)

    def update_invoice(self, invoice_id: str, payload: dict[str, Any], current_user: dict[str, Any] | None) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        existing = self.repository.get_by_id(invoice_id)
        if not existing:
            raise InvoiceServiceError("Nie znaleziono faktury.", status_code=404)
        normalized = self._normalize_payload(payload, current_user=current_user, existing=existing)
        updated = self.repository.update(invoice_id, normalized)
        if not updated:
            raise InvoiceServiceError("Nie udało się zapisać zmian faktury.", status_code=500)
        return updated

    def delete_invoice(self, invoice_id: str, current_user: dict[str, Any] | None) -> None:
        self.ensure_write_access(current_user)
        existing = self.repository.get_by_id(invoice_id)
        if not existing:
            return
        self.repository.soft_delete(
            invoice_id,
            updated_at=utc_now_iso(),
            updated_by=str(current_user.get("id") or ""),
        )

    def bulk_delete(self, invoice_ids: list[str], current_user: dict[str, Any] | None) -> int:
        self.ensure_write_access(current_user)
        clean_ids = [text(invoice_id) for invoice_id in invoice_ids if text(invoice_id)]
        return self.repository.bulk_soft_delete(
            clean_ids,
            updated_at=utc_now_iso(),
            updated_by=str(current_user.get("id") or ""),
        )

    def import_legacy_entries(
        self,
        entries: list[dict[str, Any]],
        current_user: dict[str, Any] | None,
    ) -> dict[str, Any]:
        self.ensure_write_access(current_user)
        imported = 0
        contracts = self.contract_repository.list_all(include_archived=True)
        valid_contract_ids = {
            text(contract.get("id"))
            for contract in contracts
            if text(contract.get("id"))
        }
        contract_ids_by_name: dict[str, set[str]] = {}
        for contract in contracts:
            contract_name = text(contract.get("name"))
            contract_id = text(contract.get("id"))
            if not contract_name or not contract_id:
                continue
            contract_ids_by_name.setdefault(contract_name, set()).add(contract_id)

        for entry in entries:
            contract_name = text(entry.get("contract_name"))
            legacy_contract_id = text(entry.get("contract_id"))
            resolved_contract_id = ""
            if legacy_contract_id in valid_contract_ids:
                resolved_contract_id = legacy_contract_id
            elif contract_name:
                matching_ids = sorted(contract_ids_by_name.get(contract_name, set()))
                if len(matching_ids) == 1:
                    resolved_contract_id = matching_ids[0]
            payload = {
                "id": text(entry.get("id")) or f"inv-{uuid4().hex}",
                "contract_id": resolved_contract_id,
                "contract_name": contract_name,
                "type": text(entry.get("type")) or "cost",
                "issue_date": text(entry.get("issue_date")),
                "invoice_number": text(entry.get("document_number")) or text(entry.get("invoice_number")),
                "counterparty_name": text(entry.get("party")) or text(entry.get("counterparty_name")),
                "category_or_description": (
                    text(entry.get("category"))
                    or text(entry.get("category_or_description"))
                    or text(entry.get("description"))
                ),
                "notes": text(entry.get("description")) or text(entry.get("notes")),
                "amount_net": entry.get("net_amount", entry.get("amount_net")),
                "vat_rate": entry.get("vat_rate"),
                "amount_vat": entry.get("vat_amount", entry.get("amount_vat")),
                "amount_gross": entry.get("gross_amount", entry.get("amount_gross")),
                "due_date": text(entry.get("due_date")),
                "payment_date": text(entry.get("payment_date")),
                "payment_status": text(entry.get("payment_status")),
            }
            normalized = self._normalize_payload(payload, current_user=current_user, explicit_id=payload["id"])
            existing = self.repository.get_by_id(normalized["id"], include_deleted=True)
            if existing:
                self.repository.update(normalized["id"], normalized)
            else:
                self.repository.insert(normalized)
            imported += 1

        return {"imported_count": imported}

    def _normalize_filters(self, filters: dict[str, Any]) -> dict[str, Any]:
        scope = text(filters.get("scope")).lower() or "all"
        if scope not in {"all", "year", "month"}:
            scope = "all"
        year = text(filters.get("year"))
        month = text(filters.get("month")).zfill(2) if text(filters.get("month")) else ""
        invoice_type = text(filters.get("type")).lower()
        if invoice_type not in {"cost", "sales"}:
            invoice_type = "cost"
        payment_status = text(filters.get("payment_status")).lower()
        if payment_status == "all":
            payment_status = ""
        return {
            "contract_id": text(filters.get("contract_id")),
            "unassigned": str(filters.get("unassigned") or "").strip().lower() in {"1", "true", "yes"},
            "scope": scope,
            "year": year,
            "month": month,
            "type": invoice_type,
            "payment_status": payment_status,
        }

    def _normalize_payload(
        self,
        payload: dict[str, Any],
        *,
        current_user: dict[str, Any],
        existing: dict[str, Any] | None = None,
        explicit_id: str = "",
    ) -> dict[str, Any]:
        issue_date = validate_iso_date(
            payload.get("issue_date") if payload.get("issue_date") is not None else existing.get("issue_date") if existing else "",
            "Data wystawienia",
            required=True,
        )
        due_date = validate_iso_date(
            payload.get("due_date") if payload.get("due_date") is not None else existing.get("due_date") if existing else "",
            "Termin płatności",
            required=False,
        )
        payment_date = validate_iso_date(
            payload.get("payment_date") if payload.get("payment_date") is not None else existing.get("payment_date") if existing else "",
            "Data płatności",
            required=False,
        )

        invoice_number = text(payload.get("invoice_number") if payload.get("invoice_number") is not None else existing.get("invoice_number") if existing else "")
        if not invoice_number:
            raise InvoiceServiceError("Numer faktury jest wymagany.")

        invoice_type = normalize_invoice_type(payload.get("type") if payload.get("type") is not None else existing.get("type") if existing else "cost")
        counterparty_name = text(payload.get("counterparty_name") if payload.get("counterparty_name") is not None else existing.get("counterparty_name") if existing else "")
        category_or_description = text(payload.get("category_or_description") if payload.get("category_or_description") is not None else existing.get("category_or_description") if existing else "")
        notes = text(payload.get("notes") if payload.get("notes") is not None else existing.get("notes") if existing else "")

        amount_net = number(payload.get("amount_net") if payload.get("amount_net") is not None else existing.get("amount_net") if existing else 0)
        if amount_net <= 0:
            raise InvoiceServiceError("Kwota netto musi być większa od zera.")

        vat_rate = number(payload.get("vat_rate") if payload.get("vat_rate") is not None else existing.get("vat_rate") if existing else 0)
        amount_vat = number(
            payload.get("amount_vat") if payload.get("amount_vat") is not None else existing.get("amount_vat") if existing else round(amount_net * vat_rate / 100, 2)
        )
        amount_gross = number(
            payload.get("amount_gross") if payload.get("amount_gross") is not None else existing.get("amount_gross") if existing else round(amount_net + amount_vat, 2)
        )

        contract_id = text(payload.get("contract_id") if payload.get("contract_id") is not None else existing.get("contract_id") if existing else "")
        contract_name = text(payload.get("contract_name") if payload.get("contract_name") is not None else existing.get("contract_name") if existing else "")
        if contract_id:
            resolved_contract = self.contract_repository.get_by_id(contract_id)
            if not resolved_contract:
                raise InvoiceServiceError("Nie znaleziono kontraktu dla wskazanego identyfikatora.")
            if normalize_contract_status(resolved_contract.get("status")) == "archived":
                raise InvoiceServiceError(
                    "Nie można zapisać faktury dla zarchiwizowanego kontraktu. Wybierz aktywny kontrakt z rejestru.",
                    status_code=409,
                )
            contract_name = resolved_contract["name"]

        cost_category = normalize_cost_category(
            payload.get("cost_category") if payload.get("cost_category") is not None else existing.get("cost_category") if existing else "",
            invoice_type=invoice_type,
        )

        payment_status = normalize_payment_status(
            payload.get("payment_status") if payload.get("payment_status") is not None else existing.get("payment_status") if existing else "unpaid",
            due_date=due_date,
            payment_date=payment_date,
        )

        timestamp = utc_now_iso()
        created_by = existing.get("created_by") if existing else str(current_user.get("id") or "")
        created_at = existing.get("created_at") if existing else timestamp
        invoice_id = explicit_id or (existing.get("id") if existing else f"invoice-{uuid4().hex}")

        record = {
            "id": invoice_id,
            "contract_id": contract_id or None,
            "contract_name": contract_name,
            "type": invoice_type,
            "issue_date": issue_date,
            "invoice_number": invoice_number,
            "counterparty_name": counterparty_name,
            "category_or_description": category_or_description,
            "cost_category": cost_category,
            "amount_net": round(amount_net, 2),
            "vat_rate": round(vat_rate, 2),
            "amount_vat": round(amount_vat, 2),
            "amount_gross": round(amount_gross, 2),
            "due_date": due_date,
            "payment_date": payment_date,
            "payment_status": payment_status,
            "notes": notes,
            "created_at": created_at,
            "updated_at": timestamp,
            "created_by": created_by,
            "updated_by": str(current_user.get("id") or ""),
            "is_deleted": False,
        }
        try:
            validate_shared_contract("invoice", record)
        except ContractValidationError as error:
            raise InvoiceServiceError(str(error)) from error
        return record


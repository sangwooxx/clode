import { ActionButton } from "@/components/ui/action-button";
import { SearchField } from "@/components/ui/search-field";
import { Panel } from "@/components/ui/panel";
import { UNASSIGNED_CONTRACT_ID, type InvoicePaymentStatus, type InvoiceScope } from "@/features/invoices/types";

export type InvoiceContractOption = {
  id: string;
  contract_number: string;
  name: string;
  investor: string;
};

type InvoicesToolbarProps = {
  contractSearch: string;
  onContractSearchChange: (value: string) => void;
  contractOptions: InvoiceContractOption[];
  selectedContractId: string;
  onSelectedContractIdChange: (value: string) => void;
  scope: InvoiceScope;
  onScopeChange: (value: InvoiceScope) => void;
  yearOptions: string[];
  selectedYear: string;
  onSelectedYearChange: (value: string) => void;
  monthOptions: string[];
  selectedMonth: string;
  onSelectedMonthChange: (value: string) => void;
  paymentStatus: "" | InvoicePaymentStatus;
  onPaymentStatusChange: (value: "" | InvoicePaymentStatus) => void;
};

export function InvoicesToolbar({
  contractSearch,
  onContractSearchChange,
  contractOptions,
  selectedContractId,
  onSelectedContractIdChange,
  scope,
  onScopeChange,
  yearOptions,
  selectedYear,
  onSelectedYearChange,
  monthOptions,
  selectedMonth,
  onSelectedMonthChange,
  paymentStatus,
  onPaymentStatusChange
}: InvoicesToolbarProps) {
  return (
    <Panel className="module-toolbar module-toolbar--compact">
      <div className="invoices-toolbar">
        <SearchField
          value={contractSearch}
          onChange={(event) => onContractSearchChange(event.target.value)}
          placeholder="Szukaj kontraktu"
          aria-label="Szukaj kontraktu"
        />
        <select
          value={selectedContractId}
          onChange={(event) => onSelectedContractIdChange(event.target.value)}
          className="select-field"
        >
          {contractOptions.map((contract) => (
            <option key={contract.id} value={contract.id}>
              {contract.id === UNASSIGNED_CONTRACT_ID
                ? contract.name
                : contract.contract_number
                  ? `${contract.contract_number} - ${contract.name}`
                  : contract.name}
            </option>
          ))}
        </select>
        <div className="toolbar-tabs">
          {(["all", "year", "month"] as InvoiceScope[]).map((value) => (
            <ActionButton
              key={value}
              type="button"
              variant={scope === value ? "primary" : "secondary"}
              onClick={() => onScopeChange(value)}
            >
              {value === "all" ? "Całość" : value === "year" ? "Rok" : "Miesiąc"}
            </ActionButton>
          ))}
        </div>
        <select
          value={selectedYear}
          onChange={(event) => onSelectedYearChange(event.target.value)}
          disabled={scope === "all"}
          className="select-field"
        >
          {yearOptions.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <select
          value={selectedMonth}
          onChange={(event) => onSelectedMonthChange(event.target.value)}
          disabled={scope !== "month"}
          className="select-field"
        >
          {monthOptions.map((month) => (
            <option key={month} value={month}>
              {month}
            </option>
          ))}
        </select>
        <select
          value={paymentStatus}
          onChange={(event) =>
            onPaymentStatusChange(event.target.value as "" | "paid" | "unpaid" | "overdue")
          }
          className="select-field"
        >
          <option value="">Wszystkie płatności</option>
          <option value="unpaid">Nieopłacone</option>
          <option value="paid">Opłacone</option>
          <option value="overdue">Przeterminowane</option>
        </select>
      </div>
    </Panel>
  );
}

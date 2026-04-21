"use client";

import { ActionButton } from "@/components/ui/action-button";
import { Panel } from "@/components/ui/panel";
import { SearchField } from "@/components/ui/search-field";

export type EmployeesFilter = "all" | "active" | "inactive";

type EmployeesToolbarProps = {
  filter: EmployeesFilter;
  search: string;
  onFilterChange: (filter: EmployeesFilter) => void;
  onSearchChange: (search: string) => void;
};

export function EmployeesToolbar({
  filter,
  search,
  onFilterChange,
  onSearchChange,
}: EmployeesToolbarProps) {
  return (
    <Panel className="panel--toolbar panel--toolbar--filters">
      <div className="employees-toolbar">
        <div className="toolbar-tabs">
          <ActionButton
            type="button"
            variant={filter === "all" ? "primary" : "secondary"}
            onClick={() => onFilterChange("all")}
          >
            Wszyscy
          </ActionButton>
          <ActionButton
            type="button"
            variant={filter === "active" ? "primary" : "secondary"}
            onClick={() => onFilterChange("active")}
          >
            Aktywni
          </ActionButton>
          <ActionButton
            type="button"
            variant={filter === "inactive" ? "primary" : "secondary"}
            onClick={() => onFilterChange("inactive")}
          >
            Nieaktywni
          </ActionButton>
        </div>
        <SearchField
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Szukaj po nazwisku, kodzie, stanowisku lub kontakcie"
        />
      </div>
    </Panel>
  );
}

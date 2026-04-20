"use client";

import { SearchField } from "@/components/ui/search-field";

type WorkwearToolbarProps = {
  employeeSearch: string;
  catalogSearch: string;
  onEmployeeSearchChange: (value: string) => void;
  onCatalogSearchChange: (value: string) => void;
};

export function WorkwearToolbar({
  employeeSearch,
  catalogSearch,
  onEmployeeSearchChange,
  onCatalogSearchChange,
}: WorkwearToolbarProps) {
  return (
    <div className="workwear-toolbar">
      <SearchField
        value={employeeSearch}
        onChange={(event) => onEmployeeSearchChange(event.target.value)}
        placeholder="Szukaj pracownika, kodu lub ostatniego wydania"
      />
      <SearchField
        value={catalogSearch}
        onChange={(event) => onCatalogSearchChange(event.target.value)}
        placeholder="Szukaj elementu lub kategorii"
      />
    </div>
  );
}

import { ActionButton } from "@/components/ui/action-button";
import { DataTable } from "@/components/ui/data-table";
import { FormGrid } from "@/components/ui/form-grid";
import { Panel } from "@/components/ui/panel";
import { SearchField } from "@/components/ui/search-field";
import { SectionHeader } from "@/components/ui/section-header";
import { StatCard } from "@/components/ui/stat-card";
import type { ModuleScaffoldConfig } from "@/features/shared/module-types";

const sampleRows = [
  { field: "Status", value: "Scaffold only" },
  { field: "Logika biznesowa", value: "Jeszcze nieprzeniesiona" },
  { field: "Warstwa danych", value: "API foundation gotowa" }
];

export function ModuleScaffoldPage({
  config
}: {
  config: ModuleScaffoldConfig;
}) {
  return (
    <div className="module-page">
      <SectionHeader
        eyebrow={`Moduł / ${config.label}`}
        title={config.title}
        description={config.description}
        actions={
          <ActionButton type="button" variant="secondary">
            Placeholder route
          </ActionButton>
        }
      />

      <div className="module-page__stats">
        <StatCard label="Etap migracji" value="Scaffold" accent />
        <StatCard label="API" value="Foundation ready" />
        <StatCard label="UI" value="Shared components" />
      </div>

      <Panel
        title="Założenia modułu"
        description="To jest strona tymczasowa, która potwierdza routing, shell i fundament komponentowy."
      >
        <FormGrid columns={3}>
          <label className="field-card">
            <span className="field-card__label">Szukaj</span>
            <SearchField placeholder="Placeholder search" />
          </label>
          <label className="field-card">
            <span className="field-card__label">Akcja główna</span>
            <ActionButton type="button">Przyszła akcja modułu</ActionButton>
          </label>
          <label className="field-card">
            <span className="field-card__label">Zakres</span>
            <ActionButton type="button" variant="ghost">
              Placeholder filtra
            </ActionButton>
          </label>
        </FormGrid>
      </Panel>

      <div className="module-page__columns">
        <Panel title="Warstwa API">
          <ul className="info-list">
            {config.apiNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Panel>

        <Panel title="Zakres dalszej migracji">
          <ul className="info-list">
            {config.foundationNotes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </Panel>
      </div>

      <Panel title="Stan komponentów">
        <DataTable
          columns={[
            { key: "field", header: "Obszar", render: (row) => row.field },
            { key: "value", header: "Stan", render: (row) => row.value }
          ]}
          rows={sampleRows}
        />
      </Panel>
    </div>
  );
}

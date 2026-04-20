import type { WorkwearCatalogRow, WorkwearEmployeeRow } from "@/features/workwear/types";

function matchesQuery(values: Array<unknown>, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return true;
  }

  return values
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(normalizedQuery));
}

export function filterWorkwearEmployeeRows(rows: WorkwearEmployeeRow[], search: string) {
  return rows.filter((row) =>
    matchesQuery([row.employee.name, row.employee.position, row.employee.worker_code, row.lastItemName], search)
  );
}

export function filterWorkwearCatalogRows(rows: WorkwearCatalogRow[], search: string) {
  return rows.filter((row) => matchesQuery([row.item.name, row.item.category, row.item.notes], search));
}

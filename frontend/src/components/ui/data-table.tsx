import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type DataTableSortDirection = "asc" | "desc" | null;
type DataTableSortValue = string | number | boolean | Date | null | undefined;

export type DataTableColumn<T> = {
  key: string;
  header: ReactNode;
  render: (row: T, index: number) => ReactNode;
  className?: string;
  sortable?: boolean;
  sortValue?: (row: T, index: number) => DataTableSortValue;
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);
}

function isSortablePrimitive(value: unknown): value is Exclude<DataTableSortValue, null | undefined> {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value instanceof Date
  );
}

function inferSortValue<T>(row: T, key: string): DataTableSortValue {
  if (!isPlainObject(row)) return undefined;

  const directValue = row[key];
  if (isSortablePrimitive(directValue)) {
    return directValue;
  }

  for (const nested of Object.values(row)) {
    if (!isPlainObject(nested)) continue;
    const nestedValue = nested[key];
    if (isSortablePrimitive(nestedValue)) {
      return nestedValue;
    }
  }

  return undefined;
}

function compareSortValues(left: DataTableSortValue, right: DataTableSortValue) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;

  const normalizedLeft = left instanceof Date ? left.getTime() : left;
  const normalizedRight = right instanceof Date ? right.getTime() : right;

  if (typeof normalizedLeft === "number" && typeof normalizedRight === "number") {
    return normalizedLeft - normalizedRight;
  }

  if (typeof normalizedLeft === "boolean" && typeof normalizedRight === "boolean") {
    return Number(normalizedLeft) - Number(normalizedRight);
  }

  return String(normalizedLeft).localeCompare(String(normalizedRight), "pl", {
    sensitivity: "base",
    numeric: true
  });
}

export function DataTable<T>({
  columns,
  rows,
  emptyMessage = "Brak danych do wyswietlenia.",
  rowKey,
  onRowClick,
  getRowClassName,
  tableClassName
}: {
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  emptyMessage?: string;
  rowKey?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  getRowClassName?: (row: T) => string | undefined;
  tableClassName?: string;
}) {
  const tableRef = useRef<HTMLDivElement | null>(null);
  const [sortState, setSortState] = useState<{
    key: string | null;
    direction: DataTableSortDirection;
  }>({
    key: null,
    direction: null
  });

  const sortedRows = useMemo(() => {
    if (!sortState.key || !sortState.direction) {
      return rows;
    }

    const activeColumn = columns.find((column) => column.key === sortState.key);
    if (!activeColumn) {
      return rows;
    }

    return rows
      .map((row, index) => ({
        row,
        index,
        value: activeColumn.sortValue?.(row, index) ?? inferSortValue(row, activeColumn.key)
      }))
      .sort((left, right) => {
        const comparison = compareSortValues(left.value, right.value);
        if (comparison !== 0) {
          return sortState.direction === "asc" ? comparison : -comparison;
        }
        return left.index - right.index;
      })
      .map((entry) => entry.row);
  }, [columns, rows, sortState.direction, sortState.key]);

  function isColumnSortable(column: DataTableColumn<T>) {
    return column.sortable ?? (column.key !== "actions" && column.key !== "select");
  }

  function cycleSort(column: DataTableColumn<T>) {
    if (!isColumnSortable(column)) {
      return;
    }

    setSortState((current) => {
      if (current.key !== column.key) {
        return { key: column.key, direction: "asc" };
      }
      if (current.direction === "asc") {
        return { key: column.key, direction: "desc" };
      }
      return { key: null, direction: null };
    });
  }

  useEffect(() => {
    const root = tableRef.current;
    if (!root) {
      return;
    }

    const selector = [
      ".data-table__text",
      ".data-table__primary",
      ".data-table__secondary",
      ".hours-contract-pill__name",
      ".hours-contract-pill__meta",
      ".employees-relation-pill"
    ].join(", ");

    const syncOverflowTitles = () => {
      root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        const explicitTitle = element.getAttribute("title");
        if (explicitTitle && element.dataset.overflowTitle !== "true") {
          return;
        }

        const text = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
        if (!text) {
          if (element.dataset.overflowTitle === "true") {
            element.removeAttribute("title");
            delete element.dataset.overflowTitle;
          }
          return;
        }

        const hasOverflow =
          Math.ceil(element.scrollWidth) > Math.ceil(element.clientWidth + 1) ||
          Math.ceil(element.scrollHeight) > Math.ceil(element.clientHeight + 1);

        if (hasOverflow) {
          element.title = text;
          element.dataset.overflowTitle = "true";
        } else if (element.dataset.overflowTitle === "true") {
          element.removeAttribute("title");
          delete element.dataset.overflowTitle;
        }
      });
    };

    const frameId = window.requestAnimationFrame(syncOverflowTitles);
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncOverflowTitles) : null;

    resizeObserver?.observe(root);
    window.addEventListener("resize", syncOverflowTitles);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncOverflowTitles);
    };
  }, [columns, sortedRows]);

  function renderCellContent(content: ReactNode) {
    if (typeof content === "string" || typeof content === "number") {
      return <span className="data-table__text">{content}</span>;
    }

    return content;
  }

  return (
    <div ref={tableRef} className="data-table">
      <table className={tableClassName}>
        <thead>
          <tr>
            {columns.map((column) => {
              const sortable = isColumnSortable(column);
              const direction = sortState.key === column.key ? sortState.direction : null;

              return (
                <th
                  key={column.key}
                  className={column.className}
                  aria-sort={
                    direction === "asc"
                      ? "ascending"
                      : direction === "desc"
                        ? "descending"
                        : "none"
                  }
                >
                  {sortable ? (
                    <button
                      type="button"
                      className={`data-table__sort-button${direction ? " data-table__sort-button--active" : ""}`}
                      onClick={() => cycleSort(column)}
                    >
                      <span>{column.header}</span>
                      <span className="data-table__sort-icon" aria-hidden="true">
                        {direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}
                      </span>
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedRows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="data-table__empty">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            sortedRows.map((row, index) => (
              <tr
                key={rowKey ? rowKey(row, index) : index}
                className={getRowClassName?.(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {columns.map((column) => (
                  <td key={column.key} className={column.className}>
                    {renderCellContent(column.render(row, index))}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

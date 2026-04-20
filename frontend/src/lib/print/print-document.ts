"use client";

export type PrintDetailItem = {
  label: string;
  value: string;
};

export type PrintTableColumn = {
  id: string;
  label: string;
  width?: string;
  align?: "left" | "center" | "right";
};

export type PrintTableRow = Record<string, string>;

type PrintStructuredTable = {
  columns: PrintTableColumn[];
  rows: PrintTableRow[];
  emptyText?: string;
};

type PrintLegacyTable = {
  columns: string[];
  rows: string[][];
  emptyText?: string;
};

export type PrintTable = PrintStructuredTable | PrintLegacyTable;

export type PrintSection = {
  title: string;
  description?: string;
  details?: PrintDetailItem[];
  table?: PrintTable;
};

export type PrintDocumentOptions = {
  title: string;
  subtitle?: string;
  context?: string;
  meta?: string[];
  filename: string;
  generatedAt?: string;
  footerNote?: string;
  sections: PrintSection[];
};

function escapeHtml(value: string) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderDetails(details: PrintDetailItem[]) {
  if (!details.length) return "";

  const items = details
    .map(
      (item) => `
        <div class="print-detail">
          <span class="print-detail__label">${escapeHtml(item.label)}</span>
          <strong class="print-detail__value">${escapeHtml(item.value)}</strong>
        </div>
      `
    )
    .join("");

  return `<div class="print-detail-grid">${items}</div>`;
}

function renderTable(table: PrintTable) {
  const normalized =
    typeof table.columns[0] === "string"
      ? {
          columns: (table.columns as string[]).map<PrintTableColumn>((label, index) => ({
            id: `legacy-${index}`,
            label,
          })),
          rows: (table.rows as string[][]).map((row) =>
            Object.fromEntries(row.map((cell, index) => [`legacy-${index}`, cell]))
          ),
          emptyText: table.emptyText,
        }
      : (table as PrintStructuredTable);

  const columns = normalized.columns.length ? normalized.columns : [];
  const header = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("");
  const colgroup = columns
    .map((column) => `<col${column.width ? ` style="width:${escapeHtml(column.width)}"` : ""} />`)
    .join("");
  const body = normalized.rows.length
    ? normalized.rows
        .map((row) => {
          const cells = columns
            .map((column) => {
              const value = row[column.id] ?? "—";
              const alignClass = column.align ? ` print-table__cell--${column.align}` : "";
              return `<td class="${alignClass.trim()}">${escapeHtml(value)}</td>`;
            })
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("")
    : `<tr><td colspan="${Math.max(columns.length, 1)}">${escapeHtml(
        normalized.emptyText || "Brak danych do wydruku."
      )}</td></tr>`;

  return `
    <table class="print-table">
      <colgroup>${colgroup}</colgroup>
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function buildPrintHtml(options: PrintDocumentOptions) {
  const generatedAt =
    options.generatedAt ||
    new Intl.DateTimeFormat("pl-PL", {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date());

  const metaItems = [
    options.context ? `Kontekst: ${options.context}` : null,
    `Wygenerowano: ${generatedAt}`,
    ...(options.meta || []).filter(Boolean),
  ].filter((item): item is string => Boolean(item));

  const metaHtml = metaItems
    .map((item) => `<span class="print-meta__item">${escapeHtml(item)}</span>`)
    .join("");

  const sectionsHtml = options.sections
    .map((section) => {
      const detailsHtml = section.details?.length ? renderDetails(section.details) : "";
      const tableHtml = section.table ? renderTable(section.table) : "";
      return `
        <section class="print-section">
          <div class="print-section__header">
            <h2>${escapeHtml(section.title)}</h2>
            ${
              section.description
                ? `<p class="print-section__description">${escapeHtml(section.description)}</p>`
                : ""
            }
          </div>
          ${detailsHtml}
          ${tableHtml}
        </section>
      `;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(options.filename)}</title>
    <style>
      @page { size: A4; margin: 10mm 9mm 12mm; }
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        color: #111827;
        font-family: "Segoe UI", Arial, sans-serif;
        font-size: 12px;
        line-height: 1.35;
      }
      body {
        padding: 0;
      }
      .print-page {
        display: grid;
        gap: 12px;
      }
      .print-header {
        display: grid;
        gap: 8px;
        padding-bottom: 10px;
        border-bottom: 2px solid #0f172a;
      }
      .print-brand {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 16px;
      }
      .print-brand__name {
        font-size: 22px;
        font-weight: 700;
        letter-spacing: 0.02em;
      }
      .print-brand__tag {
        font-size: 10px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #475569;
      }
      .print-title {
        display: grid;
        gap: 4px;
      }
      .print-title h1 {
        margin: 0;
        font-size: 21px;
        line-height: 1.1;
      }
      .print-title p {
        margin: 0;
        color: #475569;
        font-size: 11px;
      }
      .print-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px 12px;
      }
      .print-meta__item {
        padding: 3px 7px;
        border: 1px solid #d7dee8;
        border-radius: 999px;
        color: #334155;
        font-size: 10px;
        white-space: nowrap;
      }
      .print-section {
        display: grid;
        gap: 8px;
        page-break-inside: avoid;
      }
      .print-section__header {
        display: grid;
        gap: 4px;
      }
      .print-section__header h2 {
        margin: 0;
        font-size: 14px;
        line-height: 1.2;
      }
      .print-section__description {
        margin: 0;
        font-size: 10px;
        color: #64748b;
      }
      .print-detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px 8px;
      }
      .print-detail {
        display: grid;
        gap: 3px;
        padding: 6px 8px;
        border: 1px solid #d7dee8;
        border-radius: 8px;
      }
      .print-detail__label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #64748b;
      }
      .print-detail__value {
        font-size: 12px;
        font-weight: 600;
        color: #0f172a;
      }
      .print-table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .print-table col {
        width: auto;
      }
      .print-table thead {
        display: table-header-group;
      }
      .print-table tr {
        page-break-inside: avoid;
      }
      .print-table th,
      .print-table td {
        padding: 5px 6px;
        border: 1px solid #d7dee8;
        text-align: left;
        vertical-align: top;
        word-break: break-word;
        overflow-wrap: anywhere;
      }
      .print-table th {
        background: #eef2f7;
        font-size: 10px;
        font-weight: 700;
        color: #0f172a;
      }
      .print-table td {
        font-size: 10px;
        color: #1f2937;
      }
      .print-table__cell--right {
        text-align: right;
      }
      .print-table__cell--center {
        text-align: center;
      }
      .print-footer {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding-top: 10px;
        border-top: 1px solid #d7dee8;
        color: #64748b;
        font-size: 10px;
      }
      @media print {
        body {
          print-color-adjust: exact;
          -webkit-print-color-adjust: exact;
        }
      }
    </style>
  </head>
  <body>
    <main class="print-page">
      <header class="print-header">
        <div class="print-brand">
          <span class="print-brand__name">Clode</span>
          <span class="print-brand__tag">Dokument operacyjny</span>
        </div>
        <div class="print-title">
          <h1>${escapeHtml(options.title)}</h1>
          ${options.subtitle ? `<p>${escapeHtml(options.subtitle)}</p>` : ""}
        </div>
        ${metaHtml ? `<div class="print-meta">${metaHtml}</div>` : ""}
      </header>
      ${sectionsHtml}
      <footer class="print-footer">
        <span>${escapeHtml(options.footerNote || "Dokument wygenerowany w systemie Clode.")}</span>
        <span>${escapeHtml(options.filename)}</span>
      </footer>
    </main>
  </body>
</html>`;
}

export function pickPrintTableColumns(table: PrintTable, enabledColumnIds: string[]) {
  if (typeof table.columns[0] === "string") {
    return table;
  }

  const structuredTable = table as PrintStructuredTable;
  const selectedIds = new Set(enabledColumnIds);
  const columns = structuredTable.columns.filter((column) => selectedIds.has(column.id));

  if (columns.length === 0) {
    return structuredTable;
  }

  const rows = structuredTable.rows.map((row) => {
    const filteredRow: PrintTableRow = {};
    columns.forEach((column) => {
      filteredRow[column.id] = row[column.id] ?? "—";
    });
    return filteredRow;
  });

  return {
    ...structuredTable,
    columns,
    rows,
  };
}

export function compactPrintSections(
  sections: Array<PrintSection | null | undefined | false>
): PrintSection[] {
  return sections.filter((section): section is PrintSection => Boolean(section));
}

export function printDocument(options: PrintDocumentOptions) {
  const popup = window.open("", "_blank", "width=1120,height=920");
  if (!popup) {
    return false;
  }

  const html = buildPrintHtml(options);

  try {
    popup.opener = null;
  } catch {
    // Ignore browsers that do not allow mutating opener.
  }

  try {
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.document.title = options.filename;
  } catch {
    try {
      popup.close();
    } catch {
      // Ignore popup close failures.
    }
    return false;
  }

  let printStarted = false;
  const startPrint = () => {
    if (printStarted) return;
    printStarted = true;
    window.setTimeout(() => {
      popup.focus();
      popup.print();
    }, 250);
  };

  if (popup.document.readyState === "complete") {
    startPrint();
  } else {
    popup.addEventListener("load", startPrint, { once: true });
    window.setTimeout(startPrint, 1200);
  }

  return true;
}

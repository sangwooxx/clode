"use client";

type PrintDetailItem = {
  label: string;
  value: string;
};

type PrintTable = {
  columns: string[];
  rows: string[][];
};

type PrintSection = {
  title: string;
  details?: PrintDetailItem[];
  table?: PrintTable;
};

type PrintDocumentOptions = {
  title: string;
  subtitle?: string;
  meta?: string[];
  filename: string;
  landscape?: boolean;
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
  const header = table.columns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join("");
  const body = table.rows.length
    ? table.rows
        .map(
          (row) => `
            <tr>
              ${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="${table.columns.length}">Brak danych do wydruku.</td></tr>`;

  return `
    <table class="print-table">
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function buildPrintHtml(options: PrintDocumentOptions) {
  const sectionsHtml = options.sections
    .map((section) => {
      const detailsHtml = section.details ? renderDetails(section.details) : "";
      const tableHtml = section.table ? renderTable(section.table) : "";
      return `
        <section class="print-section">
          <h2>${escapeHtml(section.title)}</h2>
          ${detailsHtml}
          ${tableHtml}
        </section>
      `;
    })
    .join("");

  const metaHtml = (options.meta || [])
    .filter(Boolean)
    .map((item) => `<span>${escapeHtml(item)}</span>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(options.filename)}</title>
    <style>
      @page { size: ${options.landscape ? "A4 landscape" : "A4"}; margin: 16mm; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        color: #111827;
        font: 14px/1.45 "Segoe UI", Arial, sans-serif;
        background: #ffffff;
      }
      .print-page {
        display: grid;
        gap: 20px;
      }
      .print-header {
        display: grid;
        gap: 8px;
        padding-bottom: 12px;
        border-bottom: 2px solid #d1d5db;
      }
      .print-brand {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #4b5563;
      }
      .print-title {
        margin: 0;
        font-size: 28px;
        line-height: 1.1;
      }
      .print-subtitle {
        margin: 0;
        font-size: 15px;
        color: #4b5563;
      }
      .print-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 8px 16px;
        color: #4b5563;
        font-size: 12px;
      }
      .print-section {
        display: grid;
        gap: 12px;
        page-break-inside: avoid;
      }
      .print-section h2 {
        margin: 0;
        font-size: 16px;
      }
      .print-detail-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px 16px;
      }
      .print-detail {
        display: grid;
        gap: 4px;
        padding: 10px 12px;
        border: 1px solid #d1d5db;
        border-radius: 10px;
      }
      .print-detail__label {
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #6b7280;
      }
      .print-detail__value {
        font-size: 14px;
        font-weight: 600;
      }
      .print-table {
        width: 100%;
        border-collapse: collapse;
      }
      .print-table th,
      .print-table td {
        padding: 8px 10px;
        border: 1px solid #d1d5db;
        text-align: left;
        vertical-align: top;
      }
      .print-table th {
        background: #f3f4f6;
        font-size: 12px;
      }
      .print-table td {
        font-size: 12px;
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
        <span class="print-brand">Clode</span>
        <h1 class="print-title">${escapeHtml(options.title)}</h1>
        ${options.subtitle ? `<p class="print-subtitle">${escapeHtml(options.subtitle)}</p>` : ""}
        ${metaHtml ? `<div class="print-meta">${metaHtml}</div>` : ""}
      </header>
      ${sectionsHtml}
    </main>
  </body>
</html>`;
}

export function printDocument(options: PrintDocumentOptions) {
  const popup = window.open("", "_blank", "noopener,noreferrer,width=1100,height=900");
  if (!popup) {
    return false;
  }

  popup.document.open();
  popup.document.write(buildPrintHtml(options));
  popup.document.close();
  popup.document.title = options.filename;
  popup.focus();
  window.setTimeout(() => popup.print(), 200);
  return true;
}

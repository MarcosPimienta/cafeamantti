// Builds .xlsx files from simple tables: a few title lines, a header row,
// data rows and an optional totals row. Money and quantities stay numbers
// (formatted, so the accountant can sum and pivot), and 'YYYY-MM-DD'
// strings in date columns become real Excel dates.
//
// Client components should import this module dynamically
// (`await import("@/utils/excel/workbook")`) so xlsx is only downloaded
// when someone exports.

import * as XLSX from "xlsx";

export type Cell = string | number | null | undefined;

export type Column = {
  header: string;
  /** Width in characters. */
  width?: number;
  format?: "text" | "money" | "date" | "int";
};

export type TableSheet = {
  /** Sheet tab name (Excel allows at most 31 characters). */
  name: string;
  /** Lines above the table: report name, period, filters… */
  title?: Cell[][];
  columns: Column[];
  rows: Cell[][];
  /** Totals row under the data (same columns). */
  totals?: Cell[];
};

const FORMATS = { money: "#,##0", int: "#,##0", date: "yyyy-mm-dd" } as const;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

/** Excel serial date of a 'YYYY-MM-DD' string (no time zone involved). */
export function excelDate(ymd: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd);
  if (!m) return null;
  return (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - EXCEL_EPOCH) / 86400000;
}

function sheetFromTable(t: TableSheet): XLSX.WorkSheet {
  const title = t.title ?? [];
  const headerRow = title.length ? title.length + 1 : 0; // one blank line after the title
  const aoa: Cell[][] = [...title, ...(title.length ? [[]] : []), t.columns.map((c) => c.header), ...t.rows, ...(t.totals ? [t.totals] : [])];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  const firstData = headerRow + 1;
  const lastData = headerRow + t.rows.length + (t.totals ? 1 : 0);
  t.columns.forEach((col, c) => {
    if (!col.format || col.format === "text") return;
    for (let r = firstData; r <= lastData; r++) {
      const ref = XLSX.utils.encode_cell({ r, c });
      const cell = ws[ref];
      if (!cell) continue;
      if (col.format === "date") {
        const serial = typeof cell.v === "string" ? excelDate(cell.v) : null;
        if (serial !== null) ws[ref] = { t: "n", v: serial, z: FORMATS.date };
      } else if (cell.t === "n") {
        cell.z = FORMATS[col.format];
      }
    }
  });

  ws["!cols"] = t.columns.map((c) => ({ wch: c.width ?? Math.max(10, c.header.length + 2) }));
  // Filters on the header row so the table can be filtered right away.
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + t.rows.length, c: t.columns.length - 1 } }) };
  return ws;
}

export function buildWorkbook(sheets: TableSheet[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  for (const s of sheets) XLSX.utils.book_append_sheet(wb, sheetFromTable(s), s.name.slice(0, 31));
  return wb;
}

/** Builds the workbook and makes the browser download it. */
export function downloadWorkbook(filename: string, sheets: TableSheet[]) {
  XLSX.writeFile(buildWorkbook(sheets), filename);
}

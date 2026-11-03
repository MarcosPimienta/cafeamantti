// Bank statement in a spreadsheet (Excel or CSV): finds the movements table
// by its header names, so it works with the bank's export and with sheets
// typed by hand. Pure: the workbook is read into rows by the caller.
// Columns: a date, a description ("Clase de movimiento", "Descripción"…),
// optional document and office, and the value either as Crédito/Débito
// columns or as one signed "Valor" column ("3,675,000.00+" also works).

import type { ParsedStatement, StatementLine } from "./davivienda";

type Cell = string | number | boolean | Date | null | undefined;

const norm = (v: Cell) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const round2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");

/** A number from a cell: 1234.5, "1.234,50", "$ 3,675,000.00+", "(500)". */
export function cellNumber(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").trim();
  if (!s) return null;
  let sign = 1;
  if (/^\(.*\)$/.test(s) || /-$/.test(s) || /^[-−]/.test(s)) sign = -1;
  s = s.replace(/[()$\s+−-]/g, "").replace(/COP/i, "");
  if (!/\d/.test(s)) return null;
  // The last separator followed by 1–2 digits is the decimal one.
  const dec = /[.,](\d{1,2})$/.exec(s);
  const whole = (dec ? s.slice(0, dec.index) : s).replace(/[.,]/g, "");
  const n = Number(`${whole}${dec ? `.${dec[1]}` : ""}`);
  return Number.isFinite(n) ? sign * n : null;
}

/** YYYY-MM-DD from an Excel serial, a Date, or "dd/mm/yyyy" / "yyyy-mm-dd". */
export function cellDate(v: Cell): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    // The fraction is the time of day.
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(v ?? "").trim();
  let m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/.exec(s);
  if (m) return `${m[3].length === 2 ? `20${m[3]}` : m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return null;
}

type Columns = { date: number; description: number; doc: number; office: number; credit: number; debit: number; value: number; balance: number };

function columnsOf(row: Cell[]): Columns | null {
  const find = (re: RegExp, not?: RegExp) => row.findIndex((c) => re.test(norm(c)) && !(not && not.test(norm(c))));
  const cols: Columns = {
    date: find(/^fecha/),
    description: find(/clase de movimiento|descripcion|concepto|detalle|^movimiento/),
    doc: find(/^doc|documento|^referencia$|^comprobante/, /libros/),
    office: find(/oficina/),
    credit: find(/credito|abono|ingreso/),
    debit: find(/debito|cargo|retiro|egreso/),
    value: find(/^valor|^monto|^importe/),
    balance: find(/^saldo/),
  };
  const hasMoney = (cols.credit >= 0 && cols.debit >= 0) || cols.value >= 0;
  return cols.date >= 0 && cols.description >= 0 && hasMoney ? cols : null;
}

/** The first number to the right of a label ("Saldo anterior | 6922639.01"). */
function besideLabel(rows: Cell[][], label: RegExp): number | null {
  for (const row of rows) {
    const at = row.findIndex((c) => label.test(norm(c)));
    if (at < 0) continue;
    for (const c of row.slice(at + 1)) {
      const n = cellNumber(c);
      if (n !== null) return n;
    }
  }
  return null;
}

/** Statement rows (first sheet that has a movements table) → the statement. */
export function parseStatementRows(rows: Cell[][]): ParsedStatement {
  const problems: string[] = [];
  const headerAt = rows.findIndex((r) => columnsOf(r));
  const cols = headerAt >= 0 ? columnsOf(rows[headerAt]) : null;

  // The account is in the title rows (descriptions also carry 12-digit numbers).
  const text = rows.slice(0, headerAt >= 0 ? headerAt + 1 : rows.length).flat().map((c) => String(c ?? "")).join(" ");
  const acc = /\b(\d{4})\s?(\d{4})\s?(\d{4})\b/.exec(text.replace(/(\d)-(\d)/g, "$1$2"));
  const accountNumber = acc ? `${acc[1]} ${acc[2]} ${acc[3]}` : "";
  if (!accountNumber) problems.push("No encontré el número de cuenta en el archivo (por ejemplo 1089 0046 3473).");

  const lines: StatementLine[] = [];
  let totals: Cell[] | null = null;
  if (!cols) problems.push("No encontré la tabla de movimientos: necesita columnas de Fecha, Descripción (o Clase de movimiento) y Crédito/Débito o Valor.");
  else {
    for (const row of rows.slice(headerAt + 1)) {
      const date = cellDate(row[cols.date]);
      if (!date) {
        if (/segun extracto|^totales? del extracto/.test(row.map(norm).join(" | "))) totals = row;
        continue;
      }
      let amount: number | null;
      if (cols.credit >= 0 && cols.debit >= 0) {
        const credit = cellNumber(row[cols.credit]);
        const debit = cellNumber(row[cols.debit]);
        amount = (credit ? Math.abs(credit) : 0) - (debit ? Math.abs(debit) : 0);
      } else amount = cellNumber(row[cols.value]);
      if (!amount) continue;
      lines.push({
        position: lines.length + 1,
        date,
        amount: round2(amount),
        doc: cols.doc >= 0 ? String(row[cols.doc] ?? "").trim() : "",
        description: String(row[cols.description] ?? "").replace(/\s+/g, " ").trim(),
        office: cols.office >= 0 ? String(row[cols.office] ?? "").trim() : "",
      });
    }
    if (!lines.length) problems.push("La tabla de movimientos está vacía.");
  }

  const months = [...new Set(lines.map((l) => l.date.slice(0, 7)))];
  if (months.length > 1) problems.push(`El archivo tiene movimientos de varios meses (${months.join(", ")}): carga un extracto por mes.`);
  const periodMonth = months.length === 1 ? `${months[0]}-01` : "";

  const inSum = round2(lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0));
  const outSum = round2(-lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0));
  const opening = besideLabel(rows, /^saldo anterior|^saldo inicial/);
  if (opening === null) problems.push("No encontré el saldo anterior (una celda «Saldo anterior» con el valor al lado).");

  // The statement's own totals, when the sheet has them: credits, debits, closing balance.
  const t = totals as Cell[] | null;
  const credits = t && cols && cols.credit >= 0 ? cellNumber(t[cols.credit]) : null;
  const debits = t && cols && cols.debit >= 0 ? cellNumber(t[cols.debit]) : null;
  let closing = (t && cols && cols.balance >= 0 ? cellNumber(t[cols.balance]) : null) ?? besideLabel(rows, /^nuevo saldo|^saldo final|^saldo actual/);
  if (credits !== null && Math.abs(Math.abs(credits) - inSum) > 0.01) problems.push(`Los créditos del archivo (${inSum}) no suman lo del extracto (${Math.abs(credits)}).`);
  if (debits !== null && Math.abs(Math.abs(debits) - outSum) > 0.01) problems.push(`Los débitos del archivo (${outSum}) no suman lo del extracto (${Math.abs(debits)}).`);
  if (opening !== null && closing !== null && Math.abs(round2(opening + inSum - outSum) - closing) > 0.01)
    problems.push("El saldo anterior más los movimientos no da el nuevo saldo.");
  if (closing === null && opening !== null) closing = round2(opening + inSum - outSum);

  return {
    bank: "davivienda",
    accountNumber,
    periodMonth,
    openingBalance: opening ?? 0,
    closingBalance: closing ?? 0,
    credits: inSum,
    debits: outSum,
    lines,
    problems,
  };
}

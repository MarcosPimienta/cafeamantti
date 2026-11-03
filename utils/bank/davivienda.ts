// Davivienda account statement (PDF "Informe del mes"): turns the text
// pieces of its pages into the statement's lines. Pure: the PDF is read by
// utils/bank/pdfText.ts. Each movement row starts with "DD MM", then the
// value with its sign, the document number, the description (it can go on
// in the rows below) and the office (the right column).

export type TextItem = { page: number; x: number; y: number; str: string };

export type StatementLine = {
  position: number;
  date: string; // YYYY-MM-DD
  /** + money in, − money out. */
  amount: number;
  doc: string;
  description: string;
  office: string;
};

export type ParsedStatement = {
  bank: "davivienda";
  accountNumber: string;
  /** First day of the month: YYYY-MM-01. */
  periodMonth: string;
  openingBalance: number;
  closingBalance: number;
  credits: number;
  debits: number;
  lines: StatementLine[];
  /** Empty when the lines add up to the statement's own totals. */
  problems: string[];
};

const MONTHS = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const ROW = /^(\d{2})\s+(\d{2})\s+\$\s*([\d,]+\.\d{2})\s*([+-])\s+(\d{1,8})\s*(.*)$/;
const SAME_ROW = 2.5; // y units: pieces of the same printed row
const NEXT_ROW = 13; // a description goes on in the row right below

const money = (s: string) => Number(s.replace(/[$\s,]/g, ""));
const round2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

/** The value printed next to a label ("Saldo Anterior  $3,421,032.86"). */
function labelValue(items: TextItem[], label: string): number | null {
  const at = items.find((i) => norm(i.str.trim()) === norm(label));
  if (!at) return null;
  const v = items
    .filter((i) => i.page === at.page && Math.abs(i.y - at.y) <= SAME_ROW && i.x > at.x && /\$?[\d,]+\.\d{2}/.test(i.str))
    .sort((a, b) => a.x - b.x)[0];
  return v ? money(v.str) : null;
}

/** Groups a page's pieces into printed rows, top to bottom. */
function rowsOf(items: TextItem[]): TextItem[][] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: TextItem[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - it.y) <= SAME_ROW) row.push(it);
    else rows.push([it]);
  }
  return rows.map((r) => r.sort((a, b) => a.x - b.x));
}

export function parseDavivienda(all: TextItem[]): ParsedStatement {
  const items = all.filter((i) => i.str.trim());
  const problems: string[] = [];

  const account = items.find((i) => /^\d{4}\s\d{4}\s\d{4}$/.test(i.str.trim()))?.str.trim() ?? "";
  const monthText = items.map((i) => norm(i.str)).find((s) => /^[A-Z]+\s*\/\s*\d{4}$/.test(s.trim()) && MONTHS.includes(s.split("/")[0].trim()));
  if (!account) problems.push("No encontré el número de cuenta en el extracto.");
  if (!monthText) problems.push("No encontré el mes del extracto (\"Informe del mes\").");
  const [mName, yText] = (monthText ?? "/").split("/").map((s) => s.trim());
  const month = MONTHS.indexOf(mName) + 1;
  const year = Number(yText);
  const periodMonth = month > 0 && year ? `${year}-${String(month).padStart(2, "0")}-01` : "";

  const opening = labelValue(items, "Saldo Anterior");
  const closing = labelValue(items, "Nuevo Saldo");
  const credits = labelValue(items, "Más Créditos");
  const debits = labelValue(items, "Menos Débitos");
  if (opening === null || closing === null) problems.push("No encontré el saldo anterior o el nuevo saldo.");

  const lines: StatementLine[] = [];
  for (const page of [...new Set(items.map((i) => i.page))].sort((a, b) => a - b)) {
    const onPage = items.filter((i) => i.page === page);
    // The table's header gives the columns: the office column starts halfway
    // between "Clase de Movimiento" and "Oficina" (both are centered).
    const clase = onPage.find((i) => norm(i.str.trim()) === "CLASE DE MOVIMIENTO");
    const oficina = onPage.find((i) => norm(i.str.trim()) === "OFICINA");
    if (!clase || !oficina) continue;
    const officeFrom = (clase.x + oficina.x) / 2;

    let last: { line: StatementLine; y: number; descX: number } | null = null;
    for (const row of rowsOf(onPage.filter((i) => i.y < clase.y - SAME_ROW))) {
      const left = row.filter((i) => i.x < officeFrom);
      const office = row.filter((i) => i.x >= officeFrom).map((i) => i.str.trim()).join(" ");
      const m = ROW.exec(left.map((i) => i.str.trim()).join(" "));
      if (m) {
        const [, dd, mm, value, sign, doc, description] = m;
        if (Number(mm) !== month) problems.push(`Movimiento con fecha ${dd}/${mm} fuera del mes del extracto.`);
        const line: StatementLine = {
          position: lines.length + 1,
          date: `${year}-${mm}-${dd}`,
          amount: round2((sign === "-" ? -1 : 1) * money(value)),
          doc,
          description: description.trim(),
          office,
        };
        lines.push(line);
        const docAt = left.findIndex((i) => i.str.trim() === doc);
        const descX = left[docAt + 1]?.x ?? (docAt >= 0 ? left[docAt].x + 20 : left[left.length - 1].x);
        last = { line, y: row[0].y, descX };
        continue;
      }
      // The description going on in the row below (e.g. "FELC5002").
      if (last && last.y - row[0].y <= NEXT_ROW && left.length && left[0].x >= last.descX - 5) {
        last.line.description = `${last.line.description} ${left.map((i) => i.str.trim()).join(" ")}`.trim();
        if (office) last.line.office = `${last.line.office} ${office}`.trim();
        last.y = row[0].y;
      } else last = null;
    }
  }

  if (!lines.length) problems.push("No encontré movimientos: ¿es un extracto de cuenta Davivienda en PDF?");
  const inSum = round2(lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0));
  const outSum = round2(-lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0));
  if (credits !== null && Math.abs(inSum - credits) > 0.01) problems.push(`Los créditos leídos (${inSum}) no suman lo del extracto (${credits}).`);
  if (debits !== null && Math.abs(outSum - debits) > 0.01) problems.push(`Los débitos leídos (${outSum}) no suman lo del extracto (${debits}).`);
  if (opening !== null && closing !== null && Math.abs(round2(opening + inSum - outSum) - closing) > 0.01)
    problems.push("El saldo anterior más los movimientos no da el nuevo saldo.");

  return {
    bank: "davivienda",
    accountNumber: account,
    periodMonth,
    openingBalance: opening ?? 0,
    closingBalance: closing ?? 0,
    credits: credits ?? inSum,
    debits: debits ?? outSum,
    lines,
    problems,
  };
}

// What the Flujo de Caja report shows, by nature: the month's expenses
// (costs and operating expenses) apart from investments (fixed assets) and
// money that leaves without being an expense (advances, balance movements),
// and incomes by where the money came from. Pure functions.

export type ExpenseRow = { category: string | null; amount: number | string; expense_type?: string | null; concept?: string | null; supplier?: { name: string | null } | { name: string | null }[] | null };
export type IncomeRow = { category?: string | null; concept?: string | null; amount: number | string; type?: string | null };

export type Bar = {
  /** Full category name (tooltip). */
  name: string;
  /** Name without its parenthetical: "Costo de Ventas". */
  label: string;
  kind: "COGS" | "OPEX" | "OTROS" | "INGRESO";
  value: number;
  /** Share of the group's total (0–1). */
  share: number;
  /** Same bar in the previous period, when there is one. */
  previous: number | null;
  /** What adds up to it (supplier, client or concept; the categories of "Otros"). */
  children?: Bar[];
};

type Entry = { name: string; kind: Bar["kind"]; value: number; children?: Bar[] };

/** Bars shown before the rest folds into "Otros". */
export const MAX_BARS = 7;

const num = (v: unknown) => Number(v ?? 0) || 0;
const round = (n: number) => Math.round(n * 100) / 100;

/** "Costos de Producción (Maquila, Servicio de tostión)" → "Costos de Producción". */
export const shortLabel = (name: string) => name.replace(/\s*\(.*\)\s*$/, "").trim() || name;

function sumBy<T>(rows: T[], key: (r: T) => string, value: (r: T) => number) {
  const m = new Map<string, number>();
  for (const r of rows) m.set(key(r), round((m.get(key(r)) ?? 0) + value(r)));
  return m;
}

/** Biggest first; past MAX_BARS the rest is one "Otros" bar that opens into them. */
function toBars(entries: Entry[], total: number, previous?: Map<string, number>, labels = true): Bar[] {
  const bar = (e: Entry): Bar => ({
    name: e.name, label: labels ? shortLabel(e.name) : e.name, kind: e.kind, value: e.value, share: total ? e.value / total : 0,
    previous: previous ? previous.get(e.name) ?? 0 : null, ...(e.children ? { children: e.children } : {}),
  });
  const sorted = entries.filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
  const shown = sorted.length > MAX_BARS ? sorted.slice(0, MAX_BARS - 1) : sorted;
  const rest = sorted.slice(shown.length);
  const bars = shown.map(bar);
  if (rest.length) {
    const value = round(rest.reduce((s, e) => s + e.value, 0));
    const prev = previous ? round(rest.reduce((s, e) => s + (previous.get(e.name) ?? 0), 0)) : null;
    // Inside "Otros" each bar's share is of the whole, like the bars above it.
    const children = rest.map((e) => ({ ...bar(e), children: undefined }));
    bars.push({ name: rest.map((e) => e.name).join(", "), label: `Otros (${rest.length})`, kind: entries[0]?.kind === "INGRESO" ? "INGRESO" : "OTROS", value, share: total ? value / total : 0, previous: prev, children });
  }
  return bars;
}

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
const KEY = "\u0000";

/** What a category's bar opens into, per expense: its supplier, else its concept ("… · TODO EMPAQUES" → the last part). */
export function expenseDetail(r: ExpenseRow): string {
  const supplier = one(r.supplier)?.name?.trim();
  if (supplier) return supplier;
  const concept = (r.concept ?? "").trim();
  const parts = concept.split(" · ");
  return (parts.length > 1 ? parts.at(-1)! : concept).slice(0, 60) || "Sin concepto";
}

/** Per income: the client of an RC ("RC-1-250 · MXM HOSPITALITY · FV…"), else its concept. */
export function incomeDetail(r: IncomeRow): string {
  const concept = (r.concept ?? "").trim();
  if (/^RC-\d+-\d+/.test(concept)) return concept.split(" · ")[1]?.trim() || concept;
  return concept.slice(0, 60) || "Sin concepto";
}

/** Bars by `group`, each opening into its rows by `detail`; the shares of the children are of their parent. */
function nested<T extends { amount: number | string }>(
  rows: T[], prevRows: T[] | undefined, group: (r: T) => string, detail: (r: T) => string, kindOf: (name: string) => Bar["kind"], total: number
): Bar[] {
  const byGroup = new Map<string, T[]>();
  for (const r of rows) byGroup.set(group(r), [...(byGroup.get(group(r)) ?? []), r]);
  const prevGroup = prevRows ? sumBy(prevRows, group, (r) => num(r.amount)) : undefined;
  const prevDetail = prevRows ? sumBy(prevRows, (r) => group(r) + KEY + detail(r), (r) => num(r.amount)) : undefined;
  const entries: Entry[] = [...byGroup].map(([name, list]) => {
    const value = round(list.reduce((s, r) => s + num(r.amount), 0));
    const details = sumBy(list, detail, (r) => num(r.amount));
    const prev = prevDetail ? new Map([...details.keys()].map((d) => [d, prevDetail.get(name + KEY + d) ?? 0])) : undefined;
    const children = toBars([...details].map(([d, v]) => ({ name: d, kind: kindOf(name), value: v })), value, prev, false);
    return { name, kind: kindOf(name), value, children };
  });
  return toBars(entries, total, prevGroup);
}

const isSpend = (t: string | null | undefined) => t === "COGS" || t === "OPEX" || !t;

/**
 * Expenses by nature. `gasto` is what the month cost (COGS + OPEX), the only
 * part in the bars; `inversion` are fixed assets (they depreciate over
 * months); `noGasto` is money out that is not an expense.
 */
export function expenseBreakdown(rows: ExpenseRow[], previousRows?: ExpenseRow[]) {
  const spend = rows.filter((r) => isSpend(r.expense_type));
  const gasto = round(spend.reduce((s, r) => s + num(r.amount), 0));
  const inversion = round(rows.filter((r) => r.expense_type === "CAPEX").reduce((s, r) => s + num(r.amount), 0));
  const noGasto = round(rows.filter((r) => r.expense_type === "ANTICIPO" || r.expense_type === "BALANCE").reduce((s, r) => s + num(r.amount), 0));
  const kindOf = new Map<string, Bar["kind"]>();
  for (const r of spend) kindOf.set(r.category ?? "Sin categoría", r.expense_type === "COGS" ? "COGS" : "OPEX");
  const category = (r: ExpenseRow) => r.category ?? "Sin categoría";
  const prevSpend = previousRows?.filter((r) => isSpend(r.expense_type));
  const bars = nested(spend, prevSpend, category, expenseDetail, (name) => kindOf.get(name) ?? "OPEX", gasto);
  const costos = round(spend.filter((r) => r.expense_type === "COGS").reduce((s, r) => s + num(r.amount), 0));
  const previousGasto = previousRows ? round(previousRows.filter((r) => isSpend(r.expense_type)).reduce((s, r) => s + num(r.amount), 0)) : null;
  return { gasto, costos, operativos: round(gasto - costos), inversion, noGasto, bars, previousGasto };
}

/** Where the money came from: collections of invoices (RC), app orders, and the rest by category. */
export function incomeSource(r: IncomeRow): string {
  if (/^\s*RC-\d+-\d+/.test(r.concept ?? "")) return "Cobros de facturas con RC";
  if (String(r.type ?? "").toLowerCase() === "auto") return "Órdenes pagadas en la app";
  return r.category || "Otros ingresos";
}

export function incomeBreakdown(rows: IncomeRow[], previousRows?: IncomeRow[]) {
  const total = round(rows.reduce((s, r) => s + num(r.amount), 0));
  return { total, bars: nested(rows, previousRows, incomeSource, incomeDetail, () => "INGRESO", total) };
}

/** The period just before [start, end]: the previous month for a whole month, else the same length before (YYYY-MM-DD). */
export function previousPeriod(start: string, end: string): { start: string; end: string } {
  const [y, m] = start.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (start.endsWith("-01") && end === `${start.slice(0, 8)}${String(lastDay).padStart(2, "0")}`) {
    const prevLast = new Date(Date.UTC(y, m - 1, 0));
    const p = prevLast.toISOString().slice(0, 10);
    return { start: `${p.slice(0, 8)}01`, end: p };
  }
  const day = 86_400_000;
  const s = Date.parse(`${start}T00:00:00Z`);
  const e = Date.parse(`${end}T00:00:00Z`);
  const len = Math.round((e - s) / day) + 1;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { start: iso(s - len * day), end: iso(s - day) };
}

// The monthly income statement (estado de resultados) as a table: what was
// sold (before IVA), the cost of the coffee that left, gross margin, selling
// and administration expenses, EBITDA, depreciation, the operating result, then
// interest and bank costs down to the month's result. Profitability, not
// cash. Pure functions; the labels are Spanish keys the screen translates.

/** One record behind a line: an income, an expense, an accrual. */
export type StatementItem = { date: string; concept: string; category: string; amount: number };

export type LineKey =
  | "sales" | "deductions" | "net_sales"
  | "cost" | "gross"
  | "selling" | "admin" | "ebitda" | "depreciation" | "operating"
  | "interest" | "bank" | "result";

export type StatementLine = {
  key: LineKey;
  /** Spanish label (translated on screen). */
  label: string;
  /** Hint under the label, e.g. who is in it. */
  hint?: string;
  /** Positive = adds, negative = takes away; subtotals carry their sign. */
  amount: number;
  kind: "line" | "subtotal" | "total";
  items: StatementItem[];
};

export type ExpenseGroup = "selling" | "admin" | "interest" | "bank";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Which line of the statement an operating expense category goes to. */
export function expenseGroup(category: string): ExpenseGroup {
  const c = fold(category);
  if (/interes/.test(c)) return "interest";
  if (/bancari|gmf|4x1000|cuatro por mil/.test(c)) return "bank";
  if (/comision(es)? de venta|vendedor|referid|publicidad|mercadeo|marketing|fletes?|envio|domicilio|transporte|viaje|muestra|degustacion|evento|feria/.test(c)) return "selling";
  return "admin";
}

export type MonthInput = {
  /** What was sold in the month, before IVA (invoices, orders, sales without an order). */
  sales: StatementItem[];
  /** What comes off sales: credit notes, discounts (positive amounts). */
  deductions: StatementItem[];
  /** Cost of the coffee that left: units × unit cost (positive amounts). */
  cost: StatementItem[];
  /** OPEX expenses (net of IVA). */
  opex: StatementItem[];
  /** Interest that capitalizes into a loan (no money leaves). */
  accruedInterest: StatementItem[];
  /** Depreciation of the month by destination (Spanish label → amount). */
  depreciation: StatementItem[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (xs: { amount: number }[]) => round2(xs.reduce((s, x) => s + x.amount, 0));

export type Statement = {
  lines: StatementLine[];
  /** Figures for the cards on top. */
  netSales: number;
  grossMargin: number;
  grossMarginPct: number;
  /** Before interest, depreciation (and taxes): what the operation itself leaves. */
  ebitda: number;
  result: number;
  /** Net sales that would leave the month at 0 (null when the coffee leaves no margin). */
  breakEven: number | null;
};

export function buildStatement(m: MonthInput): Statement {
  const sales = sum(m.sales);
  const deductions = sum(m.deductions);
  const netSales = round2(sales - deductions);
  const cost = sum(m.cost);
  const gross = round2(netSales - cost);

  const by = (g: ExpenseGroup) => m.opex.filter((e) => expenseGroup(e.category) === g);
  const selling = by("selling");
  const admin = by("admin");
  const interest = [...by("interest"), ...m.accruedInterest];
  const bank = by("bank");
  const ebitda = round2(gross - sum(selling) - sum(admin));
  const operating = round2(ebitda - sum(m.depreciation));
  const result = round2(operating - sum(interest) - sum(bank));

  const line = (key: LineKey, label: string, amount: number, items: StatementItem[] = [], kind: StatementLine["kind"] = "line", hint?: string): StatementLine =>
    ({ key, label, amount, kind, items: [...items].sort((a, b) => b.amount - a.amount), ...(hint ? { hint } : {}) });

  const lines: StatementLine[] = [
    line("sales", "Ventas (sin IVA)", sales, m.sales),
    line("deductions", "Notas crédito y descuentos", -deductions, m.deductions),
    line("net_sales", "Ventas netas", netSales, [], "subtotal"),
    line("cost", "Costo del café vendido", -cost, m.cost, "line", "lo que salió del inventario × su costo"),
    line("gross", "Margen bruto", gross, [], "subtotal"),
    line("selling", "Gastos de ventas", -sum(selling), selling, "line", "transporte, comisiones"),
    line("admin", "Gastos de administración", -sum(admin), admin, "line", "honorarios, contabilidad"),
    line("ebitda", "EBITDA", ebitda, [], "subtotal", "antes de depreciación, intereses e impuestos"),
    line("depreciation", "Depreciación de equipos", -sum(m.depreciation), m.depreciation),
    line("operating", "Resultado operativo", operating, [], "subtotal"),
    line("interest", "Intereses de préstamos", -sum(interest), interest),
    line("bank", "Gastos bancarios", -sum(bank), bank),
    line("result", "Resultado del mes", result, [], "total"),
  ];

  const grossMarginPct = netSales ? round2((gross / netSales) * 100) : 0;
  // Fixed costs over the margin each peso of sales leaves.
  const fixed = sum(selling) + sum(admin) + sum(m.depreciation) + sum(interest) + sum(bank);
  const breakEven = gross > 0 && netSales > 0 ? round2(fixed / (gross / netSales)) : null;
  return { lines, netSales, grossMargin: gross, grossMarginPct, ebitda, result, breakEven };
}

/** Share of net sales (null without sales). */
export function pctOfSales(amount: number, netSales: number): number | null {
  return netSales ? round2((amount / netSales) * 100) : null;
}

/** Change against the previous month, in % of its absolute value (null when it was 0). */
export function change(current: number, previous: number): number | null {
  return previous ? round2(((current - previous) / Math.abs(previous)) * 100) : null;
}

/** 'YYYY-MM' of the n-th month before (n = 0 → same month). */
export function monthBefore(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 - n, 1));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────
// What the screen draws from a statement
// ─────────────────────────────────────────────────────────────

const lineAt = (s: Statement, key: LineKey) => s.lines.find((l) => l.key === key)?.amount ?? 0;

/** One bar of the waterfall: from `range[0]` to `range[1]` (pesos). */
export type WaterfallStep = {
  key: LineKey;
  label: string;
  /** What the line does: adds, takes away, or is a running total. */
  kind: "up" | "down" | "subtotal" | "total";
  amount: number;
  range: [number, number];
};

/**
 * Sales down to the month's result as floating bars: each line moves the
 * running total, subtotals stand on zero. Bars are [low, high] so a month in
 * the red draws below the axis.
 */
export function waterfall(s: Statement): WaterfallStep[] {
  let running = 0;
  return s.lines.map((l) => {
    if (l.kind !== "line") {
      running = l.amount;
      return { key: l.key, label: l.label, kind: l.kind, amount: l.amount, range: [Math.min(0, l.amount), Math.max(0, l.amount)] as [number, number] };
    }
    const from = running;
    running = round2(running + l.amount);
    return { key: l.key, label: l.label, kind: l.amount >= 0 ? "up" : "down", amount: l.amount, range: [Math.min(from, running), Math.max(from, running)] as [number, number] };
  });
}

export type CategoryTotal = { category: string; amount: number; count: number };

/** The records of a line added up by category, biggest first. */
export function byCategory(items: StatementItem[]): CategoryTotal[] {
  const m = new Map<string, CategoryTotal>();
  for (const it of items) {
    const c = m.get(it.category) ?? { category: it.category, amount: 0, count: 0 };
    c.amount = round2(c.amount + it.amount);
    c.count += 1;
    m.set(it.category, c);
  }
  return [...m.values()].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

/** The lines that take money away from sales, in the statement's order. */
const TAKES: LineKey[] = ["deductions", "cost", "selling", "admin", "depreciation", "interest", "bank"];

export type HundredSlice = { key: LineKey; label: string; amount: number; /** Pesos of every $100 of sales. */ per100: number };

/**
 * Where every $100 of sales went: what each line took away and what was
 * left (`result`, negative when the month lost money). Null without sales.
 */
export function perHundred(s: Statement): { slices: HundredSlice[]; result: HundredSlice } | null {
  const sales = lineAt(s, "sales");
  if (sales <= 0) return null;
  const slice = (key: LineKey): HundredSlice => {
    const l = s.lines.find((x) => x.key === key)!;
    const amount = Math.abs(l.amount);
    return { key, label: l.label, amount, per100: round2((amount / sales) * 100) };
  };
  const result = s.lines.find((l) => l.key === "result")!;
  return {
    slices: TAKES.map(slice).filter((x) => x.amount > 0),
    result: { key: "result", label: result.label, amount: result.amount, per100: round2((result.amount / sales) * 100) },
  };
}

export type LineChange = { key: LineKey; label: string; current: number; previous: number; delta: number; /** The month is better off for it. */ good: boolean };

/**
 * The lines that moved the most against another month, by pesos. Amounts
 * carry their sign, so a line is good news when it went up: more sales, or
 * an expense that took less away. Subtotals are left out: they only repeat
 * the lines above them, and the screen states the result on its own.
 */
export function biggestChanges(current: Statement, previous: Statement, n = 3): LineChange[] {
  return current.lines
    .filter((l) => l.kind === "line")
    .map((l) => {
      const prev = previous.lines.find((p) => p.key === l.key)?.amount ?? 0;
      const delta = round2(l.amount - prev);
      return { key: l.key, label: l.label, current: l.amount, previous: prev, delta, good: delta > 0 };
    })
    .filter((c) => c.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, n);
}

/** Share of net sales that could go before the month stops covering its costs (null without a break-even). */
export function safetyMargin(s: Statement): number | null {
  if (s.breakEven == null || !s.netSales) return null;
  return round2(((s.netSales - s.breakEven) / s.netSales) * 100);
}

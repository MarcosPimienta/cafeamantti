// The monthly income statement (estado de resultados) as a table: sales,
// cost of the coffee sold, gross margin, selling and administration expenses,
// depreciation, the operating result, then interest and bank costs down to
// the month's result. Pure functions; the labels are Spanish keys that the
// screen translates.

/** One record behind a line: an income, an expense, an accrual. */
export type StatementItem = { date: string; concept: string; category: string; amount: number };

export type LineKey =
  | "sales" | "deductions" | "net_sales"
  | "cost" | "gross"
  | "selling" | "admin" | "depreciation" | "operating"
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
  /** Every income of the month (manual, payments, web orders), already broken down. */
  incomes: (StatementItem & { fee: number; shipping: number; tax: number })[];
  /** COGS expenses (net of IVA). */
  cogs: StatementItem[];
  /** Inventory consumed (cost of what left), if any. */
  inventoryCost: number;
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
  result: number;
  /** Net sales that would leave the month at 0 (null when the coffee leaves no margin). */
  breakEven: number | null;
};

export function buildStatement(m: MonthInput): Statement {
  const sales = sum(m.incomes);
  const deductionItems: StatementItem[] = m.incomes
    .filter((i) => i.fee + i.shipping + i.tax > 0)
    .map((i) => ({ date: i.date, concept: i.concept, category: i.category, amount: round2(i.fee + i.shipping + i.tax) }));
  const deductions = sum(deductionItems);
  const netSales = round2(sales - deductions);

  const costItems = [...m.cogs, ...(m.inventoryCost > 0 ? [{ date: "", concept: "Consumo de inventario", category: "Inventario", amount: round2(m.inventoryCost) }] : [])];
  const cost = sum(costItems);
  const gross = round2(netSales - cost);

  const by = (g: ExpenseGroup) => m.opex.filter((e) => expenseGroup(e.category) === g);
  const selling = by("selling");
  const admin = by("admin");
  const interest = [...by("interest"), ...m.accruedInterest];
  const bank = by("bank");
  const operating = round2(gross - sum(selling) - sum(admin) - sum(m.depreciation));
  const result = round2(operating - sum(interest) - sum(bank));

  const line = (key: LineKey, label: string, amount: number, items: StatementItem[] = [], kind: StatementLine["kind"] = "line", hint?: string): StatementLine =>
    ({ key, label, amount, kind, items: [...items].sort((a, b) => b.amount - a.amount), ...(hint ? { hint } : {}) });

  const lines: StatementLine[] = [
    line("sales", "Ventas", sales, m.incomes.map(({ date, concept, category, amount }) => ({ date, concept, category, amount }))),
    line("deductions", "IVA, comisiones y fletes", -deductions, deductionItems),
    line("net_sales", "Ventas netas", netSales, [], "subtotal"),
    line("cost", "Costo del café vendido", -cost, costItems, "line", "café, maquila, empaques"),
    line("gross", "Margen bruto", gross, [], "subtotal"),
    line("selling", "Gastos de ventas", -sum(selling), selling, "line", "transporte, comisiones"),
    line("admin", "Gastos de administración", -sum(admin), admin, "line", "honorarios, contabilidad"),
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
  return { lines, netSales, grossMargin: gross, grossMarginPct, result, breakEven };
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

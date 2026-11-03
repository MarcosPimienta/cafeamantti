// Liabilities: loans from third parties and partners. What each one owes at
// a date, what it costs, what is due, and the interest that is a cost of the
// month even when no money leaves (a loan whose interest is capitalized).
// Pure functions; dates are YYYY-MM-DD.

export type LoanScheme = "interes_mensual" | "capitaliza" | "sin_interes";
export type LoanMoveKind = "desembolso" | "pago_interes" | "abono_capital" | "pago_final";

export type Loan = {
  id: string;
  creditor_name: string;
  creditor_kind: "tercero" | "socio";
  scheme: LoanScheme;
  principal: number;
  start_date: string;
  /** 0.03 = 3% mensual. */
  monthly_rate: number;
  capitalize_every_months?: number | null;
  payment_day?: number | null;
  maturity_date?: string | null;
  /** Monthly payments before this date are not asked for. */
  tracked_from?: string | null;
  active?: boolean;
  notes?: string | null;
};

export type LoanMove = { id?: string; loan_id: string; move_date: string; kind: LoanMoveKind; amount: number };

export type LoanState = {
  /** What is owed at the date: capital plus interest accrued and not paid. */
  balance: number;
  /** Capital (for a capitalizing loan, with the interest already added). */
  capital: number;
  /** Interest accrued since the last capitalization or payment. */
  accrued: number;
  /** Interest of a month at today's capital. */
  monthlyInterest: number;
  /** Effective annual rate (0.426 = 42,6% EA). */
  annualRate: number;
  /** Monthly payments due and not paid (interes_mensual). */
  overdueMonths: number;
  overdueAmount: number;
  /** Next monthly payment (interes_mensual) or capitalization (capitaliza). */
  nextDate: string | null;
  /** What is owed at maturity (capitaliza with a maturity date). */
  maturityValue: number | null;
  settled: boolean;
};

const round = (n: number) => Math.round(n * 100) / 100;
const ymd = (y: number, m: number, d: number) => {
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
};
const parts = (d: string) => d.split("-").map(Number) as [number, number, number];

/** Same day `n` months later (the 31st becomes the month's last day). */
export function addMonths(date: string, n: number, day?: number): string {
  const [y, m, d] = parts(date);
  const idx = y * 12 + (m - 1) + n;
  return ymd(Math.floor(idx / 12), (idx % 12) + 1, day ?? d);
}

/** Months from `a` to `b`: whole months plus the remaining days over 30 (how the lenders count). */
export function monthsBetween(a: string, b: string): number {
  if (b <= a) return 0;
  let whole = 0;
  while (addMonths(a, whole + 1) <= b) whole++;
  const from = addMonths(a, whole);
  const days = (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  return whole + days / 30;
}

const sum = (moves: LoanMove[], kind: LoanMoveKind, until: string) => round(moves.filter((m) => m.kind === kind && m.move_date <= until).reduce((s, m) => s + Number(m.amount), 0));

export function annualRate(loan: Loan): number {
  const r = Number(loan.monthly_rate) || 0;
  if (!r) return 0;
  if (loan.scheme === "capitaliza") {
    const n = loan.capitalize_every_months || 1;
    return Math.pow(1 + r * n, 12 / n) - 1;
  }
  return Math.pow(1 + r, 12) - 1;
}

/** Capitalizing loan: capital and accrued interest at `asOf`, payments aside. */
function capitalizedValue(loan: Loan, moves: LoanMove[], asOf: string) {
  const n = loan.capitalize_every_months || 6;
  const r = Number(loan.monthly_rate) || 0;
  const end = loan.maturity_date && loan.maturity_date < asOf ? loan.maturity_date : asOf;
  let capital = Number(loan.principal);
  let periodStart = loan.start_date;
  while (addMonths(periodStart, n) <= end) {
    const periodEnd = addMonths(periodStart, n);
    capital = round(capital * (1 + r * n)) - sum(moves.filter((m) => m.move_date > periodStart), "abono_capital", periodEnd);
    periodStart = periodEnd;
  }
  const accrued = round(capital * r * monthsBetween(periodStart, end));
  return { capital, accrued, periodStart, next: addMonths(periodStart, n) };
}

export function loanState(loan: Loan, moves: LoanMove[], asOf: string): LoanState {
  const own = moves.filter((m) => m.loan_id === loan.id && m.move_date <= asOf);
  const settled = own.some((m) => m.kind === "pago_final");
  const rate = Number(loan.monthly_rate) || 0;
  const base: LoanState = { balance: 0, capital: 0, accrued: 0, monthlyInterest: 0, annualRate: annualRate(loan), overdueMonths: 0, overdueAmount: 0, nextDate: null, maturityValue: null, settled };
  if (settled || asOf < loan.start_date) return base;

  if (loan.scheme === "capitaliza") {
    const { capital, accrued, next } = capitalizedValue(loan, own, asOf);
    const maturityValue = loan.maturity_date ? (() => { const v = capitalizedValue(loan, own, loan.maturity_date!); return round(v.capital + v.accrued); })() : null;
    return { ...base, capital, accrued, balance: round(capital + accrued), monthlyInterest: round(capital * rate), nextDate: loan.maturity_date && next > loan.maturity_date ? loan.maturity_date : next, maturityValue };
  }

  const capital = round(Number(loan.principal) + sum(own, "desembolso", asOf) - sum(own, "abono_capital", asOf));
  if (loan.scheme === "sin_interes" || !rate) return { ...base, capital, balance: capital };

  // Interest due every month on the payment day, from the month after the start (or from tracked_from).
  const monthlyInterest = round(capital * rate);
  const day = loan.payment_day || parts(loan.start_date)[2];
  const from = loan.tracked_from && loan.tracked_from > loan.start_date ? loan.tracked_from : loan.start_date;
  let due = addMonths(loan.start_date, 1, day);
  while (due < from) due = addMonths(due, 1, day);
  let dueCount = 0;
  while (due <= asOf) { dueCount++; due = addMonths(due, 1, day); }
  const paid = sum(own.filter((m) => m.move_date >= from), "pago_interes", asOf);
  const overdueAmount = Math.max(0, round(dueCount * monthlyInterest - paid));
  return {
    ...base, capital, balance: round(capital + overdueAmount), monthlyInterest,
    overdueMonths: monthlyInterest ? Math.floor(overdueAmount / monthlyInterest + 0.0001) : 0, overdueAmount, nextDate: due,
  };
}

/**
 * Interest that is a cost of the month without leaving the bank: the one a
 * capitalizing loan adds to its capital. (Paid interest is already a Flujo
 * de Caja expense.) `month`: YYYY-MM.
 */
export function accruedInterestInMonth(loan: Loan, moves: LoanMove[], month: string): number {
  if (loan.scheme !== "capitaliza") return 0;
  const own = moves.filter((m) => m.loan_id === loan.id && m.kind === "abono_capital");
  const first = `${month}-01`;
  const next = addMonths(first, 1);
  const from = first < loan.start_date ? loan.start_date : first;
  const to = loan.maturity_date && loan.maturity_date < next ? loan.maturity_date : next;
  if (to <= from) return 0;
  const value = (d: string) => { const v = capitalizedValue(loan, own, d); return v.capital + v.accrued; };
  return Math.max(0, round(value(to) - value(from) + sum(own.filter((m) => m.move_date >= from), "abono_capital", to)));
}

export type LiabilitiesSummary = {
  terceros: number;
  socios: number;
  monthlyInterest: number;
  /** Third-party loans, most expensive first: where a payment saves the most. */
  priority: { loan: Loan; state: LoanState }[];
  /** Payments due in the next `days` days (and overdue ones), and maturities within `maturityDays`. */
  upcoming: { loan: Loan; date: string; amount: number; kind: "interes" | "vencido" | "vencimiento" }[];
};

export function summarize(loans: Loan[], moves: LoanMove[], asOf: string, days = 35, maturityDays = 150): LiabilitiesSummary {
  const rows = loans.filter((l) => l.active !== false).map((loan) => ({ loan, state: loanState(loan, moves, asOf) })).filter((r) => !r.state.settled);
  const horizon = new Date(Date.parse(`${asOf}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
  const maturityHorizon = new Date(Date.parse(`${asOf}T00:00:00Z`) + maturityDays * 86_400_000).toISOString().slice(0, 10);
  const upcoming: LiabilitiesSummary["upcoming"] = [];
  for (const { loan, state } of rows) {
    if (state.overdueAmount > 0) upcoming.push({ loan, date: asOf, amount: state.overdueAmount, kind: "vencido" });
    if (loan.scheme === "interes_mensual" && state.nextDate && state.nextDate <= horizon) upcoming.push({ loan, date: state.nextDate, amount: state.monthlyInterest, kind: "interes" });
    if (loan.maturity_date && loan.maturity_date >= asOf && loan.maturity_date <= maturityHorizon) upcoming.push({ loan, date: loan.maturity_date, amount: state.maturityValue ?? state.balance, kind: "vencimiento" });
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date));
  return {
    terceros: round(rows.filter((r) => r.loan.creditor_kind === "tercero").reduce((s, r) => s + r.state.balance, 0)),
    socios: round(rows.filter((r) => r.loan.creditor_kind === "socio").reduce((s, r) => s + r.state.balance, 0)),
    monthlyInterest: round(rows.reduce((s, r) => s + r.state.monthlyInterest, 0)),
    priority: rows.filter((r) => r.loan.creditor_kind === "tercero" && r.state.annualRate > 0).sort((a, b) => b.state.annualRate - a.state.annualRate),
    upcoming,
  };
}

/** Problems with a loan before saving it. */
export function loanProblems(l: Partial<Loan>): string[] {
  const p: string[] = [];
  if (!(l.creditor_name ?? "").trim()) p.push("Escribe el nombre del acreedor.");
  if (!["tercero", "socio"].includes(l.creditor_kind ?? "")) p.push("Elige si el acreedor es un tercero o un socio.");
  if (!["interes_mensual", "capitaliza", "sin_interes"].includes(l.scheme ?? "")) p.push("Elige cómo se pagan los intereses.");
  if (!(Number(l.principal) > 0)) p.push("El valor prestado debe ser mayor a cero.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(l.start_date ?? "")) p.push("Fecha del préstamo inválida.");
  if (l.scheme && l.scheme !== "sin_interes" && !(Number(l.monthly_rate) > 0)) p.push("Indica la tasa mensual.");
  if (l.scheme === "capitaliza" && !(Number(l.capitalize_every_months) > 0)) p.push("Indica cada cuántos meses se capitalizan los intereses.");
  if (l.maturity_date && l.start_date && l.maturity_date <= l.start_date) p.push("El vencimiento debe ser posterior a la fecha del préstamo.");
  return p;
}

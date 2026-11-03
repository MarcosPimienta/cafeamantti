// Conciliación bancaria: which Flujo de Caja rows explain each line of the
// bank statement. Pure. A match joins one or more bank lines with one or
// more Flujo de Caja rows whose money adds up the same (incomes in, expenses
// out); a returned transfer cancels its debit (reverso); a line can also be
// left out on purpose (ignorado), with a note.

export type BankLineLite = { id: string; date: string; amount: number; doc: string; description: string };
export type CashRow = { id: string; kind: "income" | "expense"; date: string; amount: number; concept: string; category: string };

export type Suggestion = {
  kind: "flujo" | "reverso";
  lineIds: string[];
  incomeIds: string[];
  expenseIds: string[];
  /** Spanish key for tr(), with its {vars}. */
  reason: string;
  vars?: Record<string, string>;
  /** Bank minus Flujo de Caja: not zero only for the month's bank fees against the expense that sums them. */
  difference: number;
};

/** Pesos: the bank has cents, Flujo de Caja usually doesn't. */
export const TOLERANCE = 1;
const DAYS_1TO1 = 7;
const DAYS_SPLIT = 3;

const round2 = (n: number) => Math.round(n * 100) / 100;
const dayNumber = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86400000;
export const daysBetween = (a: string, b: string) => Math.abs(dayNumber(a) - dayNumber(b));

/** Money of a row as the bank sees it: + in, − out. */
export const signed = (r: Pick<CashRow, "kind" | "amount">) => (r.kind === "income" ? 1 : -1) * Number(r.amount);

/** Bank lines minus the Flujo de Caja rows: zero when they explain each other. */
export function difference(lines: Pick<BankLineLite, "amount">[], rows: Pick<CashRow, "kind" | "amount">[]): number {
  return round2(lines.reduce((s, l) => s + Number(l.amount), 0) - rows.reduce((s, r) => s + signed(r), 0));
}

export const balanced = (diff: number) => Math.abs(diff) < TOLERANCE;

/** Charges and credits of the bank itself: transfer fees, 4×1000, IVA, interest earned. */
export function isBankFee(description: string): boolean {
  return /cobro transf|cobro servicio|cuota de manejo|gravamen|iva por servicios|rendimientos financieros|comisi[oó]n/i.test(description);
}

/** A transfer the other bank rejected: the money came back. */
export const isReturn = (description: string) => /devoluci[oó]n\s+rechazo/i.test(description);

const BANK_FEE_CATEGORY = /bancari/i;

/**
 * Suggestions for the pending lines, from the most certain to the least:
 * returned transfers with their debit (same document and value), then one
 * line ↔ one row of the same value within a week (closest date first), then
 * one line ↔ two rows of the same direction that add up to it (e.g. a
 * transfer that paid two things), and the month's bank fees ↔ the expense
 * that sums them.
 */
export function suggestMatches(lines: BankLineLite[], rows: CashRow[]): Suggestion[] {
  const out: Suggestion[] = [];
  const usedLines = new Set<string>();
  const usedRows = new Set<string>();
  const freeLines = () => lines.filter((l) => !usedLines.has(l.id));
  const freeRows = () => rows.filter((r) => !usedRows.has(r.id));
  const push = (s: Omit<Suggestion, "incomeIds" | "expenseIds" | "difference">, matched: CashRow[], diff = 0) => {
    s.lineIds.forEach((id) => usedLines.add(id));
    matched.forEach((r) => usedRows.add(r.id));
    out.push({ ...s, incomeIds: matched.filter((r) => r.kind === "income").map((r) => r.id), expenseIds: matched.filter((r) => r.kind === "expense").map((r) => r.id), difference: diff });
  };

  // 1. Returned transfers: the debit they undo has the same document.
  for (const back of lines.filter((l) => l.amount > 0 && isReturn(l.description))) {
    const sent = freeLines()
      .filter((l) => l.amount < 0 && l.doc === back.doc && balanced(l.amount + back.amount) && l.date <= back.date)
      .sort((a, b) => daysBetween(a.date, back.date) - daysBetween(b.date, back.date))[0];
    if (sent && !usedLines.has(back.id)) push({ kind: "reverso", lineIds: [sent.id, back.id], reason: "Transferencia rechazada: la plata volvió" }, []);
  }

  const regular = () => freeLines().filter((l) => !isBankFee(l.description) && !isReturn(l.description));

  // 2. One line, one row: same value, closest date.
  const pairs: { line: BankLineLite; row: CashRow; days: number }[] = [];
  for (const line of regular())
    for (const row of freeRows()) {
      const days = daysBetween(line.date, row.date);
      if (days <= DAYS_1TO1 && balanced(line.amount - signed(row))) pairs.push({ line, row, days });
    }
  pairs.sort((a, b) => a.days - b.days || a.line.date.localeCompare(b.line.date));
  for (const p of pairs) {
    if (usedLines.has(p.line.id) || usedRows.has(p.row.id)) continue;
    push({ kind: "flujo", lineIds: [p.line.id], ...(p.days === 0 ? { reason: "Mismo valor y misma fecha" } : { reason: "Mismo valor, {d} día(s) de diferencia", vars: { d: String(p.days) } }) }, [p.row]);
  }

  // 3. One line, two rows that add up to it.
  for (const line of regular()) {
    const near = freeRows().filter((r) => Math.sign(signed(r)) === Math.sign(line.amount) && daysBetween(line.date, r.date) <= DAYS_SPLIT);
    let best: [CashRow, CashRow] | null = null;
    for (let i = 0; i < near.length; i++)
      for (let j = i + 1; j < near.length; j++)
        if (balanced(line.amount - signed(near[i]) - signed(near[j]))) {
          if (best) { best = null; i = near.length; break; } // two ways to do it: let a person choose
          best = [near[i], near[j]];
        }
    if (best) push({ kind: "flujo", lineIds: [line.id], reason: "Un movimiento del banco que pagó dos cosas" }, best);
  }

  // 4. The bank's own charges against the one expense that sums them.
  const fees = freeLines().filter((l) => isBankFee(l.description));
  const feeRows = freeRows().filter((r) => r.kind === "expense" && BANK_FEE_CATEGORY.test(r.category));
  if (fees.length && feeRows.length === 1) {
    push({ kind: "flujo", lineIds: fees.map((l) => l.id), reason: "Comisiones, 4×1000 e IVA del banco del mes" }, feeRows, difference(fees, feeRows));
  }
  return out;
}

/**
 * Flujo de Caja rows with no bank line that look like a second copy of a row
 * that does have one: same kind and value within two months.
 */
export function possibleDuplicates(unmatched: CashRow[], matched: CashRow[]): Map<string, CashRow> {
  const out = new Map<string, CashRow>();
  for (const r of unmatched) {
    const twin = matched.find((m) => m.id !== r.id && m.kind === r.kind && balanced(Number(m.amount) - Number(r.amount)) && daysBetween(m.date, r.date) <= 62);
    if (twin) out.set(r.id, twin);
  }
  return out;
}

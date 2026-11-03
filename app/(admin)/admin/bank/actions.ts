'use server';

// Conciliación bancaria: the Davivienda statement of each month against
// Flujo de Caja. Each bank line ends up explained by Flujo de Caja rows that
// add up the same (registered by hand, or created here from the line), as a
// returned transfer with its debit, or left out with a note. Mutations
// return { success, error }: production hides thrown messages.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { checkIsAdmin } from '../../actions';
import { createExpenseDirect, createIncomeDirect, deleteExpenseDirect, deleteIncomeDirect } from '../cashflow/actions';
import { INCOME_CATEGORIES } from '../cashflow/types';
import { errorText } from '@/utils/siigo/server';
import { loadExpenseCategories } from '@/utils/expenses/server';
import { parseDavivienda } from '@/utils/bank/davivienda';
import { pdfTextItems } from '@/utils/bank/pdfText';
import { balanced, difference, type CashRow } from '@/utils/bank/matching';

const MIGRATION_HINT = 'Falta aplicar la migración 20261108000000_bank_reconciliation.sql';
// Server actions take up to 1 MB; a month's statement is ~200 KB.
const MAX_PDF_BYTES = 950 * 1024;
/** Flujo de Caja rows this many days around the month can explain its lines. */
const WINDOW_DAYS = 10;

async function requireAdmin() {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

function message(err: unknown) {
  const m = errorText(err);
  if (/bank_(statements|lines|matches|match_rows)/.test(m) && /exist|relation|schema/i.test(m)) return MIGRATION_HINT;
  return m;
}

async function guard<T extends object>(run: () => Promise<T>): Promise<({ success: true } & T) | { success: false; error: string }> {
  try {
    return { success: true, ...(await run()) };
  } catch (err) {
    return { success: false, error: message(err) };
  }
}

function refresh() {
  revalidatePath('/admin/bank');
  revalidatePath('/admin/cashflow');
}

export type BankStatement = {
  id: string;
  bank: string;
  account_number: string;
  period_month: string;
  opening_balance: number;
  closing_balance: number;
  file_name: string | null;
  lines: number;
  pending: number;
};
export type BankLine = { id: string; statement_id: string; position: number; line_date: string; amount: number; doc: string | null; description: string; office: string | null; match_id: string | null };
export type BankMatch = { id: string; kind: 'flujo' | 'reverso' | 'ignorado'; note: string | null; rows: { kind: 'income' | 'expense'; id: string; owned: boolean }[] };
export type ReconRow = CashRow & { matchId: string | null };

const shiftDays = (d: string, n: number) => {
  const t = new Date(`${d}T12:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const monthEnd = (first: string) => {
  const t = new Date(`${first}T12:00:00Z`);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0, 12)).toISOString().slice(0, 10);
};

type MatchRowRec = { match_id: string; income_id: string | null; expense_id: string | null; owned: boolean };

/** Flujo de Caja rows dated between from and to (v2), with the match each one explains. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function cashRows(supabase: any, from: string, to: string, matchRows: MatchRowRec[]): Promise<ReconRow[]> {
  const { data: days, error } = await supabase.from('daily_cashflows').select('id, date').gte('date', from).lte('date', to);
  if (error) throw error;
  const dateOf = new Map<string, string>(((days ?? []) as { id: string; date: string }[]).map((d) => [d.id, d.date]));
  if (!dateOf.size) return [];
  const ids = [...dateOf.keys()];
  const [inc, exp] = await Promise.all([
    supabase.from('cashflow_incomes').select('id, cashflow_id, concept, category, amount, gross_amount').eq('era', 'v2').in('cashflow_id', ids),
    supabase.from('cashflow_expenses').select('id, cashflow_id, concept, category, amount').eq('era', 'v2').in('cashflow_id', ids),
  ]);
  if (inc.error) throw inc.error;
  if (exp.error) throw exp.error;
  const byIncome = new Map(matchRows.filter((m) => m.income_id).map((m) => [m.income_id, m.match_id]));
  const byExpense = new Map(matchRows.filter((m) => m.expense_id).map((m) => [m.expense_id, m.match_id]));
  type Raw = { id: string; cashflow_id: string; concept: string; category: string; amount: number; gross_amount?: number };
  const rows: ReconRow[] = [
    ...((inc.data ?? []) as Raw[]).map((r) => ({ id: r.id, kind: 'income' as const, date: dateOf.get(r.cashflow_id) ?? '', amount: Number(r.gross_amount) || Number(r.amount), concept: r.concept, category: r.category, matchId: byIncome.get(r.id) ?? null })),
    ...((exp.data ?? []) as Raw[]).map((r) => ({ id: r.id, kind: 'expense' as const, date: dateOf.get(r.cashflow_id) ?? '', amount: Number(r.amount), concept: r.concept, category: r.category, matchId: byExpense.get(r.id) ?? null })),
  ];
  return rows.sort((a, b) => a.date.localeCompare(b.date) || b.amount - a.amount);
}

/** The statements; for the chosen one (or the latest), its lines, matches and the Flujo de Caja rows around its month. */
export async function getBankData(statementId?: string | null) {
  const { supabase } = await requireAdmin();
  const stRes = await supabase.from('bank_statements').select('*').order('period_month', { ascending: false });
  if (stRes.error) return { migrationApplied: false, statements: [], statement: null, lines: [], matches: [], rows: [] };

  const { data: allLines, error: lErr } = await supabase.from('bank_lines').select('id, statement_id, match_id');
  if (lErr) throw lErr;
  const counts = new Map<string, { lines: number; pending: number }>();
  for (const l of (allLines ?? []) as { statement_id: string; match_id: string | null }[]) {
    const c = counts.get(l.statement_id) ?? { lines: 0, pending: 0 };
    c.lines += 1;
    if (!l.match_id) c.pending += 1;
    counts.set(l.statement_id, c);
  }
  const statements: BankStatement[] = ((stRes.data ?? []) as Omit<BankStatement, 'lines' | 'pending'>[]).map((s) => ({
    ...s,
    opening_balance: Number(s.opening_balance),
    closing_balance: Number(s.closing_balance),
    ...(counts.get(s.id) ?? { lines: 0, pending: 0 }),
  }));
  const statement = statements.find((s) => s.id === statementId) ?? statements[0] ?? null;
  if (!statement) return { migrationApplied: true, statements, statement: null, lines: [], matches: [], rows: [] };

  const [{ data: lines, error: e1 }, { data: matchRows, error: e2 }] = await Promise.all([
    supabase.from('bank_lines').select('*').eq('statement_id', statement.id).order('position', { ascending: true }),
    supabase.from('bank_match_rows').select('match_id, income_id, expense_id, owned'),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const bankLines = ((lines ?? []) as BankLine[]).map((l) => ({ ...l, amount: Number(l.amount) }));
  const matchIds = [...new Set(bankLines.map((l) => l.match_id).filter((id): id is string => !!id))];
  const { data: matchRecs, error: e3 } = matchIds.length
    ? await supabase.from('bank_matches').select('id, kind, note').in('id', matchIds)
    : { data: [], error: null };
  if (e3) throw e3;
  const mr = (matchRows ?? []) as MatchRowRec[];
  const matches: BankMatch[] = ((matchRecs ?? []) as Omit<BankMatch, 'rows'>[]).map((m) => ({
    ...m,
    rows: mr.filter((r) => r.match_id === m.id).map((r) => ({ kind: r.income_id ? 'income' as const : 'expense' as const, id: (r.income_id ?? r.expense_id) as string, owned: r.owned })),
  }));
  const rows = await cashRows(supabase, shiftDays(statement.period_month, -WINDOW_DAYS), shiftDays(monthEnd(statement.period_month), WINDOW_DAYS), mr);
  return { migrationApplied: true, statements, statement, lines: bankLines, matches, rows };
}

/** Reads a Davivienda PDF statement and keeps its lines (not the file). */
export async function importStatement(form: FormData) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const file = form.get('file');
    if (!(file instanceof File) || !file.size) throw new Error('Elige el extracto en PDF.');
    if (file.size > MAX_PDF_BYTES) throw new Error('El archivo pesa más de 1 MB: ¿es el extracto del banco?');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') throw new Error('El archivo no es un PDF.');

    let items;
    try {
      items = await pdfTextItems(bytes);
    } catch (err) {
      console.error('importStatement: pdf.js', err);
      if (/password/i.test(errorText(err))) throw new Error('El PDF tiene contraseña. Descárgalo de nuevo sin clave.');
      throw new Error('No pude leer el PDF del extracto.');
    }
    if (!items.length) throw new Error('Este PDF es solo una imagen (impreso a PDF o escaneado), sin texto que leer. Descarga el extracto original desde Davivienda, sin imprimirlo.');
    const parsed = parseDavivienda(items);
    if (parsed.problems.length) throw new Error(parsed.problems.join(' · '));

    const { data: existing } = await supabase.from('bank_statements').select('id')
      .eq('bank', parsed.bank).eq('account_number', parsed.accountNumber).eq('period_month', parsed.periodMonth).maybeSingle();
    if (existing) throw new Error('Ese extracto ya está cargado. Para cargarlo de nuevo, borra el que está.');

    const { data: st, error } = await supabase.from('bank_statements').insert({
      bank: parsed.bank,
      account_number: parsed.accountNumber,
      period_month: parsed.periodMonth,
      opening_balance: parsed.openingBalance,
      closing_balance: parsed.closingBalance,
      file_name: file.name.slice(0, 200),
      created_by: userId,
    }).select('id').single();
    if (error) throw error;
    const { error: linesErr } = await supabase.from('bank_lines').insert(parsed.lines.map((l) => ({
      statement_id: st.id,
      position: l.position,
      line_date: l.date,
      amount: l.amount,
      doc: l.doc,
      description: l.description,
      office: l.office || null,
    })));
    if (linesErr) {
      await supabase.from('bank_statements').delete().eq('id', st.id);
      throw linesErr;
    }
    refresh();
    return { id: st.id as string, lines: parsed.lines.length };
  });
}

/** Removes the statement and its matches. Flujo de Caja rows stay: they are real money. */
export async function deleteStatement(id: string) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const { data: lines, error } = await supabase.from('bank_lines').select('match_id').eq('statement_id', id);
    if (error) throw error;
    const matchIds = [...new Set(((lines ?? []) as { match_id: string | null }[]).map((l) => l.match_id).filter((m): m is string => !!m))];
    if (matchIds.length) {
      await supabase.from('bank_lines').update({ match_id: null }).in('match_id', matchIds);
      await supabase.from('bank_match_rows').delete().in('match_id', matchIds);
      await supabase.from('bank_matches').delete().in('id', matchIds);
    }
    await supabase.from('bank_lines').delete().eq('statement_id', id);
    const { error: delErr } = await supabase.from('bank_statements').delete().eq('id', id);
    if (delErr) throw delErr;
    refresh();
    return {};
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function pendingLines(supabase: any, lineIds: string[]): Promise<BankLine[]> {
  const ids = [...new Set(lineIds)];
  if (!ids.length) throw new Error('Elige al menos un movimiento del banco.');
  const { data, error } = await supabase.from('bank_lines').select('*').in('id', ids);
  if (error) throw error;
  const lines = ((data ?? []) as BankLine[]).map((l) => ({ ...l, amount: Number(l.amount) }));
  if (lines.length !== ids.length) throw new Error('Un movimiento del banco ya no existe. Recarga la página.');
  if (lines.some((l) => l.match_id)) throw new Error('Un movimiento del banco ya está conciliado. Recarga la página.');
  return lines;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function saveMatch(supabase: any, userId: string | null, kind: BankMatch['kind'], lineIds: string[], rows: { kind: 'income' | 'expense'; id: string; owned: boolean }[], note: string | null) {
  const { data: match, error } = await supabase.from('bank_matches').insert({ kind, note, created_by: userId }).select('id').single();
  if (error) throw error;
  const undo = async () => {
    await supabase.from('bank_lines').update({ match_id: null }).eq('match_id', match.id);
    await supabase.from('bank_match_rows').delete().eq('match_id', match.id);
    await supabase.from('bank_matches').delete().eq('id', match.id);
  };
  if (rows.length) {
    const { error: rowsErr } = await supabase.from('bank_match_rows').insert(rows.map((r) => ({
      match_id: match.id,
      income_id: r.kind === 'income' ? r.id : null,
      expense_id: r.kind === 'expense' ? r.id : null,
      owned: r.owned,
    })));
    if (rowsErr) {
      await undo();
      throw /duplicate|unique/i.test(errorText(rowsErr)) ? new Error('Un registro de Flujo de Caja ya está conciliado con otro movimiento. Recarga la página.') : rowsErr;
    }
  }
  const { error: linesErr } = await supabase.from('bank_lines').update({ match_id: match.id }).in('id', lineIds).is('match_id', null);
  if (linesErr) {
    await undo();
    throw linesErr;
  }
  return match.id as string;
}

export type ReconcileInput = {
  lineIds: string[];
  incomeIds?: string[];
  expenseIds?: string[];
  /** Registers the difference in Flujo de Caja (an income if the bank has more, an expense if less) and includes it. */
  create?: { concept: string; category: string } | null;
};

/** Bank lines explained by Flujo de Caja rows: their money must add up the same. */
export async function reconcile(input: ReconcileInput) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const lines = await pendingLines(supabase, input.lineIds);
    const incomeIds = [...new Set(input.incomeIds ?? [])];
    const expenseIds = [...new Set(input.expenseIds ?? [])];
    const [inc, exp, taken] = await Promise.all([
      incomeIds.length ? supabase.from('cashflow_incomes').select('id, amount, gross_amount, concept, category').in('id', incomeIds) : Promise.resolve({ data: [], error: null }),
      expenseIds.length ? supabase.from('cashflow_expenses').select('id, amount, concept, category').in('id', expenseIds) : Promise.resolve({ data: [], error: null }),
      supabase.from('bank_match_rows').select('income_id, expense_id'),
    ]);
    if (inc.error) throw inc.error;
    if (exp.error) throw exp.error;
    if ((inc.data ?? []).length !== incomeIds.length || (exp.data ?? []).length !== expenseIds.length) throw new Error('Un registro de Flujo de Caja ya no existe. Recarga la página.');
    const used = new Set(((taken.data ?? []) as { income_id: string | null; expense_id: string | null }[]).flatMap((r) => [r.income_id, r.expense_id]).filter(Boolean));
    if ([...incomeIds, ...expenseIds].some((id) => used.has(id))) throw new Error('Un registro de Flujo de Caja ya está conciliado con otro movimiento. Recarga la página.');

    const rows: Pick<CashRow, 'kind' | 'amount'>[] = [
      ...((inc.data ?? []) as { amount: number; gross_amount?: number }[]).map((r) => ({ kind: 'income' as const, amount: Number(r.gross_amount) || Number(r.amount) })),
      ...((exp.data ?? []) as { amount: number }[]).map((r) => ({ kind: 'expense' as const, amount: Number(r.amount) })),
    ];
    const diff = difference(lines, rows);
    const links = [
      ...incomeIds.map((id) => ({ kind: 'income' as const, id, owned: false })),
      ...expenseIds.map((id) => ({ kind: 'expense' as const, id, owned: false })),
    ];

    let created: { kind: 'income' | 'expense'; id: string } | null = null;
    if (input.create) {
      if (balanced(diff)) throw new Error('No hay diferencia que registrar.');
      const concept = input.create.concept.trim();
      const category = input.create.category.trim();
      if (!concept) throw new Error('Escribe el concepto.');
      const date = lines.map((l) => l.line_date).sort().pop() as string;
      const amount = Math.round(Math.abs(diff) * 100) / 100;
      if (diff > 0) {
        if (!(INCOME_CATEGORIES as readonly string[]).includes(category)) throw new Error('Elige una categoría de ingreso.');
        const res = await createIncomeDirect(date, { concept: concept.slice(0, 200), category, amount, gross_amount: amount, fee_amount: 0, shipping_cost: 0, tax_amount: 0 });
        if ('error' in res && res.error) throw new Error(res.error);
        created = { kind: 'income', id: (res as { data: { id: string } }).data.id };
      } else {
        const cat = (await loadExpenseCategories(supabase)).find((c) => c.name === category && c.active);
        if (!cat) throw new Error('Elige una categoría de gasto.');
        if (cat.type === 'CAPEX') throw new Error('Un activo fijo se registra en Compras o en Flujo de Caja; después lo concilias aquí.');
        const res = await createExpenseDirect(date, { concept: concept.slice(0, 200), category, amount, tax_amount: 0, expense_type: cat.type, depreciation_months: null });
        if ('error' in res && res.error) throw new Error(res.error);
        created = { kind: 'expense', id: (res as { data: { id: string } }).data.id };
      }
      links.push({ ...created, owned: true });
    } else {
      if (!links.length) throw new Error('Elige los registros de Flujo de Caja que explican el movimiento.');
      if (!balanced(diff)) throw new Error(`No cuadra: la diferencia es de ${Math.round(diff).toLocaleString('es-CO')}. Elige más registros o registra la diferencia.`);
    }

    try {
      await saveMatch(supabase, userId, 'flujo', lines.map((l) => l.id), links, null);
    } catch (err) {
      if (created) await (created.kind === 'income' ? deleteIncomeDirect(created.id) : deleteExpenseDirect(created.id));
      throw err;
    }
    refresh();
    return { createdId: created?.id ?? null };
  });
}

/** A rejected transfer and the money that came back: they add up zero. */
export async function markReversal(lineIds: string[]) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const lines = await pendingLines(supabase, lineIds);
    if (lines.length < 2 || !lines.some((l) => l.amount > 0) || !lines.some((l) => l.amount < 0)) throw new Error('Un reverso es una salida y la devolución de esa misma plata.');
    if (!balanced(difference(lines, []))) throw new Error('La salida y la devolución no suman cero.');
    await saveMatch(supabase, userId, 'reverso', lines.map((l) => l.id), [], null);
    refresh();
    return {};
  });
}

/** Lines that don't go in Flujo de Caja (e.g. a transfer between the company's own accounts), with the reason. */
export async function ignoreLines(lineIds: string[], note: string) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const reason = note.trim();
    if (!reason) throw new Error('Escribe por qué no va en Flujo de Caja.');
    const lines = await pendingLines(supabase, lineIds);
    await saveMatch(supabase, userId, 'ignorado', lines.map((l) => l.id), [], reason.slice(0, 300));
    refresh();
    return {};
  });
}

/** Undoes a match: its lines go back to pending, and the Flujo de Caja rows created here are deleted. */
export async function undoMatch(matchId: string) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const { data: rows, error } = await supabase.from('bank_match_rows').select('income_id, expense_id, owned').eq('match_id', matchId);
    if (error) throw error;
    await supabase.from('bank_lines').update({ match_id: null }).eq('match_id', matchId);
    await supabase.from('bank_match_rows').delete().eq('match_id', matchId);
    const { error: delErr } = await supabase.from('bank_matches').delete().eq('id', matchId);
    if (delErr) throw delErr;
    for (const r of ((rows ?? []) as MatchRowRec[]).filter((r) => r.owned)) {
      const res = r.income_id ? await deleteIncomeDirect(r.income_id) : await deleteExpenseDirect(r.expense_id as string);
      if ('error' in res && res.error) throw new Error(`Se deshizo la conciliación, pero no se pudo borrar el registro creado: ${res.error}`);
    }
    refresh();
    return {};
  });
}

/** Accepts several suggestions at once; each one that fails is reported, the rest stay. */
export async function acceptSuggestions(list: { kind: 'flujo' | 'reverso'; lineIds: string[]; incomeIds: string[]; expenseIds: string[] }[]) {
  await requireAdmin();
  let done = 0;
  const failed: string[] = [];
  for (const s of list) {
    const res = s.kind === 'reverso' ? await markReversal(s.lineIds) : await reconcile({ lineIds: s.lineIds, incomeIds: s.incomeIds, expenseIds: s.expenseIds });
    if (res.success) done += 1;
    else failed.push(res.error);
  }
  return { success: true as const, done, failed };
}

/** Undoes several matches; each one that fails is reported, the rest go back to pending. */
export async function undoMatches(matchIds: string[]) {
  await requireAdmin();
  let done = 0;
  const failed: string[] = [];
  for (const id of [...new Set(matchIds)]) {
    const res = await undoMatch(id);
    if (res.success) done += 1;
    else failed.push(res.error);
  }
  if (!done && failed.length) return { success: false as const, error: failed.join(' · ') };
  return { success: true as const, done, failed };
}

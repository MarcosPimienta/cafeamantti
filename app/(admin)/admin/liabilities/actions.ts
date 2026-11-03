'use server';

// Pasivos: loans from third parties and partners, and what is owed to
// suppliers. A payment of a loan is also its Flujo de Caja row (interest:
// expense; capital or the final payment: balance movement, not an expense),
// unless it was already registered there. Mutations return
// { success, error }: production hides thrown messages.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { checkIsAdmin } from '../../actions';
import { createExpenseDirect, deleteExpenseDirect } from '../cashflow/actions';
import { errorText, todayBogota } from '@/utils/siigo/server';
import { loanProblems, type Loan, type LoanMove, type LoanMoveKind } from '@/utils/loans/ledger';

const MIGRATION_HINT = 'Falta aplicar la migración 20261106000000_loans.sql';
const INTEREST_CATEGORY = 'Intereses Financieros (Préstamos de terceros)';
const CAPITAL_CATEGORY = 'Abono a capital de préstamos';

async function requireAdmin() {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

function message(err: unknown) {
  const m = errorText(err);
  if (/loans|loan_movements/.test(m) && /exist|relation|schema/i.test(m)) return MIGRATION_HINT;
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
  revalidatePath('/admin/liabilities');
  revalidatePath('/admin/cashflow');
}

export type LoanMovement = LoanMove & { id: string; notes: string | null; expense_id: string | null; expense_owned: boolean };

/** Loans and their movements (null before the migration), and what is owed to suppliers. */
export async function getLiabilities() {
  const { supabase } = await requireAdmin();
  const [loansRes, movesRes, { data: bills }] = await Promise.all([
    supabase.from('loans').select('*').order('created_at', { ascending: true }),
    supabase.from('loan_movements').select('*').order('move_date', { ascending: true }),
    supabase.from('purchase_bills').select('total, status, payments:payable_payments ( amount )').neq('status', 'anulada'),
  ]);
  const payables = ((bills ?? []) as { total: number; payments: { amount: number }[] | null }[]).reduce(
    (s, b) => s + Math.max(0, Number(b.total) - (b.payments ?? []).reduce((t, p) => t + Number(p.amount), 0)),
    0
  );
  const migrationApplied = !loansRes.error;
  return {
    migrationApplied,
    loans: migrationApplied ? ((loansRes.data ?? []) as Loan[]) : [],
    movements: migrationApplied && !movesRes.error ? ((movesRes.data ?? []) as LoanMovement[]) : [],
    payables: Math.round(payables * 100) / 100,
    today: todayBogota(),
  };
}

export type LoanInput = Omit<Loan, 'id' | 'active'>;

const loanRow = (l: LoanInput) => ({
  creditor_name: l.creditor_name.trim(),
  creditor_kind: l.creditor_kind,
  scheme: l.scheme,
  principal: Number(l.principal),
  start_date: l.start_date,
  monthly_rate: l.scheme === 'sin_interes' ? 0 : Number(l.monthly_rate),
  capitalize_every_months: l.scheme === 'capitaliza' ? Number(l.capitalize_every_months) : null,
  payment_day: l.scheme === 'interes_mensual' ? Number(l.payment_day) || null : null,
  maturity_date: l.maturity_date || null,
  tracked_from: l.tracked_from || null,
  notes: l.notes?.trim() || null,
});

export async function saveLoan(id: string | null, input: LoanInput) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const problems = loanProblems(input);
    if (problems.length) throw new Error(problems.join(' · '));
    const row = loanRow(input);
    const { data, error } = id
      ? await supabase.from('loans').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id).select('id').single()
      : await supabase.from('loans').insert({ ...row, created_by: userId }).select('id').single();
    if (error) throw error;
    refresh();
    return { id: data.id as string };
  });
}

/** Hides a loan (paid off or loaded by mistake); its movements stay. */
export async function setLoanActive(id: string, active: boolean) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const { error } = await supabase.from('loans').update({ active, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) throw error;
    refresh();
    return {};
  });
}

export type MovementInput = {
  date: string;
  kind: LoanMoveKind;
  amount: number;
  notes?: string | null;
  /** The money already has its Flujo de Caja row (registered by hand): don't create another. */
  alreadyInCashflow?: boolean;
};

/**
 * A loan movement. Payments leave the bank: interest is an expense of the
 * month; capital and the final payment of a capitalizing loan are balance
 * movements (its interest was already a cost, month by month). A
 * disbursement only raises the debt here.
 */
export async function registerLoanMovement(loanId: string, input: MovementInput) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const { data: loan, error } = await supabase.from('loans').select('*').eq('id', loanId).single();
    if (error || !loan) throw error ?? new Error('Préstamo no encontrado.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Fecha inválida.');
    if (input.date > todayBogota()) throw new Error('La fecha no puede ser futura.');
    if (!(Number(input.amount) > 0)) throw new Error('El valor debe ser mayor a cero.');
    if (input.kind === 'pago_interes' && (loan as Loan).scheme !== 'interes_mensual') throw new Error('Este préstamo no paga intereses cada mes.');

    let expenseId: string | null = null;
    if (input.kind !== 'desembolso' && !input.alreadyInCashflow) {
      const interest = input.kind === 'pago_interes';
      const concept = `${interest ? 'Intereses' : input.kind === 'pago_final' ? 'Pago del préstamo' : 'Abono a capital'} · ${(loan as Loan).creditor_name}`;
      const res = await createExpenseDirect(input.date, {
        concept: (input.notes?.trim() ? `${concept} · ${input.notes.trim()}` : concept).slice(0, 200),
        category: interest ? INTEREST_CATEGORY : CAPITAL_CATEGORY,
        amount: Number(input.amount),
        tax_amount: 0,
        expense_type: interest ? 'OPEX' : 'BALANCE',
        depreciation_months: null,
      });
      if ('error' in res && res.error) throw new Error(res.error);
      expenseId = (res as { data?: { id: string } }).data?.id ?? null;
    }
    const { error: insErr } = await supabase.from('loan_movements').insert({
      loan_id: loanId,
      move_date: input.date,
      kind: input.kind,
      amount: Number(input.amount),
      notes: input.notes?.trim() || null,
      expense_id: expenseId,
      expense_owned: !!expenseId,
      created_by: userId,
    });
    if (insErr) {
      if (expenseId) await deleteExpenseDirect(expenseId);
      throw insErr;
    }
    refresh();
    return {};
  });
}

/** Removes a movement, and the Flujo de Caja row it created (not one it only pointed to). */
export async function deleteLoanMovement(id: string) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const { data: move, error } = await supabase.from('loan_movements').select('expense_id, expense_owned').eq('id', id).single();
    if (error || !move) throw error ?? new Error('Movimiento no encontrado.');
    if (move.expense_id && move.expense_owned) {
      const res = await deleteExpenseDirect(move.expense_id);
      if ('error' in res && res.error) throw new Error(res.error);
    }
    const { error: delErr } = await supabase.from('loan_movements').delete().eq('id', id);
    if (delErr) throw delErr;
    refresh();
    return {};
  });
}

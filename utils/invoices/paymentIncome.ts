// The income in Flujo de Caja that holds an invoice payment. Server-only
// helpers (they take the caller's Supabase client); the money of an invoice
// enters Flujo de Caja through them, on the day and for the value paid.

import { createIncomeDirect, deleteIncomeDirect } from "@/app/(admin)/admin/cashflow/actions";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

export const MIGRATION_HINT_PAYMENTS = "Falta aplicar la migración 20261112000000_payments_enter_cashflow.sql";

/** Concept of the income a payment creates: "Pago FV-2-770 · Marcos Pimienta". */
export function paymentConcept(invoice: { siigo_name: string | null; customer_name: string }): string {
  return `Pago ${invoice.siigo_name ?? "factura por enviar"} · ${invoice.customer_name}`;
}

/**
 * Gives a payment its income, unless its money is already in Flujo de Caja:
 * a cobro's income (several invoices in one deposit), a manual income the
 * order is linked to, or a web order that counts by itself.
 * Returns the income id it created, or null.
 */
export async function ensurePaymentIncome(supabase: DB, paymentId: string): Promise<string | null> {
  const { data: p, error } = await supabase
    .from("invoice_payments")
    .select("id, payment_date, amount, cashflow_income_id, invoice:invoice_id ( id, order_id, siigo_name, customer_name )")
    .eq("id", paymentId)
    .single();
  if (error) {
    if (/cashflow_income_id/.test(error.message)) throw new Error(MIGRATION_HINT_PAYMENTS);
    throw new Error(error.message);
  }
  if (p.cashflow_income_id) return null;
  const inv = Array.isArray(p.invoice) ? p.invoice[0] : p.invoice;
  if (!inv) return null;
  const { data: order } = await supabase.from("orders").select("source, cashflow_income_id").eq("id", inv.order_id).maybeSingle();
  if (order?.cashflow_income_id || order?.source === "web") return null;

  const res = await createIncomeDirect(p.payment_date, { concept: paymentConcept(inv), category: "Ventas Físicas", amount: Number(p.amount), gross_amount: Number(p.amount) });
  if ("error" in res && res.error) throw new Error(res.error);
  const incomeId = (res as { data?: { id: string } }).data?.id ?? null;
  if (!incomeId) return null;
  const { error: upErr } = await supabase.from("invoice_payments").update({ cashflow_income_id: incomeId, income_owned: true }).eq("id", paymentId);
  if (upErr) {
    await deleteIncomeDirect(incomeId);
    throw new Error(upErr.message);
  }
  return incomeId;
}

/** Why a payment's own income can't go away with it: it is reconciled with the bank. */
export async function paymentIncomeLock(supabase: DB, incomeId: string | null): Promise<string | null> {
  if (!incomeId) return null;
  const { data, error } = await supabase.from("bank_match_rows").select("id").eq("income_id", incomeId).limit(1);
  if (error) return null; // before the bank reconciliation migration
  return data && data.length ? "Este pago ya está conciliado con el banco: deshaz la conciliación en Conciliación bancaria antes de borrarlo." : null;
}

/** Removes the income a payment created (after the payment itself is gone). */
export async function dropPaymentIncome(incomeId: string | null, owned: boolean): Promise<void> {
  if (!incomeId || !owned) return;
  const res = await deleteIncomeDirect(incomeId);
  if ("error" in res && res.error) throw new Error(res.error);
}

'use server';

// Sales invoices: created in the app from an order (draft), sent to Siigo
// in batches (Siigo issues them to the DIAN and emails the customer), paid
// later by the customer (payments become Siigo cash receipts in the next
// batch). Admin-only; mutations return { success, error } because
// production builds hide thrown messages.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { checkIsAdmin, updateOrderStatus } from '../../actions';
import { getSiigoClient, idempotencyKey, siigoConfigFromEnv } from '@/utils/siigo/api';
import { buildInvoicePayload, buildVoucherPayload, cleanIdentification, addDays, type AppClient } from '@/utils/siigo/mapping';
import { ensureSiigoCustomer, errorText, loadSiigoSettings, siigoLog, todayBogota, type Supabase } from '@/utils/siigo/server';
import { syncOrderStock } from '@/utils/orders/stock';
import { balanceDue, invoiceLinesFromOrder, paymentProblems, paymentState, type InvoiceLine, type PaymentMethod } from '@/utils/invoices/ledger';

const MIGRATION_HINT = 'Falta aplicar la migración 20261019000000_sales_invoices.sql';

type Result<T extends object = object> = ({ success: true } & T) | { success: false; error: string; problems?: string[] };

async function requireAdmin() {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

function message(err: unknown) {
  const m = errorText(err);
  return /sales_invoices|invoice_payments/.test(m) && /exist|relation|schema|column/i.test(m) ? MIGRATION_HINT : m;
}

async function guard<T extends object>(run: () => Promise<T>): Promise<Result<T>> {
  try {
    return { success: true, ...(await run()) };
  } catch (err) {
    return { success: false, error: message(err) };
  }
}

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

function refresh() {
  revalidatePath('/admin/invoices');
  revalidatePath('/admin/orders');
}

// ── Reading ─────────────────────────────────────────────────

export async function getInvoices() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('sales_invoices')
    .select('*, payments:invoice_payments ( * ), order:order_id ( id, status, created_at )')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getInvoices:', error.message);
    return { invoices: [], migrationApplied: !/sales_invoices/.test(error.message), today: todayBogota() };
  }
  return { invoices: data ?? [], migrationApplied: true, today: todayBogota() };
}

/** The live invoice of an order, with its payments (null if none). */
export async function getOrderInvoice(orderId: string) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('sales_invoices')
    .select('*, payments:invoice_payments ( * )')
    .eq('order_id', orderId)
    .neq('status', 'anulada')
    .maybeSingle();
  if (error) return { invoice: null, migrationApplied: !/sales_invoices/.test(error.message) };
  return { invoice: data, migrationApplied: true };
}

// ── Creating and annulling ──────────────────────────────────

export type NewInvoiceInput = {
  terms: 'credito' | 'contado';
  /** Credit: days until due (default from Ajustes → Siigo). */
  termDays?: number | null;
  /** Cash sale: how it was paid. */
  method?: PaymentMethod | null;
  notes?: string | null;
};

/** What Siigo would reject, so the admin can fix it before the batch. */
async function invoiceProblems(supabase: Supabase, invoice: { id: string; total: number; shipping: number; notes: string | null; payment_terms: string; payment_method: string | null; term_days: number; customer_identification: string | null; lines: InvoiceLine[] }) {
  const settings = await loadSiigoSettings(supabase);
  const { problems } = buildInvoicePayload(
    {
      id: invoice.id,
      total_amount: Number(invoice.total),
      shipping_cost: Number(invoice.shipping),
      notes: invoice.notes,
      payment_method: invoice.payment_terms === 'credito' ? 'credit' : ((invoice.payment_method ?? 'transfer') as 'web' | 'cash' | 'transfer'),
      term_days: invoice.term_days,
    },
    invoice.lines.map((l) => ({ product_code: l.code, name: l.name, quantity: l.quantity, unit_price: l.unit_price, linked: l.linked, tax_id: l.tax_id })),
    invoice.customer_identification ?? settings.final_consumer_identification ?? null,
    settings,
    todayBogota()
  );
  return problems;
}

export async function createInvoice(orderId: string, input: NewInvoiceInput) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    if (input.terms !== 'credito' && input.terms !== 'contado') throw new Error('Condición de pago inválida.');
    if (input.terms === 'contado' && !['web', 'transfer', 'cash'].includes(input.method ?? '')) throw new Error('Indica cómo pagó el cliente.');
    const settings = await loadSiigoSettings(supabase);
    const termDays = input.terms === 'credito' ? Math.round(Number(input.termDays ?? settings.credit_term_days ?? 30)) : 0;
    if (!(Number.isInteger(termDays) && termDays >= 0 && termDays <= 365)) throw new Error('El plazo debe ser de 0 a 365 días.');

    const [{ data: order, error }, { data: items, error: itemsError }, { data: existing }] = await Promise.all([
      supabase.from('orders').select('id, status, total_amount, shipping_info, siigo_invoice_id, siigo_invoice, client:client_id ( id, name, document_number, siigo_customer_id )').eq('id', orderId).single(),
      supabase.from('order_items').select('product_id, quantity, price_at_time, inventory:inventory_id ( * )').eq('order_id', orderId),
      supabase.from('sales_invoices').select('id').eq('order_id', orderId).neq('status', 'anulada').limit(1),
    ]);
    if (error || !order) throw error ?? new Error('Pedido no encontrado.');
    if (itemsError) throw itemsError;
    if (existing?.length) throw new Error('Este pedido ya tiene factura.');
    if (order.status === 'cancelled') throw new Error('No se puede facturar un pedido cancelado.');
    if (order.siigo_invoice_id) throw new Error(`El pedido ya tiene la factura ${order.siigo_invoice ?? order.siigo_invoice_id} en Siigo.`);
    const lines = invoiceLinesFromOrder((items ?? []) as never);
    if (!lines.length) throw new Error('El pedido no tiene productos.');

    const client = one(order.client as unknown as { id: string; name: string; document_number: string | null } | null);
    const identification = cleanIdentification(client?.document_number).identification || null;
    const row = {
      order_id: orderId,
      client_id: client?.id ?? null,
      customer_name: client?.name ?? 'Consumidor final',
      customer_identification: identification,
      payment_terms: input.terms,
      term_days: termDays,
      payment_method: input.terms === 'contado' ? input.method : null,
      lines,
      shipping: Number((order.shipping_info as { shipping_cost?: number } | null)?.shipping_cost ?? 0),
      total: Number(order.total_amount),
      notes: input.notes?.trim() || null,
      status: 'borrador',
      created_by: userId,
    };
    const { data: created, error: insErr } = await supabase.from('sales_invoices').insert(row).select('*').single();
    if (insErr) throw insErr;
    // Cash sale: paid now. Credit: the coffee leaves now, paid later.
    try {
      if (input.terms === 'contado' && order.status === 'pending') await updateOrderStatus(orderId, 'paid');
      else await syncOrderStock(supabase, { orderId, status: order.status, userId });
    } catch (err) {
      // Not enough stock (or similar): no invoice without its stock movement.
      await supabase.from('sales_invoices').delete().eq('id', created.id);
      throw err;
    }
    const problems = await invoiceProblems(supabase, { ...created, lines });
    refresh();
    return { invoice: created, problems };
  });
}

/** A draft (or failed) invoice is discarded; its stock returns unless the order is paid. */
export async function annulInvoice(invoiceId: string) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const { data: inv, error } = await supabase.from('sales_invoices').select('id, order_id, status, siigo_invoice_id').eq('id', invoiceId).single();
    if (error || !inv) throw error ?? new Error('Factura no encontrada.');
    if (inv.siigo_invoice_id || inv.status === 'emitida') throw new Error('La factura ya está en Siigo: anúlala con una nota crédito en Siigo.');
    if (inv.status === 'anulada') return {};
    const { count } = await supabase.from('invoice_payments').select('id', { count: 'exact', head: true }).eq('invoice_id', invoiceId);
    if (count) throw new Error('La factura tiene pagos registrados: elimínalos primero.');
    const { error: upErr } = await supabase.from('sales_invoices').update({ status: 'anulada', updated_at: new Date().toISOString() }).eq('id', invoiceId);
    if (upErr) throw upErr;
    const { data: order } = await supabase.from('orders').select('status').eq('id', inv.order_id).single();
    if (order) await syncOrderStock(supabase, { orderId: inv.order_id, status: order.status, userId });
    refresh();
    return {};
  });
}

/** Problems that would stop an invoice in the next batch (for the screen). */
export async function checkInvoice(invoiceId: string) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const { data: inv, error } = await supabase.from('sales_invoices').select('*').eq('id', invoiceId).single();
    if (error || !inv) throw error ?? new Error('Factura no encontrada.');
    return { problems: await invoiceProblems(supabase, inv) };
  });
}

// ── Payments ────────────────────────────────────────────────

export type PaymentInput = { date: string; amount: number; method: PaymentMethod; notes?: string | null };

export async function registerPayment(invoiceId: string, input: PaymentInput) {
  const { supabase, userId } = await requireAdmin();
  const res = await guard(async () => {
    if (!['web', 'transfer', 'cash'].includes(input.method)) throw new Error('Medio de pago inválido.');
    const { data: inv, error } = await supabase.from('sales_invoices').select('*, payments:invoice_payments ( amount )').eq('id', invoiceId).single();
    if (error || !inv) throw error ?? new Error('Factura no encontrada.');
    const payments = (inv.payments ?? []) as { amount: number }[];
    const problems = paymentProblems(inv, payments, Number(input.amount), input.date);
    if (problems.length) return { problems, fullyPaid: false };
    const { error: insErr } = await supabase.from('invoice_payments').insert({
      invoice_id: invoiceId,
      payment_date: input.date,
      amount: Number(input.amount),
      method: input.method,
      notes: input.notes?.trim() || null,
      created_by: userId,
    });
    if (insErr) throw insErr;
    const all = [...payments, { amount: Number(input.amount) }];
    const fullyPaid = paymentState(inv, all) === 'pagada';
    // Fully paid: the order becomes paid (Cash flow counts it from there).
    if (fullyPaid) {
      const { data: order } = await supabase.from('orders').select('status').eq('id', inv.order_id).single();
      if (order?.status === 'pending') await updateOrderStatus(inv.order_id, 'paid');
    }
    refresh();
    return { problems: [] as string[], fullyPaid, balance: balanceDue(inv, all) };
  });
  if (res.success && res.problems.length) return { success: false as const, error: res.problems.join(' · '), problems: res.problems };
  return res;
}

/** Removes a payment that has not reached Siigo yet. */
export async function deletePayment(paymentId: string) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const { data: p, error } = await supabase.from('invoice_payments').select('id, siigo_status').eq('id', paymentId).single();
    if (error || !p) throw error ?? new Error('Pago no encontrado.');
    if (p.siigo_status === 'enviado') throw new Error('El pago ya está en Siigo como recibo de caja: anúlalo allá.');
    const { error: delErr } = await supabase.from('invoice_payments').delete().eq('id', paymentId);
    if (delErr) throw delErr;
    refresh();
    return {};
  });
}

// ── Batch to Siigo ──────────────────────────────────────────

type SendReport = { invoicesSent: string[]; invoicesFailed: { id: string; customer: string; error: string }[]; vouchersSent: string[]; vouchersFailed: { id: string; error: string }[] };

/**
 * Sends to Siigo every invoice still pending (draft or failed) and every
 * payment of an issued invoice not sent yet, one by one: a failure is
 * recorded on that document and the rest continue. `invoiceIds` limits the
 * invoices sent; payments always go if their invoice is issued.
 */
export async function sendPendingToSiigo(invoiceIds?: string[]) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    if (!siigoConfigFromEnv()) throw new Error('Siigo no está configurado en el servidor.');
    const settings = await loadSiigoSettings(supabase);
    const siigo = getSiigoClient();
    const report: SendReport = { invoicesSent: [], invoicesFailed: [], vouchersSent: [], vouchersFailed: [] };
    const today = todayBogota();

    let query = supabase.from('sales_invoices').select('*, client:client_id ( id, name, document_type, document_number, email, phone, address, city_code, siigo_customer_id )').in('status', ['borrador', 'error']);
    if (invoiceIds?.length) query = query.in('id', invoiceIds);
    const { data: pending, error } = await query.order('created_at', { ascending: true });
    if (error) throw error;

    for (const inv of pending ?? []) {
      try {
        const client = one(inv.client as AppClient | AppClient[] | null);
        const identification = client && cleanIdentification(client.document_number).identification
          ? await ensureSiigoCustomer(supabase, userId, client)
          : settings.final_consumer_identification ?? null;
        const credit = inv.payment_terms === 'credito';
        const { payload, problems } = buildInvoicePayload(
          { id: inv.id, total_amount: Number(inv.total), shipping_cost: Number(inv.shipping), notes: inv.notes, payment_method: credit ? 'credit' : inv.payment_method ?? 'transfer', term_days: inv.term_days },
          (inv.lines as InvoiceLine[]).map((l) => ({ product_code: l.code, name: l.name, quantity: l.quantity, unit_price: l.unit_price, linked: l.linked, tax_id: l.tax_id })),
          identification,
          settings,
          today
        );
        if (problems.length) throw new Error(problems.join(' · '));
        const out = await siigo.request<{ id: string; name?: string; public_url?: string; stamp?: { status?: string; cufe?: string; errors?: string } }>('POST', '/v1/invoices', {
          body: payload,
          // Same key for the same invoice: a retry never creates a second one.
          idempotencyKey: idempotencyKey('INV', inv.id),
        });
        const dueDate = credit ? addDays(today, inv.term_days) : today;
        const siigoFields = {
          siigo_invoice_id: out.id,
          siigo_status: out.stamp?.status ?? (settings.stamp_dian ? 'Pending' : 'Draft'),
          siigo_cufe: out.stamp?.cufe ?? null,
          siigo_public_url: out.public_url ?? null,
          siigo_error: out.stamp?.errors || null,
        };
        await supabase.from('sales_invoices').update({ ...siigoFields, siigo_name: out.name ?? null, status: 'emitida', issue_date: today, due_date: dueDate, customer_identification: identification, updated_at: new Date().toISOString() }).eq('id', inv.id);
        // The order shows its invoice as before.
        await supabase.from('orders').update({ ...siigoFields, siigo_invoice: out.name ?? null }).eq('id', inv.order_id);
        await siigoLog(supabase, userId, { entity: 'invoice', local_id: inv.order_id, siigo_id: out.id, siigo_name: out.name ?? null, status: 'ok', message: out.stamp?.status ?? null });
        report.invoicesSent.push(out.name ?? out.id);
      } catch (err) {
        const msg = message(err);
        await supabase.from('sales_invoices').update({ status: 'error', siigo_error: msg, updated_at: new Date().toISOString() }).eq('id', inv.id);
        await siigoLog(supabase, userId, { entity: 'invoice', local_id: inv.order_id, status: 'error', message: msg });
        report.invoicesFailed.push({ id: inv.id, customer: inv.customer_name, error: msg });
      }
    }

    // Payments of issued invoices → cash receipts.
    const { data: payments, error: payErr } = await supabase
      .from('invoice_payments')
      .select('*, invoice:invoice_id ( id, status, siigo_name, due_date, customer_identification )')
      .in('siigo_status', ['pendiente', 'error'])
      .order('payment_date', { ascending: true });
    if (payErr) throw payErr;
    for (const p of payments ?? []) {
      const inv = one(p.invoice as { status: string; siigo_name: string | null; due_date: string | null; customer_identification: string | null } | null);
      if (!inv || inv.status !== 'emitida') continue; // goes once its invoice is in Siigo
      try {
        const { payload, problems } = buildVoucherPayload(p, inv, settings);
        if (problems.length) throw new Error(problems.join(' · '));
        const out = await siigo.request<{ id: string; name?: string }>('POST', '/v1/vouchers', { body: payload, idempotencyKey: idempotencyKey('RC', p.id) });
        await supabase.from('invoice_payments').update({ siigo_status: 'enviado', siigo_voucher_id: out.id, siigo_voucher_name: out.name ?? null, siigo_error: null }).eq('id', p.id);
        await siigoLog(supabase, userId, { entity: 'voucher', local_id: p.id, siigo_id: out.id, siigo_name: out.name ?? null, status: 'ok' });
        report.vouchersSent.push(out.name ?? out.id);
      } catch (err) {
        const msg = message(err);
        await supabase.from('invoice_payments').update({ siigo_status: 'error', siigo_error: msg }).eq('id', p.id);
        await siigoLog(supabase, userId, { entity: 'voucher', local_id: p.id, status: 'error', message: msg });
        report.vouchersFailed.push({ id: p.id, error: msg });
      }
    }
    refresh();
    return report;
  });
}

/** Re-reads an issued invoice (DIAN status, CUFE, public link). */
export async function refreshInvoice(invoiceId: string) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const { data: inv, error } = await supabase.from('sales_invoices').select('id, order_id, siigo_invoice_id').eq('id', invoiceId).single();
    if (error || !inv) throw error ?? new Error('Factura no encontrada.');
    if (!inv.siigo_invoice_id) throw new Error('La factura aún no está en Siigo.');
    const out = await getSiigoClient().request<{ name?: string; public_url?: string; stamp?: { status?: string; cufe?: string; errors?: string } }>('GET', `/v1/invoices/${inv.siigo_invoice_id}`);
    const fields = { siigo_status: out.stamp?.status ?? null, siigo_cufe: out.stamp?.cufe ?? null, siigo_public_url: out.public_url ?? null, siigo_error: out.stamp?.errors || null };
    await supabase.from('sales_invoices').update({ ...fields, siigo_name: out.name ?? null }).eq('id', invoiceId);
    await supabase.from('orders').update({ ...fields, siigo_invoice: out.name ?? null }).eq('id', inv.order_id);
    refresh();
    return { invoice: fields };
  });
}

'use server';

// Sales invoices: created in the app from an order (draft), sent to Siigo
// in batches (Siigo issues them to the DIAN and emails the customer), paid
// later by the customer (payments become Siigo cash receipts in the next
// batch). Admin-only; mutations return { success, error } because
// production builds hide thrown messages.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { checkIsAdmin, setOrderPayment, updateOrderStatus as setOrderStatus } from '../../actions';
import { SiigoError, getSiigoClient, idempotencyKey, siigoConfigFromEnv } from '@/utils/siigo/api';
import { buildInvoicePayload, buildVoucherPayload, cleanIdentification, addDays, buildCreditNotePayload, itemTaxId, lineGross, type AppClient, type SiigoSettings } from '@/utils/siigo/mapping';
import { ensureSiigoCustomer, errorText, loadSiigoSettings, siigoLog, todayBogota, type Supabase } from '@/utils/siigo/server';
import { restockCreditNote, syncOrderStock } from '@/utils/orders/stock';
import { CREDIT_REASONS, balanceDue, creditNoteLines, invoiceLinesFromOrder, paymentProblems, relinkLines, paymentState, type CreditInput, type CreditNoteLine, type InvoiceLine, type PaymentMethod } from '@/utils/invoices/ledger';

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

/** Changes the order status (stock, timestamps), failing loudly. */
async function updateOrderStatus(orderId: string, status: string) {
  const res = await setOrderStatus(orderId, status);
  if (!res.success) throw new Error('error' in res ? res.error : 'No se pudo actualizar el pedido.');
}

/** Marks the order paid on `date` (its stock and Flujo de Caja follow), failing loudly. */
async function markOrderPaid(orderId: string, date?: string | null) {
  const res = await setOrderPayment(orderId, true, date ? `${date}T12:00:00-05:00` : null);
  if (!res.success) throw new Error('error' in res ? res.error : 'No se pudo marcar el pedido como pagado.');
}

/** The order's lines with their IVA (without it before the order-item-tax migration). */
async function orderItemsForInvoice(supabase: Supabase, orderId: string) {
  const res = await supabase.from('order_items').select('product_id, quantity, price_at_time, tax_id, tax_rate, inventory:inventory_id ( * )').eq('order_id', orderId);
  if (res.error && /tax_id|tax_rate/.test(res.error.message)) {
    return supabase.from('order_items').select('product_id, quantity, price_at_time, inventory:inventory_id ( * )').eq('order_id', orderId);
  }
  return res;
}

/** IVA percentages by Siigo tax id. */
async function taxRates(): Promise<Map<number, number>> {
  const taxes = await getSiigoClient().request<{ id: number; type?: string; percentage?: number }[]>('GET', '/v1/taxes');
  return new Map((taxes ?? []).filter((t) => t.type === 'IVA').map((t) => [t.id, Number(t.percentage ?? 0)]));
}

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

function refresh() {
  revalidatePath('/admin/invoices');
  revalidatePath('/admin/orders');
}

async function updateRow(supabase: Supabase, table: 'sales_invoices' | 'orders', id: string, fields: Record<string, unknown>) {
  const { error } = await supabase.from(table).update(fields).eq('id', id);
  if (error) throw error;
}

const toSiigoItem = (l: InvoiceLine) => ({ product_code: l.code, name: l.name, quantity: l.quantity, unit_price: l.unit_price, linked: l.linked, tax_id: l.tax_id, tax_included: l.tax_included, tax_rate: l.tax_rate });
/** The order's value before any IVA added on top (what the order total is). */
const baseTotal = (lines: InvoiceLine[], shipping: number | string) => Math.round((lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unit_price), 0) + Number(shipping)) * 100) / 100;

type InvoiceRow = { id: string; order_id: string; total: number; shipping: number; notes: string | null; payment_terms: string; payment_method: string | null; term_days: number; lines: unknown };

/** The Siigo invoice body for an app invoice, dated `today`. */
function siigoPayload(inv: InvoiceRow, identification: string | null, settings: SiigoSettings, today: string) {
  const credit = inv.payment_terms === 'credito';
  return buildInvoicePayload(
    // The order's number goes in the observations ("Pedido Café Amantti #…").
    { id: inv.order_id, total_amount: baseTotal(inv.lines as InvoiceLine[], inv.shipping), shipping_cost: Number(inv.shipping), notes: inv.notes, payment_method: credit ? 'credit' : ((inv.payment_method ?? 'transfer') as 'web' | 'cash' | 'transfer'), term_days: inv.term_days },
    (inv.lines as InvoiceLine[]).map(toSiigoItem),
    identification,
    settings,
    today
  );
}

type SiigoInvoiceOut = { id: string; name?: string; prefix?: string; number?: number; public_url?: string; stamp?: { status?: string; cufe?: string; errors?: string } };

/** An unsent invoice with its products' current Siigo links, saved when they changed. */
async function withCurrentLinks<T extends { id: string; lines: unknown }>(supabase: Supabase, inv: T): Promise<T> {
  const lines = inv.lines as InvoiceLine[];
  const ids = lines.map((l) => l.inventory_id).filter((id): id is string => !!id);
  if (!ids.length) return inv;
  const { data, error } = await supabase.from('inventory').select('id, product_code, siigo_code, siigo_product_id').in('id', ids);
  if (error) return inv;
  const next = relinkLines(lines, data ?? []);
  if (next === lines) return inv;
  await supabase.from('sales_invoices').update({ lines: next }).eq('id', inv.id);
  return { ...inv, lines: next };
}

/** Sum of an invoice's credit notes (0 before their migration). */
async function creditedOf(supabase: Supabase, invoiceId: string): Promise<number> {
  const { data, error } = await supabase.from('credit_notes').select('total').eq('invoice_id', invoiceId);
  if (error) return 0;
  return (data ?? []).reduce((sum, n) => sum + Number(n.total), 0);
}

// ── Reading ─────────────────────────────────────────────────

export async function getInvoices() {
  const { supabase } = await requireAdmin();
  const query = (embedNotes: boolean) =>
    supabase
      .from('sales_invoices')
      .select(`*, payments:invoice_payments ( * ), order:order_id ( id, status, created_at )${embedNotes ? ', credit_notes ( * )' : ''}`)
      .order('created_at', { ascending: false });
  let { data, error } = await query(true);
  // Before the credit notes migration: invoices without notes.
  if (error && /credit_notes/.test(error.message)) ({ data, error } = await query(false));
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
  return { invoice: data ? { ...data, credited: await creditedOf(supabase, data.id) } : null, migrationApplied: true };
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
      total_amount: baseTotal(invoice.lines, invoice.shipping),
      shipping_cost: Number(invoice.shipping),
      notes: invoice.notes,
      payment_method: invoice.payment_terms === 'credito' ? 'credit' : ((invoice.payment_method ?? 'transfer') as 'web' | 'cash' | 'transfer'),
      term_days: invoice.term_days,
    },
    invoice.lines.map(toSiigoItem),
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
      supabase.from('orders').select('id, status, total_amount, shipping_info, source, user_id, siigo_invoice_id, siigo_invoice, client:client_id ( id, name, document_number, siigo_customer_id )').eq('id', orderId).single(),
      orderItemsForInvoice(supabase, orderId),
      supabase.from('sales_invoices').select('id').eq('order_id', orderId).neq('status', 'anulada').limit(1),
    ]);
    if (error || !order) throw error ?? new Error('Pedido no encontrado.');
    if (itemsError) throw itemsError;
    if (existing?.length) throw new Error('Este pedido ya tiene factura.');
    if (order.status === 'cancelled') throw new Error('No se puede facturar un pedido cancelado.');
    if (order.siigo_invoice_id) throw new Error(`El pedido ya tiene la factura ${order.siigo_invoice ?? order.siigo_invoice_id} en Siigo.`);
    let lines = invoiceLinesFromOrder((items ?? []) as never);
    if (!lines.length) throw new Error('El pedido no tiene productos.');
    // Web store prices are final (the customer paid them); manual orders follow Ajustes → Siigo.
    const web = order.source === 'web' || !!order.user_id;
    if (!web && settings.manual_prices_include_tax === false) {
      const rates = await taxRates();
      lines = lines.map((l) => {
        const tax = itemTaxId(l.tax_id, settings);
        // The rate chosen on the order line, else Siigo's for that tax.
        return { ...l, tax_included: false, tax_rate: tax ? l.tax_rate ?? rates.get(tax) ?? null : null };
      });
      const unknown = lines.find((l) => itemTaxId(l.tax_id, settings) && l.tax_rate == null);
      if (unknown) throw new Error(`No se encontró en Siigo la tarifa de IVA de "${unknown.name}".`);
    }
    const shippingCost = Number((order.shipping_info as { shipping_cost?: number } | null)?.shipping_cost ?? 0);
    const invoiceTotal = Math.round((lines.reduce((s, l) => s + lineGross(l, !!itemTaxId(l.tax_id, settings)), 0) + shippingCost) * 100) / 100;

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
      shipping: shippingCost,
      total: invoiceTotal,
      notes: input.notes?.trim() || null,
      status: 'borrador',
      created_by: userId,
    };
    const { data: created, error: insErr } = await supabase.from('sales_invoices').insert(row).select('*').single();
    if (insErr) throw insErr;
    // Cash sale: paid now. Credit: the coffee leaves now, paid later.
    try {
      if (input.terms === 'contado') await markOrderPaid(orderId);
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
    const current = inv.status === 'borrador' || inv.status === 'error' ? await withCurrentLinks(supabase, inv) : inv;
    return { problems: await invoiceProblems(supabase, current) };
  });
}

// ── Payments ────────────────────────────────────────────────

export type PaymentInput = { date: string; amount: number; method: PaymentMethod; notes?: string | null };

export async function registerPayment(invoiceId: string, input: PaymentInput) {
  const { supabase, userId } = await requireAdmin();
  const res = await guard(async () => {
    if (!['web', 'transfer', 'cash'].includes(input.method)) throw new Error('Medio de pago inválido.');
    const { data: row, error } = await supabase.from('sales_invoices').select('*, payments:invoice_payments ( amount )').eq('id', invoiceId).single();
    if (error || !row) throw error ?? new Error('Factura no encontrada.');
    const inv = { ...row, credited: await creditedOf(supabase, invoiceId) };
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
    // Fully paid: the order is paid on that date (Flujo de Caja counts it then),
    // whatever its delivery stage.
    if (fullyPaid) await markOrderPaid(inv.order_id, input.date);
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

    for (const pendingInv of pending ?? []) {
      const inv = await withCurrentLinks(supabase, pendingInv);
      try {
        const client = one(inv.client as AppClient | AppClient[] | null);
        const identification = client && cleanIdentification(client.document_number).identification
          ? await ensureSiigoCustomer(supabase, userId, client)
          : settings.final_consumer_identification ?? null;
        const credit = inv.payment_terms === 'credito';
        const { payload, problems } = siigoPayload(inv, identification, settings, today);
        if (problems.length) throw new Error(problems.join(' · '));
        const out = await siigo.request<SiigoInvoiceOut>('POST', '/v1/invoices', {
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
        await updateRow(supabase, 'sales_invoices', inv.id, { ...siigoFields, siigo_name: out.name ?? null, status: 'emitida', issue_date: today, due_date: dueDate, customer_identification: identification, updated_at: new Date().toISOString() });
        // The order shows its invoice as before.
        await updateRow(supabase, 'orders', inv.order_id, { ...siigoFields, siigo_invoice: out.name ?? null }).catch((e) => console.error('order siigo fields:', errorText(e)));
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

/**
 * The invoice no longer counts (annulled in Siigo or by a full credit
 * note): voided here, the order loses its invoice and its stock follows the
 * order's payment state — or the order is cancelled and everything returns.
 */
async function voidInvoiceLocally(supabase: Supabase, userId: string | null, inv: { id: string; order_id: string; siigo_invoice_id: string | null }, note: string, cancelOrder = false) {
  await updateRow(supabase, 'sales_invoices', inv.id, { status: 'anulada', siigo_status: 'Annulled', siigo_error: note, updated_at: new Date().toISOString() });
  await updateRow(supabase, 'orders', inv.order_id, { siigo_invoice_id: null, siigo_invoice: null, siigo_status: null, siigo_cufe: null, siigo_public_url: null, siigo_error: null });
  if (cancelOrder) await updateOrderStatus(inv.order_id, 'cancelled');
  else {
    const { data: order } = await supabase.from('orders').select('status').eq('id', inv.order_id).single();
    if (order) await syncOrderStock(supabase, { orderId: inv.order_id, status: order.status, userId });
  }
  await siigoLog(supabase, userId, { entity: 'invoice', local_id: inv.order_id, siigo_id: inv.siigo_invoice_id, status: 'ok', message: note });
}

type SiigoCreditNote = { id: string; name?: string; reason?: number; total?: number; invoice?: { id?: string }; stamp?: { status?: string; cude?: string }; items?: { code?: string; description?: string; quantity?: number; price?: number }[] };

/**
 * Credit notes made directly in Siigo for this invoice that the app doesn't
 * know: recorded so the balance is right. A full annulment (reason 2) also
 * voids the invoice. Returned units are not restocked (the app can't know
 * their state): the admin adds them in Inventario if they came back.
 */
async function importSiigoCreditNotes(supabase: Supabase, userId: string | null, inv: { id: string; order_id: string; siigo_invoice_id: string; issue_date: string | null; created_at: string }) {
  const since = (inv.issue_date ?? inv.created_at.slice(0, 10));
  let notes: SiigoCreditNote[];
  try {
    notes = (await getSiigoClient().listAll<SiigoCreditNote>('/v1/credit-notes', { created_start: since })).filter((n) => n.invoice?.id === inv.siigo_invoice_id);
  } catch (err) {
    console.error('credit notes from Siigo:', errorText(err));
    return { imported: [] as string[], annulled: false };
  }
  if (!notes.length) return { imported: [] as string[], annulled: false };
  const { data: known, error } = await supabase.from('credit_notes').select('siigo_id').eq('invoice_id', inv.id);
  if (error) return { imported: [] as string[], annulled: false }; // migration missing
  const seen = new Set((known ?? []).map((k) => k.siigo_id));
  const imported: string[] = [];
  let annulled = false;
  for (const n of notes) {
    if (seen.has(n.id)) continue;
    const reason = [1, 2, 3, 4].includes(Number(n.reason)) ? Number(n.reason) : 3;
    const { error: insErr } = await supabase.from('credit_notes').insert({
      invoice_id: inv.id,
      reason,
      lines: (n.items ?? []).map((i) => ({ inventory_id: null, code: i.code ?? null, name: i.description ?? i.code ?? '', quantity: Number(i.quantity ?? 0), unit_price: Number(i.price ?? 0), tax_id: null, linked: true, restock: false })),
      total: Number(n.total ?? 0) || 0.01,
      origin: 'siigo',
      status: 'enviada',
      siigo_id: n.id,
      siigo_name: n.name ?? null,
      siigo_status: n.stamp?.status ?? null,
      siigo_cude: n.stamp?.cude ?? null,
      created_by: userId,
    });
    if (insErr) throw insErr;
    await siigoLog(supabase, userId, { entity: 'credit_note', local_id: inv.id, siigo_id: n.id, siigo_name: n.name ?? null, status: 'ok', message: 'Traída de Siigo' });
    imported.push(n.name ?? n.id);
    if (reason === 2) annulled = true;
  }
  if (annulled) await voidInvoiceLocally(supabase, userId, inv, `Anulada con nota crédito ${imported.join(', ')} en Siigo`);
  return { imported, annulled };
}

/**
 * Re-reads an issued invoice (DIAN status, CUFE, number, public link). If it
 * was annulled or deleted in Siigo, the invoice is voided here too: the
 * order is free again and its stock follows the order's payment state.
 */
export async function refreshInvoice(invoiceId: string) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const { data: inv, error } = await supabase.from('sales_invoices').select('id, order_id, siigo_invoice_id, issue_date, created_at').eq('id', invoiceId).single();
    if (error || !inv) throw error ?? new Error('Factura no encontrada.');
    if (!inv.siigo_invoice_id) throw new Error('La factura aún no está en Siigo.');
    let out: (SiigoInvoiceOut & { annulled?: boolean }) | null;
    try {
      out = await getSiigoClient().request<SiigoInvoiceOut & { annulled?: boolean }>('GET', `/v1/invoices/${inv.siigo_invoice_id}`);
    } catch (err) {
      if (err instanceof SiigoError && err.status === 404) out = null; // deleted in Siigo
      else throw err;
    }

    if (!out || out.annulled) {
      const { count } = await supabase.from('invoice_payments').select('id', { count: 'exact', head: true }).eq('invoice_id', invoiceId).eq('siigo_status', 'enviado');
      if (count) throw new Error('La factura está anulada en Siigo pero tiene recibos de caja enviados: anúlalos en Siigo y avísale a tu contadora.');
      const note = out ? 'Anulada en Siigo' : 'Eliminada en Siigo';
      await voidInvoiceLocally(supabase, userId, inv, note);
      refresh();
      return { invoice: { siigo_status: 'Annulled', siigo_cufe: null, siigo_public_url: null, siigo_error: note }, annulled: true, creditNotes: [] as string[] };
    }

    const fields = { siigo_status: out.stamp?.status ?? null, siigo_cufe: out.stamp?.cufe ?? null, siigo_public_url: out.public_url ?? null, siigo_error: out.stamp?.errors || null };
    await updateRow(supabase, 'sales_invoices', invoiceId, { ...fields, siigo_name: out.name ?? null });
    await updateRow(supabase, 'orders', inv.order_id, { ...fields, siigo_invoice: out.name ?? null }).catch((e) => console.error('order siigo fields:', errorText(e)));
    // Credit notes made in Siigo (a full one voids the invoice).
    const notes = await importSiigoCreditNotes(supabase, userId, { ...inv, siigo_invoice_id: inv.siigo_invoice_id });
    refresh();
    if (notes.annulled) {
      return { invoice: { siigo_status: 'Annulled', siigo_cufe: null, siigo_public_url: null, siigo_error: 'Anulada con nota crédito' }, annulled: true, creditNotes: notes.imported };
    }
    return { invoice: fields, annulled: false, creditNotes: notes.imported };
  });
}

/** States in which Siigo still lets the invoice be edited and sent to the DIAN. */
const STAMPABLE = new Set(['Draft', 'Rejected']);
const IN_PROGRESS = new Set(['Sending', 'Pending']);
const STAMP_POLLS = 4;
const STAMP_POLL_MS = process.env.VITEST ? 0 : 2500;

/**
 * Sends to the DIAN an invoice that is in Siigo as a draft (created with
 * "Enviar a la DIAN" off) or that the DIAN rejected: the same invoice is
 * updated in Siigo with stamp.send, keeping its number. Electronic invoices
 * can't be dated before today, so it goes with today's date (and, on credit,
 * its due date counted from today).
 */
export async function stampInvoice(invoiceId: string) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    if (!siigoConfigFromEnv()) throw new Error('Siigo no está configurado en el servidor.');
    const { data: inv, error } = await supabase.from('sales_invoices').select('*').eq('id', invoiceId).single();
    if (error || !inv) throw error ?? new Error('Factura no encontrada.');
    if (inv.status !== 'emitida' || !inv.siigo_invoice_id) throw new Error('Primero envía la factura a Siigo.');
    const siigo = getSiigoClient();
    const current = await siigo.request<SiigoInvoiceOut & { annulled?: boolean }>('GET', `/v1/invoices/${inv.siigo_invoice_id}`);
    if (current.annulled) throw new Error('La factura está anulada en Siigo: pulsa "Actualizar estado".');
    const status = current.stamp?.status ?? 'Draft';
    if (!STAMPABLE.has(status)) throw new Error(status === 'Accepted' ? 'La factura ya fue aceptada por la DIAN.' : 'La factura ya está en proceso de envío a la DIAN.');
    const { count } = await supabase.from('invoice_payments').select('id', { count: 'exact', head: true }).eq('invoice_id', invoiceId).eq('siigo_status', 'enviado');
    if (count) throw new Error('Siigo no deja editar una factura con recibos de caja: elimínalos en Siigo, envíala a la DIAN y vuelve a enviar los pagos.');

    const settings = await loadSiigoSettings(supabase);
    const today = todayBogota();
    const { payload, problems } = siigoPayload(inv, inv.customer_identification, { ...settings, stamp_dian: true }, today);
    if (problems.length) throw new Error(problems.join(' · '));
    let out = await siigo.request<SiigoInvoiceOut>('PUT', `/v1/invoices/${inv.siigo_invoice_id}`, { body: payload });
    // The DIAN answers in a few seconds: read it again while Siigo says it is sending.
    for (let i = 0; i < STAMP_POLLS && IN_PROGRESS.has(out.stamp?.status ?? ''); i++) {
      await new Promise((r) => setTimeout(r, STAMP_POLL_MS));
      out = { ...out, ...(await siigo.request<SiigoInvoiceOut>('GET', `/v1/invoices/${inv.siigo_invoice_id}`)) };
    }

    const fields = {
      siigo_status: out.stamp?.status ?? 'Pending',
      siigo_cufe: out.stamp?.cufe ?? null,
      siigo_public_url: out.public_url ?? inv.siigo_public_url ?? null,
      siigo_error: out.stamp?.errors || null,
    };
    const dueDate = inv.payment_terms === 'credito' ? addDays(today, inv.term_days) : today;
    await updateRow(supabase, 'sales_invoices', invoiceId, { ...fields, siigo_name: out.name ?? inv.siigo_name, issue_date: today, due_date: dueDate, updated_at: new Date().toISOString() });
    await updateRow(supabase, 'orders', inv.order_id, { ...fields, siigo_invoice: out.name ?? inv.siigo_name }).catch((e) => console.error('order siigo fields:', errorText(e)));
    await siigoLog(supabase, userId, { entity: 'invoice', local_id: inv.order_id, siigo_id: inv.siigo_invoice_id, siigo_name: out.name ?? inv.siigo_name, status: 'ok', message: `Enviada a la DIAN: ${fields.siigo_status}` });
    refresh();
    return { invoice: fields };
  });
}

// ── Credit notes ────────────────────────────────────────────

/**
 * Makes a credit note in Siigo for an issued invoice and applies it here:
 * - 2 annulment: the invoice is voided; the order is cancelled (all stock
 *   back) or kept to invoice again (its stock follows its payment state).
 *   A draft Siigo invoice (never sent to the DIAN) is annulled instead.
 * - 1 partial return: the chosen units, back into inventory if they came back fine.
 * - 3/4 discount or price adjustment: only lowers what the customer owes.
 */
export async function createCreditNote(invoiceId: string, input: CreditInput) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    if (!siigoConfigFromEnv()) throw new Error('Siigo no está configurado en el servidor.');
    if (![1, 2, 3, 4].includes(input.reason)) throw new Error('Motivo inválido.');
    const { data: inv, error } = await supabase.from('sales_invoices').select('*, credit_notes ( * )').eq('id', invoiceId).single();
    if (error || !inv) throw error ?? new Error('Factura no encontrada.');
    if (inv.status !== 'emitida' || !inv.siigo_invoice_id) throw new Error('Solo se hacen notas crédito a facturas que ya están en Siigo.');
    const previous = ((inv.credit_notes ?? []) as { reason: number; total: number; lines: CreditNoteLine[] }[]);
    const credited = previous.reduce((s, n) => s + Number(n.total), 0);
    const siigo = getSiigoClient();

    // A draft was never sent to the DIAN: it is annulled, not credited.
    if (input.reason === 2 && (!inv.siigo_status || inv.siigo_status === 'Draft')) {
      const current = await siigo.request<SiigoInvoiceOut & { annulled?: boolean }>('GET', `/v1/invoices/${inv.siigo_invoice_id}`);
      if (!current.stamp?.status || current.stamp.status === 'Draft') {
        if (!current.annulled) await siigo.request('POST', `/v1/invoices/${inv.siigo_invoice_id}/annul`);
        await voidInvoiceLocally(supabase, userId, inv, 'Anulada en Siigo (borrador)', input.cancelOrder);
        refresh();
        return { name: null as string | null, annulled: true };
      }
    }

    // Units already returned by earlier notes, per invoice line.
    const returned: Record<number, number> = {};
    for (const n of previous.filter((n) => n.reason === 1)) {
      for (const l of n.lines ?? []) {
        const idx = (inv.lines as InvoiceLine[]).findIndex((x) => x.code === l.code && x.inventory_id === l.inventory_id);
        if (idx >= 0) returned[idx] = (returned[idx] ?? 0) + Number(l.quantity);
      }
    }
    const { lines, problems } = creditNoteLines({ lines: inv.lines as InvoiceLine[], total: inv.total, credited }, input, returned);
    if (problems.length) throw new Error(problems.join(' · '));

    const settings = await loadSiigoSettings(supabase);
    const { payload, problems: siigoProblems, total } = buildCreditNotePayload(
      inv,
      { reason: input.reason, lines, shipping: input.reason === 2 ? Number(inv.shipping) : 0, notes: input.notes ?? null, invoiceName: inv.siigo_name },
      settings,
      todayBogota()
    );
    if (siigoProblems.length) throw new Error(siigoProblems.join(' · '));

    // Saved first: the Siigo id is filled in after, and a failure stays visible.
    const { data: note, error: insErr } = await supabase
      .from('credit_notes')
      .insert({ invoice_id: invoiceId, reason: input.reason, lines, total, notes: input.notes?.trim() || null, origin: 'app', status: 'error', created_by: userId })
      .select('*')
      .single();
    if (insErr) throw insErr;

    let out: { id: string; name?: string; stamp?: { status?: string; cude?: string; errors?: string } };
    try {
      out = await siigo.request('POST', '/v1/credit-notes', { body: payload, idempotencyKey: idempotencyKey('NC', note.id) });
    } catch (err) {
      const msg = message(err);
      await supabase.from('credit_notes').update({ siigo_error: msg }).eq('id', note.id);
      await siigoLog(supabase, userId, { entity: 'credit_note', local_id: invoiceId, status: 'error', message: msg });
      // Nothing was applied: the failed note is removed so it doesn't count.
      await supabase.from('credit_notes').delete().eq('id', note.id);
      throw err;
    }
    await supabase
      .from('credit_notes')
      .update({ status: 'enviada', siigo_id: out.id, siigo_name: out.name ?? null, siigo_status: out.stamp?.status ?? (settings.stamp_dian ? 'Pending' : 'Draft'), siigo_cude: out.stamp?.cude ?? null, siigo_error: out.stamp?.errors || null })
      .eq('id', note.id);
    await siigoLog(supabase, userId, { entity: 'credit_note', local_id: invoiceId, siigo_id: out.id, siigo_name: out.name ?? null, status: 'ok', message: CREDIT_REASONS[input.reason] });

    const label = `Nota crédito ${out.name ?? ''} (${inv.siigo_name ?? 'factura'})`.replace('  ', ' ');
    if (input.reason === 2) {
      await voidInvoiceLocally(supabase, userId, inv, `Anulada con ${label}`, input.cancelOrder);
    } else if (input.reason === 1) {
      const back = lines.filter((l) => l.restock);
      if (back.length) await restockCreditNote(supabase, { creditNoteId: note.id, lines: back, reason: `Devolución · ${label}`, userId });
    }
    refresh();
    revalidatePath('/admin/inventory');
    return { name: out.name ?? out.id, annulled: input.reason === 2 };
  });
}

'use server';

// Cobros: customer deposits from the bank statement, registered in Cuentas
// por cobrar and assigned invoice by invoice (also invoices made directly in
// Siigo). Each becomes a Siigo recibo de caja per customer branch; the part
// that pays invoices made in Siigo enters Flujo de Caja (app invoices enter
// it when their order is paid). RCs made in Siigo since the cutoff are
// imported into the history. Mutations return { success, error }:
// production hides thrown messages.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { checkIsAdmin, setOrderPayment } from '../../actions';
import { createIncomeDirect, deleteIncomeDirect } from '../cashflow/actions';
import { getSiigoClient, idempotencyKey, siigoConfigFromEnv, SiigoError } from '@/utils/siigo/api';
import { buildCollectionVoucherPayload, cleanIdentification } from '@/utils/siigo/mapping';
import { errorText, loadSiigoSettings, siigoLog, todayBogota, type Supabase } from '@/utils/siigo/server';
import {
  collectionProblems,
  itemsOfVoucher,
  receiptConcept,
  receiptsByBranch,
  RECEIPTS_SINCE,
  vouchersToImport,
  type CollectionItem,
  type CollectionMethod,
  type OpenInvoice,
  type SiigoVoucher,
} from '@/utils/invoices/collections';

const MIGRATION_HINT = 'Falta aplicar la migración 20261105000000_customer_receipts.sql';

async function requireAdmin() {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

function message(err: unknown) {
  const m = errorText(err);
  if (/customer_receipts/.test(m) && /exist|relation|schema|column/i.test(m)) return MIGRATION_HINT;
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
  for (const path of ['/admin/receivables', '/admin/invoices', '/admin/orders', '/admin/cashflow']) revalidatePath(path);
}

export type Receipt = {
  id: string;
  client_id: string | null;
  site_id: string | null;
  customer_identification: string;
  customer_name: string;
  branch_office: number;
  receipt_date: string;
  amount: number;
  method: CollectionMethod;
  notes: string | null;
  items: CollectionItem[];
  status: 'pendiente' | 'enviado' | 'error' | 'importado';
  siigo_id: string | null;
  siigo_name: string | null;
  siigo_error: string | null;
  income_id: string | null;
};

/** The receipts history (null before its migration). */
export async function getReceipts() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from('customer_receipts').select('*').order('receipt_date', { ascending: false }).order('created_at', { ascending: false });
  return { receipts: error ? null : ((data ?? []) as Receipt[]) };
}

type SiigoInvoice = { id: string; name: string; balance?: number; annulled?: boolean; customer?: { identification?: string; branch_office?: number }; payments?: { due_date?: string }[]; date?: string };

/** The invoices as Siigo has them now (balance, customer, branch). */
async function openInvoices(ids: string[]): Promise<OpenInvoice[]> {
  const siigo = getSiigoClient();
  const out: OpenInvoice[] = [];
  for (const id of [...new Set(ids)]) {
    let inv: SiigoInvoice;
    try {
      inv = await siigo.request<SiigoInvoice>('GET', `/v1/invoices/${id}`);
    } catch (err) {
      if (err instanceof SiigoError && err.status === 404) continue;
      throw err;
    }
    if (inv.annulled || !(Number(inv.balance ?? 0) > 0.5)) continue;
    const dues = (inv.payments ?? []).map((p) => p.due_date).filter((d): d is string => !!d).sort();
    out.push({
      id: inv.id,
      name: inv.name,
      due_date: dues.at(-1) ?? inv.date ?? null,
      balance: Number(inv.balance),
      branch_office: Number(inv.customer?.branch_office ?? 0),
      customer_identification: inv.customer?.identification ?? null,
    });
  }
  return out;
}

/** The app client and its sede for a customer branch. */
async function clientAndSite(supabase: Supabase, identification: string, branch: number) {
  const { data: clients } = await supabase.from('clients').select('id, name, document_number');
  const client = ((clients ?? []) as { id: string; name: string; document_number: string | null }[]).find((c) => cleanIdentification(c.document_number).identification === identification) ?? null;
  if (!client || !branch) return { client, siteId: null as string | null };
  const { data: site } = await supabase.from('client_sites').select('id').eq('client_id', client.id).eq('siigo_branch_office', branch).maybeSingle();
  return { client, siteId: (site?.id as string | undefined) ?? null };
}

/**
 * The payments of a sent or imported RC on the invoices made in the app,
 * with the RC already in Siigo; an invoice left without balance marks its
 * order paid on the RC's date. Returns how much it paid of app invoices.
 */
async function applyToAppInvoices(supabase: Supabase, userId: string | null, r: Receipt): Promise<number> {
  if (!r.siigo_id) return 0;
  let applied = 0;
  for (const item of r.items) {
    const query = supabase.from('sales_invoices').select('id, order_id, siigo_invoice_id');
    const { data: inv } = await (item.siigo_invoice_id ? query.eq('siigo_invoice_id', item.siigo_invoice_id) : query.eq('siigo_name', item.name)).maybeSingle();
    if (!inv) continue;
    applied += Number(item.value);
    const { data: already } = await supabase.from('invoice_payments').select('id').eq('invoice_id', inv.id).eq('siigo_voucher_id', r.siigo_id).maybeSingle();
    if (already) continue;
    const { error } = await supabase.from('invoice_payments').insert({
      invoice_id: inv.id,
      payment_date: r.receipt_date,
      amount: Number(item.value),
      method: r.method,
      notes: `Cobro ${r.siigo_name ?? ''}`.trim(),
      siigo_status: 'enviado',
      siigo_voucher_id: r.siigo_id,
      siigo_voucher_name: r.siigo_name,
      created_by: userId,
    });
    if (error) throw error;
    const [after] = inv.siigo_invoice_id ? await openInvoices([inv.siigo_invoice_id]) : [];
    if (!after && inv.order_id) {
      const res = await setOrderPayment(inv.order_id, true, `${r.receipt_date}T12:00:00-05:00`);
      if (!res.success) throw new Error('error' in res ? res.error : 'No se pudo marcar el pedido como pagado.');
    }
  }
  return applied;
}

/** Sends a receipt as a Siigo recibo de caja; once there, its app invoices get the payment. */
async function sendReceipt(supabase: Supabase, userId: string | null, id: string): Promise<{ sent: boolean; name: string | null; error: string | null }> {
  const { data, error } = await supabase.from('customer_receipts').select('*').eq('id', id).single();
  if (error || !data) throw error ?? new Error('Cobro no encontrado.');
  const r = data as Receipt;
  try {
    const { payload, problems } = buildCollectionVoucherPayload(r, await loadSiigoSettings(supabase));
    if (problems.length) throw new Error(problems.join(' · '));
    const out = await getSiigoClient().request<{ id: string; name?: string }>('POST', '/v1/vouchers', { body: payload, idempotencyKey: idempotencyKey('CB', r.id) });
    const sent = { ...r, status: 'enviado' as const, siigo_id: out.id, siigo_name: out.name ?? null, siigo_error: null };
    await supabase.from('customer_receipts').update({ status: 'enviado', siigo_id: out.id, siigo_name: sent.siigo_name, siigo_error: null, updated_at: new Date().toISOString() }).eq('id', r.id);
    await siigoLog(supabase, userId, { entity: 'voucher', local_id: r.id, siigo_id: out.id, siigo_name: sent.siigo_name, status: 'ok' });
    await applyToAppInvoices(supabase, userId, sent);
    if (r.income_id && sent.siigo_name) await supabase.from('cashflow_incomes').update({ concept: receiptConcept(sent) }).eq('id', r.income_id);
    return { sent: true, name: sent.siigo_name, error: null };
  } catch (err) {
    const msg = message(err);
    await supabase.from('customer_receipts').update({ status: 'error', siigo_error: msg, updated_at: new Date().toISOString() }).eq('id', r.id);
    await siigoLog(supabase, userId, { entity: 'voucher', local_id: r.id, status: 'error', message: msg });
    return { sent: false, name: null, error: msg };
  }
}

export type CollectionInput = {
  date: string;
  amount: number;
  method: CollectionMethod;
  notes?: string | null;
  /** Siigo invoice id → how much of the deposit pays it. */
  assigned: { invoiceId: string; value: number }[];
};

/**
 * Registers a customer deposit: one recibo de caja per customer branch in
 * Siigo, with what was assigned to each invoice, and its income in Flujo de
 * Caja for the invoices made in Siigo.
 */
export async function registerCollection(input: CollectionInput) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    if (!siigoConfigFromEnv()) throw new Error('Siigo no está configurado en el servidor.');
    const assigned = input.assigned.filter((a) => Number(a.value) > 0);
    const invoices = await openInvoices(assigned.map((a) => a.invoiceId));
    const problems = collectionProblems({ ...input, assigned }, invoices, todayBogota());
    if (problems.length) throw new Error(problems.join(' · '));

    const identification = invoices[0].customer_identification ?? '';
    const { data: appInvoices } = await supabase.from('sales_invoices').select('siigo_invoice_id').in('siigo_invoice_id', invoices.map((i) => i.id));
    const inApp = new Set(((appInvoices ?? []) as { siigo_invoice_id: string }[]).map((i) => i.siigo_invoice_id));
    const results: { id: string; sent: boolean; name: string | null; error: string | null }[] = [];
    for (const [branch, items] of receiptsByBranch(assigned, invoices)) {
      const { client, siteId } = await clientAndSite(supabase, identification, branch);
      const amount = Math.round(items.reduce((s, i) => s + i.value, 0) * 100) / 100;
      const { data: row, error } = await supabase
        .from('customer_receipts')
        .insert({
          client_id: client?.id ?? null,
          site_id: siteId,
          customer_identification: identification,
          customer_name: client?.name ?? `NIT ${identification}`,
          branch_office: branch,
          receipt_date: input.date,
          amount,
          method: input.method,
          notes: input.notes?.trim() || null,
          items,
          status: 'pendiente',
          created_by: userId,
        })
        .select('*')
        .single();
      if (error || !row) throw error ?? new Error('No se pudo guardar el cobro.');
      // The money came in: invoices made in Siigo enter Flujo de Caja now (app ones, with their order).
      const outsideApp = Math.round(items.filter((i) => !inApp.has(i.siigo_invoice_id ?? '')).reduce((s, i) => s + i.value, 0) * 100) / 100;
      if (outsideApp > 0) {
        const res = await createIncomeDirect(input.date, { concept: receiptConcept(row as Receipt), category: 'Ventas Físicas', amount: outsideApp });
        if ('error' in res && res.error) throw new Error(res.error);
        const incomeId = (res as { data?: { id: string } }).data?.id ?? null;
        if (incomeId) await supabase.from('customer_receipts').update({ income_id: incomeId }).eq('id', row.id);
      }
      results.push({ id: row.id as string, ...(await sendReceipt(supabase, userId, row.id as string)) });
    }
    refresh();
    return { receipts: results };
  });
}

/** Sends again a receipt Siigo rejected. */
export async function retryReceipt(id: string) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    const { data, error } = await supabase.from('customer_receipts').select('status').eq('id', id).single();
    if (error || !data) throw error ?? new Error('Cobro no encontrado.');
    if (data.status === 'enviado' || data.status === 'importado') throw new Error('Este cobro ya está en Siigo.');
    const res = await sendReceipt(supabase, userId, id);
    refresh();
    return { sent: res.sent, name: res.name, siigoError: res.error };
  });
}

/** Removes a receipt that never reached Siigo, with its income in Flujo de Caja. */
export async function deleteReceipt(id: string) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const { data, error } = await supabase.from('customer_receipts').select('status, income_id').eq('id', id).single();
    if (error || !data) throw error ?? new Error('Cobro no encontrado.');
    if (data.status === 'enviado' || data.status === 'importado') throw new Error('Este cobro ya está en Siigo: anúlalo allá y avísale a tu contadora.');
    if (data.income_id) {
      const res = await deleteIncomeDirect(data.income_id);
      if ('error' in res && res.error) throw new Error(res.error);
    }
    const { error: delErr } = await supabase.from('customer_receipts').delete().eq('id', id);
    if (delErr) throw delErr;
    refresh();
    return {};
  });
}

/**
 * Brings into the history the RCs made in Siigo since the cutoff, once each.
 * They are already in Siigo and their money in Flujo de Caja (registered by
 * hand), so only their app invoices get the payment.
 */
export async function importSiigoReceipts() {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    if (!siigoConfigFromEnv()) throw new Error('Siigo no está configurado en el servidor.');
    const [vouchers, { data: own, error }, { data: appVouchers }] = await Promise.all([
      getSiigoClient().listAll<SiigoVoucher>('/v1/vouchers', { created_start: RECEIPTS_SINCE }),
      supabase.from('customer_receipts').select('siigo_id').not('siigo_id', 'is', null),
      // RCs the Facturas screen sent for one app invoice are already there.
      supabase.from('invoice_payments').select('siigo_voucher_id').not('siigo_voucher_id', 'is', null),
    ]);
    if (error) throw error;
    const known = new Set([...(own ?? []).map((r) => r.siigo_id as string), ...(appVouchers ?? []).map((p) => p.siigo_voucher_id as string)]);
    const imported: string[] = [];
    for (const v of vouchersToImport(vouchers, known)) {
      const identification = v.customer?.identification ?? '';
      const branch = Number(v.customer?.branch_office ?? 0);
      const { client, siteId } = await clientAndSite(supabase, identification, branch);
      const items = itemsOfVoucher(v);
      const { data: row, error: insErr } = await supabase
        .from('customer_receipts')
        .insert({
          client_id: client?.id ?? null,
          site_id: siteId,
          customer_identification: identification,
          customer_name: client?.name ?? `NIT ${identification}`,
          branch_office: branch,
          receipt_date: v.date,
          amount: Number(v.payment?.value ?? items.reduce((s, i) => s + i.value, 0)),
          method: /caja|efectivo/i.test(v.payment?.name ?? '') ? 'cash' : 'transfer',
          notes: v.observations?.slice(0, 500) || null,
          items,
          status: 'importado',
          siigo_id: v.id,
          siigo_name: v.name ?? null,
          created_by: userId,
        })
        .select('*')
        .single();
      if (insErr || !row) throw insErr ?? new Error('No se pudo guardar el RC.');
      await applyToAppInvoices(supabase, userId, row as Receipt);
      imported.push(v.name ?? v.id);
    }
    refresh();
    return { imported };
  });
}

'use server';

// Signed expense cuentas de cobro → Siigo support documents (documento
// soporte de adquisiciones a no obligados a facturar). Sent from the admin,
// one at a time, after reviewing date, category and retention. The signed
// PDF stays in the app (Siigo's API takes no attachments); the document
// mentions the cuenta de cobro number and signature date instead.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { checkIsAdmin } from '../../actions';
import { getSiigoClient, siigoConfigFromEnv } from '@/utils/siigo/api';
import { buildSupportDocumentPayload, cleanIdentification, type AppCuentaCobro, type Retention, type SupportOptions } from '@/utils/siigo/mapping';
import { daneCodeFor } from '@/utils/siigo/daneCities';
import { ensureSiigoSupplier, errorText, loadSiigoSettings, siigoLog, todayBogota, type Supabase } from '@/utils/siigo/server';

const MIGRATION_HINT = 'Falta aplicar la migración 20261021000000_cuentas_cobro_siigo.sql';
// A send in progress blocks a second click for this long.
const SENDING_LOCK_MS = 2 * 60 * 1000;

async function requireAdmin() {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

function message(err: unknown) {
  const m = errorText(err);
  return /siigo_ds_/.test(m) ? MIGRATION_HINT : m;
}

type Row = AppCuentaCobro & {
  id: string;
  type: string;
  status: string;
  issuer_email: string | null;
  issuer_phone: string | null;
  issue_date: string | null;
  expense_id: string | null;
  siigo_ds_id: string | null;
  siigo_ds_name: string | null;
  siigo_ds_status: string | null;
  siigo_ds_sent_at: string | null;
};

async function loadCuenta(supabase: Supabase, id: string) {
  const { data: cc, error } = await supabase.from('cuentas_cobro').select('*').eq('id', id).single();
  if (error || !cc) throw error ?? new Error('Cuenta de cobro no encontrada.');
  const row = cc as Row;
  if (row.type !== 'gasto') throw new Error('Solo las cuentas de cobro de gasto van a Siigo como documento soporte.');
  if (row.status !== 'firmada') throw new Error('La cuenta de cobro debe estar firmada.');
  const { data: expense } = row.expense_id
    ? await supabase.from('cashflow_expenses').select('category, cashflow_id ( date )').eq('id', row.expense_id).maybeSingle()
    : { data: null };
  return { cc: row, expense: expense as { category?: string; cashflow_id?: { date?: string } | { date?: string }[] | null } | null };
}

/** Retefuente taxes active in Siigo. */
async function loadRetentions(): Promise<Retention[]> {
  const taxes = await getSiigoClient().request<{ id: number; name: string; type?: string; percentage?: number; active?: boolean }[]>('GET', '/v1/taxes');
  return (taxes ?? [])
    .filter((t) => t.type === 'Retefuente' && t.active !== false)
    .map((t) => ({ id: t.id, name: t.name, percentage: Number(t.percentage ?? 0) }))
    .sort((a, b) => a.percentage - b.percentage);
}

const bogotaDate = (iso: string | null | undefined) => (iso ? new Date(Date.parse(iso) - 5 * 3600 * 1000).toISOString().slice(0, 10) : null);

/** What the form starts with: the linked expense's date and category, the category's retention. */
function defaults(cc: Row, expense: Awaited<ReturnType<typeof loadCuenta>>['expense'], retentionByCategory: Record<string, number>) {
  const day = Array.isArray(expense?.cashflow_id) ? expense?.cashflow_id[0]?.date : expense?.cashflow_id?.date;
  const category = expense?.category ?? '';
  return {
    date: day ?? bogotaDate(cc.signed_at) ?? cc.issue_date ?? todayBogota(),
    category,
    retentionId: category ? retentionByCategory[category] ?? null : null,
    assumed: false,
  };
}

export type SupportInput = { date: string; category: string; retentionId: number | null; assumed: boolean };

function options(input: SupportInput, retentions: Retention[]): SupportOptions {
  const retention = input.retentionId ? retentions.find((r) => r.id === Number(input.retentionId)) ?? null : null;
  if (input.retentionId && !retention) throw new Error('La retención elegida no existe en Siigo.');
  return { date: input.date, category: input.category, retention, assumed: !!input.assumed && !!retention };
}

/** The form for one cuenta de cobro: defaults, choices and, with input, what would be sent. */
export async function previewSupportDocument(id: string, input?: SupportInput) {
  const { supabase } = await requireAdmin();
  try {
    if (!siigoConfigFromEnv()) throw new Error('Siigo no está configurado en el servidor.');
    const [{ cc, expense }, settings, retentions] = await Promise.all([loadCuenta(supabase, id), loadSiigoSettings(supabase), loadRetentions()]);
    const start = defaults(cc, expense, settings.support_retentions ?? {});
    const chosen = input ?? start;
    const { payload, problems, totals } = buildSupportDocumentPayload(cc, options(chosen, retentions), settings);
    return {
      success: true as const,
      defaults: start,
      categories: Object.keys(settings.expense_accounts ?? {}).sort(),
      retentions,
      problems,
      totals,
      account: chosen.category ? settings.expense_accounts?.[chosen.category] ?? null : null,
      electronic: !!settings.stamp_dian,
      lines: payload.items.map((i) => ({ description: String(i.description), quantity: Number(i.quantity), price: Number(i.price) })),
      alreadySent: cc.siigo_ds_name ?? (cc.siigo_ds_id ? 'Siigo' : null),
    };
  } catch (err) {
    return { success: false as const, error: message(err) };
  }
}

export async function sendSupportDocument(id: string, input: SupportInput) {
  const { supabase, userId } = await requireAdmin();
  let claimed = false;
  try {
    if (!siigoConfigFromEnv()) throw new Error('Siigo no está configurado en el servidor.');
    const [{ cc }, settings, retentions] = await Promise.all([loadCuenta(supabase, id), loadSiigoSettings(supabase), loadRetentions()]);
    if (cc.siigo_ds_id) throw new Error(`Ya está en Siigo como ${cc.siigo_ds_name ?? 'documento soporte'}.`);
    if (cc.siigo_ds_status === 'manual') throw new Error('Esta cuenta de cobro está marcada como registrada a mano en Siigo.');
    if (cc.siigo_ds_status === 'enviando' && cc.siigo_ds_sent_at && Date.now() - Date.parse(cc.siigo_ds_sent_at) < SENDING_LOCK_MS) {
      throw new Error('Ya se está enviando: espera un momento y recarga.');
    }
    const { payload, problems, totals } = buildSupportDocumentPayload(cc, options(input, retentions), settings);
    if (problems.length) return { success: false as const, error: problems.join(' · '), problems };

    const { error: claimErr } = await supabase
      .from('cuentas_cobro')
      .update({ siigo_ds_status: 'enviando', siigo_ds_error: null, siigo_ds_sent_at: new Date().toISOString() })
      .eq('id', id);
    if (claimErr) throw claimErr;
    claimed = true;

    // The supplier's address and city, from Proveedores (needed only to create it in Siigo).
    const ident = cleanIdentification(cc.issuer_document).identification;
    const { data: suppliers } = await supabase.from('suppliers').select('name, document_number, email, phone, address, city');
    const supplier = (suppliers ?? []).find((s) => cleanIdentification(s.document_number).identification === ident);
    await ensureSiigoSupplier(supabase, userId, {
      name: cc.issuer_name,
      document_number: cc.issuer_document,
      email: cc.issuer_email ?? supplier?.email,
      phone: cc.issuer_phone ?? supplier?.phone,
      address: supplier?.address,
      city_code: daneCodeFor(supplier?.city),
    });

    const out = await getSiigoClient().request<{ id: string; name?: string; stamp?: { status?: string; errors?: string } }>('POST', '/v1/purchase-support-documents', { body: payload });
    const { error: upErr } = await supabase
      .from('cuentas_cobro')
      .update({ siigo_ds_id: out.id, siigo_ds_name: out.name ?? null, siigo_ds_status: out.stamp?.status ?? (settings.stamp_dian ? 'Pending' : 'Draft'), siigo_ds_error: out.stamp?.errors || null, siigo_ds_sent_at: new Date().toISOString() })
      .eq('id', id);
    if (upErr) console.error('sendSupportDocument save:', upErr.message);
    // What it left owed, for "Registrar pago" (separate: the columns come with the purchases migration).
    const { error: owedErr } = await supabase.from('cuentas_cobro').update({ siigo_ds_owed: totals.owed, siigo_ds_category: input.category, siigo_ds_date: input.date }).eq('id', id);
    if (owedErr) console.error('sendSupportDocument owed:', owedErr.message);
    await siigoLog(supabase, userId, { entity: 'support_document', local_id: id, siigo_id: out.id, siigo_name: out.name ?? null, status: 'ok', message: out.stamp?.status ?? null });
    revalidatePath('/admin/cuentas-cobro');
    return { success: true as const, name: out.name ?? out.id, status: out.stamp?.status ?? null };
  } catch (err) {
    const msg = message(err);
    if (claimed) await supabase.from('cuentas_cobro').update({ siigo_ds_status: 'error', siigo_ds_error: msg }).eq('id', id);
    await siigoLog(supabase, userId, { entity: 'support_document', local_id: id, status: 'error', message: msg });
    return { success: false as const, error: msg };
  }
}

/** Cuentas de cobro already typed into Siigo by hand: they never get sent. */
export async function markSupportDocumentManual(id: string, manual: boolean) {
  const { supabase } = await requireAdmin();
  try {
    const { data: cc, error } = await supabase.from('cuentas_cobro').select('siigo_ds_id').eq('id', id).single();
    if (error || !cc) throw error ?? new Error('Cuenta de cobro no encontrada.');
    if (cc.siigo_ds_id) throw new Error('Ya fue enviada a Siigo desde la app.');
    const { error: upErr } = await supabase.from('cuentas_cobro').update({ siigo_ds_status: manual ? 'manual' : null, siigo_ds_error: null }).eq('id', id);
    if (upErr) throw upErr;
    revalidatePath('/admin/cuentas-cobro');
    return { success: true as const };
  } catch (err) {
    return { success: false as const, error: message(err) };
  }
}

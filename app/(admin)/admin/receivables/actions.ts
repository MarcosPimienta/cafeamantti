'use server';

// Cuentas por cobrar from Siigo: every credit invoice with a balance (also
// those made directly in Siigo, and with the payments registered there),
// with the client and sede it belongs to. The screen buckets them by the
// cutoff it is asked for.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { checkIsAdmin } from '../../actions';
import { getSiigoClient, siigoConfigFromEnv } from '@/utils/siigo/api';
import { cleanIdentification } from '@/utils/siigo/mapping';
import { addDays } from '@/utils/siigo/mapping';
import { errorText, todayBogota } from '@/utils/siigo/server';
import { siteFromObservations, type ReceivableInvoice } from '@/utils/invoices/receivables';

/** How far back to look for unpaid invoices. */
const LOOKBACK_DAYS = 400;

type SiigoInvoice = {
  id: string;
  name: string;
  date: string;
  total?: number;
  balance?: number;
  annulled?: boolean;
  observations?: string;
  customer?: { identification?: string; branch_office?: number };
  payments?: { due_date?: string }[];
};
type Site = { id: string; client_id: string; name: string; address: string | null; city: string | null; siigo_branch_office: number | null };

async function requireAdmin() {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

export async function getReceivables() {
  const { supabase } = await requireAdmin();
  const today = todayBogota();
  const empty = { invoices: [] as ReceivableInvoice[], clients: [] as { id: string; name: string; document_number: string | null }[], sites: [] as Site[], today };
  if (!siigoConfigFromEnv()) return { ...empty, error: 'Siigo no está configurado en el servidor.' };
  try {
    const [list, { data: clients }, { data: sites }, { data: appInvoices }, { data: manual }] = await Promise.all([
      getSiigoClient().listAll<SiigoInvoice>('/v1/invoices', { created_start: addDays(today, -LOOKBACK_DAYS) }),
      supabase.from('clients').select('id, name, document_number'),
      supabase.from('client_sites').select('id, client_id, name, address, city, siigo_branch_office').order('created_at', { ascending: true }),
      supabase.from('sales_invoices').select('siigo_invoice_id, site_id').not('siigo_invoice_id', 'is', null),
      supabase.from('siigo_invoice_sites').select('siigo_invoice_id, site_id'),
    ]);
    const clientByNit = new Map<string, { id: string; name: string }>();
    for (const c of (clients ?? []) as { id: string; name: string; document_number: string | null }[]) {
      const nit = cleanIdentification(c.document_number).identification;
      if (nit && !clientByNit.has(nit)) clientByNit.set(nit, c);
    }
    const allSites = (sites ?? []) as Site[];
    const appSite = new Map(((appInvoices ?? []) as { siigo_invoice_id: string; site_id: string | null }[]).filter((i) => i.site_id).map((i) => [i.siigo_invoice_id, i.site_id as string]));
    const manualSite = new Map(((manual ?? []) as { siigo_invoice_id: string; site_id: string }[]).map((m) => [m.siigo_invoice_id, m.site_id]));

    const invoices: ReceivableInvoice[] = [];
    for (const inv of list) {
      const balance = Number(inv.balance ?? 0);
      if (inv.annulled || !(balance > 0.5)) continue;
      const nit = inv.customer?.identification ?? null;
      const client = nit ? clientByNit.get(nit) ?? null : null;
      const own = client ? allSites.filter((s) => s.client_id === client.id) : [];
      const branch = Number(inv.customer?.branch_office ?? 0);
      let siteId: string | null = manualSite.get(inv.id) ?? appSite.get(inv.id) ?? null;
      let source: ReceivableInvoice['site_source'] = manualSite.has(inv.id) ? 'manual' : siteId ? 'app' : null;
      if (!siteId && branch > 0) {
        siteId = own.find((s) => s.siigo_branch_office === branch)?.id ?? null;
        if (siteId) source = 'branch';
      }
      if (!siteId) {
        siteId = siteFromObservations(inv.observations, own)?.id ?? null;
        if (siteId) source = 'notes';
      }
      const dues = (inv.payments ?? []).map((p) => p.due_date).filter((d): d is string => !!d).sort();
      invoices.push({
        id: inv.id,
        name: inv.name,
        client_id: client?.id ?? null,
        customer_name: client?.name ?? (nit ? `NIT ${nit}` : 'Sin cliente'),
        customer_identification: nit,
        site_id: siteId,
        site_source: source,
        issue_date: inv.date,
        due_date: dues.at(-1) ?? inv.date,
        total: Number(inv.total ?? 0),
        balance,
        branch_office: branch,
      });
    }
    return { invoices, clients: (clients ?? []) as { id: string; name: string; document_number: string | null }[], sites: allSites, today, error: null };
  } catch (err) {
    return { ...empty, error: errorText(err) };
  }
}

/** Assigns the sede of an invoice (made in the app or directly in Siigo) on the statement. */
export async function setReceivableSite(siigoInvoiceId: string, siteId: string | null) {
  const { supabase, userId } = await requireAdmin();
  try {
    // An app invoice keeps it on itself; one made in Siigo, in the table for that.
    const { data: app } = await supabase.from('sales_invoices').select('id').eq('siigo_invoice_id', siigoInvoiceId).maybeSingle();
    if (app) {
      const { error } = await supabase.from('sales_invoices').update({ site_id: siteId }).eq('id', app.id);
      if (error) throw error;
    }
    if (siteId) {
      const { error } = await supabase.from('siigo_invoice_sites').upsert({ siigo_invoice_id: siigoInvoiceId, site_id: siteId, created_by: userId }, { onConflict: 'siigo_invoice_id' });
      if (error) throw error;
    } else {
      await supabase.from('siigo_invoice_sites').delete().eq('siigo_invoice_id', siigoInvoiceId);
    }
    revalidatePath('/admin/receivables');
    return { success: true as const };
  } catch (err) {
    const m = errorText(err);
    return { success: false as const, error: /siigo_invoice_sites|client_sites/.test(m) ? 'Falta aplicar la migración 20261102000000_client_sites.sql' : m };
  }
}

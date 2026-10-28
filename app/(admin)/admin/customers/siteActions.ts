'use server';

// Sedes of a client (one NIT, several places it buys for) and their sync
// to Siigo as branch offices. Mutations return { success, error }:
// production hides thrown messages.

import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { checkIsAdmin } from '../../actions';
import { daneCodeFor } from '@/utils/siigo/daneCities';
import { siigoConfigFromEnv } from '@/utils/siigo/api';
import { cleanIdentification, type AppClient } from '@/utils/siigo/mapping';
import { ensureSiigoBranch, errorText } from '@/utils/siigo/server';
import { siteProblems, type ClientSite } from '@/utils/clients/sites';

const MIGRATION_HINT = 'Falta aplicar la migración 20261102000000_client_sites.sql';

async function requireAdmin() {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

function message(err: unknown) {
  const m = errorText(err);
  if (/client_sites|site_id/.test(m) && /exist|relation|schema|column/i.test(m)) return MIGRATION_HINT;
  if (/client_sites_name_key/.test(m)) return 'Ese cliente ya tiene una sede con ese nombre.';
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
  revalidatePath('/admin/customers');
  revalidatePath('/admin/orders');
}

export type SiteInput = { id?: string | null; client_id: string; name: string; address?: string | null; city?: string | null; city_code?: string | null; contact_name?: string | null; phone?: string | null; notes?: string | null };

/** Creates or edits a sede. Its Siigo branch keeps its number (Siigo isn't renamed). */
export async function saveClientSite(input: SiteInput) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const city_code = (input.city_code ?? '').replace(/\D/g, '') || daneCodeFor(input.city ?? '') || null;
    const problems = siteProblems({ name: input.name, city_code });
    if (problems.length) throw new Error(problems.join(' '));
    const row = {
      client_id: input.client_id,
      name: input.name.trim().slice(0, 120),
      address: input.address?.trim() || null,
      city: input.city?.trim() || null,
      city_code,
      contact_name: input.contact_name?.trim() || null,
      phone: input.phone?.trim() || null,
      notes: input.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = input.id
      ? await supabase.from('client_sites').update(row).eq('id', input.id).select('*').single()
      : await supabase.from('client_sites').insert(row).select('*').single();
    if (error) throw error;
    refresh();
    return { site: data as ClientSite };
  });
}

export async function setClientSiteActive(siteId: string, active: boolean) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    const { error } = await supabase.from('client_sites').update({ active, updated_at: new Date().toISOString() }).eq('id', siteId);
    if (error) throw error;
    refresh();
    return {};
  });
}

/** Deletes a sede no order or invoice uses (otherwise deactivate it). */
export async function deleteClientSite(siteId: string) {
  const { supabase } = await requireAdmin();
  return guard(async () => {
    for (const table of ['orders', 'sales_invoices'] as const) {
      const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('site_id', siteId);
      if (error) throw error;
      if (count) throw new Error('La sede ya tiene pedidos o facturas: desactívala en vez de eliminarla.');
    }
    const { data: site } = await supabase.from('client_sites').select('siigo_branch_office').eq('id', siteId).maybeSingle();
    if (site?.siigo_branch_office != null) throw new Error('La sede ya está en Siigo como sucursal: desactívala en vez de eliminarla.');
    const { error } = await supabase.from('client_sites').delete().eq('id', siteId);
    if (error) throw error;
    refresh();
    return {};
  });
}

/** Creates the sede in Siigo as a branch office of the client's NIT (or links the one already there). */
export async function syncClientSite(siteId: string) {
  const { supabase, userId } = await requireAdmin();
  return guard(async () => {
    if (!siigoConfigFromEnv()) throw new Error('Siigo no está configurado en el servidor.');
    const { data: site, error } = await supabase.from('client_sites').select('*').eq('id', siteId).single();
    if (error || !site) throw error ?? new Error('Sede no encontrada.');
    const { data: client, error: cErr } = await supabase.from('clients').select('*').eq('id', site.client_id).single();
    if (cErr || !client) throw cErr ?? new Error('Cliente no encontrado.');
    if (!cleanIdentification(client.document_number).identification) throw new Error('El cliente no tiene NIT: agrégalo antes de crear sus sedes en Siigo.');
    const branch = await ensureSiigoBranch(supabase, userId, client as AppClient, site as ClientSite);
    refresh();
    return { branch };
  });
}

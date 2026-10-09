'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { checkIsAdmin } from '../../../actions';
import { MIN_UNITS_PER_PRESENTATION, MAQUILA_PROFILES, effectiveMinimum, type MaquilaLine, type MaquilaSettings } from '@/utils/maquila';

const STATUSES = ['borrador', 'enviada', 'aceptada', 'rechazada'];
const MIGRATION_HINT = 'Falta aplicar la migración 20261012000000_maquila_proposals.sql';

export type MaquilaProposalInput = {
  client_id: string | null;
  custom_client_name: string | null;
  title: string;
  proposal_date: string;
  valid_until: string | null;
  status: string;
  intro: string | null;
  conditions: string | null;
  minimum_units: number | null;
  settings: MaquilaSettings;
  lines: MaquilaLine[];
  internal_notes: string | null;
};

async function requireAdmin() {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: user?.id ?? null };
}

function friendly(error: { message: string }) {
  return new Error(/maquila_proposals/.test(error.message) && /exist|relation|schema/i.test(error.message) ? MIGRATION_HINT : error.message);
}

const isYmd = (d: string | null) => d === null || /^\d{4}-\d{2}-\d{2}$/.test(d);
const finiteNonNeg = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Rejects proposals that would print nonsense (negative prices, no presentations…). */
function validate(p: MaquilaProposalInput) {
  if (!p.client_id && !p.custom_client_name?.trim()) throw new Error('Elige un cliente o escribe su nombre.');
  if (!p.title?.trim()) throw new Error('Escribe un título.');
  if (!isYmd(p.proposal_date) || !p.proposal_date) throw new Error('Fecha de la propuesta inválida.');
  if (!isYmd(p.valid_until)) throw new Error('Fecha de vigencia inválida.');
  if (p.valid_until && p.valid_until < p.proposal_date) throw new Error('La vigencia no puede terminar antes de la fecha de la propuesta.');
  if (!STATUSES.includes(p.status)) throw new Error('Estado inválido.');
  if (p.minimum_units !== null && !(Number.isInteger(p.minimum_units) && p.minimum_units >= MIN_UNITS_PER_PRESENTATION)) {
    throw new Error(`El pedido mínimo es de ${MIN_UNITS_PER_PRESENTATION} unidades por presentación (número entero).`);
  }
  if (!finiteNonNeg(p.settings?.merma_pct) || p.settings.merma_pct > 50) throw new Error('La merma debe estar entre 0 y 50 %.');
  if (!finiteNonNeg(p.settings?.iva_pct) || p.settings.iva_pct > 100) throw new Error('IVA inválido.');
  if (!finiteNonNeg(p.settings?.design_fee ?? 0) || !finiteNonNeg(p.settings?.design_cost ?? 0)) throw new Error('El valor y el costo del diseño deben ser mayores o iguales a cero.');
  const opacity = p.settings?.background_opacity ?? 0.5;
  if (!finiteNonNeg(opacity) || opacity > 1) throw new Error('La opacidad del fondo debe estar entre 0 y 100 %.');
  for (const path of [p.settings?.background_path, p.settings?.ally_logo_path]) {
    if (path != null && path !== '' && !/^proposals\/[\w.-]+$/.test(path)) throw new Error('Imagen inválida: súbela de nuevo.');
  }
  if (!Array.isArray(p.lines) || p.lines.length === 0) throw new Error('Agrega al menos una presentación.');
  for (const l of p.lines) {
    const name = l.presentation?.trim() || 'una presentación';
    if (!l.presentation?.trim()) throw new Error('Cada presentación necesita un nombre.');
    if (!(finiteNonNeg(l.grams) && l.grams > 0)) throw new Error(`Indica los gramos por unidad de ${name}.`);
    if (!MAQUILA_PROFILES.some((pr) => pr.id === l.profile)) throw new Error(`Elige el perfil de café de ${name}.`);
    if (!finiteNonNeg(l.coffee_cost_per_kg)) throw new Error(`Costo del café inválido en ${name}.`);
    const minimum = effectiveMinimum(p.minimum_units);
    if (!(Number.isInteger(l.units) && l.units >= minimum)) {
      throw new Error(`${name}: el pedido debe ser de al menos ${minimum} unidades (número entero).`);
    }
    if (!finiteNonNeg(l.labor_per_unit)) throw new Error(`Mano de obra inválida en ${name}.`);
    if (!finiteNonNeg(l.target_margin_pct) || l.target_margin_pct >= 100) throw new Error(`El margen de ${name} debe estar entre 0 y 99 %.`);
    if (l.price_per_unit !== null && !finiteNonNeg(l.price_per_unit)) throw new Error(`Precio inválido en ${name}.`);
    for (const m of l.materials ?? []) {
      if (!m.name?.trim()) throw new Error(`Hay un insumo sin nombre en ${name}.`);
      if (!finiteNonNeg(m.unit_cost) || !finiteNonNeg(m.qty)) throw new Error(`Costo o cantidad inválidos en ${m.name} (${name}).`);
      if (m.supplied_by !== 'amantti' && m.supplied_by !== 'cliente') throw new Error(`Indica quién aporta ${m.name}.`);
    }
  }
}

export async function getMaquilaProposals() {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('maquila_proposals')
    .select('id, title, status, proposal_date, valid_until, custom_client_name, minimum_units, lines, settings, clients:client_id ( name )')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('getMaquilaProposals:', error.message);
    return [];
  }
  return data ?? [];
}

export async function getMaquilaProposal(id: string) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase.from('maquila_proposals').select('*').eq('id', id).single();
  if (error) return null;
  return data;
}

export async function saveMaquilaProposal(input: MaquilaProposalInput, id?: string | null) {
  const { supabase, userId } = await requireAdmin();
  validate(input);
  const row = {
    client_id: input.client_id || null,
    custom_client_name: input.client_id ? null : input.custom_client_name?.trim() || null,
    title: input.title.trim(),
    proposal_date: input.proposal_date,
    valid_until: input.valid_until || null,
    status: input.status,
    intro: input.intro?.trim() || null,
    conditions: input.conditions?.trim() || null,
    minimum_units: input.minimum_units ?? MIN_UNITS_PER_PRESENTATION,
    settings: input.settings,
    lines: input.lines,
    internal_notes: input.internal_notes?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = id
    ? await supabase.from('maquila_proposals').update(row).eq('id', id).select('id').single()
    : await supabase.from('maquila_proposals').insert({ ...row, created_by: userId }).select('id').single();
  if (error) throw friendly(error);
  revalidatePath('/admin/quotes');
  return { success: true, id: data.id as string };
}

export async function deleteMaquilaProposal(id: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from('maquila_proposals').delete().eq('id', id);
  if (error) throw friendly(error);
  revalidatePath('/admin/quotes');
  return { success: true };
}

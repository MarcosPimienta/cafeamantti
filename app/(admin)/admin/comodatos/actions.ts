'use server';

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { checkIsAdmin } from '../../actions';
import { assertCanApply, kgByClient, statusAfter, type UnitStatus } from '@/utils/comodato';

// Equipment lent to clients in comodato. An 'equipo' inventory item is the
// model; each machine is an equipment_unit. Lending never moves stock (the
// machine stays ours); registering a unit beyond the model's stock adds an
// entrada and retiring one adds a salida, so the Kardex keeps reconciling.

const today = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10); // Bogotá
const isYmd = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const PAID = ['paid', 'processing', 'shipped', 'delivered'];
const MIGRATION_HINT = 'Falta aplicar la migración 20261010010000_comodatos.sql';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

async function requireAdmin() {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase: DB = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: (user?.id ?? null) as string | null };
}

function friendly(error: { message: string }): Error {
  if (/equipment_units|comodato_assignments|equipment_events/.test(error.message) && /exist|relation|schema/i.test(error.message)) {
    return new Error(MIGRATION_HINT);
  }
  if (error.message.includes('uq_equipment_units_serial')) return new Error('Ya existe una máquina con ese serial.');
  if (error.message.includes('uq_comodato_open_per_unit')) return new Error('Esa máquina ya está en comodato.');
  return new Error(error.message);
}

async function moveStock(supabase: DB, userId: string | null, inventoryId: string, delta: number, reason: string, date: string) {
  const { data: item, error } = await supabase.from('inventory').select('current_stock').eq('id', inventoryId).single();
  if (error || !item) throw new Error('Modelo de equipo no encontrado en el inventario.');
  const next = Number(item.current_stock) + delta;
  if (next < 0) throw new Error('El stock del modelo no puede quedar negativo.');
  const { error: movErr } = await supabase.from('inventory_movements').insert({
    inventory_id: inventoryId,
    type: delta > 0 ? 'entrada' : 'salida',
    quantity: delta,
    reason,
    created_by: userId,
    movement_date: date,
    tab_source: delta > 0 ? 'entrada' : 'salida',
  });
  if (movErr) throw new Error(movErr.message);
  await supabase.from('inventory').update({ current_stock: next }).eq('id', inventoryId);
}

async function loadUnit(supabase: DB, unitId: string) {
  const { data, error } = await supabase.from('equipment_units').select('*').eq('id', unitId).single();
  if (error || !data) throw error ? friendly(error) : new Error('Máquina no encontrada.');
  return data as { id: string; inventory_id: string; serial: string | null; label: string | null; status: UnitStatus };
}

function unitName(u: { serial: string | null; label: string | null }) {
  return u.label || (u.serial ? `serial ${u.serial}` : 'sin serial');
}

/** Models, units with their current comodato, clients, and kg bought (last 30 days). */
export async function getComodatosData() {
  const { supabase } = await requireAdmin();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();

  const [models, units, open, clients, orders, inventory] = await Promise.all([
    supabase.from('inventory').select('id, product_code, product_name, current_stock').eq('category', 'equipo').order('product_name'),
    supabase.from('equipment_units').select('*').order('created_at', { ascending: true }),
    supabase.from('comodato_assignments').select('*').is('end_date', null),
    supabase.from('clients').select('id, name, document_number, city').order('name'),
    supabase
      .from('orders')
      .select('client_id, order_items ( inventory_id, quantity )')
      .in('status', PAID)
      .gte('created_at', since)
      .not('client_id', 'is', null),
    supabase.from('inventory').select('id, product_code'),
  ]);

  const migrated = !units.error;
  const codeOf = new Map(((inventory.data ?? []) as { id: string; product_code: string }[]).map((i) => [i.id, i.product_code]));
  const lines = ((orders.data ?? []) as { client_id: string; order_items: { inventory_id: string | null; quantity: number }[] }[]).flatMap((o) =>
    (o.order_items ?? [])
      .filter((it) => it.inventory_id && codeOf.has(it.inventory_id))
      .map((it) => ({ client_id: o.client_id, product_code: codeOf.get(it.inventory_id!)!, quantity: Number(it.quantity) }))
  );

  const openByUnit = new Map(((open.data ?? []) as { unit_id: string }[]).map((a) => [a.unit_id, a]));
  const clientById = new Map(((clients.data ?? []) as { id: string; name: string }[]).map((c) => [c.id, c]));
  const modelById = new Map(((models.data ?? []) as { id: string; product_name: string; product_code: string }[]).map((m) => [m.id, m]));

  return {
    migrated,
    today: today(),
    models: models.data ?? [],
    clients: clients.data ?? [],
    kgLast30ByClient: kgByClient(lines),
    units: ((units.data ?? []) as { id: string; inventory_id: string }[]).map((u) => {
      const assignment = openByUnit.get(u.id) as { client_id: string } | undefined;
      return {
        ...u,
        model: modelById.get(u.inventory_id) ?? null,
        assignment: assignment ?? null,
        client: assignment ? clientById.get(assignment.client_id) ?? null : null,
      };
    }),
  };
}

/** Everything that happened to one machine, newest first. */
export async function getUnitHistory(unitId: string) {
  const { supabase } = await requireAdmin();
  const [assignments, events] = await Promise.all([
    supabase.from('comodato_assignments').select('*, client:client_id ( name )').eq('unit_id', unitId).order('start_date', { ascending: false }),
    supabase.from('equipment_events').select('*, client:client_id ( name )').eq('unit_id', unitId).order('event_date', { ascending: false }),
  ]);
  if (assignments.error) throw friendly(assignments.error);
  return { assignments: assignments.data ?? [], events: events.data ?? [] };
}

/**
 * Registers a physical machine of an 'equipo' model. If the model already
 * had stock for it (e.g. created with an opening stock), no movement is
 * added; beyond that, the unit is an entrada.
 */
export async function registerEquipmentUnit(input: { inventoryId: string; serial?: string; label?: string; notes?: string; date?: string }) {
  const { supabase, userId } = await requireAdmin();
  const date = input.date || today();
  if (!isYmd(date)) throw new Error('Fecha inválida.');

  const { data: model } = await supabase.from('inventory').select('id, category, current_stock, product_name').eq('id', input.inventoryId).single();
  if (!model) throw new Error('Modelo no encontrado.');
  if (model.category !== 'equipo') throw new Error('Solo los productos de la categoría Equipo pueden tener máquinas en comodato.');

  const serial = input.serial?.trim() || null;
  const { data: unit, error } = await supabase
    .from('equipment_units')
    .insert({ inventory_id: model.id, serial, label: input.label?.trim() || null, notes: input.notes?.trim() || null, status: 'disponible', created_by: userId })
    .select('*')
    .single();
  if (error) throw friendly(error);

  const { data: siblings } = await supabase.from('equipment_units').select('id, status').eq('inventory_id', model.id);
  const active = ((siblings ?? []) as { status: string }[]).filter((s) => s.status !== 'baja').length;
  if (active > Number(model.current_stock)) {
    await moveStock(supabase, userId, model.id, active - Number(model.current_stock), `Alta de equipo ${unitName(unit)}`, date);
  }

  await supabase.from('equipment_events').insert({ unit_id: unit.id, event_date: date, kind: 'alta', description: input.notes?.trim() || null, created_by: userId });
  revalidatePath('/admin/comodatos');
  revalidatePath('/admin/inventory');
  return { success: true, unit };
}

/** Hands an available machine to a client. */
export async function assignComodato(input: { unitId: string; clientId: string; startDate: string; monthlyCommitmentKg?: number | null; notes?: string }) {
  const { supabase, userId } = await requireAdmin();
  if (!isYmd(input.startDate)) throw new Error('Fecha de entrega inválida.');
  if (input.monthlyCommitmentKg != null && !(Number.isFinite(input.monthlyCommitmentKg) && input.monthlyCommitmentKg >= 0)) {
    throw new Error('El compromiso mensual debe ser un número de kg mayor o igual a cero.');
  }
  const unit = await loadUnit(supabase, input.unitId);
  assertCanApply('asignar', unit.status);

  const { data: client } = await supabase.from('clients').select('id, name').eq('id', input.clientId).single();
  if (!client) throw new Error('Selecciona un cliente del CRM.');

  const { error } = await supabase.from('comodato_assignments').insert({
    unit_id: unit.id,
    client_id: client.id,
    start_date: input.startDate,
    monthly_commitment_kg: input.monthlyCommitmentKg ?? null,
    delivery_notes: input.notes?.trim() || null,
    created_by: userId,
  });
  if (error) throw friendly(error);

  await supabase.from('equipment_units').update({ status: statusAfter('asignar'), updated_at: new Date().toISOString() }).eq('id', unit.id);
  await supabase.from('equipment_events').insert({
    unit_id: unit.id, event_date: input.startDate, kind: 'entrega', client_id: client.id,
    description: input.notes?.trim() || `Entregada en comodato a ${client.name}`, created_by: userId,
  });
  revalidatePath('/admin/comodatos');
  revalidatePath('/admin/customers');
  return { success: true };
}

/** Closes the open comodato; the machine comes back available or to maintenance. */
export async function returnComodato(input: { unitId: string; endDate: string; returnTo?: 'disponible' | 'mantenimiento'; notes?: string }) {
  const { supabase, userId } = await requireAdmin();
  if (!isYmd(input.endDate)) throw new Error('Fecha de devolución inválida.');
  const unit = await loadUnit(supabase, input.unitId);
  assertCanApply('devolver', unit.status);

  const { data: open } = await supabase.from('comodato_assignments').select('*').eq('unit_id', unit.id).is('end_date', null).maybeSingle();
  if (open && input.endDate < open.start_date) throw new Error('La devolución no puede ser antes de la entrega.');
  if (open) {
    const { error } = await supabase
      .from('comodato_assignments')
      .update({ end_date: input.endDate, return_notes: input.notes?.trim() || null })
      .eq('id', open.id);
    if (error) throw friendly(error);
  }

  await supabase.from('equipment_units').update({ status: statusAfter('devolver', input.returnTo), updated_at: new Date().toISOString() }).eq('id', unit.id);
  await supabase.from('equipment_events').insert({
    unit_id: unit.id, event_date: input.endDate, kind: 'devolucion', client_id: open?.client_id ?? null,
    description: input.notes?.trim() || (input.returnTo === 'mantenimiento' ? 'Devuelta a mantenimiento' : 'Devuelta'), created_by: userId,
  });
  revalidatePath('/admin/comodatos');
  revalidatePath('/admin/customers');
  return { success: true };
}

/**
 * Maintenance in/out, retiring a machine, or just a note. Retiring takes
 * one unit out of the model's stock (salida).
 */
export async function updateEquipmentStatus(input: {
  unitId: string;
  action: 'mantenimiento' | 'disponible' | 'baja' | 'nota';
  date: string;
  description?: string;
  cost?: number | null;
}) {
  const { supabase, userId } = await requireAdmin();
  if (!isYmd(input.date)) throw new Error('Fecha inválida.');
  if (input.cost != null && !(Number.isFinite(input.cost) && input.cost >= 0)) throw new Error('El costo debe ser mayor o igual a cero.');
  const unit = await loadUnit(supabase, input.unitId);

  if (input.action !== 'nota') {
    assertCanApply(input.action, unit.status);
    if (input.action === 'baja') {
      await moveStock(supabase, userId, unit.inventory_id, -1, `Baja de equipo ${unitName(unit)}`, input.date);
    }
    await supabase.from('equipment_units').update({ status: statusAfter(input.action), updated_at: new Date().toISOString() }).eq('id', unit.id);
  } else if (!input.description?.trim()) {
    throw new Error('Escribe la nota.');
  }

  await supabase.from('equipment_events').insert({
    unit_id: unit.id,
    event_date: input.date,
    kind: input.action === 'disponible' ? 'reparacion' : input.action,
    description: input.description?.trim() || null,
    cost: input.cost ?? null,
    created_by: userId,
  });
  revalidatePath('/admin/comodatos');
  revalidatePath('/admin/inventory');
  return { success: true };
}

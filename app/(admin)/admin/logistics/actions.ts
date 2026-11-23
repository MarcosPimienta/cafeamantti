'use server';

// Logística: shipments by carrier and guía, national (Servientrega,
// Coordinadora) and international (DHL, FedEx). Shipping never moves stock
// or cash; it only tracks where the package is.

import { createClient } from '@/utils/supabase/server';
import { revalidatePath } from 'next/cache';
import { checkIsAdmin } from '../../actions';
import {
  cleanTracking,
  datesFor,
  defaultScope,
  isCarrier,
  isStatus,
  STATUS_LABELS,
  type Carrier,
  type Direction,
  type Scope,
  type ShipmentStatus,
} from '@/utils/shipments';
import { autoTrackedCarriers, syncOpenShipments } from '@/utils/shipmentTracking';

const today = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10); // Bogotá
const isYmd = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const MIGRATION_HINT = 'Falta aplicar la migración 20261121000000_shipments.sql';
/** Orders offered to link a shipment to. */
const ORDER_LOOKBACK_DAYS = 120;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

export type ShipmentInput = {
  carrier: Carrier;
  scope?: Scope;
  direction?: Direction;
  trackingNumber?: string | null;
  status?: ShipmentStatus;
  clientId?: string | null;
  orderId?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  address?: string | null;
  originCity?: string | null;
  destinationCity?: string | null;
  destinationCountry?: string | null;
  contents?: string | null;
  packages?: number | null;
  weightKg?: number | null;
  declaredValue?: number | null;
  cost?: number | null;
  currency?: 'COP' | 'USD' | 'EUR';
  paidBy?: 'nosotros' | 'cliente';
  shipDate?: string | null;
  estimatedDate?: string | null;
  notes?: string | null;
};

async function requireAdmin() {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase: DB = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, userId: (user?.id ?? null) as string | null };
}

function friendly(error: { message: string }): Error {
  if (/shipments|shipment_events/.test(error.message) && /exist|relation|schema/i.test(error.message)) return new Error(MIGRATION_HINT);
  if (error.message.includes('uq_shipments_carrier_tracking')) return new Error('Ya hay un envío con esa guía en esa transportadora.');
  return new Error(error.message);
}

const text = (v: string | null | undefined) => (v ?? '').trim() || null;

function positive(v: number | null | undefined, label: string, { integer = false } = {}) {
  if (v == null || (v as unknown) === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || (integer && (!Number.isInteger(n) || n === 0))) throw new Error(`${label} no es válido.`);
  return n;
}

function optionalDate(v: string | null | undefined, label: string) {
  const d = (v ?? '').trim();
  if (!d) return null;
  if (!isYmd(d)) throw new Error(`${label} no es válida.`);
  return d;
}

/** Validates the form into table columns. */
async function toRow(supabase: DB, input: ShipmentInput) {
  if (!isCarrier(input.carrier)) throw new Error('Elige la transportadora.');
  const scope: Scope = input.scope === 'nacional' || input.scope === 'internacional' ? input.scope : defaultScope(input.carrier);
  const shipDate = optionalDate(input.shipDate, 'La fecha de envío');
  const estimatedDate = optionalDate(input.estimatedDate, 'La fecha estimada');
  if (shipDate && estimatedDate && estimatedDate < shipDate) throw new Error('La fecha estimada no puede ser antes del envío.');

  let clientId = input.clientId || null;
  const orderId = input.orderId || null;
  if (orderId) {
    const { data: order } = await supabase.from('orders').select('id, client_id').eq('id', orderId).maybeSingle();
    if (!order) throw new Error('Pedido no encontrado.');
    if (clientId && order.client_id && order.client_id !== clientId) throw new Error('El pedido es de otro cliente.');
    clientId = clientId ?? order.client_id ?? null;
  }
  if (clientId) {
    const { data: client } = await supabase.from('clients').select('id').eq('id', clientId).maybeSingle();
    if (!client) throw new Error('Cliente no encontrado.');
  }

  const country = text(input.destinationCountry) ?? 'Colombia';
  return {
    carrier: input.carrier,
    scope,
    direction: input.direction === 'entrada' ? 'entrada' : 'salida',
    tracking_number: cleanTracking(input.trackingNumber),
    client_id: clientId,
    order_id: orderId,
    recipient_name: text(input.recipientName),
    recipient_phone: text(input.recipientPhone),
    address: text(input.address),
    origin_city: text(input.originCity),
    destination_city: text(input.destinationCity),
    destination_country: country,
    contents: text(input.contents),
    packages: positive(input.packages, 'El número de paquetes', { integer: true }),
    weight_kg: positive(input.weightKg, 'El peso'),
    declared_value: positive(input.declaredValue, 'El valor declarado'),
    cost: positive(input.cost, 'El costo del flete'),
    currency: input.currency === 'USD' || input.currency === 'EUR' ? input.currency : 'COP',
    paid_by: input.paidBy === 'cliente' ? 'cliente' : 'nosotros',
    ship_date: shipDate,
    estimated_date: estimatedDate,
    notes: text(input.notes),
  };
}

/** Shipments, plus the clients and recent orders the form can link to. */
export async function getLogisticsData() {
  const { supabase } = await requireAdmin();
  const since = new Date(Date.now() - ORDER_LOOKBACK_DAYS * 86400000).toISOString();
  const [shipments, clients, orders] = await Promise.all([
    supabase.from('shipments').select('*').order('created_at', { ascending: false }),
    supabase.from('clients').select('id, name, city').order('name'),
    supabase
      .from('orders')
      .select('id, client_id, created_at, total_amount, siigo_invoice, status')
      .neq('status', 'cancelled')
      .not('client_id', 'is', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false }),
  ]);
  const clientList = (clients.data ?? []) as { id: string; name: string; city: string | null }[];
  const clientById = new Map(clientList.map((c) => [c.id, c]));
  const orderList = (orders.data ?? []) as { id: string; client_id: string; created_at: string; total_amount: number | null; siigo_invoice: string | null }[];
  const orderById = new Map(orderList.map((o) => [o.id, o]));

  return {
    migrated: !shipments.error,
    today: today(),
    autoCarriers: autoTrackedCarriers(),
    clients: clientList,
    orders: orderList,
    shipments: ((shipments.data ?? []) as Record<string, unknown>[]).map((s) => ({
      ...s,
      client: s.client_id ? clientById.get(s.client_id as string) ?? null : null,
      order: s.order_id ? orderById.get(s.order_id as string) ?? null : null,
    })),
  };
}

/** Status changes and notes of one shipment, newest first. */
export async function getShipmentEvents(shipmentId: string) {
  const { supabase } = await requireAdmin();
  const { data, error } = await supabase
    .from('shipment_events')
    .select('*')
    .eq('shipment_id', shipmentId)
    .order('event_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw friendly(error);
  return data ?? [];
}

export async function createShipment(input: ShipmentInput) {
  const { supabase, userId } = await requireAdmin();
  const row = await toRow(supabase, input);
  const status: ShipmentStatus = input.status && isStatus(input.status) ? input.status : row.ship_date ? 'en_transito' : 'preparando';
  const date = row.ship_date ?? today();
  const { data, error } = await supabase
    .from('shipments')
    .insert({ ...row, status, ...datesFor(status, date, { ship_date: row.ship_date, delivered_date: null }), created_by: userId })
    .select('*')
    .single();
  if (error) throw friendly(error);
  await supabase.from('shipment_events').insert({
    shipment_id: data.id, event_date: date, status, description: 'Envío registrado', created_by: userId,
  });
  revalidatePath('/admin/logistics');
  return { success: true as const, shipment: data };
}

/** Edits the shipment's details; status changes go through updateShipmentStatus. */
export async function updateShipment(id: string, input: ShipmentInput) {
  const { supabase } = await requireAdmin();
  const row = await toRow(supabase, input);
  const { error } = await supabase.from('shipments').update({ ...row, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw friendly(error);
  revalidatePath('/admin/logistics');
  return { success: true as const };
}

/** Moves the shipment to a new status (or just adds a note) and keeps it in the history. */
export async function updateShipmentStatus(input: { id: string; status?: ShipmentStatus | null; date: string; description?: string }) {
  const { supabase, userId } = await requireAdmin();
  if (!isYmd(input.date)) throw new Error('Fecha inválida.');
  const { data: current, error } = await supabase.from('shipments').select('id, status, ship_date, delivered_date').eq('id', input.id).single();
  if (error || !current) throw error ? friendly(error) : new Error('Envío no encontrado.');

  const status = input.status && isStatus(input.status) && input.status !== current.status ? input.status : null;
  const description = text(input.description);
  if (!status && !description) throw new Error('Elige un estado nuevo o escribe una nota.');
  if (status && current.ship_date && input.date < current.ship_date && status !== 'cancelado') {
    throw new Error('La fecha no puede ser antes del envío.');
  }

  if (status) {
    const { error: upErr } = await supabase
      .from('shipments')
      .update({ status, ...datesFor(status, input.date, current), updated_at: new Date().toISOString() })
      .eq('id', current.id);
    if (upErr) throw friendly(upErr);
  }
  await supabase.from('shipment_events').insert({
    shipment_id: current.id,
    event_date: input.date,
    status,
    description: description ?? (status ? STATUS_LABELS[status] : null),
    created_by: userId,
  });
  revalidatePath('/admin/logistics');
  return { success: true as const };
}

export async function deleteShipment(id: string) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.from('shipments').delete().eq('id', id);
  if (error) throw friendly(error);
  revalidatePath('/admin/logistics');
  return { success: true as const };
}

/** Asks the carriers now (the same check that runs every 8 hours), for all open shipments or one. */
export async function checkTrackingNow(id?: string) {
  const { supabase } = await requireAdmin();
  const summary = await syncOpenShipments(supabase, { ids: id ? [id] : undefined });
  revalidatePath('/admin/logistics');
  return summary;
}

// Logística: carriers, statuses and the rules shared by the screen and the
// server actions. Pure functions only.

export type Carrier = 'servientrega' | 'coordinadora' | 'dhl' | 'fedex' | 'otro';
export type Scope = 'nacional' | 'internacional';
export type Direction = 'salida' | 'entrada';
export type ShipmentStatus =
  | 'preparando'
  | 'en_transito'
  | 'en_aduana'
  | 'en_reparto'
  | 'entregado'
  | 'novedad'
  | 'devuelto'
  | 'cancelado';

export const CARRIERS: Record<Carrier, { label: string; scope: Scope; track?: (guia: string) => string }> = {
  servientrega: {
    label: 'Servientrega',
    scope: 'nacional',
    track: (g) => `https://mobile.servientrega.com/WebSitePortal/RastreoEnvioDetalle.html?Guia=${encodeURIComponent(g)}`,
  },
  coordinadora: {
    label: 'Coordinadora',
    scope: 'nacional',
    track: (g) => `https://coordinadora.com/rastreo/rastreo-de-guia/detalle-de-rastreo-de-guia/?guia=${encodeURIComponent(g)}`,
  },
  dhl: {
    label: 'DHL',
    scope: 'internacional',
    track: (g) => `https://www.dhl.com/co-es/home/rastreo.html?tracking-id=${encodeURIComponent(g)}&submit=1`,
  },
  fedex: {
    label: 'FedEx',
    scope: 'internacional',
    track: (g) => `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(g)}`,
  },
  otro: { label: 'Otro', scope: 'nacional' },
};

export const CARRIER_ORDER: Carrier[] = ['servientrega', 'coordinadora', 'dhl', 'fedex', 'otro'];

export const STATUS_LABELS: Record<ShipmentStatus, string> = {
  preparando: 'Preparando',
  en_transito: 'En tránsito',
  en_aduana: 'En aduana',
  en_reparto: 'En reparto',
  entregado: 'Entregado',
  novedad: 'Novedad',
  devuelto: 'Devuelto',
  cancelado: 'Cancelado',
};

/** The order the statuses are offered in. Aduana only applies to international shipments. */
export function statusOptions(scope: Scope): ShipmentStatus[] {
  const all: ShipmentStatus[] = ['preparando', 'en_transito', 'en_aduana', 'en_reparto', 'entregado', 'novedad', 'devuelto', 'cancelado'];
  return scope === 'internacional' ? all : all.filter((s) => s !== 'en_aduana');
}

/** Shipments that no longer need follow-up. */
export const isClosed = (s: ShipmentStatus) => s === 'entregado' || s === 'devuelto' || s === 'cancelado';

export const isCarrier = (c: string): c is Carrier => c in CARRIERS;
export const isStatus = (s: string): s is ShipmentStatus => s in STATUS_LABELS;

export function defaultScope(carrier: Carrier): Scope {
  return CARRIERS[carrier].scope;
}

/** Link to the carrier's tracking page for that guía, if the carrier has one. */
export function trackingUrl(carrier: Carrier, tracking: string | null | undefined): string | null {
  const guia = (tracking ?? '').replace(/[\s-]/g, '');
  const track = CARRIERS[carrier]?.track;
  return guia && track ? track(guia) : null;
}

/** Guía numbers are stored without spaces or dashes, the way carriers ask for them. */
export function cleanTracking(tracking: string | null | undefined): string | null {
  const g = (tracking ?? '').replace(/[\s-]/g, '').toUpperCase();
  return g || null;
}

/** Still open and past the promised date. */
export function isLate(s: { status: ShipmentStatus; estimated_date: string | null }, today: string): boolean {
  return !isClosed(s.status) && !!s.estimated_date && s.estimated_date < today;
}

/** Days between two YYYY-MM-DD dates (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
}

/**
 * Dates that go with a status change: shipping sets ship_date if missing,
 * delivering sets delivered_date; reopening a delivered shipment clears it.
 */
export function datesFor(
  status: ShipmentStatus,
  date: string,
  current: { ship_date: string | null; delivered_date: string | null }
): { ship_date?: string | null; delivered_date?: string | null } {
  const out: { ship_date?: string | null; delivered_date?: string | null } = {};
  if (status !== 'preparando' && status !== 'cancelado' && !current.ship_date) out.ship_date = date;
  if (status === 'entregado') out.delivered_date = date;
  else if (current.delivered_date) out.delivered_date = null;
  return out;
}

type Summarizable = {
  status: ShipmentStatus;
  scope: Scope;
  estimated_date: string | null;
  delivered_date: string | null;
  ship_date: string | null;
  cost: number | null;
  currency: string;
  paid_by: string;
};

/** KPIs for the header: open shipments, problems, and this month's freight. */
export function summarize(list: Summarizable[], today: string) {
  const month = today.slice(0, 7);
  const deliveredThisMonth = list.filter((s) => s.status === 'entregado' && s.delivered_date?.startsWith(month));
  const transit = deliveredThisMonth
    .filter((s) => s.ship_date && s.delivered_date)
    .map((s) => daysBetween(s.ship_date!, s.delivered_date!));
  const costMonth: Record<string, number> = {};
  for (const s of list) {
    if (s.paid_by !== 'nosotros' || s.cost == null || s.status === 'cancelado') continue;
    if (!(s.ship_date ?? '').startsWith(month)) continue;
    costMonth[s.currency] = (costMonth[s.currency] ?? 0) + Number(s.cost);
  }
  return {
    abiertos: list.filter((s) => !isClosed(s.status)).length,
    nacionales: list.filter((s) => !isClosed(s.status) && s.scope === 'nacional').length,
    internacionales: list.filter((s) => !isClosed(s.status) && s.scope === 'internacional').length,
    novedades: list.filter((s) => s.status === 'novedad').length,
    atrasados: list.filter((s) => isLate(s, today)).length,
    entregadosMes: deliveredThisMonth.length,
    diasPromedio: transit.length ? Math.round((transit.reduce((a, b) => a + b, 0) / transit.length) * 10) / 10 : null,
    costoMes: costMonth,
  };
}

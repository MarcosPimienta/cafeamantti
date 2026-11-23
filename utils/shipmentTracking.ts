// Automatic tracking of open shipments: asks each carrier for the guía's
// status and scans, stores the new scans in the history and moves our
// status when the carrier's changes.
//
// Carriers with an API here: DHL (Shipment Tracking – Unified, needs
// DHL_API_KEY) and FedEx (Track API, needs FEDEX_CLIENT_ID and
// FEDEX_CLIENT_SECRET). Servientrega and Coordinadora only give their web
// service to corporate accounts; until there are credentials they are
// skipped and followed by hand.

import { isClosed, type Carrier, type ShipmentStatus } from './shipments';

export type TrackEvent = { key: string; date: string; status: ShipmentStatus | null; description: string; location: string | null };
export type TrackResult = {
  /** Our status for the carrier's latest one; null when it can't be mapped. */
  status: ShipmentStatus | null;
  /** The carrier's latest status as it says it. */
  statusText: string | null;
  estimatedDate: string | null;
  deliveredDate: string | null;
  events: TrackEvent[];
};

type Fetch = typeof fetch;
type Env = Record<string, string | undefined>;

export class TrackingError extends Error {}

/** YYYY-MM-DD of an ISO timestamp, in Bogotá when it has a zone. */
export function ymd(ts: string | null | undefined): string | null {
  if (!ts) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(ts)) return ts;
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return null;
  // Timestamps with a zone: the day in Bogotá. Without one, the carrier's local day.
  return /[zZ]|[+-]\d{2}:?\d{2}$/.test(ts) ? new Date(t - 5 * 3600 * 1000).toISOString().slice(0, 10) : ts.slice(0, 10);
}

// ---------------------------------------------------------------- DHL

/** DHL statusCode → ours. */
export function mapDhl(code: string | null | undefined, text = ''): ShipmentStatus | null {
  const t = text.toLowerCase();
  if (code === 'delivered') return 'entregado';
  if (code === 'failure') return /return|devuel/.test(t) ? 'devuelto' : 'novedad';
  if (code === 'pre-transit') return 'preparando';
  if (code === 'transit') {
    if (/customs|aduana|clearance/.test(t)) return 'en_aduana';
    if (/out for delivery|with delivery courier|en reparto|en ruta de entrega/.test(t)) return 'en_reparto';
    return 'en_transito';
  }
  return null;
}

type DhlEvent = { timestamp?: string; statusCode?: string; status?: string; description?: string; location?: { address?: { addressLocality?: string } } };

async function trackDhl(guia: string, env: Env, f: Fetch): Promise<TrackResult> {
  const key = env.DHL_API_KEY;
  if (!key) throw new TrackingError('DHL no está configurado (falta DHL_API_KEY).');
  const res = await f(`https://api-eu.dhl.com/track/shipments?trackingNumber=${encodeURIComponent(guia)}&language=es`, {
    headers: { 'DHL-API-Key': key, Accept: 'application/json' },
  });
  if (res.status === 404) throw new TrackingError('DHL todavía no reconoce esa guía.');
  if (!res.ok) throw new TrackingError(`DHL respondió ${res.status}.`);
  const body = (await res.json()) as { shipments?: { status?: DhlEvent; events?: DhlEvent[]; estimatedTimeOfDelivery?: string }[] };
  const s = body.shipments?.[0];
  if (!s) throw new TrackingError('DHL todavía no reconoce esa guía.');
  const text = (e?: DhlEvent) => e?.description || e?.status || '';
  const events = (s.events ?? [])
    .filter((e) => e.timestamp)
    .map((e) => ({
      key: `dhl:${e.timestamp}:${e.statusCode ?? ''}:${text(e)}`.slice(0, 300),
      date: ymd(e.timestamp)!,
      status: mapDhl(e.statusCode, text(e)),
      description: text(e) || 'Movimiento',
      location: e.location?.address?.addressLocality ?? null,
    }));
  const status = mapDhl(s.status?.statusCode, text(s.status));
  return {
    status,
    statusText: text(s.status) || null,
    estimatedDate: ymd(s.estimatedTimeOfDelivery),
    deliveredDate: status === 'entregado' ? ymd(s.status?.timestamp) : null,
    events,
  };
}

// ---------------------------------------------------------------- FedEx

/** FedEx derivedCode / code → ours. */
export function mapFedex(code: string | null | undefined): ShipmentStatus | null {
  switch ((code ?? '').toUpperCase()) {
    case 'DL': return 'entregado';
    case 'OD': return 'en_reparto';
    case 'IN': case 'OC': return 'preparando';
    case 'PU': case 'IT': case 'AR': case 'DP': case 'AF': case 'FD': case 'PM': case 'AA': case 'AD': case 'EP': case 'OF': return 'en_transito';
    case 'CC': case 'CD': case 'CP': return 'en_aduana';
    case 'DE': case 'SE': case 'DY': case 'HL': case 'DD': case 'CH': return 'novedad';
    case 'RS': case 'RP': return 'devuelto';
    case 'CA': return 'cancelado';
    default: return null;
  }
}

type FedexScan = { date?: string; eventType?: string; derivedStatusCode?: string; eventDescription?: string; exceptionDescription?: string; scanLocation?: { city?: string; countryName?: string } };
type FedexResult = {
  latestStatusDetail?: { code?: string; derivedCode?: string; statusByLocale?: string; description?: string };
  scanEvents?: FedexScan[];
  dateAndTimes?: { type?: string; dateTime?: string }[];
  estimatedDeliveryTimeWindow?: { window?: { ends?: string } };
  error?: { code?: string; message?: string };
};

const fedexToken: { value: string; until: number } = { value: '', until: 0 };

async function fedexAuth(env: Env, f: Fetch, base: string) {
  if (fedexToken.value && Date.now() < fedexToken.until) return fedexToken.value;
  const res = await f(`${base}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: env.FEDEX_CLIENT_ID!, client_secret: env.FEDEX_CLIENT_SECRET! }).toString(),
  });
  if (!res.ok) throw new TrackingError(`FedEx no aceptó las credenciales (${res.status}).`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new TrackingError('FedEx no devolvió el token.');
  fedexToken.value = body.access_token;
  fedexToken.until = Date.now() + Math.max(60, (body.expires_in ?? 3600) - 120) * 1000;
  return fedexToken.value;
}

async function trackFedex(guia: string, env: Env, f: Fetch): Promise<TrackResult> {
  if (!env.FEDEX_CLIENT_ID || !env.FEDEX_CLIENT_SECRET) throw new TrackingError('FedEx no está configurado (faltan FEDEX_CLIENT_ID y FEDEX_CLIENT_SECRET).');
  const base = env.FEDEX_API_URL || 'https://apis.fedex.com';
  const token = await fedexAuth(env, f, base);
  const res = await f(`${base}/track/v1/trackingnumbers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-locale': 'es_CO' },
    body: JSON.stringify({ includeDetailedScans: true, trackingInfo: [{ trackingNumberInfo: { trackingNumber: guia } }] }),
  });
  if (res.status === 401) fedexToken.until = 0;
  if (!res.ok) throw new TrackingError(`FedEx respondió ${res.status}.`);
  const body = (await res.json()) as { output?: { completeTrackResults?: { trackResults?: FedexResult[] }[] } };
  const r = body.output?.completeTrackResults?.[0]?.trackResults?.[0];
  if (!r) throw new TrackingError('FedEx no devolvió resultados.');
  if (r.error?.code) throw new TrackingError(r.error.code.includes('NOTFOUND') ? 'FedEx todavía no reconoce esa guía.' : `FedEx: ${r.error.message ?? r.error.code}`);
  const when = (type: string) => r.dateAndTimes?.find((d) => d.type === type)?.dateTime;
  const latest = r.latestStatusDetail;
  const status = mapFedex(latest?.derivedCode || latest?.code);
  return {
    status,
    statusText: latest?.statusByLocale || latest?.description || null,
    estimatedDate: ymd(when('ESTIMATED_DELIVERY') ?? r.estimatedDeliveryTimeWindow?.window?.ends),
    deliveredDate: status === 'entregado' ? ymd(when('ACTUAL_DELIVERY')) : null,
    events: (r.scanEvents ?? [])
      .filter((e) => e.date)
      .map((e) => ({
        key: `fedex:${e.date}:${e.eventType ?? ''}`,
        date: ymd(e.date)!,
        status: mapFedex(e.derivedStatusCode || e.eventType),
        description: [e.eventDescription, e.exceptionDescription].filter(Boolean).join(' — ') || 'Movimiento',
        location: [e.scanLocation?.city, e.scanLocation?.countryName].filter(Boolean).join(', ') || null,
      })),
  };
}

// ---------------------------------------------------------------- registry

const PROVIDERS: Partial<Record<Carrier, { configured: (env: Env) => boolean; track: (guia: string, env: Env, f: Fetch) => Promise<TrackResult> }>> = {
  dhl: { configured: (e) => !!e.DHL_API_KEY, track: trackDhl },
  fedex: { configured: (e) => !!(e.FEDEX_CLIENT_ID && e.FEDEX_CLIENT_SECRET), track: trackFedex },
};

/** Carriers whose guías are checked automatically with the current credentials. */
export function autoTrackedCarriers(env: Env = process.env): Carrier[] {
  return (Object.keys(PROVIDERS) as Carrier[]).filter((c) => PROVIDERS[c]!.configured(env));
}

// ---------------------------------------------------------------- sync

type Row = {
  id: string;
  carrier: Carrier;
  tracking_number: string | null;
  status: ShipmentStatus;
  ship_date: string | null;
  estimated_date: string | null;
  delivered_date: string | null;
  carrier_status: string | null;
};

/**
 * What to write for one shipment after a check. Our status follows the
 * carrier only when the carrier's own status changed since the last check,
 * so a manual change (e.g. a novedad we found by phone) isn't undone.
 */
export function planUpdate(row: Row, result: TrackResult, now: string) {
  const update: Record<string, unknown> = {
    last_checked_at: now,
    last_check_error: null,
    carrier_status: result.status,
    carrier_status_text: result.statusText,
  };
  let changed: ShipmentStatus | null = null;
  if (result.status && result.status !== row.carrier_status && result.status !== row.status) {
    changed = result.status;
    update.status = result.status;
  }
  const next = (update.status as ShipmentStatus | undefined) ?? row.status;
  const firstScan = result.events.map((e) => e.date).sort()[0] ?? null;
  if (!row.ship_date && next !== 'preparando' && next !== 'cancelado') update.ship_date = firstScan ?? now.slice(0, 10);
  if (result.estimatedDate && result.estimatedDate !== row.estimated_date && (!row.ship_date || result.estimatedDate >= row.ship_date)) {
    update.estimated_date = result.estimatedDate;
  }
  if (next === 'entregado' && !row.delivered_date) update.delivered_date = result.deliveredDate ?? now.slice(0, 10);
  if (changed) update.updated_at = now;
  return { update, changed };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DB = any;

export type SyncSummary = {
  checked: number;
  updated: { id: string; tracking: string; carrier: Carrier; status: ShipmentStatus }[];
  newEvents: number;
  errors: { id: string; tracking: string; carrier: Carrier; error: string }[];
  skipped: number;
};

/** Checks every open shipment with a guía whose carrier has an API configured. */
export async function syncOpenShipments(supabase: DB, opts: { env?: Env; fetch?: Fetch; now?: Date; ids?: string[] } = {}): Promise<SyncSummary> {
  const env = opts.env ?? process.env;
  const f = opts.fetch ?? fetch;
  const now = (opts.now ?? new Date()).toISOString();
  const summary: SyncSummary = { checked: 0, updated: [], newEvents: 0, errors: [], skipped: 0 };

  let q = supabase.from('shipments').select('id, carrier, tracking_number, status, ship_date, estimated_date, delivered_date, carrier_status').not('tracking_number', 'is', null);
  if (opts.ids?.length) q = q.in('id', opts.ids);
  const { data, error } = await q;
  if (error) throw new Error(error.message);

  for (const row of (data ?? []) as Row[]) {
    if (isClosed(row.status) || !row.tracking_number) continue;
    const provider = PROVIDERS[row.carrier];
    if (!provider || !provider.configured(env)) {
      summary.skipped++;
      continue;
    }
    summary.checked++;
    try {
      const result = await provider.track(row.tracking_number, env, f);
      const { data: known } = await supabase.from('shipment_events').select('external_key').eq('shipment_id', row.id).not('external_key', 'is', null);
      const seen = new Set(((known ?? []) as { external_key: string }[]).map((k) => k.external_key));
      const fresh = result.events.filter((e) => !seen.has(e.key) && (seen.add(e.key), true));
      if (fresh.length) {
        const { error: evErr } = await supabase.from('shipment_events').insert(
          fresh.map((e) => ({
            shipment_id: row.id, event_date: e.date, status: e.status, description: e.description, location: e.location, source: 'transportadora', external_key: e.key,
          }))
        );
        if (evErr) throw new Error(evErr.message);
        summary.newEvents += fresh.length;
      }
      const { update, changed } = planUpdate(row, result, now);
      const { error: upErr } = await supabase.from('shipments').update(update).eq('id', row.id);
      if (upErr) throw new Error(upErr.message);
      if (changed) summary.updated.push({ id: row.id, tracking: row.tracking_number, carrier: row.carrier, status: changed });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push({ id: row.id, tracking: row.tracking_number, carrier: row.carrier, error: message });
      await supabase.from('shipments').update({ last_checked_at: now, last_check_error: message.slice(0, 500) }).eq('id', row.id);
    }
  }
  return summary;
}

// Siigo Nube API client (https://api.siigo.com). Server-side only: it reads
// the API credentials from the environment and must never reach the browser.
//
//   SIIGO_USERNAME    API user (email) from Siigo Nube → Mi credencial API
//   SIIGO_ACCESS_KEY  access key of that user
//   SIIGO_PARTNER_ID  Partner-Id Siigo assigns to the linked application
//                     (Credenciales de Siigo API → Aplicaciones vinculadas),
//                     sent on every request; default CafeAmantti
//
// Rules from Siigo's docs that shape this client:
// - POST /auth returns a token valid 24 h → cached and renewed before expiry
//   (and once more if a request still gets 401).
// - At most 100 requests per minute per company (10 in the sandbox) → 429s
//   are retried with exponential backoff.
// - Creating documents can take long at peak hours → 120 s timeout.
// - POSTs of invoices, credit notes, journals and vouchers accept an
//   Idempotency-Key (≤ 30 alphanumerics) so retries never duplicate them.
// - A user whose requests are > 80 % errors for 7 days gets blocked, so
//   payloads are validated before sending.

const BASE_URL = "https://api.siigo.com";
const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 3;

export type SiigoErrorItem = { Code?: string; Message?: string; Params?: string[]; Detail?: string };

export class SiigoError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly errors: SiigoErrorItem[] = []
  ) {
    super(message);
    this.name = "SiigoError";
  }
  get codes() {
    return this.errors.map((e) => e.Code).filter(Boolean) as string[];
  }
}

export type SiigoConfig = { username: string; accessKey: string; partnerId: string };

/** Credentials from the environment; null when the integration is not set up. */
export function siigoConfigFromEnv(env: Record<string, string | undefined> = process.env): SiigoConfig | null {
  const username = env.SIIGO_USERNAME?.trim();
  const accessKey = env.SIIGO_ACCESS_KEY?.trim();
  if (!username || !accessKey) return null;
  // Siigo assigns the Partner-Id per linked application: use it exactly as given.
  const partnerId = (env.SIIGO_PARTNER_ID?.trim() || "CafeAmantti").replace(/\s+/g, "");
  return { username, accessKey, partnerId };
}

type RawErrorItem = SiigoErrorItem & { code?: string; message?: string; params?: string[]; detail?: string };

/**
 * Siigo's error body → one readable message. The docs show
 * { Errors: [{ Code, Message, Params }] }, but some endpoints (e.g. /auth)
 * answer in lowercase ({ errors: [{ code, message, params }] }): both work.
 */
export function describeSiigoErrors(status: number, body: unknown): { message: string; errors: SiigoErrorItem[] } {
  const b = (body ?? {}) as { Errors?: RawErrorItem[]; errors?: RawErrorItem[]; message?: string };
  const errors: SiigoErrorItem[] = (b.Errors ?? b.errors ?? []).map((e) => ({
    Code: e.Code ?? e.code,
    Message: e.Message ?? e.message,
    Params: e.Params ?? e.params,
    Detail: e.Detail ?? e.detail,
  }));
  const text = errors
    .map((e) => [e.Message || e.Code, e.Params?.length ? `(${e.Params.join(", ")})` : ""].filter(Boolean).join(" "))
    .filter(Boolean)
    .join(" · ");
  if (text) {
    const hint = errors.some((e) => e.Code === "invalid_value" && e.Message?.includes("access_key"))
      ? " Revisa SIIGO_ACCESS_KEY: debe ser la access key completa del usuario API (Siigo Nube → Mi credencial API)."
      : "";
    return { message: text + hint, errors };
  }
  const generic: Record<number, string> = {
    401: "Siigo rechazó las credenciales (usuario o access key inválidos, o usuario API bloqueado).",
    403: "El usuario API de Siigo no tiene permiso para esta operación.",
    404: "Siigo no encontró el recurso.",
    429: "Siigo limita a 100 solicitudes por minuto; intenta de nuevo en un momento.",
    503: "Siigo no está disponible en este momento.",
  };
  return { message: b.message || generic[status] || `Error ${status} de Siigo`, errors };
}

type Fetch = typeof fetch;
type RequestOptions = { query?: Record<string, string | number | undefined>; body?: unknown; idempotencyKey?: string };

export class SiigoClient {
  private token: string | null = null;
  private tokenExpiresAt = 0;

  constructor(
    private readonly config: SiigoConfig,
    private readonly fetchImpl: Fetch = fetch,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
    private readonly now: () => number = Date.now
  ) {}

  private async call(path: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      return await this.fetchImpl(`${BASE_URL}${path}`, { ...init, signal: controller.signal });
    } catch (err) {
      throw new SiigoError(
        controller.signal.aborted ? "Siigo tardó más de 2 minutos en responder." : `No se pudo conectar con Siigo: ${(err as Error).message}`,
        0
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private async authenticate(force = false): Promise<string> {
    // Renew 10 minutes before Siigo's 24 h expiry.
    if (!force && this.token && this.now() < this.tokenExpiresAt - 10 * 60_000) return this.token;
    const res = await this.call("/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Partner-Id": this.config.partnerId },
      body: JSON.stringify({ username: this.config.username, access_key: this.config.accessKey }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok || !body?.access_token) {
      const { message, errors } = describeSiigoErrors(res.status, body);
      throw new SiigoError(`Autenticación con Siigo: ${message}`, res.status, errors);
    }
    this.token = body.access_token as string;
    // Docs say "milliseconds" but the value (86400) is seconds: 24 h.
    this.tokenExpiresAt = this.now() + Number(body.expires_in ?? 86400) * 1000;
    return this.token;
  }

  async request<T = unknown>(method: "GET" | "POST" | "PUT" | "DELETE", path: string, opts: RequestOptions = {}): Promise<T> {
    const qs = Object.entries(opts.query ?? {})
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
      .join("&");
    const url = qs ? `${path}?${qs}` : path;

    let reauthed = false;
    for (let attempt = 0; ; attempt++) {
      const token = await this.authenticate();
      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "Partner-Id": this.config.partnerId,
        "Content-Type": "application/json",
      };
      if (opts.idempotencyKey && method === "POST") headers["Idempotency-Key"] = opts.idempotencyKey;

      const res = await this.call(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
      if (res.status === 401 && !reauthed) {
        reauthed = true;
        await this.authenticate(true);
        continue;
      }
      if ((res.status === 429 || res.status === 503 || res.status === 504) && attempt < MAX_RETRIES) {
        await this.sleep(2 ** attempt * 2000);
        continue;
      }
      const text = await res.text();
      const body = text ? safeJson(text) : null;
      if (!res.ok) {
        const { message, errors } = describeSiigoErrors(res.status, body);
        throw new SiigoError(message, res.status, errors);
      }
      return body as T;
    }
  }

  /** Every page of a list endpoint (Siigo pages of up to 100). */
  async listAll<T>(path: string, query: Record<string, string | number | undefined> = {}, maxPages = 50): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page <= maxPages; page++) {
      const res = await this.request<{ results?: T[]; pagination?: { total_results?: number; page_size?: number } }>("GET", path, {
        query: { ...query, page, page_size: 100 },
      });
      const results = res?.results ?? [];
      out.push(...results);
      const total = res?.pagination?.total_results ?? out.length;
      if (results.length === 0 || out.length >= total) break;
    }
    return out;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}

let shared: SiigoClient | null = null;

/** The app's client (one per server instance, so the token is reused). */
export function getSiigoClient(): SiigoClient {
  const config = siigoConfigFromEnv();
  if (!config) {
    throw new SiigoError("Siigo no está configurado: faltan SIIGO_USERNAME y SIIGO_ACCESS_KEY en las variables de entorno.", 0);
  }
  shared ??= new SiigoClient(config);
  return shared;
}

/** Idempotency-Key for a local record: ≤ 30 alphanumerics, stable across retries. */
export function idempotencyKey(prefix: string, id: string): string {
  return `${prefix}${id.replace(/[^A-Za-z0-9]/g, "")}`.slice(0, 30);
}

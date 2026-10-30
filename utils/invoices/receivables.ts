// Accounts receivable (cartera): what each client owes, by sede, split
// into overdue / due today / not yet due at a cutoff date. Balances come
// from Siigo (it holds every invoice and payment, also those made there).
// Pure functions, shared by the Cuentas por cobrar screen and its Excel.

export type ReceivableInvoice = {
  /** Siigo's invoice id. */
  id: string;
  /** FV-2-731 */
  name: string;
  client_id: string | null;
  customer_name: string;
  customer_identification: string | null;
  site_id: string | null;
  /** How the sede was found: the app invoice, the Siigo branch, the observations, or by hand. */
  site_source?: "app" | "branch" | "notes" | "manual" | null;
  issue_date: string;
  due_date: string | null;
  total: number;
  balance: number;
  /** The customer's Siigo branch (sucursal) it was issued to. */
  branch_office?: number;
};

export type ReceivableLine = {
  invoice: ReceivableInvoice;
  billed: number;
  /** Payments and credit notes so far (total − balance). */
  paid: number;
  balance: number;
  /** Days past due at the cutoff (0 = not overdue). */
  daysOverdue: number;
  bucket: "vencido" | "hoy" | "por_vencer";
};

export type Bucketed = { count: number; billed: number; paid: number; balance: number; vencido: number; hoy: number; por_vencer: number };

const round2 = (n: number) => Math.round(n * 100) / 100;
const empty = (): Bucketed => ({ count: 0, billed: 0, paid: 0, balance: 0, vencido: 0, hoy: 0, por_vencer: 0 });

function add(t: Bucketed, l: ReceivableLine) {
  t.count += 1;
  t.billed = round2(t.billed + l.billed);
  t.paid = round2(t.paid + l.paid);
  t.balance = round2(t.balance + l.balance);
  t[l.bucket] = round2(t[l.bucket] + l.balance);
}

/** The invoices with money owed, issued on or before the cutoff, by how due they are then. */
export function receivableLines(invoices: ReceivableInvoice[], cutoff: string): ReceivableLine[] {
  const out: ReceivableLine[] = [];
  for (const inv of invoices) {
    if (!(inv.balance > 0.5) || inv.issue_date > cutoff) continue;
    const due = inv.due_date ?? inv.issue_date;
    const days = Math.floor((Date.parse(`${cutoff}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);
    out.push({
      invoice: inv,
      billed: round2(inv.total),
      paid: round2(Math.max(0, inv.total - inv.balance)),
      balance: round2(inv.balance),
      daysOverdue: Math.max(0, days),
      bucket: days > 0 ? "vencido" : days === 0 ? "hoy" : "por_vencer",
    });
  }
  return out.sort((a, b) => (a.invoice.due_date ?? "").localeCompare(b.invoice.due_date ?? "") || a.invoice.name.localeCompare(b.invoice.name));
}

export type SiteGroup = { siteId: string | null; lines: ReceivableLine[]; totals: Bucketed };
export type ClientGroup = { clientId: string | null; name: string; identification: string | null; sites: SiteGroup[]; totals: Bucketed };

/** Lines grouped by client, then by sede (sedes in `siteOrder`, then "Sin sede"). */
export function groupReceivables(lines: ReceivableLine[], siteOrder: string[] = []): { clients: ClientGroup[]; totals: Bucketed } {
  const byClient = new Map<string, ClientGroup>();
  const totals = empty();
  for (const l of lines) {
    const key = l.invoice.client_id ?? `id:${l.invoice.customer_identification ?? l.invoice.customer_name}`;
    let c = byClient.get(key);
    if (!c) {
      c = { clientId: l.invoice.client_id, name: l.invoice.customer_name, identification: l.invoice.customer_identification, sites: [], totals: empty() };
      byClient.set(key, c);
    }
    const siteId = l.invoice.site_id ?? null;
    let s = c.sites.find((x) => x.siteId === siteId);
    if (!s) {
      s = { siteId, lines: [], totals: empty() };
      c.sites.push(s);
    }
    s.lines.push(l);
    add(s.totals, l);
    add(c.totals, l);
    add(totals, l);
  }
  const rank = (id: string | null) => (id === null ? Number.MAX_SAFE_INTEGER : siteOrder.indexOf(id) === -1 ? siteOrder.length : siteOrder.indexOf(id));
  const clients = [...byClient.values()].sort((a, b) => b.totals.balance - a.totals.balance);
  for (const c of clients) c.sites.sort((a, b) => rank(a.siteId) - rank(b.siteId));
  return { clients, totals };
}

const compact = (v: string | null | undefined) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * The sede an invoice's observations name ("Pedido … · FABRICATO" →
 * "Smart Fit Fabricato"): a part of the observations found inside exactly
 * one sede's name. null when none or several match.
 */
export function siteFromObservations<T extends { id: string; name: string }>(observations: string | null | undefined, sites: T[]): T | null {
  const parts = String(observations ?? "").split(/·|\n/).map(compact).filter((p) => p.length >= 4 && !p.startsWith("PEDIDOCAFEAMANTTI"));
  for (const p of parts) {
    const found = sites.filter((s) => compact(s.name).includes(p));
    if (found.length === 1) return found[0];
  }
  return null;
}

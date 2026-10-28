// Pure helpers behind the orders board: due-date states, grouping by
// status, display names and contact links. Kept out of the component so the
// rules can be tested.

import { bogotaToday as bogotaTodayAt, orderCustomer } from "@/utils/orders/pendingDeliveries";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type BoardOrder = {
  id: string;
  status: string;
  total_amount: number;
  created_at: string;
  updated_at?: string | null;
  status_changed_at?: string | null;
  delivered_at?: string | null;
  delivery_due_date?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  shipping_info?: any;
  siigo_invoice?: string | null;
  client?: { name: string | null; document_number?: string | null } | { name: string | null; document_number?: string | null }[] | null;
  /** The client's sede the order is for. */
  site_name?: string | null;
  order_items?: any[];
  [key: string]: any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export const UNDELIVERED = new Set(["pending", "paid", "processing", "shipped"]);

/** One-tap "advance" on mobile (by board column), where there is no drag and drop. */
export const NEXT_STATUS: Record<string, string> = {
  processing: "shipped",
  shipped: "delivered",
};

export const isPaid = (o: { status: string; payment_status?: string | null }) =>
  o.payment_status ? o.payment_status === "paid" : ["paid", "processing", "shipped", "delivered"].includes(o.status);

/**
 * The board column of an order: Preparando, Enviado, Entregado (and
 * Cancelado, hidden by default). Payment is not a column: each card shows
 * whether it is paid. New orders ('pending', and the old 'paid' stage)
 * start in Preparando.
 */
export function boardColumn(o: { status: string; payment_status?: string | null }): string {
  if (o.status === "pending" || o.status === "paid") return "processing";
  return o.status;
}

/**
 * A delivered order still owes a factura when its client has a NIT or cédula
 * and it has a value but no Siigo invoice yet. Consumidor final orders (no
 * document) and courtesy orders ($0) don't.
 */
export function needsInvoice(o: BoardOrder): boolean {
  const client = Array.isArray(o.client) ? o.client[0] : o.client;
  return !!client?.document_number?.trim() && Number(o.total_amount || 0) > 0 && !siigoOf(o);
}

/** Delivered, paid and invoiced (when it needs it): nothing left to do, so it leaves the board. */
export function isClosed(o: BoardOrder): boolean {
  return o.status === "delivered" && isPaid(o) && !needsInvoice(o);
}

/** When the order was delivered (old ones have no delivered_at). */
export const deliveredOn = (o: BoardOrder) => o.delivered_at || o.status_changed_at || o.updated_at || o.created_at;

/** Today in Colombia (UTC-5) as YYYY-MM-DD. */
export const bogotaToday = (now = Date.now()) => bogotaTodayAt(new Date(now));

export function daysBetween(fromIso: string, to = Date.now()) {
  return Math.max(0, Math.floor((to - new Date(fromIso).getTime()) / 86400000));
}

export function relDays(iso: string, now = Date.now()) {
  const d = daysBetween(iso, now);
  return d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} d`;
}

/** "4 de oct" for a YYYY-MM-DD date, without UTC shifting the day. */
export function fmtDay(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

export const customerOf = (o: BoardOrder) => orderCustomer(o);

export function siigoOf(o: BoardOrder): string | null {
  return o.siigo_invoice || o.shipping_info?.siigo_invoice || null;
}

/** Due-date state of an order that is not delivered yet. */
export function dueState(o: BoardOrder, today: string): "overdue" | "today" | "soon" | "later" | null {
  if (!o.delivery_due_date || !UNDELIVERED.has(o.status)) return null;
  if (o.delivery_due_date < today) return "overdue";
  if (o.delivery_due_date === today) return "today";
  const diff = (new Date(o.delivery_due_date).getTime() - new Date(today).getTime()) / 86400000;
  return diff <= 2 ? "soon" : "later";
}

/** wa.me link for a customer phone; 10-digit Colombian mobiles get +57. */
export function waLink(phone: string | null | undefined) {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `https://wa.me/${digits.length === 10 ? `57${digits}` : digits}`;
}

/** Order of the Entregado column: unpaid first, then missing a factura, then closed. */
const deliveredRank = (o: BoardOrder) => (!isPaid(o) ? 0 : needsInvoice(o) ? 1 : 2);

/**
 * Orders per board column. Unknown statuses land in the first column so no
 * order disappears. The board is what is left to do: closed orders (delivered,
 * paid, invoiced) are hidden unless `showClosed`, while unpaid or uninvoiced
 * deliveries stay however old they are. Inside a column: soonest promised
 * delivery first (overdue on top), then oldest; in Entregado, the oldest
 * pending delivery first and the latest closed one first.
 */
export function groupOrdersByStatus(
  orders: BoardOrder[],
  columns: string[],
  opts: { showClosed?: boolean } = {}
): Map<string, BoardOrder[]> {
  const map = new Map<string, BoardOrder[]>(columns.map((c) => [c, []]));
  for (const o of orders) {
    if (!opts.showClosed && isClosed(o)) continue;
    (map.get(boardColumn(o)) ?? map.get(columns[0]))!.push(o);
  }
  for (const [col, list] of map) {
    list.sort((a, b) => {
      if (col === "delivered") {
        const ra = deliveredRank(a);
        const rb = deliveredRank(b);
        if (ra !== rb) return ra - rb;
        return ra === 2 ? deliveredOn(b).localeCompare(deliveredOn(a)) : deliveredOn(a).localeCompare(deliveredOn(b));
      }
      const da = a.delivery_due_date || "9999";
      const db = b.delivery_due_date || "9999";
      return da === db ? a.created_at.localeCompare(b.created_at) : da.localeCompare(db);
    });
  }
  return map;
}

// Orders still waiting to be delivered, and the WhatsApp summary of them.
// Shared by the admin "send now" action and the scheduled cron route, which
// pass their own Supabase client (user session vs. service role).

/** Statuses of an order that still has to reach the customer. */
export const UNDELIVERED_STATUSES = ['pending', 'paid', 'processing', 'shipped'] as const;

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente de pago',
  paid: 'Pagado',
  processing: 'Preparando',
  shipped: 'Enviado',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
};

export type PendingOrder = {
  id: string;
  status: string;
  total_amount: number;
  created_at: string;
  delivery_due_date: string | null;
  customer: string;
  city: string | null;
  daysOpen: number;
  overdue: boolean;
};

/** Today in Colombia (UTC-5, no DST) as YYYY-MM-DD. */
export function bogotaToday(now = new Date()): string {
  return new Date(now.getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Display name for an order: CRM client, then recipient, then email. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function orderCustomer(order: any): string {
  const client = Array.isArray(order.client) ? order.client[0] : order.client;
  return (
    client?.name ||
    order.shipping_info?.recipient_name ||
    order.contact_email ||
    'Sin cliente'
  );
}

export async function getPendingDeliveries(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  now = new Date()
): Promise<PendingOrder[]> {
  const { data, error } = await supabase
    .from('orders')
    .select('id, status, total_amount, created_at, delivery_due_date, contact_email, shipping_info, client:client_id ( name )')
    .in('status', UNDELIVERED_STATUSES as unknown as string[])
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const today = bogotaToday(now);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data ?? []).map((o: any) => {
    const daysOpen = Math.max(0, Math.floor((now.getTime() - new Date(o.created_at).getTime()) / 86400000));
    return {
      id: o.id,
      status: o.status,
      total_amount: Number(o.total_amount) || 0,
      created_at: o.created_at,
      delivery_due_date: o.delivery_due_date ?? null,
      customer: orderCustomer(o),
      city: o.shipping_info?.city ?? null,
      daysOpen,
      overdue: !!o.delivery_due_date && o.delivery_due_date < today,
    };
  });
}

const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const shortDate = (d: string) => {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(y, m - 1, day).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
};

/**
 * WhatsApp text: overdue first, then by status, oldest first inside each.
 * Kept short — at most `limit` orders listed, the rest summarised.
 */
export function buildPendingDeliveriesMessage(orders: PendingOrder[], limit = 25): string {
  if (orders.length === 0) {
    return '☕ Café Amantti — No hay órdenes pendientes por entregar. ¡Todo al día!';
  }

  const line = (o: PendingOrder) => {
    const due = o.delivery_due_date
      ? o.overdue
        ? ` · ⚠️ vencida ${shortDate(o.delivery_due_date)}`
        : ` · entrega ${shortDate(o.delivery_due_date)}`
      : '';
    return `• #${o.id.split('-')[0]} ${o.customer}${o.city ? ` (${o.city})` : ''} · ${cop(o.total_amount)} · ${o.daysOpen}d${due}`;
  };

  const overdue = orders.filter((o) => o.overdue);
  const rest = orders.filter((o) => !o.overdue);
  const parts: string[] = [
    `☕ Café Amantti — ${orders.length} ${orders.length === 1 ? 'orden pendiente' : 'órdenes pendientes'} por entregar` +
      (overdue.length ? ` (${overdue.length} atrasada${overdue.length === 1 ? '' : 's'})` : ''),
  ];

  let listed = 0;
  const section = (title: string, list: PendingOrder[]) => {
    if (list.length === 0 || listed >= limit) return;
    parts.push('', `*${title}* (${list.length})`);
    for (const o of list) {
      if (listed >= limit) break;
      parts.push(line(o));
      listed++;
    }
  };

  section('Atrasadas', overdue);
  for (const status of UNDELIVERED_STATUSES) {
    section(ORDER_STATUS_LABELS[status], rest.filter((o) => o.status === status));
  }
  if (orders.length > listed) parts.push('', `…y ${orders.length - listed} más en el tablero.`);

  return parts.join('\n');
}

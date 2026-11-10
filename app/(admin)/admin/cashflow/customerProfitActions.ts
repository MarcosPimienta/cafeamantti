'use server';

import { createClient } from '@/utils/supabase/server';
import { checkIsAdmin, getCostingData } from '../../actions';
import { orderCustomer } from '@/utils/orders/pendingDeliveries';
import { orderIsSold } from '@/utils/orders/stock';
import { orderTaxTotals, pricesIncludeTax } from '@/utils/orders/tax';
import { dropVoided, lineBase, linesBase, siigoDocBase, type SiigoSalesDoc } from '@/utils/cashflow/accrual';
import { expenseGroup, monthBefore } from '@/utils/cashflow/incomeStatement';
import { customerKey, customerProfit, type CustomerDoc, type CustomerMachines, type CustomerProfit, type UnitCostKg } from '@/utils/cashflow/customerProfit';
import { getSiigoClient, siigoConfigFromEnv } from '@/utils/siigo/api';
import { matchInventoryItem } from '@/utils/siigo/parser';
import type { InventoryLookupItem } from '@/utils/siigo/types';
import { monthBounds, summarizeMonthlyPL } from './calculations';

export type CustomerProfitReport = CustomerProfit & {
  /** First and last month of the period ('YYYY-MM'). */
  from: string;
  to: string;
  /** Selling and admin expenses of the period: not split among customers. */
  sharedExpenses: number;
  salesFromSiigo: boolean;
};

type SiigoDoc = SiigoSalesDoc;

/** Profitability by customer over `months` months ending in month/year. */
export async function getCustomerProfit(month: number, year: number, months: 1 | 3 | 6 = 1): Promise<CustomerProfitReport> {
  if (!(await checkIsAdmin())) throw new Error('Unauthorized');
  const supabase = await createClient();
  const to = `${year}-${String(month).padStart(2, '0')}`;
  const from = monthBefore(to, months - 1);
  const start = `${from}-01`;
  const { period_end: end } = monthBounds(month, year);
  const lastDay = (() => { const t = new Date(`${end}T12:00:00Z`); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); })();
  const inPeriod = (d: string) => !!d && d >= start && d < end;
  const n = (v: unknown) => Number(v ?? 0) || 0;
  const day = (v: unknown) => String(v ?? '').slice(0, 10);

  const [invRes, clientRes, appInvRes, orderRes, comodatoRes, capexRes, expRes, costing] = await Promise.all([
    supabase.from('inventory').select('id, product_code, product_name, siigo_code, unit, current_stock'),
    supabase.from('clients').select('id, name, document_number'),
    supabase.from('sales_invoices').select('order_id, status, lines, shipping, issue_date, created_at, siigo_name, customer_name, order:order_id ( client_id )').neq('status', 'anulada'),
    supabase.from('orders').select('id, status, payment_status, paid_at, delivered_at, created_at, source, total_amount, prices_include_tax, siigo_invoice, client_id, shipping_info, contact_email, client:client_id ( name ), order_items ( inventory_id, price_at_time, quantity, tax_rate, product_id )').neq('status', 'cancelled'),
    supabase.from('comodato_assignments').select('client_id, start_date, end_date, monthly_commitment_kg'),
    supabase.from('cashflow_expenses').select('net_amount, depreciation_months, created_at, in_service_date, residual_value, asset_use, cashflow:cashflow_id!inner ( date )').eq('expense_type', 'CAPEX').lt('cashflow.date', end),
    supabase.from('cashflow_expenses').select('category, net_amount, cashflow:cashflow_id!inner ( date )').eq('expense_type', 'OPEX').gte('cashflow.date', start).lt('cashflow.date', end),
    getCostingData().catch(() => null),
  ]);
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const rows = (r: { data: unknown }) => (r.data ?? []) as any[];
  const one = (v: any) => (Array.isArray(v) ? v[0] : v);

  const inventory = rows(invRes) as InventoryLookupItem[];
  const clients = rows(clientRes) as { id: string; name: string; document_number: string | null }[];
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const nameByNit = new Map(clients.map((c) => [String(c.document_number ?? '').replace(/\D/g, '').slice(0, 9), c.name]));
  const keyOfClient = (id: string | null | undefined, fallback: string) => {
    const c = id ? clientById.get(id) : undefined;
    return { key: customerKey(c?.document_number, c?.name ?? fallback), name: c?.name ?? fallback };
  };
  const named = (key: string, name: string) => (key === 'consumidor-final' ? 'Consumidor final' : name);

  const docs: CustomerDoc[] = [];

  // ── Siigo: every invoice and credit note, as in the income statement ──
  let siigoOk = false;
  if (siigoConfigFromEnv()) {
    try {
      const siigo = getSiigoClient();
      const [invs, notes] = await Promise.all([
        siigo.listAll<SiigoDoc>('/v1/invoices', { date_start: start, date_end: lastDay }),
        siigo.listAll<SiigoDoc>('/v1/credit-notes', { date_start: start, date_end: lastDay }),
      ]);
      const inWindow = (d: SiigoDoc) => inPeriod(day(d.date));
      const kept = dropVoided(invs.filter(inWindow), notes.filter(inWindow));
      const push = (d: SiigoDoc, kind: 'factura' | 'nota') => {
        const base = siigoDocBase(d);
        if (!base) return;
        const nit = d.customer?.identification ?? null;
        const key = customerKey(nit, nit ?? 'sin nit');
        const short = String(nit ?? '').replace(/\D/g, '').slice(0, 9);
        docs.push({
          customerKey: key,
          customer: named(key, nameByNit.get(short) ?? (nit ? `NIT ${nit}` : 'Sin cliente')),
          date: day(d.date),
          doc: d.name ?? (kind === 'nota' ? 'Nota crédito' : 'Factura'),
          kind,
          base,
          lines: (d.items ?? []).map((i) => ({
            inventory_id: matchInventoryItem(String(i.code ?? ''), String(i.description ?? ''), inventory)?.id ?? null,
            description: String(i.description ?? i.code ?? ''),
            quantity: n(i.quantity),
            base: n(i.quantity) * n(i.price),
          })),
        });
      };
      kept.invoices.forEach((d) => push(d, 'factura'));
      kept.notes.forEach((d) => push(d, 'nota'));
      siigoOk = true;
    } catch (err) {
      console.error('getCustomerProfit: Siigo', err);
    }
  }

  // ── App invoices Siigo doesn't have yet (all of them without Siigo) ──
  const invoicedOrders = new Set<string>();
  for (const inv of rows(appInvRes)) {
    invoicedOrders.add(inv.order_id);
    const date = day(inv.issue_date ?? inv.created_at);
    if ((siigoOk && inv.status === 'emitida') || !inPeriod(date)) continue;
    const { key, name } = keyOfClient(one(inv.order)?.client_id, inv.customer_name ?? 'Sin cliente');
    docs.push({
      customerKey: key, customer: named(key, name), date, doc: inv.siigo_name ?? 'Factura por enviar', kind: 'factura',
      base: linesBase(inv.lines, inv.shipping),
      lines: (inv.lines ?? []).map((l: any) => ({ inventory_id: l.inventory_id ?? null, description: l.name ?? '', quantity: n(l.quantity), base: lineBase(l) })),
    });
  }

  // ── Orders sold without invoice (web, consumidor final) ──
  for (const o of rows(orderRes)) {
    if (invoicedOrders.has(o.id) || o.siigo_invoice || !orderIsSold(o) || n(o.total_amount) <= 0) continue;
    const date = day(o.delivered_at ?? o.paid_at ?? o.created_at);
    if (!inPeriod(date)) continue;
    const incl = pricesIncludeTax(o.prices_include_tax, undefined);
    const lines = (o.order_items ?? []).map((it: any) => ({
      inventory_id: it.inventory_id ?? null,
      description: String(it.product_id ?? ''),
      quantity: n(it.quantity),
      base: orderTaxTotals([{ price: n(it.price_at_time), quantity: n(it.quantity), tax_rate: it.tax_rate }], incl).subtotal,
    }));
    const web = o.source === 'web';
    const { key, name } = web && !o.client_id ? { key: 'web', name: 'Ventas web' } : keyOfClient(o.client_id, orderCustomer(o));
    docs.push({
      customerKey: key, customer: named(key, name), date, doc: `${web ? 'Venta web' : 'Pedido'} #${String(o.id).slice(0, 8)}`, kind: web ? 'web' : 'pedido',
      base: lines.reduce((s: number, l: { base: number }) => s + l.base, 0) || n(o.total_amount), lines,
    });
  }

  // ── Comodato: machines held in the period and their depreciation ──
  const machines = new Map<string, CustomerMachines>();
  for (const a of rows(comodatoRes)) {
    if (day(a.start_date) >= end || (a.end_date && day(a.end_date) < start)) continue;
    const { key, name } = keyOfClient(a.client_id, 'Cliente');
    const m = machines.get(key) ?? { customerKey: key, customer: named(key, name), machines: 0, commitmentKg: null };
    m.machines += 1;
    if (a.monthly_commitment_kg != null) m.commitmentKg = (m.commitmentKg ?? 0) + n(a.monthly_commitment_kg) * months;
    machines.set(key, m);
  }
  const capex = rows(capexRes).map(({ cashflow, ...a }) => ({ ...a, purchase_date: one(cashflow)?.date ?? null }));
  let depreciation = 0;
  for (let i = months - 1; i >= 0; i--) {
    const [y, mo] = monthBefore(to, i).split('-').map(Number);
    const { period_start, period_end } = monthBounds(mo, y);
    depreciation += summarizeMonthlyPL({ period_start, period_end, manualIncomes: [], webOrders: [], cogsExpenses: [], inventoryConsumptions: [], opexExpenses: [], capexItems: capex, paidExpenses: [] }).depreciation_by_use.comodato ?? 0;
  }

  const sharedExpenses = rows(expRes)
    .filter((e) => ['selling', 'admin'].includes(expenseGroup(e.category ?? '')))
    .reduce((s, e) => s + n(e.net_amount), 0);
  /* eslint-enable @typescript-eslint/no-explicit-any */

  const costs = new Map<string, UnitCostKg>(Object.entries(costing?.unitCosts ?? {}));
  const result = customerProfit(docs, costs, { machines: [...machines.values()], depreciation });
  return { ...result, from, to, sharedExpenses: Math.round(sharedExpenses * 100) / 100, salesFromSiigo: siigoOk };
}

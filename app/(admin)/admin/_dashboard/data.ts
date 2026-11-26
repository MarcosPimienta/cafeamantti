// What the dashboard reads, loaded once per request: every section asks for
// what it needs and React's cache() shares the call. Each loader returns
// null when its source fails, so one broken source (Siigo down, a missing
// migration) only empties its own cards.

import { cache } from "react";
import { createClient } from "@/utils/supabase/server";
import { checkIsAdmin, getRecentOrders } from "../../actions";
import { getIncomeStatement, getMissingCashflowDays } from "../cashflow/actions";
import { getReceivables } from "../receivables/actions";
import { RECORDS_RELIABLE_FROM } from "@/utils/invoices/receivables";
import { getLiabilities } from "../liabilities/actions";
import { getComodatosData } from "../comodatos/actions";
import { getPendingDeliveries, bogotaToday } from "@/utils/orders/pendingDeliveries";
import { stageTotals } from "../inventory/stages";
import { summarize } from "@/utils/loans/ledger";
import {
  comodatoClients,
  greenCoffee,
  productionSummary,
  receivablesAging,
  sameDayPrevMonth,
  type Batch,
} from "@/utils/dashboard/summary";

async function safe<T>(label: string, run: () => Promise<T>): Promise<T | null> {
  try {
    return await run();
  } catch (err) {
    console.error(`dashboard: ${label}`, err);
    return null;
  }
}

const admin = cache(async () => {
  if (!(await checkIsAdmin())) throw new Error("Unauthorized");
  return createClient();
});

export const today = cache(async () => bogotaToday());

/** This month's income statement and the five before it. */
export const loadStatement = cache(async () => {
  const t = await today();
  const [y, m] = t.split("-").map(Number);
  return safe("estado de resultados", () => getIncomeStatement(m, y));
});

/** The overdue-invoices alerts split at this issue date: from here on the platform's records are reliable. */
export const OVERDUE_ALERT_SINCE = RECORDS_RELIABLE_FROM;

export const loadReceivables = cache(async () => {
  const t = await today();
  return safe("cartera", async () => {
    const r = await getReceivables();
    if (r.error) throw new Error(r.error);
    const invoices = r.invoices.map((i) => ({ ...i, due_date: i.due_date ?? i.issue_date }));
    return {
      ...receivablesAging(invoices, t),
      sinceStart: receivablesAging(invoices.filter((i) => (i.issue_date ?? "") >= OVERDUE_ALERT_SINCE), t),
      // Issued before the platform started: loaded history still to clean up.
      beforeStart: receivablesAging(invoices.filter((i) => (i.issue_date ?? "") < OVERDUE_ALERT_SINCE), t),
    };
  });
});

export const loadDebts = cache(async () => {
  const t = await today();
  return safe("pasivos", async () => {
    const l = await getLiabilities();
    if (!l.migrationApplied) return null;
    const s = summarize(l.loans, l.movements, t);
    return { socios: s.socios, terceros: s.terceros, proveedores: l.payables };
  });
});

/** The last bank statement's closing balance, and the movements of every statement not reconciled yet. */
export const loadBank = cache(async () =>
  safe("banco", async () => {
    const supabase = await admin();
    const [{ data: statements, error }, { count, error: e2 }] = await Promise.all([
      supabase.from("bank_statements").select("bank, period_month, closing_balance").order("period_month", { ascending: false }).limit(1),
      supabase.from("bank_lines").select("id", { count: "exact", head: true }).is("match_id", null),
    ]);
    if (error) return null; // before the bank migration
    if (e2) throw e2;
    const last = (statements ?? [])[0] as { bank: string; period_month: string; closing_balance: number } | undefined;
    return { last: last ? { ...last, closing_balance: Number(last.closing_balance) } : null, pending: count ?? 0 };
  })
);

/** Production of the month and how long the green coffee lasts. */
export const loadOperation = cache(async () => {
  const t = await today();
  return safe("operación", async () => {
    const supabase = await admin();
    const prevStart = `${sameDayPrevMonth(t).slice(0, 7)}-01`;
    const windowStart = new Date(Date.parse(`${t}T00:00:00Z`) - 56 * 86_400_000).toISOString().slice(0, 10);
    const since = prevStart < windowStart ? prevStart : windowStart;
    const [{ data: inv, error: e1 }, { data: batches, error: e2 }] = await Promise.all([
      supabase.from("inventory").select("product_code, category, current_stock").eq("category", "cafe"),
      supabase
        .from("production_batches")
        .select("process_type, input_quantity_kg, output_quantity_kg, movement_date")
        .eq("era", "v2")
        .in("process_type", ["trilla", "tostion"])
        .gte("movement_date", since),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const list = ((batches ?? []) as Batch[]).map((b) => ({ ...b, movement_date: String(b.movement_date).slice(0, 10) }));
    const stock = stageTotals((inv ?? []) as { product_code: string; category: string; current_stock: number }[]);
    return { production: productionSummary(list, t), green: greenCoffee(stock, list, t), stock };
  });
});

export const loadPendingOrders = cache(async () =>
  safe("órdenes por despachar", async () => {
    const all = await getPendingDeliveries(await admin());
    // Shipped ones are already on their way: only what still has to leave.
    const toShip = all.filter((o) => o.status !== "shipped");
    return { count: toShip.length, late: toShip.filter((o) => o.overdue || o.daysOpen > 3).length, total: toShip.reduce((s, o) => s + o.total_amount, 0) };
  })
);

export const loadComodatos = cache(async () =>
  safe("comodatos", async () => {
    const d = await getComodatosData();
    if (!d.migrated) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return comodatoClients(d.units as any, d.kgLast30ByClient);
  })
);

export const loadSubscriptionsAndQuotes = cache(async () => {
  const t = await today();
  return safe("suscripciones y cotizaciones", async () => {
    const supabase = await admin();
    const [{ data: subs, error: e1 }, { data: quotes, error: e2 }] = await Promise.all([
      supabase.from("subscriptions").select("status, created_at"),
      supabase.from("quotes").select("status, total_amount").in("status", ["Borrador", "Enviada"]),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const s = (subs ?? []) as { status: string; created_at: string }[];
    const q = (quotes ?? []) as { status: string; total_amount: number }[];
    const sent = q.filter((x) => x.status === "Enviada");
    return {
      activeSubs: s.filter((x) => x.status === "active").length,
      newSubs: s.filter((x) => x.status === "active" && String(x.created_at).slice(0, 7) === t.slice(0, 7)).length,
      sentQuotes: sent.length,
      sentQuotesTotal: sent.reduce((sum, x) => sum + Number(x.total_amount || 0), 0),
      draftQuotes: q.length - sent.length,
    };
  });
});

export const loadMissingDays = cache(async () => safe("días sin registrar", () => getMissingCashflowDays()));

export const loadRecentOrders = cache(async () => safe("órdenes recientes", () => getRecentOrders()));

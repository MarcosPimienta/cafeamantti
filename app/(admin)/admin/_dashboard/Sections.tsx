// Sections of the admin dashboard. Each one is an async server component
// that waits only for its own sources, so the page streams in pieces
// (Siigo, behind sales and receivables, is the slow one).

import React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowUpRight, Coffee, HandCoins, Handshake, Scale, Truck, CheckCircle2, type LucideIcon } from "lucide-react";
import { getLocale, getTr } from "@/utils/i18n/server";
import { orderCustomer } from "@/utils/orders/pendingDeliveries";
import {
  AGING_LABELS,
  copShort,
  netSalesThrough,
  pctChange,
  sameDayPrevMonth,
  topCustomers,
  type ComodatoStatus,
} from "@/utils/dashboard/summary";
import SalesCostChart, { type ChartMonth } from "./SalesCostChart";
import {
  loadBank,
  loadComodatos,
  loadDebts,
  loadMissingDays,
  loadOperation,
  loadPendingOrders,
  loadReceivables,
  loadRecentOrders,
  loadStatement,
  loadSubscriptionsAndQuotes,
  today,
} from "./data";

type Tone = "up" | "down" | "muted";
const TONE: Record<Tone, string> = { up: "text-green-700", down: "text-red-700", muted: "text-foreground/50" };

const card = "bg-white rounded-3xl border border-foreground/5 shadow-sm";
const kg = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })} kg`;
const pct = (n: number) => `${n.toLocaleString("es-CO", { maximumFractionDigits: 1 })}%`;

async function monthName(ym: string, style: "short" | "long" = "long") {
  const locale = (await getLocale()) === "en" ? "en-US" : "es-CO";
  const [y, m] = ym.split("-").map(Number);
  const s = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(locale, { month: style, timeZone: "UTC" }).replace(".", "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Kpi({ label, value, hint, tone = "muted", href }: { label: string; value: string; hint?: React.ReactNode; tone?: Tone; href?: string }) {
  const body = (
    <>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/40">{label}</p>
      <p className="text-2xl font-serif mt-1.5 tabular-nums">{value}</p>
      {hint && <p className={`text-xs font-bold mt-1.5 ${TONE[tone]}`}>{hint}</p>}
    </>
  );
  return href ? (
    <Link href={href} className={`${card} p-5 block hover:border-[#C59F59]/40 transition-colors`}>{body}</Link>
  ) : (
    <div className={`${card} p-5`}>{body}</div>
  );
}

async function Unavailable({ what, className = "" }: { what: string; className?: string }) {
  const tr = await getTr();
  return (
    <div className={`${card} p-5 text-sm text-foreground/50 flex items-center gap-2 ${className}`}>
      <AlertTriangle className="w-4 h-4 shrink-0" />
      {tr("No se pudo cargar: {what}", { what })}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 mt-2">
      <h2 className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-[#A98C5D]">{children}</h2>
      <div className="flex-1 h-px bg-[#C59F59]/25" />
    </div>
  );
}

export function Skeleton({ className }: { className: string }) {
  return <div className={`${card} animate-pulse bg-foreground/[0.03] ${className}`} />;
}

// ─────────────────────────────────────────────────────────────
// Alerts
// ─────────────────────────────────────────────────────────────

type Alert = { tone: "amber" | "red" | "blue"; Icon: LucideIcon; title: string; detail: string; href: string };
const ALERT_TONE = {
  amber: "bg-amber-50 border-amber-300 text-amber-900 [&_.ic]:bg-amber-500",
  red: "bg-red-50 border-red-300 text-red-900 [&_.ic]:bg-red-500",
  blue: "bg-blue-50 border-blue-300 text-blue-900 [&_.ic]:bg-blue-500",
};

export async function AlertsStrip({ legacy = false }: { legacy?: boolean }) {
  const tr = await getTr();
  const [missing, aging, op, pending, bank, comodatos] = await Promise.all([
    loadMissingDays(),
    loadReceivables(),
    loadOperation(),
    loadPendingOrders(),
    loadBank(),
    loadComodatos(),
  ]);
  const alerts: Alert[] = [];
  if (missing?.length)
    alerts.push({ tone: "amber", Icon: AlertTriangle, href: "/admin/cashflow", title: tr("Días sin registrar: {n}", { n: missing.length }), detail: tr("Flujo de Caja · último pendiente {date}", { date: missing[missing.length - 1] }) });
  // Overdue invoices of the period on screen: from Sep 2026, or the archive before it.
  const overdue = legacy ? aging?.beforeStart : aging?.sinceStart;
  if (overdue?.overdueCount)
    alerts.push({
      tone: legacy ? "amber" : "red",
      Icon: HandCoins,
      href: legacy ? "/admin/receivables?datos=anteriores" : "/admin/receivables",
      title: tr("Facturas vencidas: {n}", { n: overdue.overdueCount }),
      detail: legacy
        ? tr("{amount} · antes de sep 2026 · la más antigua lleva {days} días", { amount: copShort(overdue.overdue), days: overdue.oldestOverdueDays })
        : tr("{amount} · desde sep 2026 · la más antigua lleva {days} días", { amount: copShort(overdue.overdue), days: overdue.oldestOverdueDays }),
    });
  if (op && op.green.weeksLeft !== null && op.green.weeksLeft < 4)
    alerts.push({ tone: "amber", Icon: Coffee, href: "/admin/inventory", title: tr("Café verde para {w} semanas", { w: op.green.weeksLeft.toLocaleString("es-CO", { maximumFractionDigits: 1 }) }), detail: tr("{kg} disponibles al ritmo de tostión actual", { kg: kg(op.green.usableKg) }) });
  if (pending?.late)
    alerts.push({ tone: "amber", Icon: Truck, href: "/admin/orders", title: tr("Órdenes atrasadas: {n}", { n: pending.late }), detail: tr("Más de 3 días sin despachar o con la entrega vencida") });
  const low = (comodatos ?? []).filter((c) => c.status === "bajo");
  if (low.length)
    alerts.push({ tone: "red", Icon: Handshake, href: "/admin/comodatos", title: tr("Comodatos bajo el mínimo: {n}", { n: low.length }), detail: low.slice(0, 2).map((c) => c.name).join(", ") + (low.length > 2 ? "…" : "") });
  if (bank?.pending)
    alerts.push({ tone: "blue", Icon: Scale, href: "/admin/bank", title: tr("Movimientos sin conciliar: {n}", { n: bank.pending }), detail: tr("Conciliación bancaria") });

  if (!alerts.length)
    return (
      <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border border-green-200 bg-green-50 text-green-900 text-sm font-bold">
        <CheckCircle2 className="w-5 h-5 text-green-600" />
        {tr("Todo al día: no hay pendientes urgentes.")}
      </div>
    );
  return (
    <div className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(250px,1fr))]">
      {alerts.map((a) => (
        <Link key={a.href + a.title} href={a.href} className={`group flex items-center gap-3 px-4 py-3 rounded-2xl border-[1.5px] hover:shadow-md transition-shadow ${ALERT_TONE[a.tone]}`}>
          <span className="ic w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white">
            <a.Icon className="w-[18px] h-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <b className="block text-sm">{a.title}</b>
            <span className="block text-[11px] opacity-80 truncate">{a.detail}</span>
          </span>
          <ArrowUpRight className="w-4 h-4 opacity-50 group-hover:opacity-100 shrink-0" />
        </Link>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Finanzas
// ─────────────────────────────────────────────────────────────

export async function FinanceKpis({ legacy = false }: { legacy?: boolean }) {
  const tr = await getTr();
  const [t, statement, aging, bank, debts] = await Promise.all([today(), loadStatement(), loadReceivables(), loadBank(), loadDebts()]);
  const cur = statement?.months.at(-1)?.statement;
  const prev = statement?.months.at(-2);
  const prevName = prev ? await monthName(prev.month) : "";

  let salesKpi: React.ReactNode = <Unavailable what={tr("ventas")} />;
  let marginKpi: React.ReactNode = <Unavailable what={tr("margen")} />;
  let resultKpi: React.ReactNode = <Unavailable what={tr("resultado")} />;
  if (cur && prev) {
    const items = (s: typeof cur, key: "sales" | "deductions") => s.lines.find((l) => l.key === key)?.items ?? [];
    const prevSoFar = netSalesThrough(items(prev.statement, "sales"), items(prev.statement, "deductions"), sameDayPrevMonth(t));
    const ch = pctChange(cur.netSales, prevSoFar);
    salesKpi = (
      <Kpi
        label={tr("Ventas del mes")}
        value={copShort(cur.netSales)}
        tone={ch === null ? "muted" : ch >= 0 ? "up" : "down"}
        hint={ch === null ? tr("Sin ventas a esta altura de {month}", { month: prevName }) : tr("{arrow} {pct} vs mismo día de {month}", { arrow: ch >= 0 ? "▲" : "▼", pct: pct(Math.abs(ch)), month: prevName })}
        href="/admin/cashflow"
      />
    );
    const pts = cur.grossMarginPct - prev.statement.grossMarginPct;
    marginKpi = (
      <Kpi
        label={tr("Margen bruto")}
        value={cur.netSales ? pct(cur.grossMarginPct) : "—"}
        tone={!cur.netSales || !prev.statement.netSales ? "muted" : pts >= 0 ? "up" : "down"}
        hint={prev.statement.netSales ? tr("{month}: {pct}", { month: prevName, pct: pct(prev.statement.grossMarginPct) }) : undefined}
        href="/admin/cashflow"
      />
    );
    resultKpi = (
      <Kpi
        label={tr("Resultado del mes")}
        value={copShort(cur.result)}
        tone={cur.result >= 0 ? "up" : "down"}
        hint={cur.breakEven !== null ? tr("Equilibrio: vender {amount}", { amount: copShort(cur.breakEven) }) : tr("El café vendido no deja margen")}
        href="/admin/cashflow"
      />
    );
  }

  const bankKpi = bank?.last ? (
    <Kpi label={tr("Saldo en banco")} value={copShort(bank.last.closing_balance)} hint={tr("Extracto {bank} · {month}", { bank: bank.last.bank, month: await monthName(bank.last.period_month.slice(0, 7)) })} href="/admin/bank" />
  ) : bank ? (
    <Kpi label={tr("Saldo en banco")} value="—" hint={tr("Carga el extracto del banco")} href="/admin/bank" />
  ) : (
    <Unavailable what={tr("banco")} />
  );

  return (
    <div className="grid gap-4 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      {salesKpi}
      {marginKpi}
      {resultKpi}
      {bankKpi}
      {aging ? (
        <Kpi
          label={legacy ? tr("Por cobrar antes de sep 2026") : tr("Por cobrar desde sep 2026")}
          value={copShort((legacy ? aging.beforeStart : aging.sinceStart).total)}
          tone={(legacy ? aging.beforeStart : aging.sinceStart).overdue > 0 ? "down" : "up"}
          hint={
            (legacy ? aging.beforeStart : aging.sinceStart).overdue > 0
              ? tr("{amount} vencido", { amount: copShort((legacy ? aging.beforeStart : aging.sinceStart).overdue) })
              : tr("Nada vencido")
          }
          href={legacy ? "/admin/receivables?datos=anteriores" : "/admin/receivables"}
        />
      ) : (
        <Unavailable what={tr("cartera")} />
      )}
      {debts ? (
        <Kpi label={tr("Deuda con socios")} value={copShort(debts.socios)} hint={tr("Terceros {a} · proveedores {b}", { a: copShort(debts.terceros), b: copShort(debts.proveedores) })} href="/admin/liabilities" />
      ) : (
        <Unavailable what={tr("pasivos")} />
      )}
    </div>
  );
}

export async function SalesChartCard() {
  const tr = await getTr();
  const statement = await loadStatement();
  if (!statement) return <Unavailable what={tr("estado de resultados")} className="lg:col-span-2" />;
  const last = statement.months.length - 1;
  const months: ChartMonth[] = await Promise.all(
    statement.months.map(async (m, i) => ({
      ym: m.month,
      label: await monthName(m.month, "short"),
      sales: m.statement.netSales,
      costs: m.statement.netSales - m.statement.result,
      result: m.statement.result,
      partial: i === last,
    }))
  );
  const missingCost = statement.warnings.missingCost.length;
  return (
    <div className={`${card} p-6 lg:col-span-2`}>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-serif text-lg">{tr("Ventas vs. costos")}</h3>
        <Link href="/admin/cashflow" className="text-[11px] font-bold uppercase tracking-widest text-[#A98C5D] hover:text-foreground">{tr("Estado de resultados ↗")}</Link>
      </div>
      <SalesCostChart months={months} />
      {(missingCost > 0 || !statement.warnings.salesFromSiigo) && (
        <p className="text-[11px] text-amber-700 mt-1">
          {!statement.warnings.salesFromSiigo && tr("Siigo no respondió: las ventas son solo las de la app.")}{" "}
          {missingCost > 0 && tr("Hay {n} productos sin costo: el costo del mes está incompleto.", { n: missingCost })}
        </p>
      )}
    </div>
  );
}

export async function AgingCard({ legacy = false }: { legacy?: boolean }) {
  const tr = await getTr();
  const data = await loadReceivables();
  if (!data) return <Unavailable what={tr("cartera")} />;
  const aging = legacy ? data.beforeStart : data.sinceStart;
  const max = Math.max(...aging.buckets.map((b) => b.amount), 1);
  const color: Record<string, string> = { por_vencer: "bg-green-500", d1_30: "bg-yellow-500", d31_60: "bg-orange-500", d61_90: "bg-red-500", d90: "bg-red-700" };
  return (
    <div className={`${card} p-6`}>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="font-serif text-lg">{tr("Cartera por antigüedad")}</h3>
        <Link href={legacy ? "/admin/receivables?datos=anteriores" : "/admin/receivables"} className="text-[11px] font-bold uppercase tracking-widest text-[#A98C5D] hover:text-foreground">{tr("Ver ↗")}</Link>
      </div>
      <p className="text-xs text-foreground/50 mb-4">
        {legacy ? tr("Facturas emitidas antes de sep 2026 · total {amount}", { amount: copShort(aging.total) }) : tr("Facturas emitidas desde sep 2026 · total {amount}", { amount: copShort(aging.total) })}
      </p>
      {aging.total === 0 ? (
        <p className="text-sm text-foreground/40">{tr("Sin saldo por cobrar.")}</p>
      ) : (
        <div className="space-y-3.5">
          {aging.buckets.map((b) => (
            <div key={b.key}>
              <div className="flex justify-between text-sm">
                <span>{tr(AGING_LABELS[b.key])} <span className="text-foreground/40 text-xs">· {b.count}</span></span>
                <b className="tabular-nums">{copShort(b.amount)}</b>
              </div>
              <div className="h-2 rounded-full bg-foreground/[0.06] mt-1.5 overflow-hidden">
                <div className={`h-full rounded-full ${color[b.key]}`} style={{ width: `${(b.amount / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      {aging.topDebtor && (
        <p className="text-xs text-foreground/50 mt-4">{tr("Debe más vencido: {name} · {amount}", { name: aging.topDebtor.name, amount: copShort(aging.topDebtor.amount) })}</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Operación
// ─────────────────────────────────────────────────────────────

export async function OperationKpis() {
  const tr = await getTr();
  const [t, op, pending] = await Promise.all([today(), loadOperation(), loadPendingOrders()]);
  const prevName = await monthName(sameDayPrevMonth(t).slice(0, 7));
  return (
    <div className="grid gap-4 grid-cols-2 xl:grid-cols-4">
      {op ? (
        <>
          <Kpi
            label={tr("Café verde disponible")}
            value={kg(op.green.usableKg)}
            tone={op.green.weeksLeft !== null && op.green.weeksLeft < 4 ? "down" : "muted"}
            hint={
              op.green.weeksLeft !== null
                ? tr("≈ {w} semanas · verde {v} + pergamino {p}", { w: op.green.weeksLeft.toLocaleString("es-CO", { maximumFractionDigits: 1 }), v: kg(op.green.verdeKg), p: kg(op.green.pergaminoKg) })
                : tr("Verde {v} + pergamino {p}", { v: kg(op.green.verdeKg), p: kg(op.green.pergaminoKg) })
            }
            href="/admin/inventory"
          />
          <Kpi
            label={tr("Tostado este mes")}
            value={kg(op.production.roastedKg)}
            tone={op.production.roastedKg >= op.production.roastedPrevKg ? "up" : "down"}
            hint={tr("{kg} a esta altura de {month}", { kg: kg(op.production.roastedPrevKg), month: prevName })}
            href="/admin/inventory/produccion"
          />
          <Kpi
            label={tr("Merma de tostión")}
            value={op.production.tostionLossPct !== null ? pct(op.production.tostionLossPct) : "—"}
            hint={op.production.trillaLossPct !== null ? tr("Trilla: {pct}", { pct: pct(op.production.trillaLossPct) }) : tr("Sin trillas este mes")}
            href="/admin/inventory/produccion"
          />
        </>
      ) : (
        <Unavailable what={tr("inventario y producción")} className="col-span-2 xl:col-span-3" />
      )}
      {pending ? (
        <Kpi
          label={tr("Órdenes por despachar")}
          value={String(pending.count)}
          tone={pending.late ? "down" : "muted"}
          hint={pending.late ? tr("{n} atrasadas · {amount}", { n: pending.late, amount: copShort(pending.total) }) : tr("Ninguna atrasada · {amount}", { amount: copShort(pending.total) })}
          href="/admin/orders"
        />
      ) : (
        <Unavailable what={tr("órdenes por despachar")} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Clientes
// ─────────────────────────────────────────────────────────────

export async function TopCustomersCard() {
  const tr = await getTr();
  const statement = await loadStatement();
  const cur = statement?.months.at(-1)?.statement;
  if (!cur) return <Unavailable what={tr("ventas por cliente")} />;
  const items = (key: "sales" | "deductions") => cur.lines.find((l) => l.key === key)?.items ?? [];
  const top = topCustomers(items("sales"), items("deductions"));
  const max = top.rows[0]?.amount ?? 1;
  return (
    <div className={`${card} p-6`}>
      <div className="flex items-baseline justify-between mb-4">
        <h3 className="font-serif text-lg">{tr("Mejores clientes del mes")}</h3>
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#A98C5D]">{tr("Ventas netas")}</span>
      </div>
      {top.rows.length === 0 ? (
        <p className="text-sm text-foreground/40">{tr("Todavía no hay ventas este mes.")}</p>
      ) : (
        <div className="space-y-3">
          {top.rows.map((r) => (
            <div key={r.name}>
              <div className="flex justify-between text-sm gap-3">
                <span className="truncate">{r.name}</span>
                <b className="tabular-nums shrink-0">{copShort(r.amount)}</b>
              </div>
              <div className="h-1.5 rounded-full bg-foreground/[0.06] mt-1.5 overflow-hidden">
                <div className="h-full rounded-full bg-[#B07A1F]" style={{ width: `${(r.amount / max) * 100}%` }} />
              </div>
            </div>
          ))}
          {top.topShare !== null && <p className="text-xs text-foreground/50 pt-1">{tr("Estos {n} son el {pct} de las ventas del mes", { n: top.rows.length, pct: pct(top.topShare) })}</p>}
        </div>
      )}
    </div>
  );
}

const COMODATO_PILL: Record<ComodatoStatus, [string, string]> = {
  ok: ["Cumple", "bg-green-100 text-green-800"],
  justo: ["Justo", "bg-yellow-100 text-yellow-800"],
  bajo: ["Bajo", "bg-red-100 text-red-800"],
  sin_compromiso: ["Sin mínimo", "bg-gray-100 text-gray-700"],
};

export async function ComodatosCard() {
  const tr = await getTr();
  const [rows, sq] = await Promise.all([loadComodatos(), loadSubscriptionsAndQuotes()]);
  return (
    <div className={`${card} p-6`}>
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="font-serif text-lg">{tr("Comodatos")}</h3>
        <span className="text-[11px] font-bold uppercase tracking-widest text-[#A98C5D]">{tr("Últimos 30 días vs mínimo")}</span>
      </div>
      {rows === null ? (
        <p className="text-sm text-foreground/40">{tr("No se pudo cargar: {what}", { what: tr("comodatos") })}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-foreground/40">{tr("No hay máquinas en comodato.")}</p>
      ) : (
        <div className="divide-y divide-foreground/5">
          {rows.slice(0, 5).map((c) => (
            <Link key={c.clientId} href="/admin/comodatos" className="flex items-center justify-between gap-3 py-2 text-sm hover:bg-[#fdfbf7]">
              <span className="min-w-0">
                <span className="block truncate">{c.name}</span>
                <span className="text-[11px] text-foreground/45">{tr("{n} máquinas", { n: c.machines })}</span>
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <b className="tabular-nums">{c.commitmentKg ? `${kg(c.boughtKg)} / ${kg(c.commitmentKg)}` : kg(c.boughtKg)}</b>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${COMODATO_PILL[c.status][1]}`}>{tr(COMODATO_PILL[c.status][0])}</span>
              </span>
            </Link>
          ))}
          {rows.length > 5 && <p className="text-[11px] text-foreground/45 pt-2">{tr("y {n} más", { n: rows.length - 5 })}</p>}
        </div>
      )}
      {sq && (
        <div className="mt-3 pt-3 border-t border-foreground/10 space-y-2 text-sm">
          <Link href="/admin/subscriptions" className="flex justify-between hover:text-[#A98C5D]">
            <span className="text-foreground/60">{tr("Suscripciones activas")}</span>
            <b>{sq.activeSubs}{sq.newSubs > 0 && <span className="text-green-700 text-xs"> {tr("+{n} este mes", { n: sq.newSubs })}</span>}</b>
          </Link>
          <Link href="/admin/quotes" className="flex justify-between hover:text-[#A98C5D]">
            <span className="text-foreground/60">{tr("Cotizaciones enviadas sin respuesta")}</span>
            <b>{sq.sentQuotes} · {copShort(sq.sentQuotesTotal)}</b>
          </Link>
        </div>
      )}
    </div>
  );
}

const STATUS: Record<string, [string, string]> = {
  pending: ["Pendiente", "bg-yellow-100 text-yellow-800"],
  paid: ["Pagado", "bg-blue-100 text-blue-800"],
  processing: ["Preparando", "bg-purple-100 text-purple-800"],
  shipped: ["Enviado", "bg-indigo-100 text-indigo-800"],
  delivered: ["Entregado", "bg-green-100 text-green-800"],
  cancelled: ["Cancelado", "bg-red-100 text-red-800"],
};

export async function RecentOrdersCard() {
  const tr = await getTr();
  const locale = (await getLocale()) === "en" ? "en-US" : "es-CO";
  const orders = await loadRecentOrders();
  return (
    <div className={`${card} p-6`}>
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="font-serif text-lg">{tr("Órdenes Recientes")}</h3>
        <Link href="/admin/orders" className="text-[11px] font-bold uppercase tracking-widest text-[#A98C5D] hover:text-foreground">{tr("Ver todas")} ↗</Link>
      </div>
      {!orders ? (
        <p className="text-sm text-foreground/40">{tr("No se pudo cargar: {what}", { what: tr("órdenes") })}</p>
      ) : orders.length === 0 ? (
        <p className="text-sm text-foreground/40">{tr("No hay órdenes recientes")}</p>
      ) : (
        <div className="divide-y divide-foreground/5">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {orders.map((o: any) => {
            const client = Array.isArray(o.client) ? o.client[0] : o.client;
            const profile = Array.isArray(o.profiles) ? o.profiles[0] : o.profiles;
            const name = client?.name || [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || orderCustomer(o);
            const [label, cls] = STATUS[o.status] ?? [o.status, "bg-gray-100 text-gray-800"];
            return (
              <div key={o.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block text-sm font-bold truncate">{name}</span>
                  <span className="text-[11px] text-foreground/45">
                    {new Date(o.created_at).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "America/Bogota" })} · <span className="font-mono">#{o.id.slice(0, 8)}</span>
                  </span>
                </span>
                <span className="text-right shrink-0">
                  <span className="block text-sm font-bold tabular-nums">{copShort(Number(o.total_amount))}</span>
                  <span className={`inline-block mt-0.5 px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wider ${cls}`}>{tr(label)}</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

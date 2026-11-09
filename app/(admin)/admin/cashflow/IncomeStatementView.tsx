'use client';

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, Loader2 } from "lucide-react";
import {
  Area, Bar, BarChart, Cell, ComposedChart, CartesianGrid, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useTr } from "@/app/(admin)/AdminI18n";
import { getIncomeStatement, type IncomeStatementReport } from "./actions";
import { ExportButton, exportExcel, nowLabel } from "./ExportButton";
import {
  biggestChanges, byCategory, change, pctOfSales, perHundred, safetyMargin, waterfall,
  type LineKey, type Statement, type StatementLine,
} from "@/utils/cashflow/incomeStatement";

// ─────────────────────────────────────────────────────────────
// Estado de resultados: three ways to read the same month.
//   Detalle   — the figures, a waterfall from sales to the result, and the
//               table whose lines open into categories and records.
//   Mes a mes — the 6 months side by side, in pesos or % of net sales.
//   Resumen   — the month in plain words: where every $100 of sales went.
// ─────────────────────────────────────────────────────────────

type View = "detalle" | "meses" | "resumen";
const VIEWS: { id: View; label: string }[] = [
  { id: "detalle", label: "Detalle" },
  { id: "meses", label: "Mes a mes" },
  { id: "resumen", label: "Resumen" },
];

const C = {
  gold: "#C59F59",
  ink: "#2c2a29",
  down: "#b0614f",
  good: "#2f6b3a",
  bad: "#b3261e",
  track: "#f4f1ed",
};

/** Short names under the waterfall's bars. */
const SHORT: Record<LineKey, string> = {
  sales: "Ventas",
  deductions: "Notas crédito",
  net_sales: "Ventas netas",
  cost: "Costo del café",
  gross: "Margen bruto",
  selling: "Gastos de ventas",
  admin: "Administración",
  depreciation: "Depreciación",
  operating: "Operativo",
  interest: "Intereses",
  bank: "Bancarios",
  result: "Resultado",
};

/** Colors of the "$100" bar: lightness differs between neighbours, not only hue. */
const SLICE_COLOR: Partial<Record<LineKey, string>> = {
  deductions: "#d9cfc3",
  cost: "#6e4a2c",
  selling: "#C59F59",
  admin: "#e8d6ad",
  depreciation: "#a89f94",
  interest: "#b0614f",
  bank: "#e0b2a6",
};
const SLICE_TEXT: Partial<Record<LineKey, string>> = { cost: "#fdfbf7" };

export default function IncomeStatementView({ formatCurrency }: { formatCurrency: (v: number) => string }) {
  const tr = useTr();
  const now = new Date();
  const [ym, setYm] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [report, setReport] = useState<IncomeStatementReport | null>(null);
  const [loadedFor, setLoadedFor] = useState("");
  const [view, setView] = useState<View>("detalle");
  const key = `${ym.year}-${String(ym.month).padStart(2, "0")}`;
  const loading = loadedFor !== key;

  useEffect(() => {
    let alive = true;
    getIncomeStatement(ym.month, ym.year).then((r) => {
      if (!alive) return;
      setReport(r);
      setLoadedFor(`${ym.year}-${String(ym.month).padStart(2, "0")}`);
    });
    return () => { alive = false; };
  }, [ym]);

  const locale = tr.locale === "en" ? "en-US" : "es-CO";
  const monthName = (m: string, style: "long" | "short" = "long") =>
    new Date(`${m}-15T12:00:00Z`).toLocaleDateString(locale, { month: style, year: style === "long" ? "numeric" : "2-digit", timeZone: "UTC" });
  const shift = (d: number) => setYm(({ month, year }) => {
    const t = new Date(Date.UTC(year, month - 1 + d, 1));
    return { month: t.getUTCMonth() + 1, year: t.getUTCFullYear() };
  });
  const isFuture = ym.year > now.getFullYear() || (ym.year === now.getFullYear() && ym.month >= now.getMonth() + 1);

  const months = report?.months ?? [];
  const current = months.at(-1)?.statement;
  const previous = months.at(-2)?.statement;
  const prevMonth = months.at(-2)?.month;

  const fmt: Fmt = {
    money: (v) => (v < 0 ? `(${formatCurrency(Math.abs(v))})` : formatCurrency(v)),
    currency: formatCurrency,
    pct: (v) => (v === null ? "—" : `${v.toLocaleString(locale, { maximumFractionDigits: 1 })}%`),
    millions: (v) => {
      const s = (Math.abs(v) / 1_000_000).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      return v < -0.5 ? `(${s})` : s;
    },
    monthName,
  };

  const exportCurrent = () => {
    if (!current || !previous) return;
    if (view === "meses") {
      void exportExcel(`estado-de-resultados-6-meses-${key}`, [{
        name: tr("Mes a mes"),
        title: [[tr("Estado de resultados")], [`${monthName(months[0].month)} – ${monthName(key)}`], [`${tr("Generado")}: ${nowLabel()}`]],
        columns: [
          { header: tr("Concepto"), width: 36 },
          ...months.map((m) => ({ header: monthName(m.month, "short"), width: 15, format: "money" as const })),
          { header: tr("Acumulado"), width: 16, format: "money" as const },
        ],
        rows: current.lines.map((l, i) => [tr(l.label), ...months.map((m) => m.statement.lines[i].amount), months.reduce((s, m) => s + m.statement.lines[i].amount, 0)]),
      }]);
      return;
    }
    void exportExcel(`estado-de-resultados-${key}`, [{
      name: tr("Estado de resultados"),
      title: [[tr("Estado de resultados")], [monthName(key)], [`${tr("Generado")}: ${nowLabel()}`]],
      columns: [
        { header: tr("Concepto"), width: 36 },
        { header: monthName(key), width: 16, format: "money" },
        { header: tr("% de ventas netas"), width: 16 },
        { header: prevMonth ? monthName(prevMonth) : "", width: 16, format: "money" },
      ],
      rows: current.lines.map((l, i) => [tr(l.label), l.amount, fmt.pct(pctOfSales(l.amount, current.netSales)), previous.lines[i].amount]),
    }]);
  };

  const warnings = report?.warnings;
  // What makes this month's profit less sure: coffee that left with no known cost, or Siigo not answering.
  const missingCost = warnings?.missingCost ?? [];
  const noSiigo = !!warnings && warnings.salesFromSiigo === false;
  const pending = !loading && warnings ? missingCost.length + (noSiigo ? 1 : 0) : 0;

  return (
    <div className="space-y-5">
      {/* Period, view and export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shift(-1)} aria-label={tr("Mes anterior")} className="p-2.5 rounded-xl border border-foreground/10 bg-white hover:bg-foreground/5"><ChevronDown className="w-4 h-4 rotate-90" /></button>
          <span className="min-w-[11rem] text-center font-serif text-xl capitalize">{monthName(key)}</span>
          <button type="button" onClick={() => shift(1)} disabled={isFuture} aria-label={tr("Mes siguiente")} className="p-2.5 rounded-xl border border-foreground/10 bg-white hover:bg-foreground/5 disabled:opacity-30"><ChevronDown className="w-4 h-4 -rotate-90" /></button>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-[#C59F59]" />}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-[#f4f1ed] p-1 gap-0.5" role="group" aria-label={tr("Vista")}>
            {VIEWS.map((v) => (
              <button key={v.id} type="button" onClick={() => setView(v.id)} aria-pressed={view === v.id}
                className={`px-4 py-2 rounded-lg text-sm transition-all ${view === v.id ? "bg-white font-bold text-foreground shadow-sm" : "font-medium text-foreground/60 hover:text-foreground"}`}>
                {tr(v.label)}
              </button>
            ))}
          </div>
          <ExportButton onClick={exportCurrent} disabled={loading || !current} />
        </div>
      </div>

      <p className="text-xs text-foreground/50">
        {tr("Rentabilidad, no caja: las ventas del mes como las cuenta Siigo (facturas menos notas crédito, sin IVA) más los pedidos vendidos sin factura, menos lo que costó el café que salió del inventario, los gastos del mes, la depreciación y los intereses. Los cobros no son ventas, y las compras de café, maquila y empaques se restan cuando ese café se vende.")}
      </p>

      {/* What makes the month's result less sure */}
      {warnings && pending > 0 && (
        <div className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-bold"><AlertTriangle className="w-4 h-4 shrink-0" />{tr("El resultado de este mes es aproximado:")}</p>
          {missingCost.length > 0 && (
            <p className="text-xs">
              • {tr("Salieron productos sin costo conocido, así que su costo no está restado: {items}.", { items: missingCost.map((m) => `${m.quantity.toLocaleString(locale)} ${m.name}`).join(", ") })}{" "}
              <Link href="/admin/inventory" className="font-bold underline">{tr("Ponerles costo")}</Link>
            </p>
          )}
          {noSiigo && (
            <p className="text-xs">• {tr("Siigo no respondió: las ventas son solo las facturas y pedidos de la app, sin las facturas hechas directamente en Siigo.")}</p>
          )}
        </div>
      )}

      {!current && loading && (
        <div className="flex items-center justify-center py-20"><Loader2 className="w-10 h-10 text-[#C59F59] animate-spin" /></div>
      )}

      {current && previous && prevMonth && (
        <div className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
          {view === "detalle" && <DetailView month={key} prevMonth={prevMonth} current={current} previous={previous} months={months} fmt={fmt} />}
          {view === "meses" && <MonthsView month={key} months={months} fmt={fmt} />}
          {view === "resumen" && <SummaryView month={key} prevMonth={prevMonth} current={current} previous={previous} months={months} fmt={fmt} />}
        </div>
      )}
    </div>
  );
}

type Fmt = {
  /** Full pesos, negatives in parentheses. */
  money: (v: number) => string;
  currency: (v: number) => string;
  pct: (v: number | null) => string;
  /** Millions with one decimal, negatives in parentheses. */
  millions: (v: number) => string;
  monthName: (m: string, style?: "long" | "short") => string;
};
type Months = IncomeStatementReport["months"];

const card = "bg-white rounded-2xl border border-foreground/5 shadow-sm";

/** ▲/▼ says which way the line moved in size; the color says whether that helps the month. */
function ChangeMark({ line, prev, fmt }: { line: StatementLine; prev: number; fmt: Fmt }) {
  const delta = change(Math.abs(line.amount), Math.abs(prev));
  const dark = line.kind === "total";
  if (delta === null || delta === 0) return <span className={dark ? "text-[#d8cfc2]" : "text-foreground/30"}>—</span>;
  const better = line.amount - prev > 0;
  const tone = dark ? (better ? "text-[#9fd3a8]" : "text-[#ffb4a8]") : better ? "text-green-700" : "text-red-700";
  return (
    <span className={tone}>
      {delta > 0 ? "▲" : "▼"} {fmt.pct(Math.abs(delta))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────
// DETALLE
// ─────────────────────────────────────────────────────────────

function DetailView({ month, prevMonth, current, previous, months, fmt }: {
  month: string; prevMonth: string; current: Statement; previous: Statement; months: Months; fmt: Fmt;
}) {
  const tr = useTr();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const openLine = (k: LineKey) => {
    setOpen((s) => new Set(s).add(k));
    document.getElementById(`pl-line-${k}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const trend = months.map((m) => ({ sales: m.statement.netSales, result: m.statement.result, margin: m.statement.grossMarginPct }));
  const be = current.breakEven;
  const gap = be != null ? be - current.netSales : null;
  const scale = be != null ? Math.max(be, current.netSales) * 1.1 : 0;

  const steps = waterfall(current).map((s) => ({ ...s, name: tr(SHORT[s.key]) }));
  const stepColor = (k: (typeof steps)[number]) =>
    k.kind === "up" ? C.gold : k.kind === "down" ? C.down : k.kind === "total" ? (k.amount >= 0 ? C.good : C.bad) : C.ink;

  const sparkCard = (label: string, value: string, tone: string, sub: React.ReactNode, series: "sales" | "result" | "margin") => (
    <div className={`${card} p-5`}>
      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{tr(label)}</p>
      <p className={`mt-1 text-2xl font-serif font-bold ${tone}`}>{value}</p>
      <div className="mt-1 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-foreground/60">{sub}</span>
        <div className="hidden h-8 w-20 shrink-0 sm:block" aria-hidden="true">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trend}><Area type="monotone" dataKey={series} stroke={C.gold} fill={C.gold} fillOpacity={0.12} strokeWidth={1.5} dot={false} isAnimationActive={false} /></ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
  const vsPrev = (cur: number, prev: number) => {
    const d = change(cur, prev);
    if (d === null) return null;
    return <span className={`font-bold ${d >= 0 ? "text-green-700" : "text-red-700"}`}>{tr("{v} vs. mes anterior", { v: `${d > 0 ? "▲" : d < 0 ? "▼" : ""} ${fmt.pct(Math.abs(d))}` })}</span>;
  };

  return (
    <div className="space-y-5">
      {/* The figures that matter */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {sparkCard("Ventas netas", fmt.currency(current.netSales), "text-foreground", vsPrev(current.netSales, previous.netSales), "sales")}
        {sparkCard("Margen bruto", fmt.pct(current.grossMarginPct), current.grossMargin >= 0 ? "text-foreground" : "text-red-700",
          <>
            <span className={`font-bold ${current.grossMarginPct >= previous.grossMarginPct ? "text-green-700" : "text-red-700"}`}>
              {tr("{v} pp", { v: `${current.grossMarginPct >= previous.grossMarginPct ? "+" : "−"}${Math.abs(current.grossMarginPct - previous.grossMarginPct).toLocaleString(tr.locale === "en" ? "en-US" : "es-CO", { maximumFractionDigits: 1 })}` })}
            </span>{" "}· {fmt.currency(current.grossMargin)}
          </>, "margin")}
        <div className="rounded-2xl bg-[#2c2a29] p-5 text-[#fdfbf7] shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#d8cfc2]">{tr("Resultado del mes")}</p>
          <p className={`mt-1 text-2xl font-serif font-bold ${current.result < 0 ? "text-[#ffb4a8]" : ""}`}>{fmt.money(current.result)}</p>
          <p className="mt-1 text-[11px] text-[#d8cfc2]">
            {tr("{v} de ventas netas", { v: fmt.pct(pctOfSales(current.result, current.netSales)) })} · {fmt.monthName(prevMonth, "short")}: {fmt.money(previous.result)}
          </p>
        </div>
        <div className={`${card} p-5`}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{tr("Punto de equilibrio")}</p>
          <p className="mt-1 text-2xl font-serif font-bold">{be == null ? "—" : fmt.currency(be)}</p>
          {be != null && (
            <div className="relative mt-2 h-2 rounded-full bg-[#f0ebe3]" aria-hidden="true">
              <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(current.netSales / scale) * 100}%`, background: gap != null && gap > 0 ? "#d9a441" : C.gold }} />
              <div className="absolute -top-1 h-4 w-0.5 bg-foreground" style={{ left: `${(be / scale) * 100}%` }} />
            </div>
          )}
          <p className={`mt-2 text-[11px] font-bold ${gap == null ? "text-foreground/50" : gap > 0 ? "text-amber-700" : "text-green-700"}`}>
            {gap == null ? tr("Sin margen bruto este mes") : gap > 0 ? tr("Faltan {v} de ventas netas", { v: fmt.currency(gap) }) : tr("Por encima en {v}", { v: fmt.currency(-gap) })}
          </p>
        </div>
      </div>

      {/* From sales to the result */}
      <div className={`${card} p-5 sm:p-6`}>
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-serif">{tr("De las ventas al resultado")}</h3>
          <div className="flex flex-wrap gap-4 text-[11px] text-foreground/60">
            {[[C.gold, "Ingreso"], [C.down, "Resta"], [C.ink, "Subtotal"]].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c }} />{tr(l)}</span>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-foreground/50">{tr("Toca una barra para abrir sus movimientos en la tabla.")}</p>
        <div className="overflow-x-auto">
          <div className="h-72 min-w-[980px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={steps} margin={{ top: 20, right: 8, left: 8, bottom: 0 }} barCategoryGap="18%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" vertical={false} />
                <XAxis dataKey="name" interval={0} tick={{ fontSize: 10, fill: "#4d4944" }} tickLine={false} />
                <YAxis tickFormatter={(v) => `${(Number(v) / 1_000_000).toFixed(0)}M`} tick={{ fontSize: 10, fill: "#6b6660" }} width={40} />
                <ReferenceLine y={0} stroke="#2c2a29" strokeOpacity={0.3} />
                <Tooltip
                  cursor={{ fill: "rgba(44,42,41,0.04)" }}
                  formatter={(_v, _n, p) => [fmt.money((p.payload as (typeof steps)[number]).amount), tr((p.payload as (typeof steps)[number]).label)]}
                  labelFormatter={() => ""}
                />
                <Bar dataKey="range" radius={[3, 3, 3, 3]} isAnimationActive={false} cursor="pointer"
                  onClick={(d) => { const k = (d as unknown as { payload?: { key?: LineKey } }).payload?.key; if (k) openLine(k); }}>
                  {steps.map((s) => <Cell key={s.key} fill={stepColor(s)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* The statement */}
      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-foreground/50 border-b border-foreground/5">
              <th className="px-5 py-3 text-left font-bold">{tr("Concepto")}</th>
              <th className="px-4 py-3 text-right font-bold capitalize">{fmt.monthName(month, "short")}</th>
              <th className="px-4 py-3 text-left font-bold w-48">{tr("% de ventas netas")}</th>
              <th className="px-4 py-3 text-right font-bold capitalize">{fmt.monthName(prevMonth, "short")}</th>
              <th className="px-5 py-3 text-right font-bold">{tr("Cambio")}</th>
            </tr>
          </thead>
          <tbody>
            {current.lines.map((l, i) => {
              const prevLine = previous.lines[i];
              const prev = prevLine?.amount ?? 0;
              const canOpen = l.items.length > 0;
              const isOpen = open.has(l.key);
              const share = pctOfSales(l.amount, current.netSales);
              const rowCls = l.kind === "total"
                ? "bg-[#2c2a29] text-[#fdfbf7] font-bold"
                : l.kind === "subtotal" ? "bg-[#f8f5ef] font-bold border-t border-foreground/10" : "border-t border-foreground/[0.04]";
              const amountTone = l.kind === "total" ? (l.amount < 0 ? "text-[#ffb4a8]" : "text-[#9fd3a8]") : l.kind === "subtotal" && l.amount < 0 ? "text-red-700" : "";
              const cats = byCategory(l.items);
              const prevCats = new Map(byCategory(prevLine?.items ?? []).map((c) => [c.category, c.amount]));
              const showCats = cats.length > 1;
              return (
                <React.Fragment key={l.key}>
                  <tr id={`pl-line-${l.key}`} className={`${rowCls} ${canOpen ? "cursor-pointer hover:bg-foreground/[0.03]" : ""} ${isOpen && l.kind === "line" ? "bg-[#fffcf6]" : ""}`}
                    onClick={canOpen ? () => toggle(l.key) : undefined}>
                    <td className={`px-5 ${l.kind === "total" ? "py-4 font-serif text-base" : "py-2.5"}`}>
                      {canOpen ? (
                        <button type="button" aria-expanded={isOpen} onClick={(e) => { e.stopPropagation(); toggle(l.key); }} className="inline-flex items-center gap-1.5 text-left">
                          <ChevronDown className={`w-3.5 h-3.5 text-foreground/40 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                          <span className={l.kind === "line" ? "text-foreground/80" : ""}>{l.kind === "line" && l.amount < 0 ? "− " : ""}{tr(l.label)}</span>
                        </button>
                      ) : (
                        <span className={`${l.kind === "line" ? "pl-5 text-foreground/80" : ""}`}>{l.kind === "line" && l.amount < 0 ? "− " : ""}{tr(l.label)}</span>
                      )}
                      {l.hint && <span className="block pl-5 text-[10px] font-normal text-foreground/50">{tr(l.hint)}</span>}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${amountTone}`}>{fmt.money(l.amount)}</td>
                    <td className="px-4 py-2.5">
                      {l.kind === "line" ? (
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded-full bg-[#f4f1ed]" aria-hidden="true">
                            <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.abs(share ?? 0))}%`, background: l.amount >= 0 ? C.gold : C.down }} />
                          </div>
                          <span className="w-14 text-right font-mono text-xs tabular-nums text-foreground/60">{fmt.pct(share === null ? null : Math.abs(share))}</span>
                        </div>
                      ) : (
                        <span className={`font-mono text-xs tabular-nums ${l.kind === "total" ? "text-[#d8cfc2]" : "text-foreground/70"}`}>{fmt.pct(share)}</span>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${l.kind === "total" ? "text-[#d8cfc2]" : "text-foreground/60"}`}>{fmt.money(prev)}</td>
                    <td className="px-5 py-2.5 text-right font-mono text-xs tabular-nums"><ChangeMark line={l} prev={prev} fmt={fmt} /></td>
                  </tr>

                  {isOpen && showCats && cats.map((c) => {
                    const ck = `${l.key}|${c.category}`;
                    const catOpen = open.has(ck);
                    const items = l.items.filter((it) => it.category === c.category);
                    const pc = prevCats.get(c.category) ?? 0;
                    return (
                      <React.Fragment key={ck}>
                        <tr className="bg-[#fffcf6] text-xs text-foreground/75 hover:bg-[#fbf6ea] cursor-pointer" onClick={() => toggle(ck)}>
                          <td className="py-1.5 pl-11 pr-4">
                            <button type="button" aria-expanded={catOpen} onClick={(e) => { e.stopPropagation(); toggle(ck); }} className="inline-flex items-center gap-1.5 text-left">
                              <ChevronDown className={`w-3 h-3 text-foreground/40 transition-transform ${catOpen ? "" : "-rotate-90"}`} />
                              <span>{tr.msg(c.category)}</span>
                              <span className="text-foreground/50">· {tr("{n} mov.", { n: String(c.count) })}</span>
                            </button>
                          </td>
                          <td className="px-4 py-1.5 text-right font-mono tabular-nums">{fmt.currency(c.amount)}</td>
                          <td className="px-4 py-1.5 font-mono text-[11px] text-foreground/55">{tr("{v} de la línea", { v: fmt.pct(Math.round((c.amount / Math.abs(l.amount || 1)) * 1000) / 10) })}</td>
                          <td className="px-4 py-1.5 text-right font-mono tabular-nums text-foreground/55">{pc ? fmt.currency(pc) : "—"}</td>
                          <td />
                        </tr>
                        {catOpen && <ItemRows items={items} indent="pl-16" fmt={fmt} />}
                      </React.Fragment>
                    );
                  })}
                  {isOpen && !showCats && <ItemRows items={l.items} indent="pl-11" fmt={fmt} />}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-foreground/50">{tr("▲/▼ dice si la línea creció o bajó; el color dice si eso le conviene al mes (un gasto que sube sale en rojo).")}</p>
    </div>
  );
}

function ItemRows({ items, indent, fmt }: { items: StatementLine["items"]; indent: string; fmt: Fmt }) {
  const tr = useTr();
  return (
    <>
      {items.slice(0, 60).map((it, j) => (
        <tr key={j} className="bg-[#fafaf9] text-xs text-foreground/65">
          <td className={`${indent} pr-4 py-1.5`}>
            <span className="font-mono text-foreground/45 mr-2">{it.date ? it.date.slice(5) : ""}</span>{it.concept}
          </td>
          <td className="px-4 py-1.5 text-right font-mono tabular-nums">{fmt.currency(it.amount)}</td>
          <td colSpan={3} />
        </tr>
      ))}
      {items.length > 60 && (
        <tr className="bg-[#fafaf9] text-[11px] text-foreground/50"><td colSpan={5} className={`${indent} py-1.5`}>{tr("y {n} más", { n: String(items.length - 60) })}</td></tr>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// MES A MES
// ─────────────────────────────────────────────────────────────

function MonthsView({ month, months, fmt }: { month: string; months: Months; fmt: Fmt }) {
  const tr = useTr();
  const [mode, setMode] = useState<"pesos" | "pct">("pesos");
  const [compact, setCompact] = useState(false);
  const base = months.at(-1)!.statement.lines;
  const netTotal = months.reduce((s, m) => s + m.statement.netSales, 0);

  const cell = (v: number, net: number) => (mode === "pesos" ? fmt.millions(v) : fmt.pct(pctOfSales(v, net)));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-foreground/60">
          {mode === "pesos" ? tr("Millones de pesos. Negativos entre paréntesis.") : tr("Cada línea como % de las ventas netas de su mes.")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl bg-[#f4f1ed] p-1 gap-0.5" role="group" aria-label={tr("Unidades")}>
            {([["pesos", "Pesos"], ["pct", "% de ventas netas"]] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setMode(id)} aria-pressed={mode === id}
                className={`px-3 py-1.5 rounded-lg text-xs transition-all ${mode === id ? "bg-white font-bold shadow-sm" : "font-medium text-foreground/60 hover:text-foreground"}`}>
                {tr(label)}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setCompact((c) => !c)} aria-pressed={compact}
            className="px-3 py-2 rounded-xl border border-foreground/10 bg-white text-xs font-medium hover:bg-foreground/5">
            {compact ? tr("Mostrar todas las líneas") : tr("Solo subtotales")}
          </button>
        </div>
      </div>

      <div className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-foreground/50 border-b border-foreground/5">
              <th className="sticky left-0 z-10 bg-white px-5 py-3 text-left font-bold">{tr("Concepto")}</th>
              {months.map((m) => (
                <th key={m.month} className={`px-3 py-3 text-right font-bold capitalize ${m.month === month ? "bg-[#fbf3e2] text-amber-900" : ""}`}>{fmt.monthName(m.month, "short")}</th>
              ))}
              <th className="px-4 py-3 text-right font-bold border-l border-foreground/5">{tr("Acumulado")}</th>
              <th className="px-5 py-3 text-left font-bold">{tr("Tendencia")}</th>
            </tr>
          </thead>
          <tbody>
            {base.map((l, i) => {
              if (compact && l.kind === "line") return null;
              const values = months.map((m) => m.statement.lines[i].amount);
              const total = values.reduce((s, v) => s + v, 0);
              const max = Math.max(...values.map(Math.abs), 1);
              const isTotal = l.kind === "total";
              const rowCls = isTotal ? "bg-[#2c2a29] text-[#fdfbf7] font-bold" : l.kind === "subtotal" ? "bg-[#f8f5ef] font-bold border-t border-foreground/10" : "border-t border-foreground/[0.04]";
              const stickyBg = isTotal ? "bg-[#2c2a29]" : l.kind === "subtotal" ? "bg-[#f8f5ef]" : "bg-white";
              return (
                <tr key={l.key} className={rowCls}>
                  <td className={`sticky left-0 z-10 whitespace-nowrap px-5 py-2.5 ${stickyBg} ${isTotal ? "font-serif text-base" : l.kind === "line" ? "text-foreground/80" : ""}`}>
                    {l.kind === "line" && l.amount <= 0 && l.key !== "sales" ? "− " : ""}{tr(l.label)}
                  </td>
                  {months.map((m, j) => {
                    const v = values[j];
                    const tone = isTotal ? (v < 0 ? "text-[#ffb4a8]" : "text-[#9fd3a8]") : l.kind === "subtotal" && v < 0 ? "text-red-700" : "";
                    const hi = m.month === month ? (isTotal ? "bg-[#3a3735]" : "bg-[#fbf3e2]/70") : "";
                    return <td key={m.month} className={`px-3 py-2.5 text-right font-mono text-[13px] tabular-nums ${tone} ${hi}`}>{cell(v, m.statement.netSales)}</td>;
                  })}
                  <td className={`px-4 py-2.5 text-right font-mono text-[13px] font-bold tabular-nums border-l border-foreground/5 ${isTotal ? (total < 0 ? "text-[#ffb4a8]" : "text-[#9fd3a8]") : ""}`}>
                    {mode === "pesos" ? fmt.millions(total) : fmt.pct(pctOfSales(total, netTotal))}
                  </td>
                  <td className="px-5 py-2">
                    <div className="flex h-6 items-end gap-[3px]" aria-hidden="true">
                      {values.map((v, j) => (
                        <span key={j} className="w-2 rounded-sm" style={{ height: `${Math.max(2, (Math.abs(v) / max) * 22)}px`, background: v < 0 ? C.down : C.gold, opacity: months[j].month === month ? 1 : 0.7 }} />
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// RESUMEN
// ─────────────────────────────────────────────────────────────

function SummaryView({ month, prevMonth, current, previous, months, fmt }: {
  month: string; prevMonth: string; current: Statement; previous: Statement; months: Months; fmt: Fmt;
}) {
  const tr = useTr();
  const hundred = perHundred(current);
  const before = perHundred(previous);
  const changes = biggestChanges(current, previous, 3);
  const safety = safetyMargin(current);
  const be = current.breakEven;
  const trend = months.map((m) => ({ name: fmt.monthName(m.month, "short"), sales: m.statement.netSales, result: m.statement.result, month: m.month }));
  const pesos = (v: number) => `$${Math.round(Math.abs(v)).toLocaleString(tr.locale === "en" ? "en-US" : "es-CO")}`;

  if (!hundred) {
    return <div className={`${card} p-10 text-center text-sm text-foreground/50`}>{tr("Sin ventas este mes: no hay resumen que mostrar.")}</div>;
  }
  const kept = hundred.result.per100;
  const width = hundred.slices.reduce((s, x) => s + x.per100, 0) + Math.max(0, kept);
  const scale = be != null ? Math.max(be, current.netSales) * 1.15 : 0;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <h3 className="max-w-3xl font-serif text-3xl leading-tight">
          {kept >= 0
            ? tr("De cada $100 que vendimos en {m}, nos quedaron {v}.", { m: fmt.monthName(month, "long"), v: pesos(kept) })
            : tr("De cada $100 que vendimos en {m}, perdimos {v}.", { m: fmt.monthName(month, "long"), v: pesos(kept) })}
        </h3>
        {before && (
          <p className="text-sm text-foreground/65">
            {before.result.per100 >= 0
              ? tr("En {m} nos quedaron {v} de cada $100.", { m: fmt.monthName(prevMonth, "long"), v: pesos(before.result.per100) })
              : tr("En {m} perdimos {v} de cada $100.", { m: fmt.monthName(prevMonth, "long"), v: pesos(before.result.per100) })}
          </p>
        )}
      </div>

      {/* Every $100 */}
      <div className={`${card} p-5 sm:p-6 space-y-5`}>
        <div className="flex h-14 gap-0.5 overflow-hidden rounded-xl font-mono text-xs font-bold" role="img"
          aria-label={hundred.slices.map((s) => `${tr(s.label)} ${pesos(s.per100)}`).join(", ")}>
          {hundred.slices.map((s) => (
            <div key={s.key} className="flex items-center justify-center overflow-hidden" title={`${tr(s.label)}: ${pesos(s.per100)}`}
              style={{ width: `${(s.per100 / width) * 100}%`, background: SLICE_COLOR[s.key], color: SLICE_TEXT[s.key] ?? C.ink }}>
              {s.per100 / width >= 0.06 ? pesos(s.per100) : ""}
            </div>
          ))}
          {kept > 0 && (
            <div className="flex items-center justify-center text-white" style={{ width: `${(kept / width) * 100}%`, background: C.good }}>
              {kept / width >= 0.05 ? pesos(kept) : ""}
            </div>
          )}
        </div>
        {kept < 0 && (
          <p className="text-xs font-bold text-red-700">{tr("Los costos y gastos sumaron {v} por cada $100 vendidos.", { v: pesos(100 - kept) })}</p>
        )}
        <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {hundred.slices.map((s) => (
            <div key={s.key} className="flex items-center gap-2.5 text-sm">
              <span className="h-3.5 w-3.5 shrink-0 rounded" style={{ background: SLICE_COLOR[s.key] }} />
              <span className="w-12 shrink-0 font-mono font-bold tabular-nums">{pesos(s.per100)}</span>
              <span className="text-foreground/70">{tr(s.label)}</span>
            </div>
          ))}
          <div className="flex items-center gap-2.5 text-sm">
            <span className="h-3.5 w-3.5 shrink-0 rounded" style={{ background: kept >= 0 ? C.good : C.bad }} />
            <span className={`w-12 shrink-0 font-mono font-bold tabular-nums ${kept >= 0 ? "text-green-700" : "text-red-700"}`}>{kept < 0 ? "−" : ""}{pesos(kept)}</span>
            <span className="font-bold">{tr("Resultado del mes")}</span>
          </div>
        </div>
      </div>

      {/* What changed */}
      {changes.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-serif text-xl">{tr("Qué cambió frente a {m}", { m: fmt.monthName(prevMonth, "long") })}</h3>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {changes.map((c) => {
              const grew = Math.abs(c.current) > Math.abs(c.previous);
              return (
                <div key={c.key} className={`${card} p-5 space-y-1.5`}>
                  <p className={`text-xs font-bold ${c.good ? "text-green-700" : "text-red-700"}`}>
                    {grew ? "▲" : "▼"} {fmt.currency(Math.abs(Math.abs(c.current) - Math.abs(c.previous)))}
                  </p>
                  <p className="font-bold">{grew ? tr("{l} subió", { l: tr(c.label) }) : tr("{l} bajó", { l: tr(c.label) })}</p>
                  <p className="text-xs text-foreground/60">
                    {fmt.monthName(prevMonth, "short")}: {fmt.currency(Math.abs(c.previous))} → {fmt.monthName(month, "short")}: {fmt.currency(Math.abs(c.current))}
                    {" · "}{c.good ? tr("ayuda al resultado") : tr("le resta al resultado")}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Break-even */}
        <div className={`${card} p-5 sm:p-6 space-y-4`}>
          <h3 className="font-serif text-xl">{tr("¿Cubrimos los gastos fijos?")}</h3>
          {be == null ? (
            <p className="text-sm text-foreground/60">{tr("Sin margen bruto este mes")}</p>
          ) : (
            <>
              <div className="space-y-2">
                <div className="relative h-7 rounded-lg bg-[#f4f1ed]" aria-hidden="true">
                  <div className="absolute inset-y-0 left-0 rounded-l-lg bg-[#e8d6ad]" style={{ width: `${(Math.min(current.netSales, be) / scale) * 100}%` }} />
                  {current.netSales > be && (
                    <div className="absolute inset-y-0" style={{ left: `${(be / scale) * 100}%`, width: `${((current.netSales - be) / scale) * 100}%`, background: C.good }} />
                  )}
                  <div className="absolute -top-1.5 h-10 w-0.5 bg-foreground" style={{ left: `${(be / scale) * 100}%` }} />
                </div>
                <div className="flex justify-between font-mono text-[11px] text-foreground/60">
                  <span>$0</span>
                  <span className="font-bold text-foreground">{tr("Equilibrio {v}", { v: fmt.currency(be) })}</span>
                </div>
              </div>
              <p className="text-sm text-foreground/75">
                {current.netSales >= be
                  ? tr("Vendimos {s} netos: {g} por encima del punto de equilibrio. Las ventas podrían caer {p} antes de perder plata.", { s: fmt.currency(current.netSales), g: fmt.currency(current.netSales - be), p: fmt.pct(safety) })
                  : tr("Vendimos {s} netos: faltaron {g} para cubrir los gastos fijos.", { s: fmt.currency(current.netSales), g: fmt.currency(be - current.netSales) })}
              </p>
            </>
          )}
        </div>

        {/* 6 months */}
        <div className={`${card} p-5 sm:p-6`}>
          <h3 className="font-serif text-xl">{tr("Últimos 6 meses")}</h3>
          <p className="mb-3 text-xs text-foreground/55">{tr("Barras claras: ventas netas. Barras verdes o rojas: resultado del mes.")}</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend} margin={{ top: 5, right: 5, left: 5, bottom: 0 }} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} tickLine={false} />
                <YAxis tickFormatter={(v) => `${(Number(v) / 1_000_000).toFixed(0)}M`} tick={{ fontSize: 10 }} width={40} />
                <ReferenceLine y={0} stroke="#2c2a29" strokeOpacity={0.3} />
                <Tooltip formatter={(v, name) => [fmt.money(Number(v ?? 0)), name === "sales" ? tr("Ventas netas") : tr("Resultado del mes")]} />
                <Bar dataKey="sales" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {trend.map((t) => <Cell key={t.month} fill={t.month === month ? C.gold : "#e8d6ad"} />)}
                </Bar>
                <Bar dataKey="result" radius={[3, 3, 3, 3]} isAnimationActive={false}>
                  {trend.map((t) => <Cell key={t.month} fill={t.result >= 0 ? C.good : C.bad} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronDown, Loader2, Search } from "lucide-react";
import { useTr } from "@/app/(admin)/AdminI18n";
import { getCustomerProfit, type CustomerProfitReport } from "./customerProfitActions";
import { ExportButton, exportExcel, nowLabel } from "./ExportButton";
import type { CustomerProfitRow } from "@/utils/cashflow/customerProfit";

// ─────────────────────────────────────────────────────────────
// Rentabilidad por cliente: what each customer bought, what that coffee
// cost, and what is left after the machines lent to them. Shared expenses
// (transport, fees, admin) stay apart, below the table.
// ─────────────────────────────────────────────────────────────

type Span = 1 | 3 | 6;
type Sort = "ventas" | "contribucion-asc" | "contribucion-desc" | "margen-asc";
const SORTS: { id: Sort; label: string }[] = [
  { id: "ventas", label: "Más ventas primero" },
  { id: "contribucion-asc", label: "Los que menos dejan primero" },
  { id: "contribucion-desc", label: "Los que más dejan primero" },
  { id: "margen-asc", label: "Menor margen % primero" },
];
const card = "bg-white rounded-2xl border border-foreground/5 shadow-sm";

export default function CustomerProfitView({ formatCurrency }: { formatCurrency: (v: number) => string }) {
  const tr = useTr();
  const now = new Date();
  const [ym, setYm] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [span, setSpan] = useState<Span>(1);
  const [report, setReport] = useState<CustomerProfitReport | null>(null);
  const [loadedFor, setLoadedFor] = useState("");
  const [sort, setSort] = useState<Sort>("ventas");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const key = `${ym.year}-${String(ym.month).padStart(2, "0")}·${span}`;
  const loading = loadedFor !== key;

  useEffect(() => {
    let alive = true;
    getCustomerProfit(ym.month, ym.year, span).then((r) => {
      if (!alive) return;
      setReport(r);
      setLoadedFor(`${ym.year}-${String(ym.month).padStart(2, "0")}·${span}`);
    });
    return () => { alive = false; };
  }, [ym, span]);

  const locale = tr.locale === "en" ? "en-US" : "es-CO";
  const monthName = (m: string, style: "long" | "short" = "long") =>
    new Date(`${m}-15T12:00:00Z`).toLocaleDateString(locale, { month: style, year: "numeric", timeZone: "UTC" });
  const shift = (d: number) => setYm(({ month, year }) => {
    const t = new Date(Date.UTC(year, month - 1 + d, 1));
    return { month: t.getUTCMonth() + 1, year: t.getUTCFullYear() };
  });
  const isFuture = ym.year > now.getFullYear() || (ym.year === now.getFullYear() && ym.month >= now.getMonth() + 1);
  const money = (v: number) => (v < 0 ? `(${formatCurrency(Math.abs(v))})` : formatCurrency(v));
  const pct = (v: number | null) => (v === null ? "—" : `${v.toLocaleString(locale, { maximumFractionDigits: 1 })}%`);
  const kg = (v: number) => `${v.toLocaleString(locale, { maximumFractionDigits: 1 })} kg`;
  const period = report ? (report.from === report.to ? monthName(report.to) : `${monthName(report.from, "short")} – ${monthName(report.to, "short")}`) : "";

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (report?.rows ?? []).filter((r) => !q || r.customer.toLowerCase().includes(q));
    const by: Record<Sort, (a: CustomerProfitRow, b: CustomerProfitRow) => number> = {
      "ventas": (a, b) => b.netSales - a.netSales,
      "contribucion-asc": (a, b) => a.contribution - b.contribution,
      "contribucion-desc": (a, b) => b.contribution - a.contribution,
      "margen-asc": (a, b) => (a.contributionPct ?? Infinity) - (b.contributionPct ?? Infinity),
    };
    return [...list].sort(by[sort]);
  }, [report, query, sort]);

  const all = report?.rows ?? [];
  const losing = all.filter((r) => r.contribution < 0);
  const uncosted = all.filter((r) => r.uncosted.length > 0);
  const best = [...all].sort((a, b) => b.contribution - a.contribution)[0];
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.contribution)));

  const exportCurrent = () => {
    if (!report) return;
    void exportExcel(`rentabilidad-por-cliente-${report.from}_${report.to}`, [{
      name: tr("Rentabilidad por cliente"),
      title: [[tr("Rentabilidad por cliente")], [period], [`${tr("Generado")}: ${nowLabel()}`]],
      columns: [
        { header: tr("Cliente"), width: 34 },
        { header: tr("Ventas netas"), width: 16, format: "money" },
        { header: tr("Costo del café"), width: 16, format: "money" },
        { header: tr("Margen bruto"), width: 16, format: "money" },
        { header: tr("Máquinas"), width: 10 },
        { header: tr("Depreciación máquinas"), width: 18, format: "money" },
        { header: tr("Lo que deja"), width: 16, format: "money" },
        { header: tr("% de ventas"), width: 12 },
        { header: tr("Kg comprados"), width: 12 },
        { header: tr("Kg pactados"), width: 12 },
      ],
      rows: rows.map((r) => [r.customer, r.netSales, -r.cost, r.gross, r.machines, -r.comodatoCost, r.contribution, pct(r.contributionPct), Math.round(r.kg * 10) / 10, r.commitmentKg ?? ""]),
    }]);
  };

  return (
    <div className="space-y-5">
      {/* Period, span and export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shift(-1)} aria-label={tr("Mes anterior")} className="p-2.5 rounded-xl border border-foreground/10 bg-white hover:bg-foreground/5"><ChevronDown className="w-4 h-4 rotate-90" /></button>
          <span className="min-w-[11rem] text-center font-serif text-xl capitalize">{monthName(`${ym.year}-${String(ym.month).padStart(2, "0")}`)}</span>
          <button type="button" onClick={() => shift(1)} disabled={isFuture} aria-label={tr("Mes siguiente")} className="p-2.5 rounded-xl border border-foreground/10 bg-white hover:bg-foreground/5 disabled:opacity-30"><ChevronDown className="w-4 h-4 -rotate-90" /></button>
          {loading && <Loader2 className="w-4 h-4 animate-spin text-[#C59F59]" />}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-xl bg-[#f4f1ed] p-1 gap-0.5" role="group" aria-label={tr("Periodo")}>
            {([1, 3, 6] as Span[]).map((s) => (
              <button key={s} type="button" onClick={() => setSpan(s)} aria-pressed={span === s}
                className={`px-4 py-2 rounded-lg text-sm transition-all ${span === s ? "bg-white font-bold text-foreground shadow-sm" : "font-medium text-foreground/60 hover:text-foreground"}`}>
                {s === 1 ? tr("El mes") : tr("Últimos {n} meses", { n: s })}
              </button>
            ))}
          </div>
          <ExportButton onClick={exportCurrent} disabled={loading || !report} />
        </div>
      </div>

      <p className="text-xs text-foreground/50">
        {tr("Lo que dejó cada cliente: sus ventas sin IVA (facturas menos notas crédito, más pedidos sin factura), menos lo que costó el café que se le vendió, menos la depreciación de las máquinas que tiene en comodato. Transporte, comisiones y administración son de todos: se muestran aparte, abajo.")}
      </p>

      {report && !loading && (uncosted.length > 0 || !report.salesFromSiigo || report.unassignedComodato > 0) && (
        <div className="space-y-1 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-bold"><AlertTriangle className="w-4 h-4 shrink-0" />{tr("Para que sea exacto:")}</p>
          {report.unassignedComodato > 0 && (
            <p className="text-xs">
              • {tr("Hay {v} de depreciación de máquinas en comodato sin cliente: registra a quién le prestaste cada máquina.", { v: formatCurrency(report.unassignedComodato) })}{" "}
              <Link href="/admin/comodatos" className="font-bold underline">{tr("Ir a Comodatos")}</Link>
            </p>
          )}
          {uncosted.length > 0 && (
            <p className="text-xs">
              • {tr("{n} cliente(s) compraron productos sin costo conocido; su margen se ve más alto de lo que es.", { n: uncosted.length })}{" "}
              <Link href="/admin/inventory" className="font-bold underline">{tr("Ponerles costo")}</Link>
            </p>
          )}
          {!report.salesFromSiigo && <p className="text-xs">• {tr("Siigo no respondió: faltan las facturas hechas directamente en Siigo.")}</p>}
        </div>
      )}

      {!report && loading && <div className="flex items-center justify-center py-20"><Loader2 className="w-10 h-10 text-[#C59F59] animate-spin" /></div>}

      {report && (
        <div className={`space-y-5 transition-opacity ${loading ? "opacity-50" : ""}`}>
          {/* The figures that matter */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className={`${card} p-5`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{tr("Clientes con ventas")}</p>
              <p className="mt-1 text-2xl font-serif font-bold">{all.filter((r) => r.netSales > 0).length}</p>
              <p className="mt-1 text-[11px] text-foreground/60">{tr("Ventas netas")}: {formatCurrency(report.totals.netSales)}</p>
            </div>
            <div className={`${card} p-5`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{tr("Lo que dejan los clientes")}</p>
              <p className={`mt-1 text-2xl font-serif font-bold ${report.totals.contribution < 0 ? "text-red-700" : ""}`}>{money(report.totals.contribution)}</p>
              <p className="mt-1 text-[11px] text-foreground/60">{tr("{v} de ventas netas", { v: pct(report.totals.netSales ? Math.round((report.totals.contribution / report.totals.netSales) * 1000) / 10 : null) })}</p>
            </div>
            <div className={`${card} p-5`}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{tr("El que más deja")}</p>
              <p className="mt-1 truncate text-lg font-serif font-bold" title={best?.customer}>{best?.customer ?? "—"}</p>
              <p className="mt-1 text-[11px] font-bold text-green-700">{best ? money(best.contribution) : ""}</p>
            </div>
            <div className={`rounded-2xl p-5 shadow-sm ${losing.length ? "bg-[#2c2a29] text-[#fdfbf7]" : card}`}>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${losing.length ? "text-[#d8cfc2]" : "text-foreground/50"}`}>{tr("Clientes que pierden plata")}</p>
              <p className={`mt-1 text-2xl font-serif font-bold ${losing.length ? "text-[#ffb4a8]" : ""}`}>{losing.length}</p>
              <p className={`mt-1 text-[11px] ${losing.length ? "text-[#d8cfc2]" : "text-foreground/60"}`}>
                {losing.length ? money(losing.reduce((s, r) => s + r.contribution, 0)) : tr("Ninguno en este periodo")}
              </p>
            </div>
          </div>

          {/* Search and sort */}
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative flex-1 min-w-[14rem]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/40" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr("Buscar cliente")}
                className="w-full rounded-xl border border-foreground/10 bg-white py-2.5 pl-9 pr-3 text-sm" />
            </label>
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label={tr("Ordenar")}
              className="rounded-xl border border-foreground/10 bg-white px-3 py-2.5 text-sm">
              {SORTS.map((s) => <option key={s.id} value={s.id}>{tr(s.label)}</option>)}
            </select>
          </div>

          {/* The table */}
          <div className={`${card} overflow-x-auto`}>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-widest text-foreground/50">
                  <th className="px-4 py-3">{tr("Cliente")}</th>
                  <th className="px-3 py-3 text-right">{tr("Ventas netas")}</th>
                  <th className="px-3 py-3 text-right">{tr("Costo del café")}</th>
                  <th className="px-3 py-3 text-right">{tr("Margen bruto")}</th>
                  <th className="px-3 py-3 text-right">{tr("Máquinas")}</th>
                  <th className="px-3 py-3 text-right">{tr("Lo que deja")}</th>
                  <th className="px-4 py-3 w-40" aria-hidden="true"></th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-foreground/50">{tr("Sin ventas en este periodo")}</td></tr>
                )}
                {rows.map((r) => {
                  const isOpen = open === r.key;
                  const short = r.commitmentKg !== null && r.kg < r.commitmentKg;
                  return (
                    <React.Fragment key={r.key}>
                      <tr className={`border-t border-foreground/[0.04] cursor-pointer hover:bg-[#f8f5ef] ${isOpen ? "bg-[#f8f5ef]" : ""}`} onClick={() => setOpen(isOpen ? null : r.key)}>
                        <td className="px-4 py-3">
                          <span className="flex items-center gap-2 font-medium">
                            <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-foreground/40 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                            {r.customer}
                            {r.uncosted.length > 0 && <span title={tr("Tiene productos sin costo")} className="text-amber-600">•</span>}
                          </span>
                          <span className="ml-5 text-[11px] text-foreground/50">
                            {r.kg > 0 ? kg(r.kg) : ""}{r.commitmentKg !== null ? ` / ${kg(r.commitmentKg)} ${tr("pactados")}` : ""}
                            {short && <span className="ml-1 font-bold text-amber-700">{tr("debajo del mínimo")}</span>}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(r.netSales)}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-foreground/70">{r.cost ? money(-r.cost) : "—"}</td>
                        <td className="px-3 py-3 text-right tabular-nums">{money(r.gross)} <span className="text-[11px] text-foreground/50">{pct(r.grossPct)}</span></td>
                        <td className="px-3 py-3 text-right tabular-nums">{r.machines ? <>{r.machines} <span className="text-[11px] text-foreground/50">{money(-r.comodatoCost)}</span></> : "—"}</td>
                        <td className={`px-3 py-3 text-right tabular-nums font-bold ${r.contribution < 0 ? "text-red-700" : ""}`}>{money(r.contribution)}</td>
                        <td className="px-4 py-3">
                          <div className="relative h-2 rounded-full bg-[#f4f1ed]" aria-hidden="true">
                            <div className="absolute inset-y-0 left-1/2 w-px bg-foreground/20" />
                            <div className="absolute inset-y-0 rounded-full" style={{
                              background: r.contribution < 0 ? "#b0614f" : "#C59F59",
                              width: `${(Math.abs(r.contribution) / maxAbs) * 50}%`,
                              ...(r.contribution < 0 ? { right: "50%" } : { left: "50%" }),
                            }} />
                          </div>
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-[#fcfbf8]">
                          <td colSpan={7} className="px-6 py-4">
                            {r.uncosted.length > 0 && (
                              <p className="mb-3 text-xs text-amber-800">
                                {tr("Sin costo (no restado): {items}", { items: r.uncosted.map((u) => `${u.quantity.toLocaleString(locale)} ${u.description}`).join(", ") })}
                              </p>
                            )}
                            {r.docs.length === 0 ? (
                              <p className="text-xs text-foreground/50">{tr("Tiene máquinas en comodato pero no compró en este periodo.")}</p>
                            ) : (
                              <table className="w-full text-xs">
                                <tbody>
                                  {r.docs.map((d, i) => (
                                    <tr key={i} className="border-t border-foreground/[0.04]">
                                      <td className="py-1.5 pr-3 text-foreground/50 tabular-nums">{d.date}</td>
                                      <td className="py-1.5 pr-3 font-medium">{d.doc}</td>
                                      <td className="py-1.5 pr-3 text-foreground/60">{d.lines.map((l) => `${l.quantity.toLocaleString(locale)} × ${l.description}`).join(" · ")}</td>
                                      <td className={`py-1.5 text-right tabular-nums ${d.kind === "nota" ? "text-red-700" : ""}`}>{money(d.kind === "nota" ? -d.base : d.base)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="text-sm">
                  <tr className="border-t border-foreground/10 bg-[#f8f5ef] font-bold">
                    <td className="px-4 py-3">{tr("Total clientes")}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(report.totals.netSales)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(-report.totals.cost)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(report.totals.gross)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{report.totals.comodatoCost ? money(-report.totals.comodatoCost) : "—"}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{money(report.totals.contribution)}</td>
                    <td />
                  </tr>
                  {report.unassignedComodato > 0 && (
                    <tr className="border-t border-foreground/[0.04] text-foreground/70">
                      <td className="px-4 py-2" colSpan={5}>{tr("Máquinas en comodato sin cliente asignado")}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(-report.unassignedComodato)}</td>
                      <td />
                    </tr>
                  )}
                  <tr className="border-t border-foreground/[0.04] text-foreground/70">
                    <td className="px-4 py-2" colSpan={5}>{tr("Gastos de todos (ventas y administración), no repartidos")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(-report.sharedExpenses)}</td>
                    <td />
                  </tr>
                  <tr className="border-t border-foreground/10 bg-[#2c2a29] font-bold text-[#fdfbf7]">
                    <td className="px-4 py-3" colSpan={5}>{tr("Queda para intereses y resultado")}</td>
                    <td className={`px-3 py-3 text-right tabular-nums ${report.totals.contribution - report.unassignedComodato - report.sharedExpenses < 0 ? "text-[#ffb4a8]" : "text-[#9fd3a8]"}`}>
                      {money(report.totals.contribution - report.unassignedComodato - report.sharedExpenses)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="text-[11px] text-foreground/50">
            {tr("El costo aquí sale de lo facturado a cada cliente; en el estado de resultados sale de lo que salió del inventario. Por eso el total puede no coincidir exacto.")}
          </p>
        </div>
      )}
    </div>
  );
}

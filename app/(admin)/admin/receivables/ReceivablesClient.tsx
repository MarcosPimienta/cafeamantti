"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Download, Loader2, RefreshCw } from "lucide-react";
import { setReceivableSite } from "./actions";
import { groupReceivables, receivableLines, type Bucketed, type ReceivableInvoice } from "@/utils/invoices/receivables";
import { receivablesSheets, siteName, type SiteInfo } from "@/utils/invoices/receivablesExcel";
import { useTr } from "@/app/(admin)/AdminI18n";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

type Site = SiteInfo & { id: string; client_id: string };
const SOURCE_LABEL: Record<string, string> = { branch: "por la sucursal de Siigo", notes: "por las observaciones", manual: "asignada a mano" };

export default function ReceivablesClient({ invoices, sites, today, error }: { invoices: ReceivableInvoice[]; clients: { id: string; name: string }[]; sites: Site[]; today: string; error: string | null }) {
  const tr = useTr();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [assignError, setAssignError] = useState("");
  const assign = (invoiceId: string, siteId: string) =>
    startTransition(async () => {
      setAssignError("");
      const res = await setReceivableSite(invoiceId, siteId || null);
      if (!res.success) return setAssignError(res.error);
      router.refresh();
    });
  const [cutoff, setCutoff] = useState(today);
  const [clientId, setClientId] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s])), [sites]);
  const lines = useMemo(() => receivableLines(invoices, cutoff), [invoices, cutoff]);
  // Clients are keyed by app client, else by NIT (an invoice of a client not in the app).
  const keyOf = (i: ReceivableInvoice) => i.client_id ?? `nit:${i.customer_identification ?? i.customer_name}`;
  const debtors = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of lines) m.set(keyOf(l.invoice), l.invoice.customer_name);
    return [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [lines]);
  const shown = useMemo(() => (clientId ? lines.filter((l) => keyOf(l.invoice) === clientId) : lines), [lines, clientId]);
  const { clients: groups, totals } = useMemo(() => groupReceivables(shown, sites.map((s) => s.id)), [shown, sites]);

  if (error) return <p className="rounded-2xl bg-red-50 p-4 text-sm text-red-700">{tr.msg(error)}</p>;

  const scope = clientId ? (debtors.find((c) => c.id === clientId)?.name ?? "") : tr("Todos los clientes");
  const download = async () => {
    setExporting(true);
    try {
      const { downloadWorkbook } = await import("@/utils/excel/workbook");
      const sheets = receivablesSheets({ clients: groups, totals, sites: siteMap, cutoff, scope });
      const slug = scope.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "");
      downloadWorkbook(`Estado_de_cuenta_${slug}_${cutoff}.xlsx`, sheets);
    } finally {
      setExporting(false);
    }
  };

  const money = (t: Bucketed) => (
    <>
      <td className="px-3 py-2 text-right">{t.count}</td>
      <td className="px-3 py-2 text-right">{cop(t.billed)}</td>
      <td className="px-3 py-2 text-right">{cop(t.paid)}</td>
      <td className="px-3 py-2 text-right font-bold">{cop(t.balance)}</td>
      <td className={`px-3 py-2 text-right ${t.vencido > 0 ? "text-red-600 font-bold" : "text-foreground/40"}`}>{cop(t.vencido)}</td>
      <td className={`px-3 py-2 text-right ${t.hoy > 0 ? "text-amber-700 font-bold" : "text-foreground/40"}`}>{cop(t.hoy)}</td>
      <td className="px-3 py-2 text-right">{cop(t.por_vencer)}</td>
    </>
  );

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-4">
        {([
          ["Saldo por cobrar", totals.balance, ""],
          ["Vencido", totals.vencido, "text-red-600"],
          ["Vence hoy", totals.hoy, "text-amber-700"],
          ["Por vencer", totals.por_vencer, ""],
        ] as [string, number, string][]).map(([label, value, color]) => (
          <div key={label} className="rounded-2xl border border-foreground/10 p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{tr(label)}</p>
            <p className={`mt-1 text-2xl font-serif ${color}`}>{cop(value)}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs font-bold text-foreground/60 space-y-1">
          <span className="block">{tr("Fecha de corte")}</span>
          <input type="date" value={cutoff} onChange={(e) => setCutoff(e.target.value || today)} className="px-3 py-2 border border-foreground/10 rounded-xl text-sm bg-white" />
        </label>
        <label className="text-xs font-bold text-foreground/60 space-y-1 min-w-0">
          <span className="block">{tr("Cliente")}</span>
          <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="px-3 py-2 border border-foreground/10 rounded-xl text-sm bg-white max-w-full">
            <option value="">{tr("Todos los clientes")}</option>
            {debtors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <button type="button" onClick={() => router.refresh()} className="ml-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-foreground/15 text-sm font-bold hover:bg-foreground/5" title={tr("Vuelve a leer los saldos de Siigo")}>
          <RefreshCw className="w-4 h-4" />{" "}{tr("Actualizar")}
        </button>
        <button type="button" onClick={download} disabled={exporting || !groups.length} className=" inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59F59] text-white text-sm font-bold hover:bg-[#B38E4D] disabled:opacity-40">
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}{" "}{tr("Descargar Excel")}
        </button>
      </div>

      {assignError && <p className="text-sm text-red-600 break-words">{tr.msg(assignError)}</p>}
      {groups.length === 0 ? (
        <p className="text-sm text-foreground/50">{tr("Nadie debe nada a esta fecha de corte.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-foreground/10">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-[#3a2c22] text-left text-[11px] uppercase tracking-wider text-white">
              <tr>
                <th className="px-3 py-2">{tr("Empresa / Sede")}</th>
                <th className="px-3 py-2 text-right">{tr("N° facturas")}</th>
                <th className="px-3 py-2 text-right">{tr("Total facturado")}</th>
                <th className="px-3 py-2 text-right">{tr("Abonos")}</th>
                <th className="px-3 py-2 text-right">{tr("Saldo")}</th>
                <th className="px-3 py-2 text-right">{tr("Vencido")}</th>
                <th className="px-3 py-2 text-right">{tr("Vence hoy")}</th>
                <th className="px-3 py-2 text-right">{tr("Por vencer")}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((c) => (
                <React.Fragment key={c.clientId ?? c.name}>
                  {c.sites.map((s) => {
                    const key = `${c.clientId}:${s.siteId}`;
                    const info = s.siteId ? siteMap.get(s.siteId) : undefined;
                    return (
                      <React.Fragment key={key}>
                        <tr className="border-t border-foreground/5 hover:bg-foreground/[0.02] cursor-pointer" onClick={() => setOpen(open === key ? null : key)}>
                          <td className="px-3 py-2">
                            <span className="flex items-start gap-1">
                              {open === key ? <ChevronDown className="w-4 h-4 mt-0.5 shrink-0" /> : <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" />}
                              <span className="min-w-0">
                                <span className="font-bold">{c.name}</span>
                                <span className={`block text-xs ${s.siteId ? "text-[#9a7a3c] font-bold" : "text-foreground/40"}`}>{s.siteId ? siteName(s.siteId, siteMap) : tr("Sin sede identificada")}</span>
                                {info && <span className="block text-[11px] text-foreground/40">{[info.address, info.city].filter(Boolean).join(", ")}</span>}
                              </span>
                            </span>
                          </td>
                          {money(s.totals)}
                        </tr>
                        {open === key && (
                          <tr>
                            <td colSpan={8} className="bg-foreground/[0.02] px-6 py-3 overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead className="text-left text-foreground/50">
                                  <tr><th className="py-1">{tr("Factura")}</th><th>{tr("Fecha")}</th><th>{tr("Vence")}</th><th>{tr("Estado")}</th><th className="text-right">{tr("Total")}</th><th className="text-right">{tr("Abonos")}</th><th className="text-right">{tr("Saldo")}</th><th className="pl-4">{tr("Sede")}</th></tr>
                                </thead>
                                <tbody>
                                  {s.lines.map((l) => (
                                    <tr key={l.invoice.id} className="border-t border-foreground/5">
                                      <td className="py-1 font-mono">{l.invoice.name}</td>
                                      <td>{l.invoice.issue_date}</td>
                                      <td>{l.invoice.due_date}</td>
                                      <td className={l.bucket === "vencido" ? "text-red-600 font-bold" : l.bucket === "hoy" ? "text-amber-700 font-bold" : ""}>
                                        {l.bucket === "vencido" ? tr("Vencida hace {n} día(s)", { n: String(l.daysOverdue) }) : l.bucket === "hoy" ? tr("Vence hoy") : tr("Por vencer")}
                                      </td>
                                      <td className="text-right">{cop(l.billed)}</td>
                                      <td className="text-right">{cop(l.paid)}</td>
                                      <td className="text-right font-bold">{cop(l.balance)}</td>
                                      <td className="pl-4" onClick={(e) => e.stopPropagation()}>
                                        {l.invoice.client_id && sites.some((x) => x.client_id === l.invoice.client_id) ? (
                                          <select value={l.invoice.site_id ?? ""} disabled={isPending} onChange={(e) => assign(l.invoice.id, e.target.value)}
                                            className="max-w-[12rem] px-2 py-1 border border-foreground/10 rounded-lg bg-white text-xs" aria-label={tr("Sede de {name}", { name: l.invoice.name })}>
                                            <option value="">{tr("Sin sede")}</option>
                                            {sites.filter((x) => x.client_id === l.invoice.client_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                                          </select>
                                        ) : <span className="text-foreground/40">—</span>}
                                        {l.invoice.site_source && SOURCE_LABEL[l.invoice.site_source] && <span className="block text-[10px] text-foreground/40">{tr(SOURCE_LABEL[l.invoice.site_source])}</span>}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                  {c.sites.length > 1 && (
                    <tr className="border-t border-foreground/10 bg-[#f3ece2] font-bold">
                      <td className="px-3 py-2">{tr("Subtotal {name}", { name: c.name })}</td>
                      {money(c.totals)}
                    </tr>
                  )}
                </React.Fragment>
              ))}
              <tr className="border-t-2 border-foreground/20 bg-[#3a2c22] text-white font-bold">
                <td className="px-3 py-2">{tr("TOTAL GENERAL")}</td>
                <td className="px-3 py-2 text-right">{totals.count}</td>
                <td className="px-3 py-2 text-right">{cop(totals.billed)}</td>
                <td className="px-3 py-2 text-right">{cop(totals.paid)}</td>
                <td className="px-3 py-2 text-right">{cop(totals.balance)}</td>
                <td className="px-3 py-2 text-right">{cop(totals.vencido)}</td>
                <td className="px-3 py-2 text-right">{cop(totals.hoy)}</td>
                <td className="px-3 py-2 text-right">{cop(totals.por_vencer)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

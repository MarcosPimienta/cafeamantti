"use client";

import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RefreshCw, Search } from "lucide-react";
import { getCreditNotesList } from "./actions";
import type { CreditNoteRow } from "@/utils/invoices/creditNotesList";
import { useTr } from "@/app/(admin)/AdminI18n";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const DIAN: Record<string, { label: string; cls: string }> = {
  Accepted: { label: "Aceptada por la DIAN", cls: "bg-green-100 text-green-700" },
  Draft: { label: "Sin enviar a la DIAN", cls: "bg-amber-100 text-amber-800" },
  Rejected: { label: "Rechazada por la DIAN", cls: "bg-red-100 text-red-700" },
  Pending: { label: "Enviada a la DIAN", cls: "bg-sky-100 text-sky-700" },
  Sending: { label: "Enviando a la DIAN…", cls: "bg-sky-100 text-sky-700" },
};

type Filter = "todas" | "borrador";

/** Every credit note, the app's and Siigo's, with what is still to send to the DIAN. */
export default function CreditNotesView({ onOpenInvoice }: { onOpenInvoice: (invoiceName: string) => void }) {
  const tr = useTr();
  const [rows, setRows] = useState<CreditNoteRow[] | null>(null);
  const [siigoOk, setSiigoOk] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("todas");
  const [search, setSearch] = useState("");

  function load() {
    setLoading(true);
    setError("");
    getCreditNotesList()
      .then((res) => {
        if (!res.success) return setError(res.error);
        setRows(res.rows);
        setSiigoOk(res.siigoOk);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }
  useEffect(load, []);

  const drafts = (rows ?? []).filter((r) => r.dian === "Draft");
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (rows ?? []).filter((r) => {
      if (filter === "borrador" && r.dian !== "Draft") return false;
      if (!q) return true;
      return [r.name, r.invoiceName, r.customer, r.notes].some((v) => String(v ?? "").toLowerCase().includes(q));
    });
  }, [rows, filter, search]);

  if (loading && !rows) {
    return <p className="flex items-center gap-2 text-sm text-foreground/50"><Loader2 className="w-4 h-4 animate-spin" />{tr("Trayendo las notas crédito de Siigo…")}</p>;
  }

  return (
    <div className="space-y-5">
      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 break-words">{tr.msg(error)}</p>}
      {!siigoOk && (
        <p className="flex items-center gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          <AlertTriangle className="w-4 h-4 shrink-0" />{tr("No se pudo leer Siigo: solo se ven las notas crédito que tiene la app.")}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-foreground/10 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{tr("Notas crédito (último año)")}</p>
          <p className="mt-1 text-2xl font-serif">{rows?.length ?? 0}</p>
        </div>
        <div className="rounded-2xl border border-foreground/10 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{tr("Valor total")}</p>
          <p className="mt-1 text-2xl font-serif">{cop((rows ?? []).reduce((s, r) => s + r.total, 0))}</p>
        </div>
        <div className={`rounded-2xl border p-4 ${drafts.length ? "border-amber-300 bg-amber-50/60" : "border-foreground/10"}`}>
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{tr("Sin enviar a la DIAN")}</p>
          <p className={`mt-1 text-2xl font-serif ${drafts.length ? "text-amber-800" : ""}`}>{drafts.length}</p>
          {drafts.length > 0 && <p className="text-[11px] text-foreground/60">{tr("Mientras no se envíen, la factura sigue vigente ante la DIAN. Se envían desde Siigo.")}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {([["todas", "Todas"], ["borrador", "Sin enviar a la DIAN"]] as [Filter, string][]).map(([f, label]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border ${filter === f ? "bg-foreground text-background border-foreground" : "border-foreground/15 text-foreground/60 hover:bg-foreground/5"}`}
            >
              {tr(label)}
            </button>
          ))}
          <button type="button" onClick={load} disabled={loading} aria-label={tr("Actualizar")} className="p-1.5 rounded-full text-foreground/40 hover:bg-foreground/5 disabled:opacity-40">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <label className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/40" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr("Buscar nota, factura o cliente")}
            aria-label={tr("Buscar nota, factura o cliente")}
            className="w-full rounded-full border border-foreground/15 py-1.5 pl-9 pr-3 text-sm focus:border-[#C59F59] focus:outline-none"
          />
        </label>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-foreground/50">{(rows ?? []).length === 0 ? tr("Aún no hay notas crédito.") : tr("Ninguna nota crédito en este filtro.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-foreground/10">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-[#fdfbf7] border-b border-foreground/5 text-[10px] font-bold uppercase tracking-widest text-foreground/50">
                <th className="px-4 py-3">{tr("Fecha")}</th>
                <th className="px-4 py-3">{tr("Nota")}</th>
                <th className="px-4 py-3">{tr("Factura")}</th>
                <th className="px-4 py-3">{tr("Cliente")}</th>
                <th className="px-4 py-3">{tr("Tipo")}</th>
                <th className="px-4 py-3 text-right">{tr("Valor")}</th>
                <th className="px-4 py-3">{tr("DIAN")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/5">
              {shown.map((r) => {
                const d = r.dian ? DIAN[r.dian] : undefined;
                return (
                  <tr key={r.key} className="align-top">
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums">{r.date}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-bold">
                      {r.name ?? "—"}
                      <span className="block text-[11px] font-normal text-foreground/50">{r.origin === "app" ? tr("desde la app") : tr("hecha en Siigo")}</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.invoiceName && r.invoiceId ? (
                        <button type="button" onClick={() => onOpenInvoice(r.invoiceName!)} className="font-bold text-[#8a6a2f] underline">{r.invoiceName}</button>
                      ) : (r.invoiceName ?? "—")}
                    </td>
                    <td className="px-4 py-3 min-w-[10rem]">
                      {r.customer}
                      {r.notes && <span className="block text-[11px] text-foreground/50">{r.notes}</span>}
                    </td>
                    <td className="px-4 py-3">{tr(r.reason)}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums whitespace-nowrap">−{cop(r.total)}</td>
                    <td className="px-4 py-3">
                      {d ? <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold ${d.cls}`}>{tr(d.label)}</span> : <span className="text-foreground/40">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

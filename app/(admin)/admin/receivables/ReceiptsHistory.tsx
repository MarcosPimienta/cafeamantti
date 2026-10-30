"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CloudDownload, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { deleteReceipt, importSiigoReceipts, retryReceipt, type Receipt } from "./receiptActions";
import { RECEIPTS_SINCE } from "@/utils/invoices/collections";
import { siteName, type SiteInfo } from "@/utils/invoices/receivablesExcel";
import { useTr } from "@/app/(admin)/AdminI18n";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

const STATUS: Record<Receipt["status"], { label: string; cls: string }> = {
  enviado: { label: "En Siigo", cls: "bg-green-50 text-green-700" },
  importado: { label: "Traído de Siigo", cls: "bg-blue-50 text-blue-700" },
  pendiente: { label: "Pendiente", cls: "bg-amber-50 text-amber-800" },
  error: { label: "Error", cls: "bg-red-50 text-red-700" },
};

/** The deposits registered (and the RCs brought from Siigo since the cutoff), newest first. */
export default function ReceiptsHistory({ receipts, sites }: { receipts: Receipt[] | null; sites: Map<string, SiteInfo> }) {
  const tr = useTr();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const run = (action: () => Promise<{ success: boolean; error?: string } & Record<string, unknown>>, ok: (res: Record<string, unknown>) => string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => {
      setError("");
      setNotice("");
      const res = await action();
      if (!res.success) return setError(res.error ?? "");
      setNotice(ok(res));
      router.refresh();
    });
  };

  if (receipts === null) return <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">{tr("Falta aplicar la migración 20261105000000_customer_receipts.sql para registrar cobros.")}</p>;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-serif font-bold">{tr("Cobros")}</h2>
        <button type="button" disabled={isPending} onClick={() => run(importSiigoReceipts, (res) => {
          const n = (res.imported as string[]).length;
          return n ? tr("Se trajeron {n} recibo(s) de Siigo: {names}.", { n: String(n), names: (res.imported as string[]).join(", ") }) : tr("No hay recibos nuevos en Siigo.");
        })}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border border-foreground/15 text-xs font-bold hover:bg-foreground/5 disabled:opacity-40" title={tr("Los recibos de caja hechos en Siigo desde el {date}", { date: RECEIPTS_SINCE })}>
          {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CloudDownload className="w-3.5 h-3.5" />}{" "}{tr("Traer RC de Siigo")}
        </button>
      </div>
      {notice && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {error && <p className="text-sm text-red-600 break-words">{tr.msg(error)}</p>}
      {receipts.length === 0 ? (
        <p className="text-sm text-foreground/50">{tr("Aún no hay cobros registrados.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-foreground/10">
          <table className="w-full min-w-[820px] text-xs">
            <thead className="bg-foreground/[0.03] text-left text-foreground/50">
              <tr>
                <th className="px-3 py-2">{tr("Fecha")}</th>
                <th className="px-3 py-2">{tr("Recibo")}</th>
                <th className="px-3 py-2">{tr("Cliente / Sede")}</th>
                <th className="px-3 py-2">{tr("Facturas")}</th>
                <th className="px-3 py-2 text-right">{tr("Valor")}</th>
                <th className="px-3 py-2">{tr("Estado")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {receipts.map((r) => (
                <tr key={r.id} className="border-t border-foreground/5 align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{r.receipt_date}</td>
                  <td className="px-3 py-2 font-mono">{r.siigo_name ?? "—"}<span className="block font-sans text-[10px] text-foreground/40">{r.method === "cash" ? tr("Caja") : tr("Banco")}</span></td>
                  <td className="px-3 py-2">
                    <span className="font-bold">{r.customer_name}</span>
                    {r.site_id && <span className="block text-[#9a7a3c] font-bold">{siteName(r.site_id, sites)}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {r.items.map((i) => <span key={i.name} className="block"><span className="font-mono">{i.name}</span> · {cop(i.value)}</span>)}
                  </td>
                  <td className="px-3 py-2 text-right font-bold">{cop(Number(r.amount))}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-1.5 py-0.5 rounded font-bold ${STATUS[r.status].cls}`}>{tr(STATUS[r.status].label)}</span>
                    {r.siigo_error && <span className="block max-w-[16rem] text-[10px] text-red-600 break-words">{tr.msg(r.siigo_error)}</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-right">
                    {(r.status === "error" || r.status === "pendiente") && (
                      <span className="inline-flex items-center gap-3">
                        <button type="button" disabled={isPending} onClick={() => run(() => retryReceipt(r.id), (res) => (res.sent ? tr("Recibo enviado a Siigo: {name}.", { name: String(res.name ?? "") }) : tr("Siigo no lo recibió: {error}", { error: tr.msg(String(res.siigoError ?? "")) })))}
                          className="inline-flex items-center gap-1 font-bold text-[#C59F59] hover:underline disabled:opacity-40"><RefreshCw className="w-3 h-3" />{" "}{tr("Reintentar")}</button>
                        <button type="button" disabled={isPending} onClick={() => run(() => deleteReceipt(r.id), () => tr("Cobro eliminado (y su ingreso en Flujo de Caja)."), tr("¿Eliminar este cobro? También se borra su ingreso en Flujo de Caja."))}
                          aria-label={tr("Eliminar cobro")} className="text-foreground/40 hover:text-red-600 disabled:opacity-40"><Trash2 className="w-3.5 h-3.5" /></button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

"use client";

import React, { useState, useTransition } from "react";
import { AlertTriangle, ExternalLink, FileText, Loader2, RefreshCw } from "lucide-react";
import { createSiigoInvoice, previewSiigoInvoice, refreshSiigoInvoice } from "../siigo/actions";
import { useTr } from "@/app/(admin)/AdminI18n";

type Method = "web" | "cash" | "transfer";
type Preview = {
  problems: string[];
  customer: string;
  electronic: boolean;
  lines: { code: string; description: string; quantity: number; price: number }[];
  total: number;
};

const PAID = new Set(["paid", "processing", "shipped", "delivered"]);
const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
const STATUS_LABEL: Record<string, string> = { Accepted: "Aceptada por la DIAN", Rejected: "Rechazada por la DIAN", Pending: "Enviada a la DIAN", Draft: "Creada (sin enviar a la DIAN)" };

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Order panel section: create the order's invoice in Siigo, or show it. */
export default function SiigoInvoiceSection({ order }: { order: any }) {
  const tr = useTr();
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const [invoice, setInvoice] = useState(
    order.siigo_invoice_id
      ? { name: order.siigo_invoice, status: order.siigo_status, url: order.siigo_public_url, cufe: order.siigo_cufe, error: order.siigo_error }
      : null
  );
  const [method, setMethod] = useState<Method>(order.epayco_ref_payco ? "web" : "transfer");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState(order.siigo_invoice_id ? "" : order.siigo_error ?? "");
  const [problems, setProblems] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  if (!invoice && !PAID.has(order.status)) return null;

  const loadPreview = (m: Method) =>
    startTransition(async () => {
      setError("");
      setProblems([]);
      const res = await previewSiigoInvoice(order.id, m);
      if (!res.success) return setError(res.error);
      setPreview(res);
    });

  const create = () => {
    if (preview?.electronic && !window.confirm(tr("La factura se emitirá ante la DIAN. Después solo se puede anular con una nota crédito. ¿Continuar?"))) return;
    startTransition(async () => {
      setError("");
      const res = await createSiigoInvoice(order.id, method);
      if (!res.success) {
        setError(res.error);
        setProblems(res.problems ?? []);
        return;
      }
      if (res.invoice) {
        setInvoice({ name: res.invoice.siigo_invoice, status: res.invoice.siigo_status, url: res.invoice.siigo_public_url, cufe: res.invoice.siigo_cufe, error: res.invoice.siigo_error });
        setPreview(null);
      }
    });
  };

  const refresh = () =>
    startTransition(async () => {
      setError("");
      const res = await refreshSiigoInvoice(order.id);
      if (!res.success) return setError(res.error);
      const i = res.invoice;
      setInvoice({ name: i.siigo_invoice, status: i.siigo_status, url: i.siigo_public_url, cufe: i.siigo_cufe, error: i.siigo_error });
    });

  return (
    <section className="space-y-3 rounded-2xl border border-foreground/10 p-4">
      <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">
        <FileText className="w-3.5 h-3.5" />{" "}{tr("Factura en Siigo")}
      </h3>

      {invoice ? (
        <div className="space-y-2 text-sm">
          <p>
            <strong>{invoice.name ?? tr("Factura creada")}</strong>
            {invoice.status && <span className={`ml-2 text-xs ${/reject/i.test(invoice.status) ? "text-red-600" : "text-foreground/60"}`}>{tr.msg(STATUS_LABEL[invoice.status] ?? invoice.status)}</span>}
          </p>
          {invoice.cufe && <p className="text-[11px] text-foreground/40 break-all">{tr("CUFE {cufe}", { cufe: invoice.cufe })}</p>}
          {invoice.error && <p className="text-xs text-red-600 break-words">{invoice.error}</p>}
          <div className="flex flex-wrap gap-3">
            {invoice.url && (
              <a href={invoice.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#C59F59] hover:underline">
                {tr("Ver factura")}{" "}<ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button type="button" onClick={refresh} disabled={isPending} className="inline-flex items-center gap-1 text-xs font-bold text-foreground/60 hover:text-foreground disabled:opacity-50">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}{" "}{tr("Actualizar estado")}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label htmlFor={`sg-method-${order.id}`} className="block text-xs text-foreground/60 mb-1">{tr("Forma de pago")}</label>
              <select id={`sg-method-${order.id}`} value={method} onChange={(e) => { const m = e.target.value as Method; setMethod(m); if (preview) loadPreview(m); }}
                className="px-3 py-2 rounded-lg border border-foreground/10 bg-white text-sm">
                <option value="web">{tr("Pago web (ePayco)")}</option>
                <option value="transfer">{tr("Transferencia")}</option>
                <option value="cash">{tr("Efectivo")}</option>
              </select>
            </div>
            {!preview && (
              <button type="button" onClick={() => loadPreview(method)} disabled={isPending}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-foreground/15 text-xs font-bold hover:bg-foreground/5 disabled:opacity-50">
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{" "}{tr("Revisar factura")}
              </button>
            )}
          </div>

          {preview && (
            <div className="space-y-2 text-sm">
              <p className="text-xs text-foreground/60">{tr("Cliente:")}{" "}<strong className="text-foreground">{preview.customer}</strong></p>
              <ul className="text-xs space-y-1">
                {preview.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2">
                    <span className="truncate"><span className="font-mono text-foreground/50">{l.code || tr("¿código?")}</span> {tr(l.description)} × {l.quantity}</span>
                    <span className="shrink-0">{cop(l.price * l.quantity)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-right font-bold">{cop(preview.total)}</p>
              {(preview.problems.length > 0 || problems.length > 0) ? (
                <ul className="text-xs text-red-700 bg-red-50 rounded-xl p-3 space-y-1">
                  {[...new Set([...preview.problems, ...problems])].map((p) => <li key={p} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{tr.msg(p)}</li>)}
                </ul>
              ) : (
                <p className="text-xs text-foreground/60">
                  {preview.electronic ? tr("Se emitirá como factura electrónica ante la DIAN, con fecha de hoy.") : tr("Se creará en Siigo sin enviarse a la DIAN (modo de prueba en Ajustes → Siigo).")}
                </p>
              )}
              <div className="flex gap-2">
                <button type="button" onClick={() => setPreview(null)} className="px-3 py-2 rounded-lg border border-foreground/15 text-xs font-bold hover:bg-foreground/5">{tr("Cancelar")}</button>
                <button type="button" onClick={create} disabled={isPending || preview.problems.length > 0}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-foreground text-background text-xs font-bold hover:bg-[#C59F59] disabled:opacity-40">
                  {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />} {preview.electronic ? tr("Emitir factura electrónica") : tr("Crear factura en Siigo")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600 break-words">{tr.msg(error)}</p>}
    </section>
  );
}

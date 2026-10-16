"use client";

import React, { useMemo, useState, useTransition } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { createCreditNote } from "./actions";
import { CREDIT_REASONS, creditNoteLines, lineValue, type CreditInput, type CreditReason, type InvoiceLine } from "@/utils/invoices/ledger";
import { useTr } from "@/app/(admin)/AdminI18n";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

type Invoice = {
  id: string;
  siigo_name: string | null;
  siigo_status: string | null;
  total: number;
  shipping?: number;
  lines: InvoiceLine[];
  credit_notes?: { reason: number; total: number; lines: (InvoiceLine & { restock?: boolean })[] }[];
};

const REASON_HINT: Record<CreditReason, string> = {
  1: "El cliente devuelve parte de los productos.",
  2: "La factura queda sin efecto por su valor total.",
  3: "Baja el valor que el cliente paga, sin devolver productos.",
  4: "Corrige el precio cobrado, sin devolver productos.",
};

/** Credit note against an invoice already in Siigo, with what it does to the order and the inventory. */
export default function CreditNoteModal({ invoice, onClose, onDone }: { invoice: Invoice; onClose: () => void; onDone: () => void }) {
  const tr = useTr();
  const draft = !invoice.siigo_status || invoice.siigo_status === "Draft";
  const credited = (invoice.credit_notes ?? []).reduce((s, n) => s + Number(n.total), 0);
  const [reason, setReason] = useState<CreditReason>(credited > 0 ? 1 : 2);
  const [cancelOrder, setCancelOrder] = useState(false);
  const [qty, setQty] = useState<Record<number, string>>({});
  const [restock, setRestock] = useState<Record<number, boolean>>({});
  const [amount, setAmount] = useState<Record<number, string>>({});
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  // Units already returned by earlier notes, per line.
  const returned = useMemo(() => {
    const out: Record<number, number> = {};
    for (const n of invoice.credit_notes ?? []) {
      if (n.reason !== 1) continue;
      for (const l of n.lines ?? []) {
        const idx = invoice.lines.findIndex((x) => x.code === l.code && x.inventory_id === l.inventory_id);
        if (idx >= 0) out[idx] = (out[idx] ?? 0) + Number(l.quantity);
      }
    }
    return out;
  }, [invoice]);

  const input: CreditInput =
    reason === 2
      ? { reason, cancelOrder, notes }
      : reason === 1
        ? { reason, notes, items: invoice.lines.map((_, i) => ({ index: i, quantity: Number(qty[i] || 0), restock: restock[i] ?? true })) }
        : { reason, notes, items: invoice.lines.map((_, i) => ({ index: i, amount: Number(amount[i] || 0) })) };
  const { lines, problems } = creditNoteLines({ lines: invoice.lines, total: invoice.total, credited }, input, returned);
  const total = reason === 2 ? Number(invoice.total) : lines.reduce((s, l) => s + lineValue(l), 0);

  const send = () => {
    const what =
      draft && reason === 2
        ? tr("La factura {name} no se ha enviado a la DIAN: se anulará en Siigo. ¿Continuar?", { name: invoice.siigo_name ?? "" })
        : tr("Se creará en Siigo una nota crédito por {total} a la factura {name}. ¿Continuar?", { total: cop(total), name: invoice.siigo_name ?? "" });
    if (!window.confirm(what)) return;
    startTransition(async () => {
      setError("");
      const res = await createCreditNote(invoice.id, input);
      if (!res.success) return setError(res.error);
      onDone();
    });
  };

  const field = "px-2 py-1.5 bg-white border border-foreground/10 rounded-lg text-sm";
  return (
    <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-xl w-full max-h-[90vh] overflow-y-auto border border-foreground/5 shadow-2xl p-6 space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h2 className="text-xl font-serif font-bold">{tr("Nota crédito")}</h2>
            <p className="text-xs text-foreground/50">{tr("Factura {name}", { name: invoice.siigo_name ?? "" })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("Cerrar")} className="p-1 text-foreground/40 hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {([2, 1, 3, 4] as CreditReason[]).map((r) => (
            <button key={r} type="button" onClick={() => setReason(r)} disabled={r === 2 && credited > 0}
              className={`text-left rounded-xl border p-3 text-xs disabled:opacity-40 ${reason === r ? "border-[#C59F59] bg-[#C59F59]/5" : "border-foreground/10 hover:bg-foreground/[0.02]"}`}>
              <span className="block font-bold text-sm">{tr(CREDIT_REASONS[r])}</span>
              <span className="text-foreground/50">{tr(REASON_HINT[r])}</span>
            </button>
          ))}
        </div>

        {reason === 2 && (
          <div className="space-y-2 text-sm">
            <label className="flex items-start gap-2">
              <input type="radio" checked={!cancelOrder} onChange={() => setCancelOrder(false)} className="mt-1" />
              <span>{tr("Mantener el pedido para volver a facturarlo")}<span className="block text-xs text-foreground/50">{tr("El inventario sigue el estado del pedido: si no está pagado, vuelve.")}</span></span>
            </label>
            <label className="flex items-start gap-2">
              <input type="radio" checked={cancelOrder} onChange={() => setCancelOrder(true)} className="mt-1" />
              <span>{tr("Cancelar el pedido")}<span className="block text-xs text-foreground/50">{tr("La venta se deshace: todo el inventario vuelve.")}</span></span>
            </label>
          </div>
        )}

        {reason !== 2 && (
          <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full min-w-[26rem] text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-widest text-foreground/40">
                <th className="py-1">{tr("Producto")}</th>
                <th className="py-1 text-right">{tr("Facturado")}</th>
                <th className="py-1 text-right">{reason === 1 ? tr("Devuelve") : tr("Rebaja ($)")}</th>
                {reason === 1 && <th className="py-1 text-center">{tr("Al inventario")}</th>}
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l, i) => (
                <tr key={i} className="border-t border-foreground/5">
                  <td className="py-2 pr-2">{l.name}</td>
                  <td className="py-2 text-right text-xs text-foreground/60 whitespace-nowrap">
                    {reason === 1 ? `${l.quantity - (returned[i] ?? 0)} / ${l.quantity}` : cop(l.quantity * l.unit_price)}
                  </td>
                  <td className="py-2 text-right">
                    {reason === 1 ? (
                      <input type="number" min={0} max={l.quantity - (returned[i] ?? 0)} step={1} value={qty[i] ?? ""} onChange={(e) => setQty({ ...qty, [i]: e.target.value })} className={`${field} w-20 text-right`} aria-label={tr("Unidades que devuelve")} />
                    ) : (
                      <input type="number" min={0} step={1} value={amount[i] ?? ""} onChange={(e) => setAmount({ ...amount, [i]: e.target.value })} className={`${field} w-28 text-right`} aria-label={tr("Valor a rebajar")} />
                    )}
                  </td>
                  {reason === 1 && (
                    <td className="py-2 text-center">
                      <input type="checkbox" checked={restock[i] ?? true} onChange={(e) => setRestock({ ...restock, [i]: e.target.checked })} aria-label={tr("Vuelve al inventario")} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {reason === 1 && <p className="text-[11px] text-foreground/50">{tr("Desmarca «Al inventario» si lo devuelto no se puede vender (dañado o abierto).")}</p>}

        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("Motivo o nota (opcional)")} className={`${field} w-full`} />

        <div className="flex justify-between items-center rounded-xl bg-[#fdfbf7] px-4 py-3 text-sm">
          <span className="font-bold">{tr("Valor de la nota crédito")}</span>
          <span className="font-bold">{cop(total)}</span>
        </div>
        {credited > 0 && <p className="text-xs text-foreground/50">{tr("Ya tiene notas crédito por {total}.", { total: cop(credited) })}</p>}

        {problems.length > 0 && reason !== 2 && total > 0 && (
          <ul className="text-xs text-red-700 bg-red-50 rounded-xl p-3 space-y-1">
            {problems.map((p) => <li key={p} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{tr.msg(p)}</li>)}
          </ul>
        )}
        {error && <p className="text-xs text-red-600 break-words">{tr.msg(error)}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-foreground/10 text-xs font-bold hover:bg-stone-50">{tr("Cancelar")}</button>
          <button type="button" onClick={send} disabled={isPending || problems.length > 0}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-foreground text-background text-xs font-bold hover:bg-[#C59F59] disabled:opacity-40">
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{" "}{draft && reason === 2 ? tr("Anular en Siigo") : tr("Crear nota crédito")}
          </button>
        </div>
      </div>
    </div>
  );
}

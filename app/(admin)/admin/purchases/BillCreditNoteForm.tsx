"use client";

import React, { useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { registerBillCreditNote, registerPartialBillCreditNote } from "./actions";
import { partialCreditEffect, partialCreditProblems } from "@/utils/payables/ledger";
import { useTr } from "@/app/(admin)/AdminI18n";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

/**
 * A supplier's credit note. For the whole invoice: it is anulada, the goods
 * leave the inventory if they went back, and what was paid becomes saldo a
 * favor. For part of it (a discount, a corrected price): the invoice stays
 * and owes less; what was paid beyond its new value becomes saldo a favor.
 * The accountant registers it in Siigo.
 */
export default function BillCreditNoteForm({
  billId, title, total, credited = 0, paid, supplier, hasStock, today, onClose, onDone,
}: {
  billId: string;
  title: string;
  total: number;
  /** What earlier partial notes already took off. */
  credited?: number;
  paid: number;
  supplier: string;
  /** The invoice brought products into the inventory. */
  hasStock: boolean;
  today: string;
  onClose: () => void;
  onDone: (notice: string) => void;
}) {
  const tr = useTr();
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [goodsReturned, setGoodsReturned] = useState(hasStock);
  const [siigoName, setSiigoName] = useState("");
  // With partial notes already, only another partial one fits.
  const [mode, setMode] = useState<"total" | "parcial">(credited > 0 ? "parcial" : "total");
  const [amountText, setAmountText] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const amount = Number(amountText.replace(/[^\d.,]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
  const left = Math.round((total - credited) * 100) / 100;
  const effect = partialCreditEffect(total, credited, paid, amount);
  const amountProblems = amount > 0 ? partialCreditProblems(total, credited, amount) : [];

  const save = () =>
    startTransition(async () => {
      setError("");
      if (mode === "parcial") {
        const res = await registerPartialBillCreditNote(billId, { number, date, amount, reason, siigoName });
        if (!res.success) return setError(res.error);
        return onDone(
          res.excess > 0.5
            ? tr("Nota crédito registrada: la factura queda en {owed} por pagar y {amount} quedó como saldo a favor con {supplier}.", { owed: cop(res.owed), amount: cop(res.excess), supplier })
            : tr("Nota crédito registrada: la factura queda en {owed} por pagar.", { owed: cop(res.owed) })
        );
      }
      const res = await registerBillCreditNote(billId, { number, date, reason, goodsReturned: hasStock && goodsReturned, siigoName });
      if (!res.success) return setError(res.error);
      onDone(
        res.paid > 0.5
          ? tr("Factura anulada con la nota crédito. Lo pagado ({amount}) quedó como saldo a favor con {supplier}.", { amount: cop(res.paid), supplier })
          : tr("Factura anulada con la nota crédito.")
      );
    });

  const field = "w-full px-3 py-2 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm";
  return (
    <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-left">
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-foreground/5 shadow-2xl p-6 space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h2 className="text-xl font-serif font-bold">{tr("Nota crédito del proveedor")}</h2>
            <p className="text-xs text-foreground/50">{title}</p>
            <p className="text-xs text-foreground/50">
              {credited > 0
                ? tr("Factura {total} · notas crédito anteriores {credited} · queda {left}.", { total: cop(total), credited: cop(credited), left: cop(left) })
                : tr("Factura por {total}.", { total: cop(total) })}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("Cerrar")} className="p-1 text-foreground/40 hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs font-bold">
          {([["total", tr("Toda la factura")], ["parcial", tr("Una parte (descuento, ajuste)")]] as const).map(([m, label]) => (
            <button key={m} type="button" disabled={m === "total" && credited > 0} onClick={() => setMode(m)}
              className={`rounded-xl border px-3 py-2 disabled:opacity-40 ${mode === m ? "border-[#C59F59] bg-[#C59F59]/10 text-[#9a7a3c]" : "border-foreground/10 text-foreground/60 hover:bg-foreground/5"}`}>
              {label}
            </button>
          ))}
        </div>
        {mode === "parcial" && (
          <label className="text-xs font-bold text-foreground/60 space-y-1 block">
            <span>{tr("Valor de la nota crédito (con IVA, como dice el documento del proveedor)")}</span>
            <input inputMode="decimal" value={amountText} onChange={(e) => setAmountText(e.target.value)} placeholder="$ 0" className={field} />
          </label>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:min-w-0">
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Número de la nota crédito")}</span>
            <input value={number} onChange={(e) => setNumber(e.target.value)} placeholder={tr("Ej. NC-125")} className={field} />
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Fecha de la nota crédito")}</span>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
        </div>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr("Motivo (opcional), ej. factura con valores errados")} className={field} />
        <label className="text-xs font-bold text-foreground/60 space-y-1 block">
          <span>{tr("Número en Siigo (opcional, cuando contabilidad la registre)")}</span>
          <input value={siigoName} onChange={(e) => setSiigoName(e.target.value)} className={field} />
        </label>
        {hasStock && mode === "total" && (
          <label className="flex gap-2 rounded-xl bg-foreground/[0.03] p-3 text-xs">
            <input type="checkbox" checked={goodsReturned} onChange={(e) => setGoodsReturned(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#C59F59] shrink-0" />
            <span>{tr("La mercancía se devolvió al proveedor: sale del inventario. Desmárcalo si se queda (por ejemplo, porque el proveedor envía una factura nueva); en ese caso registra la factura nueva sin cantidades de inventario.")}</span>
          </label>
        )}
        {mode === "parcial" ? (
        <p className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-900">
          {amountProblems.length
            ? tr.msg(amountProblems[0])
            : amount > 0
            ? effect.excess > 0.5
              ? tr("La factura queda valiendo {value}. Ya se pagaron {paid}: {excess} quedan como saldo a favor con {supplier} y dejan de ser gasto en Flujo de Caja.", { value: cop(effect.newValue), paid: cop(paid), excess: cop(effect.excess), supplier })
              : tr("La factura queda valiendo {value} y se debe {owed}.", { value: cop(effect.newValue), owed: cop(Math.max(0, effect.newValue - paid)) })
            : tr("Escribe el valor de la nota crédito.")}
          {" "}{tr("La factura no se anula. Si se devolvió mercancía, sácala del inventario con una salida. A Siigo no se envía nada: contabilidad registra la nota crédito allá.")}
        </p>
        ) : (
        <p className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-900">
          {paid > 0.5
            ? tr("Ya se pagaron {amount}: quedan como saldo a favor con {supplier} y dejan de ser gasto en Flujo de Caja. Ese saldo se usa en el próximo pago o el proveedor lo devuelve.", { amount: cop(paid), supplier })
            : tr("La factura no tiene pagos: deja de deberse y ya.")}
          {" "}{tr("A Siigo no se envía nada: contabilidad registra la nota crédito allá.")}
        </p>
        )}
        {error && <p className="text-xs text-red-600 break-words">{tr.msg(error)}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-foreground/10 text-xs font-bold hover:bg-stone-50">{tr("Cancelar")}</button>
          <button type="button" onClick={save} disabled={isPending || !number.trim() || (mode === "parcial" && (!(amount > 0) || amountProblems.length > 0))} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59F59] text-white text-xs font-bold hover:bg-[#B38E4D] disabled:opacity-40">
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{" "}{mode === "parcial" ? tr("Registrar nota crédito") : tr("Anular con nota crédito")}
          </button>
        </div>
      </div>
    </div>
  );
}

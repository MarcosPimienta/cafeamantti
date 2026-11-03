"use client";

import React, { useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { registerBillCreditNote } from "./actions";
import { useTr } from "@/app/(admin)/AdminI18n";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

/**
 * A supplier's credit note that voids a whole purchase invoice. The
 * accountant registers it in Siigo; here the invoice is anulada, the goods
 * leave the inventory if they went back, and what was paid becomes saldo a
 * favor with the supplier.
 */
export default function BillCreditNoteForm({
  billId, title, total, paid, supplier, hasStock, today, onClose, onDone,
}: {
  billId: string;
  title: string;
  total: number;
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
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError("");
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
            <p className="text-xs text-foreground/50">{tr("Anula toda la factura ({total}).", { total: cop(total) })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("Cerrar")} className="p-1 text-foreground/40 hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
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
        {hasStock && (
          <label className="flex gap-2 rounded-xl bg-foreground/[0.03] p-3 text-xs">
            <input type="checkbox" checked={goodsReturned} onChange={(e) => setGoodsReturned(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#C59F59] shrink-0" />
            <span>{tr("La mercancía se devolvió al proveedor: sale del inventario. Desmárcalo si se queda (por ejemplo, porque el proveedor envía una factura nueva); en ese caso registra la factura nueva sin cantidades de inventario.")}</span>
          </label>
        )}
        <p className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-900">
          {paid > 0.5
            ? tr("Ya se pagaron {amount}: quedan como saldo a favor con {supplier} y dejan de ser gasto en Flujo de Caja. Ese saldo se usa en el próximo pago o el proveedor lo devuelve.", { amount: cop(paid), supplier })
            : tr("La factura no tiene pagos: deja de deberse y ya.")}
          {" "}{tr("A Siigo no se envía nada: contabilidad registra la nota crédito allá.")}
        </p>
        {error && <p className="text-xs text-red-600 break-words">{tr.msg(error)}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-foreground/10 text-xs font-bold hover:bg-stone-50">{tr("Cancelar")}</button>
          <button type="button" onClick={save} disabled={isPending || !number.trim()} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59F59] text-white text-xs font-bold hover:bg-[#B38E4D] disabled:opacity-40">
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{" "}{tr("Anular con nota crédito")}
          </button>
        </div>
      </div>
    </div>
  );
}

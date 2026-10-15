"use client";

import React, { useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { registerPayablePayment, type PayableTarget } from "./actions";
import type { PayableMethod } from "@/utils/payables/ledger";
import { useTr } from "@/app/(admin)/AdminI18n";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

/**
 * Pays (part of) a purchase invoice or a signed cuenta de cobro: the egreso
 * goes to Siigo and the money that left goes to Flujo de Caja.
 */
export default function PayablePaymentForm({
  target, title, balance, today, categories, defaultCategory, onClose, onDone,
}: {
  target: PayableTarget;
  title: string;
  balance: number;
  today: string;
  /** Only for cuentas de cobro: the expense category of the payment. */
  categories?: string[];
  defaultCategory?: string | null;
  onClose: () => void;
  onDone: (notice: string) => void;
}) {
  const tr = useTr();
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(String(Math.round(balance)));
  const [method, setMethod] = useState<PayableMethod>("bank");
  const [category, setCategory] = useState(defaultCategory ?? "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError("");
      const res = await registerPayablePayment(target, { date, amount: Number(amount), method, notes, category: categories ? category : null });
      if (!res.success) return setError(res.error);
      onDone(
        res.siigo?.sent
          ? tr("Pago registrado: egreso {name} en Siigo y salida en Flujo de Caja.", { name: res.siigo.name ?? "" })
          : res.siigo && !res.siigo.sent
            ? tr("Pago registrado en Flujo de Caja, pero Siigo no lo recibió: {error}", { error: tr.msg(res.siigo.error ?? "") })
            : res.waitingForDocument
              ? tr("Pago registrado en Flujo de Caja. El egreso irá a Siigo cuando el documento esté allá.")
              : tr("Pago registrado en Flujo de Caja. Regístralo también en Siigo (el documento se hizo a mano allá).")
      );
    });

  const field = "w-full px-3 py-2 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm";
  return (
    <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-left">
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-foreground/5 shadow-2xl p-6 space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h2 className="text-xl font-serif font-bold">{tr("Registrar pago")}</h2>
            <p className="text-xs text-foreground/50">{title}</p>
            <p className="text-xs text-foreground/50">{tr("Saldo por pagar: {balance}", { balance: cop(balance) })}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("Cerrar")} className="p-1 text-foreground/40 hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Fecha del pago")}</span>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Valor pagado")}</span>
            <input type="number" min={0} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Medio de pago")}</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as PayableMethod)} className={field}>
              <option value="bank">{tr("Banco (transferencia)")}</option>
              <option value="cash">{tr("Efectivo")}</option>
            </select>
          </label>
          {categories && (
            <label className="text-xs font-bold text-foreground/60 space-y-1">
              <span>{tr("Categoría del gasto")}</span>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
                <option value="">{tr("— Elige —")}</option>
                {categories.map((c) => <option key={c} value={c}>{tr(c)}</option>)}
              </select>
            </label>
          )}
        </div>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("Nota (opcional)")} className={field} />
        <p className="text-[11px] text-foreground/50">{tr("Se crea el egreso en Siigo contra el documento y la salida en Flujo de Caja con esta fecha, por el valor pagado.")}</p>
        {error && <p className="text-xs text-red-600 break-words">{tr.msg(error)}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-foreground/10 text-xs font-bold hover:bg-stone-50">{tr("Cancelar")}</button>
          <button type="button" onClick={save} disabled={isPending} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59F59] text-white text-xs font-bold hover:bg-[#B38E4D] disabled:opacity-40">
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{" "}{tr("Registrar pago")}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import React, { useEffect, useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { getAdvanceBalance, registerPayablePayment, type PayableTarget } from "./actions";
import type { PayableMethod } from "@/utils/payables/ledger";
import { useTr } from "@/app/(admin)/AdminI18n";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

/**
 * Pays (part of) a purchase invoice or a signed cuenta de cobro: the egreso
 * goes to Siigo and the money that left goes to Flujo de Caja. A transfer
 * above the balance can leave the rest as saldo a favor, and the supplier's
 * saldo a favor can pay the document.
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
  const [keepExcess, setKeepExcess] = useState(false);
  const [available, setAvailable] = useState(0);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    getAdvanceBalance(target).then((res) => alive && res.success && setAvailable(res.balance)).catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const excess = method === "advance" ? 0 : Math.max(0, Number(amount) - balance);
  const pickMethod = (m: PayableMethod) => {
    setMethod(m);
    if (m === "advance") setAmount(String(Math.round(Math.min(balance, available))));
  };

  const save = () =>
    startTransition(async () => {
      setError("");
      const res = await registerPayablePayment(target, { date, amount: Number(amount), method, notes, category: categories ? category : null, keepExcess: excess > 0.5 && keepExcess });
      if (!res.success) return setError(res.error);
      const advance = res.advance
        ? res.advance.sent
          ? " " + tr("El excedente de {amount} quedó como saldo a favor (anticipo {name} en Siigo).", { amount: cop(res.advance.amount), name: res.advance.name ?? "" })
          : res.advance.manual
            ? " " + tr("El excedente de {amount} quedó como saldo a favor; regístralo también en Siigo.", { amount: cop(res.advance.amount) })
            : " " + tr("El excedente de {amount} quedó como saldo a favor, pero su anticipo no llegó a Siigo: {error}", { amount: cop(res.advance.amount), error: tr.msg(res.advance.error ?? "") })
        : "";
      if ("crossed" in res) {
        const amountText = cop(Number(res.crossed));
        return onDone(
          res.siigo?.sent
            ? tr("Pagado con saldo a favor ({amount}): cruce {name} en Siigo.", { amount: amountText, name: res.siigo.name ?? "" })
            : res.siigo
              ? tr("Pagado con saldo a favor ({amount}), pero Siigo no recibió el cruce: {error}", { amount: amountText, error: tr.msg(res.siigo.error ?? "") })
              : res.waitingForDocument
                ? tr("Pagado con saldo a favor ({amount}). El cruce irá a Siigo cuando el documento esté allá.", { amount: amountText })
                : tr("Pagado con saldo a favor ({amount}). Haz el cruce del anticipo en Siigo.", { amount: amountText })
        );
      }
      if (!res.paymentId) return onDone(advance.trim());
      onDone(
        (res.siigo?.sent
          ? tr("Pago registrado: egreso {name} en Siigo y salida en Flujo de Caja.", { name: res.siigo.name ?? "" })
          : res.siigo && !res.siigo.sent
            ? tr("Pago registrado en Flujo de Caja, pero Siigo no lo recibió: {error}", { error: tr.msg(res.siigo.error ?? "") })
            : res.waitingForDocument
              ? tr("Pago registrado en Flujo de Caja. El egreso irá a Siigo cuando el documento esté allá.")
              : tr("Pago registrado en Flujo de Caja. Regístralo también en Siigo (el documento se hizo a mano allá).")) + advance
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:min-w-0">
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Fecha del pago")}</span>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{method === "advance" ? tr("Valor a aplicar") : tr("Valor pagado")}</span>
            <input type="number" min={0} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Medio de pago")}</span>
            <select value={method} onChange={(e) => pickMethod(e.target.value as PayableMethod)} className={field}>
              <option value="bank">{tr("Banco (transferencia)")}</option>
              <option value="cash">{tr("Efectivo")}</option>
              {available > 0.5 && <option value="advance">{tr("Saldo a favor ({amount} disponible)", { amount: cop(available) })}</option>}
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
        {excess > 0.5 && (
          <label className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            <input type="checkbox" checked={keepExcess} onChange={(e) => setKeepExcess(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#C59F59] shrink-0" />
            <span>{tr("Se pagó {excess} de más. Déjalo como saldo a favor del proveedor: sale en Flujo de Caja como anticipo (no es gasto) y va a Siigo como egreso de anticipo.", { excess: cop(excess) })}</span>
          </label>
        )}
        <p className="text-[11px] text-foreground/50">
          {method === "advance"
            ? tr("No sale plata: el gasto entra en Flujo de Caja con esta fecha y el saldo a favor baja. A Siigo va un comprobante que cruza el anticipo contra el documento.")
            : tr("Se crea el egreso en Siigo contra el documento y la salida en Flujo de Caja con esta fecha, por el valor pagado.")}
        </p>
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

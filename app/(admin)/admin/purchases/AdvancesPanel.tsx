"use client";

import React, { useState, useTransition } from "react";
import { AlertTriangle, ArrowDownLeft, Loader2, PiggyBank, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { deleteAdvance, registerAdvance, registerAdvanceRefund, retryAdvance } from "./actions";
import { advanceBalance, type AdvanceKind } from "@/utils/payables/ledger";
import { useTr } from "@/app/(admin)/AdminI18n";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

export type AdvanceMove = {
  id: string;
  supplier_id: string | null;
  supplier_name: string;
  supplier_identification: string;
  kind: AdvanceKind;
  move_date: string;
  amount: number;
  method: "bank" | "cash" | null;
  payment_id: string | null;
  notes: string | null;
  siigo_status: "pendiente" | "enviado" | "error" | "no_aplica";
  siigo_name: string | null;
  siigo_error: string | null;
};
type Supplier = { id: string; name: string; document_number: string | null };

const KIND_LABEL: Record<AdvanceKind, string> = { anticipo: "Anticipo", cruce: "Aplicado a un pago", devolucion: "Devolución de anticipo" };

/**
 * Saldo a favor with suppliers: money paid beyond what a document owed (or
 * handed over before an invoice). It is used when paying their next
 * documents ("Saldo a favor" as the payment method) or comes back.
 */
export default function AdvancesPanel({ moves, suppliers, today, onDone }: { moves: AdvanceMove[] | null; suppliers: Supplier[]; today: string; onDone: (msg: string) => void }) {
  const tr = useTr();
  const [form, setForm] = useState<"anticipo" | "devolucion" | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  if (moves === null) {
    return <p className="rounded-2xl bg-amber-50 p-3 text-xs text-amber-800">{tr("Para manejar saldos a favor con proveedores falta aplicar la migración 20261029000000_supplier_advances.sql")}</p>;
  }

  const bySupplier = new Map<string, AdvanceMove[]>();
  for (const m of moves) bySupplier.set(m.supplier_identification, [...(bySupplier.get(m.supplier_identification) ?? []), m]);
  const groups = [...bySupplier.values()].map((ms) => ({ moves: ms, name: ms[0].supplier_name, identification: ms[0].supplier_identification, supplierId: ms.find((m) => m.supplier_id)?.supplier_id ?? null, balance: advanceBalance(ms) }));
  const withBalance = groups.filter((g) => g.balance > 0.5);
  const total = withBalance.reduce((s, g) => s + g.balance, 0);
  const refundable = suppliers.filter((s) => withBalance.some((g) => g.supplierId === s.id));

  return (
    <section className="rounded-2xl border border-foreground/10 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold"><PiggyBank className="w-4 h-4 text-[#C59F59]" />{" "}{tr("Saldos a favor con proveedores")}</h2>
          <p className="text-xs text-foreground/50">
            {withBalance.length ? tr("{amount} a favor de Café Amantti con {n} proveedor(es).", { amount: cop(total), n: String(withBalance.length) }) : tr("Ningún proveedor nos debe plata.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setForm("anticipo")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-foreground/15 text-xs font-bold hover:bg-foreground/5">
            <Plus className="w-3.5 h-3.5" />{" "}{tr("Registrar anticipo")}
          </button>
          {refundable.length > 0 && (
            <button type="button" onClick={() => setForm("devolucion")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-foreground/15 text-xs font-bold hover:bg-foreground/5">
              <ArrowDownLeft className="w-3.5 h-3.5" />{" "}{tr("Registrar devolución")}
            </button>
          )}
        </div>
      </div>

      {groups.length > 0 && (
        <ul className="divide-y divide-foreground/5 text-sm">
          {groups.map((g) => (
            <li key={g.identification} className="py-2">
              <button type="button" onClick={() => setOpen(open === g.identification ? null : g.identification)} className="flex w-full items-center justify-between gap-3 text-left">
                <span className="min-w-0 truncate">{g.name}</span>
                <span className={`shrink-0 font-bold ${g.balance > 0.5 ? "text-teal-700" : "text-foreground/40"}`}>{g.balance > 0.5 ? tr("{amount} a favor", { amount: cop(g.balance) }) : tr("Sin saldo")}</span>
              </button>
              {open === g.identification && <MoveList moves={g.moves} onDone={onDone} />}
            </li>
          ))}
        </ul>
      )}

      {form && (
        <AdvanceForm kind={form} suppliers={form === "devolucion" ? refundable : suppliers} balances={new Map(groups.filter((g) => g.supplierId).map((g) => [g.supplierId as string, g.balance]))} today={today}
          onClose={() => setForm(null)} onDone={(msg) => { setForm(null); onDone(msg); }} />
      )}
    </section>
  );
}

function MoveList({ moves, onDone }: { moves: AdvanceMove[]; onDone: (msg: string) => void }) {
  const tr = useTr();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const run = (action: () => Promise<{ success: boolean; error?: string }>, ok: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => {
      setError("");
      const res = await action();
      if (!res.success) return setError(res.error ?? "");
      onDone(ok);
    });
  };
  return (
    <div className="mt-2 space-y-1">
      <ul className="text-xs divide-y divide-foreground/5 rounded-xl bg-foreground/[0.02] px-3">
        {moves.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0">
              {m.move_date} · {tr(KIND_LABEL[m.kind])} · <strong>{m.kind === "anticipo" ? "+" : "−"}{cop(Number(m.amount))}</strong>{m.notes ? ` · ${m.notes}` : ""}
            </span>
            <span className="flex items-center gap-2">
              <span className={m.siigo_status === "enviado" ? "text-green-700" : m.siigo_status === "error" ? "text-red-600" : "text-foreground/50"}>
                {m.siigo_status === "enviado"
                  ? tr("En Siigo: {name}", { name: m.siigo_name ?? "" })
                  : m.siigo_status === "error"
                    ? tr("Error al enviar")
                    : m.siigo_status === "pendiente"
                      ? tr("Por enviar a Siigo")
                      : m.kind === "anticipo" ? tr("Ya estaba en Siigo: {name}", { name: m.siigo_name ?? "" }) : tr("A mano en Siigo")}
              </span>
              {(m.siigo_status === "error" || m.siigo_status === "pendiente") && (
                <button type="button" disabled={isPending} onClick={() => run(() => retryAdvance(m.id), tr("Enviado a Siigo."))} aria-label={tr("Reintentar")} className="text-foreground/50 hover:text-foreground disabled:opacity-40">
                  {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                </button>
              )}
              {!m.payment_id && m.siigo_status !== "enviado" && (
                <button type="button" disabled={isPending} onClick={() => run(() => deleteAdvance(m.id), tr("Movimiento eliminado (también en Flujo de Caja)."), tr("¿Eliminar este movimiento? También se borra en Flujo de Caja."))} aria-label={tr("Eliminar movimiento")} className="text-foreground/40 hover:text-red-600 disabled:opacity-40">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
            {m.siigo_error && m.siigo_status === "error" && <span className="w-full text-red-600 break-words flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{tr.msg(m.siigo_error)}</span>}
          </li>
        ))}
      </ul>
      {moves.some((m) => m.payment_id) && <p className="text-[11px] text-foreground/40">{tr("Los movimientos que salen de un pago se eliminan eliminando ese pago.")}</p>}
      {error && <p className="text-xs text-red-600 break-words">{tr.msg(error)}</p>}
    </div>
  );
}

function AdvanceForm({ kind, suppliers, balances, today, onClose, onDone }: {
  kind: "anticipo" | "devolucion";
  suppliers: Supplier[];
  balances: Map<string, number>;
  today: string;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const tr = useTr();
  const [supplierId, setSupplierId] = useState(suppliers.length === 1 ? suppliers[0].id : "");
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"bank" | "cash">("bank");
  const [notes, setNotes] = useState("");
  const [alreadyInSiigo, setAlreadyInSiigo] = useState(false);
  const [siigoReceipt, setSiigoReceipt] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const balance = balances.get(supplierId) ?? 0;

  const save = () =>
    startTransition(async () => {
      setError("");
      if (!supplierId) return setError(tr("Elige el proveedor."));
      const input = { supplierId, date, amount: Number(amount), method, notes, alreadyInSiigo, siigoReceipt };
      if (kind === "devolucion") {
        const res = await registerAdvanceRefund(input);
        if (!res.success) return setError(res.error);
        return onDone(
          res.siigo.sent
            ? tr("Devolución registrada: comprobante {name} en Siigo y entrada en Flujo de Caja.", { name: res.siigo.name ?? "" })
            : tr("Devolución registrada en Flujo de Caja, pero Siigo no la recibió: {error}", { error: tr.msg(res.siigo.error ?? "") })
        );
      }
      const res = await registerAdvance(input);
      if (!res.success) return setError(res.error);
      const a = res.advance;
      onDone(
        a.sent
          ? tr("Anticipo registrado: egreso {name} en Siigo y salida en Flujo de Caja.", { name: a.name ?? "" })
          : a.manual
            ? tr("Anticipo registrado en la app y en Flujo de Caja (ya estaba en Siigo como {name}).", { name: a.name ?? "" })
            : tr("Anticipo registrado en Flujo de Caja, pero Siigo no lo recibió: {error}", { error: tr.msg(a.error ?? "") })
      );
    });

  const field = "w-full px-3 py-2 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm";
  return (
    <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-left">
      <div className="bg-white rounded-3xl max-w-md w-full max-h-[90vh] overflow-y-auto border border-foreground/5 shadow-2xl p-6 space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h2 className="text-xl font-serif font-bold">{kind === "anticipo" ? tr("Registrar anticipo") : tr("Registrar devolución")}</h2>
            <p className="text-xs text-foreground/50">
              {kind === "anticipo"
                ? tr("Plata entregada a un proveedor sin factura que pagar, o un pago de más que ya pasó. Queda como saldo a favor.")
                : tr("El proveedor devolvió plata del saldo a favor.")}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("Cerrar")} className="p-1 text-foreground/40 hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>
        <label className="block text-xs font-bold text-foreground/60 space-y-1">
          <span>{tr("Proveedor")}</span>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={field}>
            <option value="">{tr("— Elige —")}</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {kind === "devolucion" && supplierId && <span className="block font-normal text-foreground/50">{tr("Saldo a favor: {amount}", { amount: cop(balance) })}</span>}
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:min-w-0">
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Fecha")}</span>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Valor")}</span>
            <input type="number" min={0} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={field} />
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{kind === "anticipo" ? tr("Medio de pago") : tr("Cómo llegó")}</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as "bank" | "cash")} className={field}>
              <option value="bank">{tr("Banco (transferencia)")}</option>
              <option value="cash">{tr("Efectivo")}</option>
            </select>
          </label>
        </div>
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("Nota (opcional)")} className={field} />
        {kind === "anticipo" && (
          <label className="flex gap-2 text-xs text-foreground/70">
            <input type="checkbox" checked={alreadyInSiigo} onChange={(e) => setAlreadyInSiigo(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#C59F59] shrink-0" />
            <span>{tr("Ya está registrado en Siigo (no enviar el egreso de anticipo).")}</span>
          </label>
        )}
        {kind === "anticipo" && alreadyInSiigo && (
          <label className="block text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Número del egreso de anticipo en Siigo")}</span>
            <input value={siigoReceipt} onChange={(e) => setSiigoReceipt(e.target.value.toUpperCase())} placeholder="RP-1-48" className={field} />
            <span className="block font-normal text-foreground/50">{tr("Con él, los cruces y devoluciones de este anticipo se envían a Siigo.")}</span>
          </label>
        )}
        <p className="text-[11px] text-foreground/50">
          {kind === "anticipo"
            ? tr("Sale en Flujo de Caja como anticipo (no es gasto) y va a Siigo como egreso de anticipo (cuenta 13300501).")
            : tr("Entra en Flujo de Caja como devolución del anticipo (no es ingreso por ventas). En Siigo va un comprobante contable: banco contra la cuenta 13300501, cruzando el egreso del anticipo.")}
        </p>
        {error && <p className="text-xs text-red-600 break-words">{tr.msg(error)}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-foreground/10 text-xs font-bold hover:bg-stone-50">{tr("Cancelar")}</button>
          <button type="button" onClick={save} disabled={isPending} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59F59] text-white text-xs font-bold hover:bg-[#B38E4D] disabled:opacity-40">
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{" "}{kind === "anticipo" ? tr("Registrar anticipo") : tr("Registrar devolución")}
          </button>
        </div>
      </div>
    </div>
  );
}

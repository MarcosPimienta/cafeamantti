"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Pencil, Plus, RefreshCw, Trash2, Wallet, X } from "lucide-react";
import { annulBill, deletePayablePayment, retryBill, retryPayablePayment } from "./actions";
import BillForm, { type EditableBill } from "./BillForm";
import PayablePaymentForm from "./PayablePaymentForm";
import AdvancesPanel, { type AdvanceMove } from "./AdvancesPanel";
import { payableBalance, paidOf, type BillLine, type PayableMethod } from "@/utils/payables/ledger";
import { useTr } from "@/app/(admin)/AdminI18n";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

export type PayablePayment = {
  id: string;
  payment_date: string;
  amount: number;
  method: PayableMethod;
  notes: string | null;
  siigo_status: "pendiente" | "enviado" | "error" | "no_aplica";
  siigo_name: string | null;
  siigo_error: string | null;
};
type Bill = {
  id: string;
  supplier_id: string | null;
  notes: string | null;
  supplier_name: string;
  supplier_identification: string;
  provider_prefix: string;
  provider_number: string;
  issue_date: string;
  due_date: string;
  lines: BillLine[];
  subtotal: number;
  iva: number;
  withheld: number;
  total: number;
  status: "borrador" | "registrada" | "error" | "anulada";
  siigo_name: string | null;
  siigo_error: string | null;
  payments: PayablePayment[];
};
type Filter = "pendientes" | "vencidas" | "pagadas" | "todas";
const METHOD_LABEL: Record<PayableMethod, string> = { bank: "Banco", cash: "Efectivo", advance: "Saldo a favor" };

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function PurchasesClient(props: {
  migrationApplied: boolean;
  bills: any[];
  suppliers: { id: string; name: string; document_type: string | null; document_number: string | null }[];
  cuentasCobro: { id: string; number: number; issuer_name: string; total: number; paid: number; date: string | null }[];
  categories: string[];
  assetCategories: string[];
  assetMonths: Record<string, number>;
  advances: AdvanceMove[] | null;
  inventory: { id: string; product_code: string; product_name: string; unit: string | null }[];
  accounts: { code: string; name: string }[];
  defaultAccounts: Record<string, string>;
  configured: boolean;
  today: string;
}) {
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const tr = useTr();
  const router = useRouter();
  const bills = (props.bills as Bill[]).filter((b) => b.status !== "anulada");
  const [filter, setFilter] = useState<Filter>("pendientes");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<EditableBill | null>(null);
  const [notice, setNotice] = useState("");

  if (!props.migrationApplied) {
    return <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">{tr("Falta aplicar la migración 20261025000000_purchases_payables.sql")}</p>;
  }

  const rows = bills.map((b) => {
    const balance = payableBalance(b.total, b.payments);
    const overdue = balance > 0.5 && b.due_date < props.today;
    return { b, balance, overdue };
  });
  const owed = rows.reduce((s, r) => s + r.balance, 0);
  const late = rows.reduce((s, r) => s + (r.overdue ? r.balance : 0), 0);
  const ccOwed = props.cuentasCobro.reduce((s, c) => s + Math.max(0, c.total - c.paid), 0);
  const ccOpen = props.cuentasCobro.filter((c) => c.total - c.paid > 0.5).length;
  const shown = rows.filter(({ balance, overdue }) =>
    filter === "pendientes" ? balance > 0.5 : filter === "vencidas" ? overdue : filter === "pagadas" ? balance <= 0.5 : true
  );
  const done = (msg: string) => {
    setNotice(msg);
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={tr("Facturas de compra por pagar")} value={cop(owed)} />
        <Stat label={tr("Vencido")} value={cop(late)} warn={late > 0} />
        <Link href="/admin/cuentas-cobro" className="rounded-2xl border border-foreground/10 p-4 hover:bg-foreground/[0.02]">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{tr("Cuentas de cobro por pagar")}</p>
          <p className="mt-1 text-2xl font-serif">{cop(ccOwed)}</p>
          <p className="text-xs text-foreground/50">{tr("{n} pendientes · ir a Cuentas de Cobro", { n: String(ccOpen) })}</p>
        </Link>
      </div>

      {notice && (
        <div className="flex justify-between gap-3 rounded-xl bg-green-50 p-3 text-sm text-green-800">
          <span className="flex gap-2"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />{notice}</span>
          <button type="button" onClick={() => setNotice("")} aria-label={tr("Cerrar")}><X className="w-4 h-4" /></button>
        </div>
      )}

      <AdvancesPanel moves={props.advances} suppliers={props.suppliers} today={props.today} onDone={done} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {([["pendientes", "Por pagar"], ["vencidas", "Vencidas"], ["pagadas", "Pagadas"], ["todas", "Todas"]] as [Filter, string][]).map(([f, label]) => (
            <button key={f} type="button" onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border ${filter === f ? "bg-foreground text-background border-foreground" : "border-foreground/15 text-foreground/60 hover:bg-foreground/5"}`}>
              {tr(label)}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setCreating(true)} disabled={!props.configured}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59F59] text-white text-sm font-bold hover:bg-[#B38E4D] disabled:opacity-40">
          <Plus className="w-4 h-4" />{" "}{tr("Nueva factura de compra")}
        </button>
      </div>
      {!props.configured && <p className="text-xs text-red-600">{tr("Siigo no está configurado en el servidor.")}</p>}


      {shown.length === 0 ? (
        <p className="text-sm text-foreground/50">{bills.length === 0 ? tr("Aún no hay facturas de compra. Registra la primera con «Nueva factura de compra».") : tr("No hay facturas en este filtro.")}</p>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => <BillCard key={r.b.id} {...r} today={props.today} inventory={props.inventory} onDone={done} onEdit={() => setEditing(r.b)} />)}
        </div>
      )}

      {editing && (
        <BillForm bill={editing} suppliers={props.suppliers} categories={props.categories} assetCategories={props.assetCategories} assetMonths={props.assetMonths} inventory={props.inventory} accounts={props.accounts} defaultAccounts={props.defaultAccounts} today={props.today}
          onClose={() => setEditing(null)} onDone={(msg) => { setEditing(null); done(msg); }} />
      )}

      {creating && (
        <BillForm suppliers={props.suppliers} categories={props.categories} assetCategories={props.assetCategories} assetMonths={props.assetMonths} inventory={props.inventory} accounts={props.accounts} defaultAccounts={props.defaultAccounts} today={props.today}
          onClose={() => setCreating(false)} onDone={(msg) => { setCreating(false); done(msg); }} />
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-2xl border border-foreground/10 p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{label}</p>
      <p className={`mt-1 text-2xl font-serif ${warn ? "text-red-600" : "text-foreground"}`}>{value}</p>
    </div>
  );
}

function BillCard({ b, balance, overdue, today, inventory, onDone, onEdit }: { b: Bill; balance: number; overdue: boolean; today: string; inventory: { id: string; product_name: string; unit: string | null }[]; onDone: (msg: string) => void; onEdit: () => void }) {
  const tr = useTr();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const run = (action: () => Promise<{ success: boolean; error?: string }>, ok: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => {
      setError("");
      const res = await action();
      if (!res.success) return setError(res.error ?? "");
      onDone(ok);
    });
  };
  const invoiceNo = `${b.provider_prefix}${b.provider_prefix ? "-" : ""}${b.provider_number}`;

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${overdue ? "border-red-200" : "border-foreground/10"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold truncate">{b.supplier_name}</p>
          <p className="text-xs text-foreground/50">
            {tr("Factura {n}", { n: invoiceNo })} · {b.siigo_name ?? (b.status === "error" ? tr("Error al enviar") : tr("Por enviar a Siigo"))}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold">{cop(Number(b.total))}</p>
          <p className="text-xs text-foreground/50">{balance > 0.5 ? tr("Saldo {balance}", { balance: cop(balance) }) : tr("Pagada")}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-foreground/60">
        <span>{tr("Fecha {date}", { date: b.issue_date })}</span>
        <span className={overdue ? "font-bold text-red-600" : ""}>{tr("Vence {date}", { date: b.due_date })}</span>
        <span>{tr("Subtotal {s} · IVA {i}", { s: cop(Number(b.subtotal)), i: cop(Number(b.iva)) })}{Number(b.withheld) > 0 ? tr(" · Retención {r}", { r: cop(Number(b.withheld)) }) : ""}</span>
        <span>{tr("Pagado {paid}", { paid: cop(paidOf(b.payments)) })}</span>
      </div>
      {b.siigo_error && !b.siigo_name && <p className="text-xs text-red-600 break-words">{tr.msg(b.siigo_error)}</p>}
      {b.lines.some((l) => l.inventory_id) && (
        <p className="text-xs text-foreground/50">
          {tr("Entró al inventario: {items}.", {
            items: b.lines
              .filter((l) => l.inventory_id)
              .map((l) => {
                const p = inventory.find((x) => x.id === l.inventory_id);
                return p ? `${l.inventory_qty} ${p.unit ?? ""} ${p.product_name}`.replace(/\s+/g, " ") : `${l.inventory_qty} · ${l.description}`;
              })
              .join(", "),
          })}
        </p>
      )}
      <PaymentList payments={b.payments} onDone={onDone} />
      <div className="flex flex-wrap gap-3">
        {balance > 0.5 && (
          <button type="button" onClick={() => setPaying(true)} className="inline-flex items-center gap-1 text-xs font-bold text-[#C59F59] hover:underline">
            <Wallet className="w-3.5 h-3.5" />{" "}{tr("Registrar pago")}
          </button>
        )}
        {!b.siigo_name && (
          <>
            <button type="button" disabled={isPending} onClick={onEdit} className="inline-flex items-center gap-1 text-xs font-bold text-foreground/60 hover:text-foreground disabled:opacity-50">
              <Pencil className="w-3.5 h-3.5" />{" "}{tr("Editar")}
            </button>
            <button type="button" disabled={isPending} onClick={() => run(() => retryBill(b.id), tr("Factura enviada a Siigo."))} className="inline-flex items-center gap-1 text-xs font-bold text-foreground/60 hover:text-foreground disabled:opacity-50">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}{" "}{tr("Enviar a Siigo")}
            </button>
            {b.payments.length === 0 && (
              <button type="button" disabled={isPending} onClick={() => run(() => annulBill(b.id), tr("Factura anulada."), tr("¿Anular esta factura de compra?"))} className="inline-flex items-center gap-1 text-xs font-bold text-foreground/40 hover:text-red-600 disabled:opacity-50">
                <X className="w-3.5 h-3.5" />{" "}{tr("Anular")}
              </button>
            )}
          </>
        )}
      </div>
      {error && <p className="text-xs text-red-600 break-words">{tr.msg(error)}</p>}
      {paying && (
        <PayablePaymentForm target={{ billId: b.id }} title={`${b.supplier_name} · ${tr("Factura {n}", { n: invoiceNo })}`} balance={balance} today={today}
          onClose={() => setPaying(false)} onDone={(msg) => { setPaying(false); onDone(msg); }} />
      )}
    </div>
  );
}

/** Payments of a purchase invoice or cuenta de cobro, with their Siigo egreso. */
export function PaymentList({ payments, onDone }: { payments: PayablePayment[]; onDone: (msg: string) => void }) {
  const tr = useTr();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  if (!payments.length) return null;
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
    <div className="space-y-1">
      <ul className="text-xs divide-y divide-foreground/5 rounded-xl bg-foreground/[0.02] px-3">
        {[...payments].sort((a, b) => a.payment_date.localeCompare(b.payment_date)).map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{p.payment_date} · {tr(METHOD_LABEL[p.method])} · <strong>{cop(Number(p.amount))}</strong>{p.notes ? ` · ${p.notes}` : ""}</span>
            <span className="flex items-center gap-2">
              <span className={p.siigo_status === "enviado" ? "text-green-700" : p.siigo_status === "error" ? "text-red-600" : "text-foreground/50"}>
                {p.method === "advance" && p.siigo_status === "enviado" ? tr("Cruce {name}", { name: p.siigo_name ?? "" }) : p.method === "advance" && p.siigo_status === "pendiente" ? tr("Cruce pendiente") : p.siigo_status === "enviado" ? tr("Egreso {name}", { name: p.siigo_name ?? "" }) : p.siigo_status === "no_aplica" ? tr("Egreso a mano en Siigo") : p.siigo_status === "error" ? tr("Error al enviar") : tr("Egreso pendiente")}
              </span>
              {(p.siigo_status === "error" || p.siigo_status === "pendiente") && (
                <button type="button" disabled={isPending} onClick={() => run(() => retryPayablePayment(p.id), tr("Enviado a Siigo."))} aria-label={tr("Reintentar")} className="text-foreground/50 hover:text-foreground disabled:opacity-40">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
              {p.siigo_status !== "enviado" && (
                <button type="button" disabled={isPending} onClick={() => run(() => deletePayablePayment(p.id), tr("Pago eliminado (también su salida en Flujo de Caja)."), tr("¿Eliminar este pago? También se borra su salida en Flujo de Caja."))} aria-label={tr("Eliminar pago")} className="text-foreground/40 hover:text-red-600 disabled:opacity-40">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </span>
            {p.siigo_error && p.siigo_status === "error" && <span className="w-full text-red-600 break-words flex gap-1"><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{tr.msg(p.siigo_error)}</span>}
          </li>
        ))}
      </ul>
      {error && <p className="text-xs text-red-600 break-words">{tr.msg(error)}</p>}
    </div>
  );
}

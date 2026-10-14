"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Plus, RefreshCw, Send, Trash2, X } from "lucide-react";
import { annulInvoice, deletePayment, refreshInvoice, registerPayment, sendPendingToSiigo } from "./actions";
import { balanceDue, daysOverdue, paidAmount, paymentState, type InvoiceStatus, type PaymentMethod } from "@/utils/invoices/ledger";
import { useTr } from "@/app/(admin)/AdminI18n";

type Payment = {
  id: string;
  payment_date: string;
  amount: number;
  method: PaymentMethod;
  notes: string | null;
  siigo_status: "pendiente" | "enviado" | "error";
  siigo_voucher_name: string | null;
  siigo_error: string | null;
};
type Invoice = {
  id: string;
  order_id: string;
  customer_name: string;
  customer_identification: string | null;
  payment_terms: "credito" | "contado";
  term_days: number;
  payment_method: PaymentMethod | null;
  total: number;
  status: InvoiceStatus;
  issue_date: string | null;
  due_date: string | null;
  siigo_name: string | null;
  siigo_number?: string | null;
  siigo_status: string | null;
  siigo_public_url: string | null;
  siigo_error: string | null;
  created_at: string;
  payments: Payment[];
};
type Filter = "siigo" | "cobrar" | "vencidas" | "pagadas" | "anuladas" | "todas";
type Report = { invoicesSent: string[]; invoicesFailed: { customer: string; error: string }[]; vouchersSent: string[]; vouchersFailed: { error: string }[] };

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
const METHOD_LABEL: Record<PaymentMethod, string> = { transfer: "Transferencia", cash: "Efectivo", web: "Pago web (ePayco)" };
const STATUS_LABEL: Record<InvoiceStatus, string> = { borrador: "Por enviar a Siigo", error: "Error al enviar", emitida: "En Siigo", anulada: "Anulada" };
const DIAN_LABEL: Record<string, string> = { Accepted: "Aceptada por la DIAN", Rejected: "Rechazada por la DIAN", Pending: "Enviada a la DIAN", Draft: "Creada (sin enviar a la DIAN)" };

/* eslint-disable @typescript-eslint/no-explicit-any */
export default function InvoicesClient({ invoices: raw, migrationApplied, today, configured }: { invoices: any[]; migrationApplied: boolean; today: string; configured: boolean }) {
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const tr = useTr();
  const router = useRouter();
  const invoices = raw as Invoice[];
  const [filter, setFilter] = useState<Filter>("todas");
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [isSending, startSending] = useTransition();

  const info = useMemo(
    () =>
      invoices.map((inv) => ({
        inv,
        balance: inv.status === "anulada" ? 0 : balanceDue(inv, inv.payments),
        overdue: daysOverdue(inv, inv.payments, today),
        state: paymentState(inv, inv.payments),
      })),
    [invoices, today]
  );
  const live = info.filter((x) => x.inv.status !== "anulada");
  const pendingInvoices = live.filter((x) => x.inv.status === "borrador" || x.inv.status === "error").length;
  const pendingPayments = live.reduce((n, x) => n + (x.inv.status === "emitida" ? x.inv.payments.filter((p) => p.siigo_status !== "enviado").length : 0), 0);
  const waitingPayments = live.reduce((n, x) => n + (x.inv.status !== "emitida" ? x.inv.payments.length : 0), 0);
  const receivable = live.reduce((s, x) => s + x.balance, 0);
  const overdue = live.reduce((s, x) => s + (x.overdue > 0 ? x.balance : 0), 0);

  const shown = info.filter(({ inv, balance, overdue: late }) => {
    switch (filter) {
      case "siigo": return inv.status === "borrador" || inv.status === "error" || (inv.status === "emitida" && inv.payments.some((p) => p.siigo_status !== "enviado"));
      case "cobrar": return inv.status !== "anulada" && balance > 0.5;
      case "vencidas": return late > 0;
      case "pagadas": return inv.status !== "anulada" && balance <= 0.5;
      case "anuladas": return inv.status === "anulada";
      default: return inv.status !== "anulada";
    }
  });

  const sendAll = () => {
    if (!window.confirm(tr("Se enviarán a Siigo las facturas pendientes (Siigo las emite ante la DIAN y se las envía al cliente) y los pagos como recibos de caja. ¿Continuar?"))) return;
    startSending(async () => {
      setError("");
      setReport(null);
      const res = await sendPendingToSiigo();
      if (!res.success) return setError(res.error);
      setReport(res);
      router.refresh();
    });
  };

  if (!migrationApplied) {
    return <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">{tr("Falta aplicar la migración 20261019000000_sales_invoices.sql")}</p>;
  }

  const FILTERS: [Filter, string][] = [
    ["todas", "Todas"],
    ["siigo", "Pendientes de Siigo"],
    ["cobrar", "Por cobrar"],
    ["vencidas", "Vencidas"],
    ["pagadas", "Pagadas"],
    ["anuladas", "Anuladas"],
  ];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={tr("Por cobrar (cartera)")} value={cop(receivable)} />
        <Stat label={tr("Vencido")} value={cop(overdue)} warn={overdue > 0} />
        <div className="rounded-2xl border border-foreground/10 p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{tr("Pendiente de Siigo")}</p>
          <p className="text-sm">
            {tr("{n} facturas · {p} pagos", { n: String(pendingInvoices), p: String(pendingPayments) })}
          </p>
          <button
            type="button"
            onClick={sendAll}
            disabled={isSending || !configured || pendingInvoices + pendingPayments === 0}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-foreground text-background text-xs font-bold hover:bg-[#C59F59] disabled:opacity-40"
          >
            {isSending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}{" "}
            {tr("Enviar {n} pendientes a Siigo", { n: String(pendingInvoices + pendingPayments) })}
          </button>
          {!configured && <p className="text-xs text-red-600">{tr("Siigo no está configurado en el servidor.")}</p>}
          {waitingPayments > 0 && <p className="text-[11px] text-foreground/50">{tr("Los pagos de facturas que aún no están en Siigo se envían después de su factura.")}</p>}
        </div>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700 break-words">{tr.msg(error)}</p>}
      {report && <BatchReport report={report} onClose={() => setReport(null)} />}

      <div className="flex flex-wrap gap-2">
        {FILTERS.map(([f, label]) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border ${filter === f ? "bg-foreground text-background border-foreground" : "border-foreground/15 text-foreground/60 hover:bg-foreground/5"}`}
          >
            {tr(label)}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-foreground/50">
          {invoices.length === 0 ? tr("Aún no hay facturas. Créalas desde el panel de cada pedido en Órdenes.") : tr("No hay facturas en este filtro.")}
        </p>
      ) : (
        <div className="space-y-3">
          {shown.map((x) => (
            <InvoiceCard key={x.inv.id} {...x} today={today} onChanged={() => router.refresh()} />
          ))}
        </div>
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

function BatchReport({ report, onClose }: { report: Report; onClose: () => void }) {
  const tr = useTr();
  const failed = [...report.invoicesFailed.map((f) => `${f.customer}: ${f.error}`), ...report.vouchersFailed.map((f) => f.error)];
  return (
    <div className="rounded-2xl border border-foreground/10 p-4 space-y-2 text-sm">
      <div className="flex justify-between gap-2">
        <p className="flex items-center gap-2 font-bold">
          <CheckCircle2 className="w-4 h-4 text-green-600" />
          {tr("{n} facturas y {p} recibos de caja enviados a Siigo.", { n: String(report.invoicesSent.length), p: String(report.vouchersSent.length) })}
        </p>
        <button type="button" onClick={onClose} aria-label={tr("Cerrar")} className="text-foreground/40 hover:text-foreground"><X className="w-4 h-4" /></button>
      </div>
      {[...report.invoicesSent, ...report.vouchersSent].length > 0 && <p className="text-xs text-foreground/60">{[...report.invoicesSent, ...report.vouchersSent].join(", ")}</p>}
      {failed.length > 0 && (
        <ul className="text-xs text-red-700 bg-red-50 rounded-xl p-3 space-y-1">
          {failed.map((f, i) => <li key={i} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{tr.msg(f)}</li>)}
        </ul>
      )}
    </div>
  );
}

function InvoiceCard({ inv, balance, overdue, state, today, onChanged }: { inv: Invoice; balance: number; overdue: number; state: string; today: string; onChanged: () => void }) {
  const tr = useTr();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [paying, setPaying] = useState(false);

  const run = (action: () => Promise<{ success: boolean; error?: string }>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => {
      setError("");
      const res = await action();
      if (!res.success) return setError(res.error ?? "");
      onChanged();
    });
  };

  const credit = inv.payment_terms === "credito";
  const paid = paidAmount(inv.payments);
  const badge =
    inv.status === "anulada" ? "bg-foreground/5 text-foreground/40"
    : inv.status === "error" ? "bg-red-50 text-red-700"
    : inv.status === "borrador" ? "bg-amber-50 text-amber-800"
    : "bg-green-50 text-green-700";

  return (
    <div className={`rounded-2xl border p-4 space-y-3 ${overdue > 0 ? "border-red-200" : "border-foreground/10"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold truncate">{inv.customer_name}</p>
          <p className="text-xs text-foreground/50">
            {inv.siigo_number ?? inv.siigo_name ?? tr("Sin número")}
            {" · "}
            <Link href={`/admin/orders?order=${inv.order_id}`} className="hover:text-[#C59F59] hover:underline">{tr("Pedido #{id}", { id: inv.order_id.slice(0, 8) })}</Link>
            {" · "}
            {credit ? tr("Crédito {n} días", { n: String(inv.term_days) }) : tr("Contado · {method}", { method: tr(METHOD_LABEL[inv.payment_method ?? "transfer"]) })}
          </p>
        </div>
        <div className="text-right">
          <p className="font-bold">{cop(Number(inv.total))}</p>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${badge}`}>{tr(STATUS_LABEL[inv.status])}</span>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-foreground/60">
        {inv.issue_date && <span>{tr("Emitida {date}", { date: inv.issue_date })}</span>}
        {credit && inv.due_date && <span className={overdue > 0 ? "font-bold text-red-600" : ""}>{tr("Vence {date}", { date: inv.due_date })}{overdue > 0 ? tr(" · vencida hace {n} días", { n: String(overdue) }) : ""}</span>}
        {credit && !inv.due_date && inv.status !== "anulada" && <span>{tr("Vence {n} días después de enviarla a Siigo", { n: String(inv.term_days) })}</span>}
        {inv.status !== "anulada" && credit && <span>{tr("Pagado {paid} · Saldo {balance}", { paid: cop(paid), balance: cop(balance) })}</span>}
        {inv.status !== "anulada" && <span className="font-bold">{tr.msg(state === "pagada" ? "Pagada" : state === "parcial" ? "Pago parcial" : "Sin pagos")}</span>}
        {inv.siigo_status && <span>{tr.msg(DIAN_LABEL[inv.siigo_status] ?? inv.siigo_status)}</span>}
      </div>

      {inv.siigo_error && <p className="text-xs text-red-600 break-words">{tr.msg(inv.siigo_error)}</p>}

      {inv.payments.length > 0 && (
        <ul className="text-xs divide-y divide-foreground/5 rounded-xl bg-foreground/[0.02] px-3">
          {[...inv.payments].sort((a, b) => a.payment_date.localeCompare(b.payment_date)).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span>
                {p.payment_date} · {tr(METHOD_LABEL[p.method])} · <strong>{cop(Number(p.amount))}</strong>
                {p.notes ? ` · ${p.notes}` : ""}
              </span>
              <span className="flex items-center gap-2">
                <span className={p.siigo_status === "enviado" ? "text-green-700" : p.siigo_status === "error" ? "text-red-600" : "text-foreground/50"}>
                  {p.siigo_status === "enviado" ? tr("Recibo {name}", { name: p.siigo_voucher_name ?? "" }) : p.siigo_status === "error" ? tr("Error al enviar") : tr("Por enviar a Siigo")}
                </span>
                {p.siigo_status !== "enviado" && (
                  <button type="button" disabled={isPending} onClick={() => run(() => deletePayment(p.id), tr("¿Eliminar este pago?"))} aria-label={tr("Eliminar pago")} className="text-foreground/40 hover:text-red-600 disabled:opacity-40">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </span>
              {p.siigo_error && <span className="w-full text-red-600 break-words">{tr.msg(p.siigo_error)}</span>}
            </li>
          ))}
        </ul>
      )}

      {paying && <PaymentForm invoiceId={inv.id} balance={balance} today={today} onDone={() => { setPaying(false); onChanged(); }} onCancel={() => setPaying(false)} />}

      <div className="flex flex-wrap gap-3">
        {credit && inv.status !== "anulada" && balance > 0.5 && !paying && (
          <button type="button" onClick={() => setPaying(true)} className="inline-flex items-center gap-1 text-xs font-bold text-[#C59F59] hover:underline">
            <Plus className="w-3.5 h-3.5" />{" "}{tr("Registrar pago")}
          </button>
        )}
        {inv.siigo_public_url && (
          <a href={inv.siigo_public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#C59F59] hover:underline">
            {tr("Ver factura")}{" "}<ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        {inv.status === "emitida" && (
          <button type="button" disabled={isPending} onClick={() => run(() => refreshInvoice(inv.id))} className="inline-flex items-center gap-1 text-xs font-bold text-foreground/60 hover:text-foreground disabled:opacity-50">
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}{" "}{tr("Actualizar estado")}
          </button>
        )}
        {(inv.status === "borrador" || inv.status === "error") && (
          <>
            <button type="button" disabled={isPending} onClick={() => run(() => sendPendingToSiigo([inv.id]), tr("Se enviará esta factura a Siigo (se emite ante la DIAN y se envía al cliente). ¿Continuar?"))} className="inline-flex items-center gap-1 text-xs font-bold text-foreground/60 hover:text-foreground disabled:opacity-50">
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}{" "}{tr("Enviar solo esta")}
            </button>
            <button type="button" disabled={isPending} onClick={() => run(() => annulInvoice(inv.id), tr("¿Anular esta factura? El pedido vuelve a quedar sin facturar."))} className="inline-flex items-center gap-1 text-xs font-bold text-foreground/40 hover:text-red-600 disabled:opacity-50">
              <X className="w-3.5 h-3.5" />{" "}{tr("Anular")}
            </button>
          </>
        )}
      </div>

      {error && <p className="text-xs text-red-600 break-words">{tr.msg(error)}</p>}
    </div>
  );
}

function PaymentForm({ invoiceId, balance, today, onDone, onCancel }: { invoiceId: string; balance: number; today: string; onDone: () => void; onCancel: () => void }) {
  const tr = useTr();
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(String(Math.round(balance)));
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      setError("");
      const res = await registerPayment(invoiceId, { date, amount: Number(amount), method, notes });
      if (!res.success) return setError(res.error);
      onDone();
    });

  const input = "px-3 py-2 rounded-lg border border-foreground/10 bg-white text-sm";
  return (
    <div className="rounded-xl border border-foreground/10 p-3 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-foreground/60">
          {tr("Fecha del pago")}
          <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={`${input} block mt-1`} />
        </label>
        <label className="text-xs text-foreground/60">
          {tr("Valor")}
          <input type="number" min={0} step={1} value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} block mt-1 w-36`} />
        </label>
        <label className="text-xs text-foreground/60">
          {tr("Medio de pago")}
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={`${input} block mt-1`}>
            {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((m) => <option key={m} value={m}>{tr(METHOD_LABEL[m])}</option>)}
          </select>
        </label>
        <label className="text-xs text-foreground/60 flex-1 min-w-[10rem]">
          {tr("Nota")}
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("Referencia de la transferencia…")} className={`${input} block mt-1 w-full`} />
        </label>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-2 rounded-lg border border-foreground/15 text-xs font-bold hover:bg-foreground/5">{tr("Cancelar")}</button>
        <button type="button" onClick={save} disabled={isPending} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-foreground text-background text-xs font-bold hover:bg-[#C59F59] disabled:opacity-40">
          {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{" "}{tr("Guardar pago")}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 break-words">{tr.msg(error)}</p>}
    </div>
  );
}

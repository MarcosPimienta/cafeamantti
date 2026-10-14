"use client";

import React, { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, ExternalLink, FileText, Loader2 } from "lucide-react";
import { createInvoice, getOrderInvoice } from "../invoices/actions";
import { balanceDue, type PaymentMethod } from "@/utils/invoices/ledger";
import { useTr } from "@/app/(admin)/AdminI18n";

type Terms = "credito" | "contado";
/* eslint-disable @typescript-eslint/no-explicit-any */
type Invoice = any;

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
const STATUS_LABEL: Record<string, string> = { borrador: "Por enviar a Siigo", error: "Error al enviar", emitida: "En Siigo" };
const DIAN_LABEL: Record<string, string> = { Accepted: "Aceptada por la DIAN", Rejected: "Rechazada por la DIAN", Pending: "Enviada a la DIAN", Draft: "Creada (sin enviar a la DIAN)" };
const PAID = new Set(["paid", "processing", "shipped", "delivered"]);

/**
 * Order panel section: create the order's sales invoice (a draft that the
 * batch in Facturas sends to Siigo), or show it with what is still owed.
 */
export default function SiigoInvoiceSection({ order }: { order: any }) {
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const tr = useTr();
  const [invoice, setInvoice] = useState<Invoice | null | undefined>(undefined);
  const [available, setAvailable] = useState(true);
  const [open, setOpen] = useState(false);
  const [terms, setTerms] = useState<Terms>(PAID.has(order.status) ? "contado" : "credito");
  const [termDays, setTermDays] = useState("30");
  const [method, setMethod] = useState<PaymentMethod>(order.epayco_ref_payco ? "web" : "transfer");
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    getOrderInvoice(order.id)
      .then((res) => {
        if (!alive) return;
        setAvailable(res.migrationApplied);
        setInvoice(res.invoice);
      })
      .catch(() => alive && setInvoice(null));
    return () => {
      alive = false;
    };
  }, [order.id]);

  // An invoice made before Facturas existed (straight to Siigo).
  if (order.siigo_invoice_id && !invoice) {
    return (
      <Section title={tr("Factura")}>
        <p className="text-sm">
          <strong>{order.siigo_invoice ?? tr("Factura creada")}</strong>
          {order.siigo_status && <span className="ml-2 text-xs text-foreground/60">{tr.msg(DIAN_LABEL[order.siigo_status] ?? order.siigo_status)}</span>}
        </p>
        {order.siigo_public_url && (
          <a href={order.siigo_public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#C59F59] hover:underline">
            {tr("Ver factura")}{" "}<ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </Section>
    );
  }
  if (invoice === undefined || !available || order.status === "cancelled") return null;

  const create = () =>
    startTransition(async () => {
      setError("");
      setProblems([]);
      const res = await createInvoice(order.id, { terms, termDays: Number(termDays), method: terms === "contado" ? method : null });
      if (!res.success) return setError(res.error);
      setInvoice({ ...res.invoice, payments: [] });
      setProblems(res.problems);
      setOpen(false);
    });

  if (invoice) {
    const balance = balanceDue(invoice, invoice.payments ?? []);
    return (
      <Section title={tr("Factura")}>
        <div className="space-y-1 text-sm">
          <p>
            <strong>{invoice.siigo_name ?? tr("Sin número")}</strong>
            <span className="ml-2 text-xs text-foreground/60">{tr(STATUS_LABEL[invoice.status] ?? invoice.status)}</span>
            {invoice.siigo_status && <span className="ml-2 text-xs text-foreground/60">· {tr.msg(DIAN_LABEL[invoice.siigo_status] ?? invoice.siigo_status)}</span>}
          </p>
          <p className="text-xs text-foreground/60">
            {invoice.payment_terms === "credito"
              ? tr("Crédito {n} días · Saldo {balance}", { n: String(invoice.term_days), balance: cop(balance) })
              : tr("Contado · pagada")}
            {invoice.due_date && invoice.payment_terms === "credito" ? tr(" · vence {date}", { date: invoice.due_date }) : ""}
          </p>
          {invoice.siigo_error && <p className="text-xs text-red-600 break-words">{tr.msg(invoice.siigo_error)}</p>}
        </div>
        <ProblemList problems={problems} />
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/invoices" className="text-xs font-bold text-[#C59F59] hover:underline">{tr("Ir a Facturas")}</Link>
          {invoice.siigo_public_url && (
            <a href={invoice.siigo_public_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-[#C59F59] hover:underline">
              {tr("Ver factura")}{" "}<ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </Section>
    );
  }

  const field = "px-3 py-2 rounded-lg border border-foreground/10 bg-white text-sm";
  return (
    <Section title={tr("Factura")}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="px-3 py-2 rounded-lg border border-foreground/15 text-xs font-bold hover:bg-foreground/5">
          {tr("Crear factura")}
        </button>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs text-foreground/60">
              {tr("Condición")}
              <select value={terms} onChange={(e) => setTerms(e.target.value as Terms)} className={`${field} block mt-1`}>
                <option value="credito">{tr("Crédito (paga después)")}</option>
                <option value="contado">{tr("Contado (ya pagó)")}</option>
              </select>
            </label>
            {terms === "credito" ? (
              <label className="text-xs text-foreground/60">
                {tr("Plazo (días)")}
                <input type="number" min={0} max={365} value={termDays} onChange={(e) => setTermDays(e.target.value)} className={`${field} block mt-1 w-24`} />
              </label>
            ) : (
              <label className="text-xs text-foreground/60">
                {tr("Forma de pago")}
                <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={`${field} block mt-1`}>
                  <option value="web">{tr("Pago web (ePayco)")}</option>
                  <option value="transfer">{tr("Transferencia")}</option>
                  <option value="cash">{tr("Efectivo")}</option>
                </select>
              </label>
            )}
          </div>
          <p className="text-xs text-foreground/60">
            {tr("Queda como borrador y el inventario se descuenta. Se emite ante la DIAN cuando la envíes a Siigo desde Facturas.")}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 rounded-lg border border-foreground/15 text-xs font-bold hover:bg-foreground/5">{tr("Cancelar")}</button>
            <button type="button" onClick={create} disabled={isPending} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-foreground text-background text-xs font-bold hover:bg-[#C59F59] disabled:opacity-40">
              {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{" "}{tr("Crear factura")}
            </button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-red-600 break-words">{tr.msg(error)}</p>}
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 rounded-2xl border border-foreground/10 p-4">
      <h3 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">
        <FileText className="w-3.5 h-3.5" />{" "}{title}
      </h3>
      {children}
    </section>
  );
}

function ProblemList({ problems }: { problems: string[] }) {
  const tr = useTr();
  if (!problems.length) return null;
  return (
    <div className="text-xs text-amber-800 bg-amber-50 rounded-xl p-3 space-y-1">
      <p className="font-bold">{tr("Corrige esto antes de enviarla a Siigo:")}</p>
      <ul className="space-y-1">
        {problems.map((p) => <li key={p} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{tr.msg(p)}</li>)}
      </ul>
    </div>
  );
}

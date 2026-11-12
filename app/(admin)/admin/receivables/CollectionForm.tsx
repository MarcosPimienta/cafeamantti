"use client";

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { AlertTriangle, Loader2, Plus, X } from "lucide-react";
import { getRetentionOptions, registerCollection } from "./receiptActions";
import { collectionProblems, computeRetention, retentionTotal, type CollectionRetention, type OpenInvoice, type RetentionOption } from "@/utils/invoices/collections";
import type { ReceivableInvoice } from "@/utils/invoices/receivables";
import { siteName, type SiteInfo } from "@/utils/invoices/receivablesExcel";
import { useTr } from "@/app/(admin)/AdminI18n";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * A customer deposit from the bank statement, assigned by hand to the
 * invoices it pays (from Siigo: also those made there). Saved as one
 * recibo de caja per sucursal.
 */
export default function CollectionForm({ invoices, debtors, clientKey: initialClient, keyOf, sites, today, onClose, onDone }: {
  invoices: ReceivableInvoice[];
  debtors: { id: string; name: string }[];
  clientKey: string;
  keyOf: (i: ReceivableInvoice) => string;
  sites: Map<string, SiteInfo>;
  today: string;
  onClose: () => void;
  onDone: (notice: string) => void;
}) {
  const tr = useTr();
  const [clientKey, setClientKey] = useState(initialClient);
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState<"transfer" | "cash">("transfer");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  /** Withholdings the customer applied, per invoice. */
  const [rets, setRets] = useState<Record<string, CollectionRetention[]>>({});
  /** The invoice whose "add withholding" picker is open. */
  const [picking, setPicking] = useState<string | null>(null);
  const [options, setOptions] = useState<RetentionOption[]>([]);
  const [optionsError, setOptionsError] = useState("");
  useEffect(() => {
    getRetentionOptions().then((r) => { setOptions(r.options); setOptionsError(r.error ?? ""); }).catch(() => setOptionsError("No se pudieron leer las retenciones de Siigo."));
  }, []);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const open = useMemo(
    () => invoices.filter((i) => keyOf(i) === clientKey && i.balance > 0.5).sort((a, b) => (a.due_date ?? a.issue_date).localeCompare(b.due_date ?? b.issue_date) || a.name.localeCompare(b.name)),
    [invoices, clientKey, keyOf]
  );
  const openInvoices: OpenInvoice[] = open.map((i) => ({ id: i.id, name: i.name, due_date: i.due_date, balance: i.balance, branch_office: i.branch_office ?? 0, customer_identification: i.customer_identification, subtotal: i.subtotal, iva: i.iva }));
  const retsOf = (id: string) => rets[id] ?? [];
  const assigned = open
    .map((i) => ({ invoiceId: i.id, value: Number(values[i.id] || 0), retentions: retsOf(i.id) }))
    .filter((a) => a.value > 0 || a.retentions.length > 0);
  const total = round2(assigned.reduce((s, a) => s + a.value, 0));
  const withheld = round2(assigned.reduce((s, a) => s + retentionTotal(a), 0));
  const setRet = (id: string, list: CollectionRetention[]) => setRets({ ...rets, [id]: list });
  const left = round2(Number(amount || 0) - total);
  const branches = new Set(open.filter((i) => assigned.some((x) => x.invoiceId === i.id)).map((i) => i.branch_office ?? 0));
  const problems = clientKey ? collectionProblems({ date, amount: Number(amount || 0), method, assigned }, openInvoices, today) : [tr("Elige el cliente.")];

  const save = () =>
    startTransition(async () => {
      setError("");
      const res = await registerCollection({ date, amount: Number(amount), method, notes, assigned });
      const warnings = res.success ? res.receipts.map((r) => r.warning).filter((w): w is string => !!w) : [];
      if (!res.success) return setError(res.error);
      const sent = res.receipts.filter((r) => r.sent).map((r) => r.name ?? "");
      const failed = res.receipts.filter((r) => !r.sent);
      onDone(
        [
          sent.length ? tr("Cobro registrado en Siigo: {names}.", { names: sent.join(", ") }) : "",
          failed.length ? tr("Siigo no recibió {n} recibo(s): {error}. Quedó en el historial para reintentar.", { n: String(failed.length), error: tr.msg(failed[0].error ?? "") }) : "",
          ...warnings.map((w) => tr.msg(w)),
        ].filter(Boolean).join(" ")
      );
    });

  const field = "w-full px-3 py-2 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm";
  return (
    <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[92vh] overflow-y-auto border border-foreground/5 shadow-2xl p-6 space-y-5">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h2 className="text-xl font-serif font-bold">{tr("Registrar cobro")}</h2>
            <p className="text-xs text-foreground/50">{tr("Un abono del extracto: asígnalo a las facturas que paga. Se crea el recibo de caja en Siigo y entra al Flujo de Caja.")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("Cerrar")} className="p-1 text-foreground/40 hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 [&>*]:min-w-0">
          <label className="md:col-span-2 text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Cliente")}</span>
            <select value={clientKey} onChange={(e) => { setClientKey(e.target.value); setValues({}); setRets({}); setPicking(null); }} className={field}>
              <option value="">{tr("— Elige —")}</option>
              {debtors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Fecha del abono")}</span>
            <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Entró a")}</span>
            <select value={method} onChange={(e) => setMethod(e.target.value as "transfer" | "cash")} className={field}>
              <option value="transfer">{tr("Banco")}</option>
              <option value="cash">{tr("Caja")}</option>
            </select>
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Valor del abono")}</span>
            <input type="number" min={0} step="any" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={field} />
          </label>
          <label className="md:col-span-3 text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Nota (opcional)")}</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("Ej. Abono ACH 901656887 del extracto")} className={field} />
          </label>
        </div>

        {clientKey && (
          <div className="space-y-2">
            <p className="text-xs font-bold text-foreground/60">{tr("Facturas con saldo: escribe cuánto del abono va a cada una")}</p>
            <p className="text-[11px] text-foreground/50">{tr("¿El cliente pagó menos porque aplicó retención? Agrégala en «+ Retención»: también paga la factura, aunque no entre dinero.")}</p>
            {open.length === 0 ? (
              <p className="text-sm text-foreground/50">{tr("Este cliente no tiene facturas con saldo.")}</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-foreground/10">
                <table className="w-full min-w-[640px] text-xs">
                  <thead className="bg-foreground/[0.03] text-left text-foreground/50">
                    <tr><th className="px-3 py-2">{tr("Factura")}</th><th className="px-3 py-2">{tr("Sede")}</th><th className="px-3 py-2">{tr("Vence")}</th><th className="px-3 py-2 text-right">{tr("Saldo")}</th><th className="px-3 py-2 text-right">{tr("Retención")}</th><th className="px-3 py-2 text-right">{tr("Abono")}</th></tr>
                  </thead>
                  <tbody>
                    {open.map((i) => {
                      const list = retsOf(i.id);
                      const ret = retentionTotal({ retentions: list });
                      const used = new Set(list.map((r) => r.type));
                      return (
                        <React.Fragment key={i.id}>
                          <tr className="border-t border-foreground/5">
                            <td className="px-3 py-1.5 font-mono">{i.name}</td>
                            <td className="px-3 py-1.5">{siteName(i.site_id, sites)}</td>
                            <td className="px-3 py-1.5">{i.due_date}</td>
                            <td className="px-3 py-1.5 text-right">{cop(i.balance)}</td>
                            <td className="px-3 py-1.5 text-right whitespace-nowrap">
                              {ret > 0 && <span className="mr-1.5 font-bold text-[#8a6a2f]">{cop(ret)}</span>}
                              <button type="button" onClick={() => setPicking(picking === i.id ? null : i.id)} disabled={!options.length}
                                className="inline-flex items-center gap-0.5 text-[10px] font-bold text-[#C59F59] hover:underline disabled:opacity-40">
                                <Plus className="w-3 h-3" />{tr("Retención")}
                              </button>
                            </td>
                            <td className="px-3 py-1.5 text-right">
                              <span className="inline-flex items-center gap-1.5">
                                <button type="button" onClick={() => setValues({ ...values, [i.id]: String(round2(Math.max(0, i.balance - ret))) })} className="text-[10px] font-bold text-[#C59F59] hover:underline">{tr("Saldar")}</button>
                                <input type="number" min={0} step="any" value={values[i.id] ?? ""} onChange={(e) => setValues({ ...values, [i.id]: e.target.value })}
                                  aria-label={tr("Abono a {name}", { name: i.name })} className="w-32 px-2 py-1 bg-white border border-foreground/10 rounded-lg text-xs text-right" />
                              </span>
                            </td>
                          </tr>
                          {(list.length > 0 || picking === i.id) && (
                            <tr className="bg-[#fdfbf7]">
                              <td colSpan={6} className="px-3 py-2">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  {list.map((r, k) => (
                                    <span key={r.id} className="inline-flex items-center gap-1.5 rounded-lg border border-[#C59F59]/30 bg-white px-2 py-1">
                                      <span className="font-bold">{r.name}</span>
                                      <span className="text-foreground/40">{tr("sobre {base}", { base: cop(r.base) })}</span>
                                      <input type="number" min={0} step="any" value={r.value}
                                        onChange={(e) => setRet(i.id, list.map((x, j) => (j === k ? { ...x, value: Number(e.target.value) || 0 } : x)))}
                                        aria-label={tr("Valor de la {name} de {invoice}", { name: r.name, invoice: i.name })} className="w-24 px-2 py-0.5 border border-foreground/10 rounded text-right" />
                                      <button type="button" onClick={() => setRet(i.id, list.filter((_, j) => j !== k))} aria-label={tr("Quitar")} className="text-foreground/40 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>
                                    </span>
                                  ))}
                                  {picking === i.id && (
                                    <select autoFocus defaultValue="" aria-label={tr("Tipo de retención")} className="px-2 py-1 bg-white border border-foreground/10 rounded-lg"
                                      onChange={(e) => {
                                        const opt = options.find((o) => String(o.id) === e.target.value);
                                        if (opt) setRet(i.id, [...list, computeRetention(opt, i)]);
                                        setPicking(null);
                                      }}>
                                      <option value="" disabled>{tr("— Tipo de retención —")}</option>
                                      {options.filter((o) => !used.has(o.type)).map((o) => <option key={o.id} value={o.id}>{o.name}{o.type === "ReteICA" ? " ‰" : ""}</option>)}
                                    </select>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className={`text-xs text-right ${Math.abs(left) > 0.5 ? "text-amber-700 font-bold" : "text-green-700 font-bold"}`}>
              {tr("Asignado {total} de {amount}", { total: cop(total), amount: cop(Number(amount || 0)) })}
              {Math.abs(left) > 0.5 ? ` · ${left > 0 ? tr("faltan {v}", { v: cop(left) }) : tr("sobran {v}", { v: cop(-left) })}` : ""}
            </p>
            {withheld > 0 && (
              <p className="text-[11px] text-right text-foreground/60">
                {tr("Retenciones {ret} · las facturas bajan {applied} (abono + retención)", { ret: cop(withheld), applied: cop(round2(total + withheld)) })}
              </p>
            )}
            {optionsError && <p className="text-[11px] text-amber-700">{tr("No se pudieron leer las retenciones de Siigo.")}</p>}
            {branches.size > 1 && <p className="text-[11px] text-foreground/50">{tr("Paga facturas de {n} sucursales en Siigo: se crea un recibo de caja por cada una.", { n: String(branches.size) })}</p>}
          </div>
        )}

        {problems.length > 0 && (amount || total > 0) && (
          <ul className="text-xs text-amber-800 bg-amber-50 rounded-xl p-3 space-y-1">
            {problems.map((p) => <li key={p} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{tr.msg(p)}</li>)}
          </ul>
        )}
        {error && <p className="text-xs text-red-600 break-words">{tr.msg(error)}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-foreground/10 text-xs font-bold hover:bg-stone-50">{tr("Cancelar")}</button>
          <button type="button" onClick={save} disabled={isPending || problems.length > 0} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59F59] text-white text-xs font-bold hover:bg-[#B38E4D] disabled:opacity-40">
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{" "}{tr("Registrar y enviar a Siigo")}
          </button>
        </div>
      </div>
    </div>
  );
}

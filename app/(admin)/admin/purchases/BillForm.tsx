"use client";

import React, { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Loader2, Plus, Trash2, X } from "lucide-react";
import { createBill, getPurchaseTaxes, updateBill } from "./actions";
import { billProblems, billTotals, type BillLine } from "@/utils/payables/ledger";
import { useTr } from "@/app/(admin)/AdminI18n";
import { ASSET_USES } from "../cashflow/types";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
type Tax = { id: number; name: string; rate: number };
type Supplier = { id: string; name: string; document_type: string | null; document_number: string | null };

const addDays = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

/** A supplier's invoice (company): saved and sent to Siigo as a purchase invoice owed to them. */
/** A saved invoice being corrected (only before it reaches Siigo). */
export type EditableBill = {
  id: string;
  supplier_id: string | null;
  provider_prefix: string;
  provider_number: string;
  issue_date: string;
  due_date: string;
  notes?: string | null;
  lines: BillLine[];
};

const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

export default function BillForm({
  suppliers, categories, assetCategories, assetMonths, accounts, defaultAccounts, inventory, today, onClose, onDone, bill,
}: {
  /** Given: edit this invoice instead of creating one. */
  bill?: EditableBill;
  suppliers: Supplier[];
  /** Products a line can bring into stock. */
  inventory: { id: string; product_code: string; product_name: string; unit: string | null }[];
  categories: string[];
  /** Fixed asset classes (equipos, muebles…): their lines ask for a useful life. */
  assetCategories: string[];
  /** Suggested useful life per fixed asset category. */
  assetMonths: Record<string, number>;
  accounts: { code: string; name: string }[];
  defaultAccounts: Record<string, string>;
  today: string;
  onClose: () => void;
  onDone: (notice: string) => void;
}) {
  const tr = useTr();
  const [supplierId, setSupplierId] = useState(bill?.supplier_id ?? "");
  const [prefix, setPrefix] = useState(bill?.provider_prefix ?? "");
  const [number, setNumber] = useState(bill?.provider_number ?? "");
  const [issueDate, setIssueDate] = useState(bill?.issue_date ?? today);
  const [term, setTerm] = useState(bill ? Math.max(0, daysBetween(bill.issue_date, bill.due_date)) : 30);
  const [notes, setNotes] = useState(bill?.notes ?? "");
  const blank = (): BillLine => ({ category: "", account: "", description: "", base: 0, tax_id: null, tax_rate: 0, retention_id: null, retention_rate: 0, inventory_id: null, inventory_qty: null });
  const [lines, setLines] = useState<BillLine[]>(bill?.lines?.length ? bill.lines.map((l) => ({ ...blank(), ...l })) : [blank()]);
  const [taxes, setTaxes] = useState<{ iva: Tax[]; retentions: Tax[] } | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    getPurchaseTaxes().then((res) => (res.success ? setTaxes(res) : setError(res.error)));
  }, []);

  const supplier = suppliers.find((s) => s.id === supplierId);
  const dueDate = addDays(issueDate, term);
  const totals = billTotals(lines);
  const problems = billProblems({ supplier_identification: supplier?.document_number ?? "", provider_number: number, issue_date: issueDate, due_date: dueDate, lines }, assetCategories);

  const setLine = (i: number, patch: Partial<BillLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const isAsset = (l: BillLine) => assetCategories.includes(l.category);
  /** A fixed asset class suggests its fiscal useful life and never moves stock. */
  const setCategory = (i: number, l: BillLine, category: string) => {
    const asset = assetCategories.includes(category);
    setLine(i, {
      category,
      account: defaultAccounts[category] ?? (asset !== isAsset(l) ? "" : l.account),
      depreciation_months: asset ? l.depreciation_months ?? assetMonths[category] ?? null : null,
      in_service_date: asset ? l.in_service_date ?? null : null,
      asset_use: asset ? l.asset_use ?? null : null,
      ...(asset ? { inventory_id: null, inventory_qty: null } : {}),
    });
  };
  const pickTax = (list: Tax[] | undefined, id: string) => {
    const t = list?.find((x) => x.id === Number(id));
    return t ? { id: t.id, rate: t.rate } : { id: null, rate: 0 };
  };

  const save = () =>
    startTransition(async () => {
      setError("");
      const input = { supplierId, providerPrefix: prefix, providerNumber: number, issueDate, dueDate, notes, lines };
      const res = bill ? await updateBill(bill.id, input) : await createBill(input);
      if (!res.success) return setError(res.error);
      const stock = res.stocked?.length ? " " + tr("Entró al inventario: {items}.", { items: res.stocked.join(", ") }) : "";
      onDone((res.sent ? tr("Factura de compra registrada en Siigo como {name}.", { name: res.siigoName ?? "" }) : tr("Factura guardada, pero Siigo no la recibió: {error}", { error: tr.msg(res.siigoError ?? "") })) + stock);
    });

  const field = "w-full px-3 py-2 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm";
  const small = "w-full px-2 py-1.5 bg-white border border-foreground/10 rounded-lg text-xs";
  const inline = "px-2 py-1.5 bg-white border border-foreground/10 rounded-lg text-xs";
  return (
    <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92vh] overflow-y-auto border border-foreground/5 shadow-2xl p-6 space-y-5">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h2 className="text-xl font-serif font-bold">{bill ? tr("Editar factura de compra") : tr("Nueva factura de compra")}</h2>
            <p className="text-xs text-foreground/50">
              {bill
                ? tr("Aún no está en Siigo: corrige lo que haga falta y se envía de nuevo. Si cambias lo que entró al inventario, solo se mueve la diferencia.")
                : tr("Factura recibida de una empresa: va a Siigo como factura de compra (no documento soporte) y queda por pagar.")}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={tr("Cerrar")} className="p-1 text-foreground/40 hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 [&>*]:min-w-0">
          <label className="md:col-span-2 text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Proveedor")}</span>
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={field}>
              <option value="">{tr("— Elige —")}</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.document_number ? ` · ${s.document_number}` : ""}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Prefijo factura")}</span>
            <input value={prefix} onChange={(e) => setPrefix(e.target.value.toUpperCase())} placeholder={tr("Ej. FETD")} maxLength={6} className={field} />
            <span className="block text-[11px] font-normal text-foreground/40">{tr("Si la factura no trae prefijo, queda como FC.")}</span>
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Número factura")}</span>
            <input value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))} placeholder={tr("Ej. 1968")} className={field} />
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Fecha de la factura")}</span>
            <input type="date" value={issueDate} max={today} onChange={(e) => setIssueDate(e.target.value)} className={field} />
          </label>
          <label className="text-xs font-bold text-foreground/60 space-y-1">
            <span>{tr("Plazo de pago")}</span>
            <select value={term} onChange={(e) => setTerm(Number(e.target.value))} className={field}>
              {[...new Set([0, 8, 15, 30, 45, 60, 90, term])].sort((a, b) => a - b).map((d) => <option key={d} value={d}>{d === 0 ? tr("De contado") : tr("{n} días", { n: String(d) })}</option>)}
            </select>
          </label>
          <div className="text-xs text-foreground/60 md:col-span-2 self-end pb-2">{tr("Vence el {date}", { date: dueDate })}</div>
        </div>
        {supplier && !supplier.document_number && <p className="text-xs text-red-600">{tr("Este proveedor no tiene NIT: complétalo en Proveedores.")}</p>}

        <div className="space-y-2 @container">
          <div className="hidden @3xl:grid grid-cols-[1.3fr_1.4fr_1.2fr_0.8fr_0.8fr_0.8fr_auto] gap-2 text-[10px] font-bold uppercase tracking-widest text-foreground/40">
            <span>{tr("Categoría")}</span><span>{tr("Cuenta contable")}</span><span>{tr("Descripción")}</span><span>{tr("Valor sin IVA")}</span><span>{tr("IVA")}</span><span>{tr("Retención")}</span><span />
          </div>
          {lines.map((l, i) => (
            <div key={i} className="space-y-1.5 rounded-xl @3xl:rounded-none border @3xl:border-0 border-foreground/10 p-2 @3xl:p-0 @3xl:pb-2 @3xl:border-b @3xl:border-foreground/5">
            <div className="grid grid-cols-1 @3xl:grid-cols-[1.3fr_1.4fr_1.2fr_0.8fr_0.8fr_0.8fr_auto] gap-2 items-center [&>*]:min-w-0">
              <select value={l.category} onChange={(e) => setCategory(i, l, e.target.value)} className={small} aria-label={tr("Categoría")}>
                <option value="">{tr("— Categoría —")}</option>
                {categories.filter((c) => !assetCategories.includes(c)).map((c) => <option key={c} value={c}>{tr(c)}</option>)}
                <optgroup label={tr("Activos fijos")}>
                  {categories.filter((c) => assetCategories.includes(c)).map((c) => <option key={c} value={c}>{tr(c)}</option>)}
                </optgroup>
              </select>
              {accounts.length ? (
                <select value={l.account} onChange={(e) => setLine(i, { account: e.target.value })} className={small} aria-label={tr("Cuenta contable")}>
                  <option value="">{tr("— Cuenta —")}</option>
                  {accounts.filter((a) => (isAsset(l) ? /^1[5-7]/ : /^(14|5|6)/).test(a.code) || a.code === l.account).map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
                  {l.account && !accounts.some((a) => a.code === l.account) && <option value={l.account}>{tr("{code} · inactiva o no está en el PUC traído", { code: l.account })}</option>}
                </select>
              ) : (
                <input value={l.account} onChange={(e) => setLine(i, { account: e.target.value.replace(/\D/g, "") })} placeholder={tr("Cuenta PUC")} className={small} aria-label={tr("Cuenta contable")} />
              )}
              <input value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} placeholder={tr("Ej. Empaques kraft")} className={small} aria-label={tr("Descripción")} />
              <input type="number" min={0} step={1} value={l.base || ""} onChange={(e) => setLine(i, { base: Number(e.target.value) })} className={small} aria-label={tr("Valor sin IVA")} />
              <select value={l.tax_id ?? ""} onChange={(e) => { const t = pickTax(taxes?.iva, e.target.value); setLine(i, { tax_id: t.id, tax_rate: t.rate }); }} className={small} aria-label={tr("IVA")}>
                <option value="">{tr("Sin IVA")}</option>
                {taxes?.iva.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value={l.retention_id ?? ""} onChange={(e) => { const t = pickTax(taxes?.retentions, e.target.value); setLine(i, { retention_id: t.id, retention_rate: t.rate }); }} className={small} aria-label={tr("Retención")}>
                <option value="">{tr("Sin retención")}</option>
                {taxes?.retentions.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button type="button" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} disabled={lines.length === 1} aria-label={tr("Quitar línea")} className="p-1 text-foreground/40 hover:text-red-600 disabled:opacity-30 justify-self-end">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            {isAsset(l) ? (
            /* A fixed asset: Flujo de Caja registers and depreciates it as it is paid. */
            <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
              <span>{tr("Vida útil:")}</span>
              <input type="number" min={1} step={1} value={l.depreciation_months ?? ""} onChange={(e) => setLine(i, { depreciation_months: e.target.value === "" ? null : Number(e.target.value) })}
                className={`${inline} w-20`} aria-label={tr("Vida útil en meses")} />
              <span>{tr("meses")}</span>
              <span className="ml-2">{tr("En uso desde:")}</span>
              <input type="date" value={l.in_service_date ?? ""} onChange={(e) => setLine(i, { in_service_date: e.target.value || null })}
                className={inline} aria-label={tr("Fecha de puesta en uso")} />
              <span className="ml-2">{tr("Destino:")}</span>
              <select value={l.asset_use ?? ""} onChange={(e) => setLine(i, { asset_use: e.target.value || null })} className={inline} aria-label={tr("Destino del activo")}>
                <option value="">{tr("— Elige —")}</option>
                {Object.entries(ASSET_USES).map(([k, u]) => <option key={k} value={k} title={tr(u.hint)}>{tr(u.label)}</option>)}
              </select>
              <span className="basis-full text-[11px] text-foreground/40">{tr("Activo fijo: se deprecia en Flujo de Caja a medida que se paga. Sin fecha de uso, desde la fecha de la factura. El destino dice a dónde va la depreciación (comodato y punto de venta: gasto de ventas).")}</span>
            </div>
            ) : (
            /* What this line brings into stock (materia prima, empaques…). */
            <div className="flex flex-wrap items-center gap-2 text-xs text-foreground/60">
              <span>{tr("Entra al inventario:")}</span>
              <select value={l.inventory_id ?? ""} onChange={(e) => setLine(i, { inventory_id: e.target.value || null, inventory_qty: e.target.value ? l.inventory_qty ?? null : null })}
                className={`${inline} w-full sm:w-72`} aria-label={tr("Producto que entra al inventario")}>
                <option value="">{tr("— No mueve inventario —")}</option>
                {inventory.map((p) => <option key={p.id} value={p.id}>{p.product_name} ({p.product_code})</option>)}
              </select>
              {l.inventory_id && (
                <>
                  <input type="number" min={0} step="any" value={l.inventory_qty ?? ""} onChange={(e) => setLine(i, { inventory_qty: e.target.value === "" ? null : Number(e.target.value) })}
                    placeholder={tr("Cantidad")} className={`${inline} w-28`} aria-label={tr("Cantidad que entra")} />
                  <span>{inventory.find((p) => p.id === l.inventory_id)?.unit ?? ""}</span>
                </>
              )}
            </div>
            )}
            </div>
          ))}
          <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="inline-flex items-center gap-1 text-xs font-bold text-[#C59F59] hover:underline">
            <Plus className="w-3.5 h-3.5" />{" "}{tr("Agregar línea")}
          </button>
        </div>

        <div className="rounded-2xl bg-[#fdfbf7] border border-foreground/5 p-4 text-sm space-y-1 max-w-sm ml-auto">
          <p className="flex justify-between"><span>{tr("Subtotal")}</span><span>{cop(totals.subtotal)}</span></p>
          <p className="flex justify-between"><span>{tr("IVA")}</span><span>{cop(totals.iva)}</span></p>
          {totals.withheld > 0 && <p className="flex justify-between text-foreground/60"><span>{tr("Retención")}</span><span>−{cop(totals.withheld)}</span></p>}
          <p className="flex justify-between font-bold border-t border-foreground/10 pt-1"><span>{tr("Por pagar al proveedor")}</span><span>{cop(totals.total)}</span></p>
        </div>

        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("Observaciones (opcional)")} className={field} />

        {problems.length > 0 && (supplierId || number || totals.subtotal > 0) && (
          <ul className="text-xs text-amber-800 bg-amber-50 rounded-xl p-3 space-y-1">
            {problems.map((p) => <li key={p} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{tr.msg(p)}</li>)}
          </ul>
        )}
        {error && <p className="text-xs text-red-600 break-words">{tr.msg(error)}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-foreground/10 text-xs font-bold hover:bg-stone-50">{tr("Cancelar")}</button>
          <button type="button" onClick={save} disabled={isPending || problems.length > 0} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59F59] text-white text-xs font-bold hover:bg-[#B38E4D] disabled:opacity-40">
            {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{" "}{tr("Guardar y enviar a Siigo")}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

// Comprobante de ajuste de inventario: one voucher (AJ-0001…) with every
// product whose stock changes because of a count, damage or a typing error.
// Each line says what comes in, what goes out, or what was counted (and the
// difference is computed). It is never an entrada or a salida: the Kardex
// shows it as «Comprobante de ajuste».

import React, { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { FileText, Loader2, Plus, Trash2 } from "lucide-react";
import { useTr } from "@/app/(admin)/AdminI18n";
import { isGrindTracked, MOLIENDAS, MOLIENDA_LABELS } from "@/app/(admin)/coffeeProfiles";
import { tracksStock, CATEGORY_LABELS } from "@/utils/inventory/categories";
import { stockIn } from "@/utils/inventory/warehouses";
import { bogotaToday } from "@/utils/orders/pendingDeliveries";
import {
  ADJUSTMENT_REASONS,
  ADJUSTMENT_REASON_LABELS,
  adjustmentLabel,
  adjustmentProblems,
  lineDelta,
  type AdjustmentReason,
  type DraftLine,
  type LineMode,
} from "@/utils/inventory/adjustments";
import { createAdjustment, getAdjustments, type Adjustment } from "../ajustes/actions";
import { fmtDate, fmtQty } from "../InventoryClient";
import { useInventory } from "../InventoryContext";
import type { WarehousesState } from "../bodegas/useWarehouses";
import WarehouseSelect from "../bodegas/WarehouseSelect";

type Row = { key: number; inventoryId: string; mode: LineMode; value: string; molienda: string };

const MODES: { id: LineMode; label: string }[] = [
  { id: "salida", label: "Disminuye" },
  { id: "entrada", label: "Aumenta" },
  { id: "conteo", label: "Conteo físico" },
];

const inputCls = "w-full min-h-11 px-3 border border-foreground/15 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/30 bg-white";
const labelCls = "block text-sm font-medium mb-1.5";

let nextKey = 1;
const blankRow = (inventoryId = ""): Row => ({ key: nextKey++, inventoryId, mode: "salida", value: "", molienda: "" });

export default function AjustesPanel({ wh, initialProductId }: { wh: WarehousesState; initialProductId?: string | null }) {
  const tr = useTr();
  const { inventory, updateStock } = useInventory();
  const stocked = useMemo(
    () =>
      inventory
        .filter((i) => tracksStock(i.category, i.product_code))
        .sort((a, b) => a.category.localeCompare(b.category) || a.product_name.localeCompare(b.product_name, "es")),
    [inventory]
  );
  const byId = useMemo(() => new Map(stocked.map((i) => [i.id, i])), [stocked]);

  const [date, setDate] = useState(bogotaToday());
  const [warehouseId, setWarehouseId] = useState("");
  const [reason, setReason] = useState<AdjustmentReason | "">("");
  const [responsable, setResponsable] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [blankRow(initialProductId && byId.has(initialProductId) ? initialProductId : "")]);
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState<{ id: string; number: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [list, setList] = useState<Adjustment[] | null | "missing">(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getAdjustments(30)
      .then((d) => !cancelled && setList(d === null ? "missing" : d))
      .catch(() => !cancelled && setList([]));
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const whId = wh.migrated ? warehouseId || wh.main?.id || "" : "";

  /** What the system has of the product, in the bodega and grind of the line. */
  function systemOf(r: Row): number {
    const item = byId.get(r.inventoryId);
    if (!item) return 0;
    if (!whId) return Number(item.current_stock) || 0;
    const s = stockIn(wh.stock, item.id, whId);
    if (isGrindTracked(item.product_code)) return r.molienda === "grano" ? s.grano : r.molienda === "molido" ? s.molido : 0;
    return s.total;
  }

  const drafts: DraftLine[] = rows.map((r) => {
    const item = byId.get(r.inventoryId);
    const v = r.value.trim() === "" ? null : Number(r.value.replace(",", "."));
    return {
      inventoryId: r.inventoryId,
      name: item?.product_name ?? "",
      mode: r.mode,
      value: v,
      systemStock: systemOf(r),
      needsGrind: item ? isGrindTracked(item.product_code) : false,
      molienda: r.molienda || null,
    };
  });

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(null);
    const found = adjustmentProblems({ date, reason, notes, lines: drafts });
    setProblems(found);
    if (found.length) return;
    const lines = drafts.map((d) => ({ inventoryId: d.inventoryId, quantity: lineDelta(d.mode, d.value, d.systemStock)!, molienda: d.molienda }));
    startTransition(async () => {
      const res = await createAdjustment({ date, warehouseId: whId || null, reason: reason as AdjustmentReason, notes, responsable, lines });
      if (!res.success) {
        setError(res.error);
        return;
      }
      for (const l of lines) {
        const item = byId.get(l.inventoryId);
        if (item) updateStock(item.id, (Number(item.current_stock) || 0) + l.quantity);
      }
      wh.reload();
      setDone({ id: res.id, number: res.number });
      setRows([blankRow()]);
      setNotes("");
      setProblems([]);
      setReload((n) => n + 1);
    });
  }

  return (
    <div className="space-y-6">
      <form onSubmit={submit} className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 space-y-6">
        <div>
          <h2 className="font-serif text-xl">{tr("Comprobante de ajuste de inventario")}</h2>
          <p className="text-sm text-foreground/70 mt-1">
            {tr("Para cambiar el stock por un conteo, un daño o un error de registro. Queda con número, motivo y responsable, y en el kardex aparece como ajuste, no como entrada ni salida.")}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="aj-date" className={labelCls}>{tr("Fecha")}</label>
            <input id="aj-date" type="date" value={date} max={bogotaToday()} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
          {wh.migrated && (
            <WarehouseSelect id="aj-wh" label={tr("Bodega")} labelClassName={labelCls} className={inputCls} warehouses={wh.warehouses} value={warehouseId} onChange={setWarehouseId} />
          )}
          <div>
            <label htmlFor="aj-reason" className={labelCls}>{tr("Motivo")}</label>
            <select id="aj-reason" value={reason} onChange={(e) => setReason(e.target.value as AdjustmentReason)} className={inputCls}>
              <option value="">{tr("Seleccionar motivo...")}</option>
              {ADJUSTMENT_REASONS.map((r) => (
                <option key={r} value={r}>{tr(ADJUSTMENT_REASON_LABELS[r])}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="aj-resp" className={labelCls}>{tr("Responsable")}</label>
            <input id="aj-resp" value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder={tr("Quién hizo el conteo")} className={inputCls} />
          </div>
        </div>

        <div className="space-y-3">
          <div className="hidden lg:grid grid-cols-[minmax(0,2.4fr)_110px_minmax(0,1.6fr)_110px_90px_90px_90px_40px] gap-2 px-1 text-[11px] font-bold uppercase tracking-wider text-foreground/50">
            <span>{tr("Producto")}</span>
            <span>{tr("Molienda")}</span>
            <span>{tr("Ajuste")}</span>
            <span>{tr("Cantidad")}</span>
            <span className="text-right">{tr("En sistema")}</span>
            <span className="text-right">{tr("Diferencia")}</span>
            <span className="text-right">{tr("Queda en")}</span>
            <span />
          </div>
          {rows.map((r, i) => {
            const d = drafts[i];
            const item = byId.get(r.inventoryId);
            const delta = item ? lineDelta(d.mode, d.value, d.systemStock) : null;
            return (
              <div key={r.key} className="grid gap-2 rounded-2xl border border-foreground/10 p-3 lg:border-0 lg:p-0 lg:grid-cols-[minmax(0,2.4fr)_110px_minmax(0,1.6fr)_110px_90px_90px_90px_40px] lg:items-center">
                <select aria-label={tr("Producto")} value={r.inventoryId} onChange={(e) => patch(r.key, { inventoryId: e.target.value, molienda: "" })} className={inputCls}>
                  <option value="">{tr("Seleccionar producto...")}</option>
                  {stocked.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.product_name} · {it.product_code} ({tr.msg(CATEGORY_LABELS[it.category] ?? it.category)})
                    </option>
                  ))}
                </select>
                {d.needsGrind ? (
                  <select aria-label={tr("Molienda")} value={r.molienda} onChange={(e) => patch(r.key, { molienda: e.target.value })} className={inputCls}>
                    <option value="">{tr("Molienda...")}</option>
                    {MOLIENDAS.map((m) => (
                      <option key={m} value={m}>{tr(MOLIENDA_LABELS[m])}</option>
                    ))}
                  </select>
                ) : (
                  <span className="hidden lg:block text-center text-foreground/30">—</span>
                )}
                <div role="group" aria-label={tr("Tipo de ajuste")} className="grid grid-cols-3 gap-1 rounded-xl bg-foreground/[0.04] p-1">
                  {MODES.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      aria-pressed={r.mode === m.id}
                      onClick={() => patch(r.key, { mode: m.id })}
                      className={`min-h-9 rounded-lg px-1 text-xs font-semibold transition-colors ${r.mode === m.id ? "bg-white shadow-sm text-foreground" : "text-foreground/60 hover:text-foreground"}`}
                    >
                      {tr(m.label)}
                    </button>
                  ))}
                </div>
                <input
                  aria-label={r.mode === "conteo" ? tr("Contado") : tr("Cantidad")}
                  inputMode="decimal"
                  value={r.value}
                  onChange={(e) => patch(r.key, { value: e.target.value })}
                  placeholder={r.mode === "conteo" ? tr("Contado") : item?.unit ?? ""}
                  className={`${inputCls} tabular-nums`}
                />
                <span className="text-sm tabular-nums lg:text-right"><span className="lg:hidden text-foreground/50">{tr("En sistema")}: </span>{item ? fmtQty(d.systemStock) : "—"}</span>
                <span className={`text-sm font-semibold tabular-nums lg:text-right ${delta && delta < 0 ? "text-red-700" : delta ? "text-emerald-800" : ""}`}>
                  <span className="lg:hidden font-normal text-foreground/50">{tr("Diferencia")}: </span>
                  {delta ? `${delta > 0 ? "+" : "−"}${fmtQty(Math.abs(delta))}` : "—"}
                </span>
                <span className="text-sm font-semibold tabular-nums lg:text-right"><span className="lg:hidden font-normal text-foreground/50">{tr("Queda en")}: </span>{delta !== null && item ? fmtQty(d.systemStock + delta) : "—"}</span>
                <button
                  type="button"
                  aria-label={tr("Quitar línea")}
                  disabled={rows.length === 1}
                  onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                  className="justify-self-end p-2 rounded-lg text-foreground/40 hover:text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:hover:bg-transparent"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
          <button type="button" onClick={() => setRows((rs) => [...rs, blankRow()])} className="inline-flex items-center gap-2 text-sm font-semibold text-[#7A5B22] hover:underline">
            <Plus className="w-4 h-4" /> {tr("Agregar producto")}
          </button>
        </div>

        <div>
          <label htmlFor="aj-notes" className={labelCls}>{tr("Observaciones")}</label>
          <textarea id="aj-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={tr("ej. Conteo mensual de noviembre; 2 bolsas rotas en el estante")} className={`${inputCls} py-2`} />
        </div>

        <p className="text-xs text-foreground/60">
          {tr("Lo que disminuye se suma al costo de ventas y lo que aumenta lo resta, al costo de hoy de cada producto.")}
        </p>

        {problems.length > 0 && (
          <ul role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700 list-disc pl-8 space-y-0.5">
            {problems.map((p) => <li key={p}>{tr.msg(p)}</li>)}
          </ul>
        )}
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{tr.msg(error)}</p>}
        {done && (
          <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {tr("✓ Comprobante {n} guardado.", { n: adjustmentLabel(done.number) })}{" "}
            <Link href={`/admin/inventory/ajustes/${done.id}`} className="font-semibold underline">{tr("Ver e imprimir")}</Link>
          </p>
        )}

        <button type="submit" disabled={pending} className="w-full sm:w-auto min-h-11 px-8 rounded-xl bg-foreground text-sm font-semibold text-white hover:bg-[#7A5B22] disabled:opacity-60 inline-flex items-center justify-center gap-2">
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {tr("Guardar comprobante")}
        </button>
      </form>

      <section aria-label={tr("Comprobantes de ajuste")} className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
        <h3 className="px-6 py-4 border-b border-foreground/5 font-semibold">{tr("Comprobantes de ajuste")}</h3>
        {list === null ? (
          <p className="flex items-center gap-2 px-6 py-6 text-sm text-foreground/60"><Loader2 className="w-4 h-4 animate-spin" /> {tr("Cargando…")}</p>
        ) : list === "missing" ? (
          <p className="px-6 py-6 text-sm text-amber-800 bg-amber-50">{tr("Falta aplicar la migración 20261126000000_inventory_adjustments.sql para hacer comprobantes de ajuste.")}</p>
        ) : list.length === 0 ? (
          <p className="px-6 py-6 text-sm text-foreground/60">{tr("Todavía no hay comprobantes de ajuste.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#fdfbf7] text-left text-[11px] font-bold uppercase tracking-wider text-foreground/50">
                  <th className="px-6 py-3">{tr("Número")}</th>
                  <th className="px-3 py-3">{tr("Fecha")}</th>
                  <th className="px-3 py-3">{tr("Motivo")}</th>
                  <th className="px-3 py-3">{tr("Productos")}</th>
                  <th className="px-3 py-3">{tr("Estado")}</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {list.map((a) => {
                  const originals = a.lines.filter((l) => !l.reversal);
                  return (
                    <tr key={a.id} className="hover:bg-[#fdfbf7]">
                      <td className="px-6 py-3 font-mono font-semibold">{adjustmentLabel(a.number)}</td>
                      <td className="px-3 py-3 whitespace-nowrap">{fmtDate(a.adjustment_date)}</td>
                      <td className="px-3 py-3">{tr(ADJUSTMENT_REASON_LABELS[a.reason_kind])}</td>
                      <td className="px-3 py-3 text-foreground/70 max-w-[320px] truncate" title={originals.map((l) => l.product_name).join(", ")}>
                        {originals.map((l) => `${l.product_name} ${l.quantity > 0 ? "+" : "−"}${fmtQty(Math.abs(l.quantity))}`).join(" · ")}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${a.status === "anulado" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
                          {a.status === "anulado" ? tr("Anulado") : tr("Vigente")}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right">
                        <Link href={`/admin/inventory/ajustes/${a.id}`} className="inline-flex items-center gap-1.5 font-semibold text-[#7A5B22] hover:underline">
                          <FileText className="w-4 h-4" /> {tr("Ver")}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

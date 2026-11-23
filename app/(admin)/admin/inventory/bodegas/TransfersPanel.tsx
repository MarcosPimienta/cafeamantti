"use client";

// Transfer stock between bodegas, and the latest transfers. Used in
// Bodegas and in Movimientos → Transferencia.

import React, { useEffect, useMemo, useState, useTransition } from "react";
import { ArrowRight, Loader2 } from "lucide-react";
import { useTr } from "@/app/(admin)/AdminI18n";
import { tracksStock } from "@/utils/inventory/categories";
import { stockIn, transferProblem } from "@/utils/inventory/warehouses";
import { isGrindTracked } from "../../../coffeeProfiles";
import { fmtDate, fmtQty } from "../InventoryClient";
import { useInventory } from "../InventoryContext";
import { createTransfer, getRecentTransfers, type TransferRow } from "./actions";
import type { WarehousesState } from "./useWarehouses";

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const inputCls =
  "w-full min-h-11 px-4 border border-foreground/15 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/30 bg-white";
const labelCls = "block text-sm font-medium mb-1.5";

export default function TransfersPanel({ wh, productId, onProductChange }: { wh: WarehousesState; productId?: string; onProductChange?: (id: string) => void }) {
  const tr = useTr();
  const { inventory } = useInventory();
  const [itemIdLocal, setItemIdLocal] = useState(productId ?? "");
  const itemId = productId ?? itemIdLocal;
  const setItemId = (id: string) => (onProductChange ? onProductChange(id) : setItemIdLocal(id));
  const [fromId, setFromId] = useState(wh.main?.id ?? "");
  const [toId, setToId] = useState("");
  const [qty, setQty] = useState("");
  const [molienda, setMolienda] = useState<"" | "grano" | "molido">("");
  const [date, setDate] = useState(todayStr);
  const [lote, setLote] = useState("");
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [recent, setRecent] = useState<TransferRow[] | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getRecentTransfers(30)
      .then((r) => {
        if (!cancelled) setRecent(r);
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  const stocked = useMemo(
    () =>
      inventory
        .filter((i) => tracksStock(i.category, i.product_code))
        .sort((a, b) => a.category.localeCompare(b.category) || a.product_name.localeCompare(b.product_name, "es")),
    [inventory]
  );
  const item = stocked.find((i) => i.id === itemId) ?? null;
  const from = fromId || wh.main?.id || "";
  const origin = item && from ? stockIn(wh.stock, item.id, from) : null;
  const needsGrind = !!item && isGrindTracked(item.product_code);
  // The bodega's total is what the database checks; older coffee may have no grind recorded.
  const available = origin ? origin.total : 0;
  const nameOf = (id: string | null) => wh.all.find((w) => w.id === id)?.name ?? "—";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    const q = Number(qty.replace(",", "."));
    const problem = transferProblem({ inventoryId: itemId, fromId: from, toId, qty: q, available, needsGrind, molienda: molienda || null });
    if (problem) {
      setFeedback({ ok: false, text: tr(problem) });
      return;
    }
    startTransition(async () => {
      const res = await createTransfer({ inventoryId: itemId, fromId: from, toId, qty: q, date, molienda: molienda || null, lote, note });
      if (!res.success) {
        setFeedback({ ok: false, text: tr.msg(res.error) });
        return;
      }
      setFeedback({
        ok: true,
        text: tr("✓ Transferencia registrada: {qty} {unit} de {product} · {from} → {to}", {
          qty: fmtQty(q),
          unit: item?.unit ?? "",
          product: item?.product_name ?? "",
          from: nameOf(from),
          to: nameOf(toId),
        }),
      });
      setQty("");
      setLote("");
      setNote("");
      wh.reload();
      setTick((n) => n + 1);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] items-start">
      <form onSubmit={submit} className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="font-serif text-xl">{tr("Transferir entre bodegas")}</h2>
          <p className="text-sm text-foreground/70 mt-1">{tr("Sale de una bodega y entra en la otra en el mismo registro. El total del producto no cambia.")}</p>
        </div>
        <div>
          <label htmlFor="tr-item" className={labelCls}>{tr("Producto")}</label>
          <select id="tr-item" value={itemId} onChange={(e) => { setItemId(e.target.value); setMolienda(""); }} className={inputCls}>
            <option value="">{tr("Seleccionar producto...")}</option>
            {stocked.map((i) => (
              <option key={i.id} value={i.id}>{i.product_name} · {i.product_code}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
          <div>
            <label htmlFor="tr-from" className={labelCls}>{tr("Desde")}</label>
            <select id="tr-from" value={from} onChange={(e) => setFromId(e.target.value)} className={inputCls}>
              {wh.warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
          <ArrowRight aria-hidden="true" className="mb-3.5 w-4 h-4 text-foreground/50" />
          <div>
            <label htmlFor="tr-to" className={labelCls}>{tr("Hacia")}</label>
            <select id="tr-to" value={toId} onChange={(e) => setToId(e.target.value)} className={inputCls}>
              <option value="">{tr("Elegir…")}</option>
              {wh.warehouses.filter((w) => w.id !== from).map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>
        {item && origin && (
          <p className="rounded-xl bg-[#f9f7f0] px-4 py-2.5 text-sm tabular-nums">
            {tr("En {wh} hay {n} {unit}", { wh: nameOf(from), n: fmtQty(round(origin.total)), unit: item.unit })}
            {needsGrind && ` · ${tr("Grano {g} · Molido {m}", { g: fmtQty(round(origin.grano)), m: fmtQty(round(origin.molido)) })}`}
          </p>
        )}
        {needsGrind && (
          <div>
            <span className={labelCls}>{tr("Molienda")}</span>
            <div role="group" aria-label={tr("Molienda")} className="flex gap-1 rounded-xl bg-[#efebe3] p-1">
              {(["grano", "molido"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={molienda === g}
                  onClick={() => setMolienda(g)}
                  className={`flex-1 min-h-10 rounded-lg text-sm font-medium ${molienda === g ? "bg-white shadow-sm" : "text-foreground/70"}`}
                >
                  {g === "grano" ? tr("Grano") : tr("Molido")}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="tr-qty" className={labelCls}>{tr("Cantidad")}{item ? ` (${item.unit})` : ""}</label>
            <input id="tr-qty" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="tr-date" className={labelCls}>{tr("Fecha")}</label>
            <input id="tr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="tr-lote" className={labelCls}>{tr("Lote (opcional)")}</label>
            <input id="tr-lote" value={lote} onChange={(e) => setLote(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="tr-note" className={labelCls}>{tr("Nota (opcional)")}</label>
            <input id="tr-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("ej. Para el evento del sábado")} className={inputCls} />
          </div>
        </div>
        {feedback && (
          <p role="status" className={`rounded-xl px-4 py-3 text-sm font-medium ${feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
            {feedback.text}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full min-h-11 inline-flex items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-semibold text-white hover:bg-[#7A5B22] disabled:opacity-60"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {tr("Registrar transferencia")}
        </button>
      </form>

      <section aria-label={tr("Transferencias recientes")} className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
        <h3 className="px-6 py-4 border-b border-foreground/5 font-semibold">{tr("Transferencias recientes")}</h3>
        {recent === null ? (
          <p className="flex items-center gap-2 px-6 py-6 text-sm text-foreground/60"><Loader2 className="w-4 h-4 animate-spin" /> {tr("Cargando…")}</p>
        ) : recent.length === 0 ? (
          <p className="px-6 py-6 text-sm text-foreground/60">{tr("Aún no hay transferencias.")}</p>
        ) : (
          <ul>
            {recent.map((t) => (
              <li key={t.transfer_id} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-b border-foreground/5 px-6 py-3 text-sm">
                <span className="font-medium">{t.product_name}</span>
                <span className="font-semibold tabular-nums">{fmtQty(t.qty)} {t.unit ?? ""}</span>
                <span className="text-xs text-foreground/70">
                  {nameOf(t.from_id)} → {nameOf(t.to_id)} · {fmtDate(t.date)}
                  {t.molienda ? ` · ${t.molienda}` : ""}
                  {t.lote ? ` · ${tr("Lote {lote}", { lote: t.lote })}` : ""}
                </span>
                <span />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

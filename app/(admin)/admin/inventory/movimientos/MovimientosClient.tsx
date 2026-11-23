"use client";

// Movimientos: one place to register what comes in or goes out (entradas,
// salidas, count adjustments) and to see every recent movement together.
// Sales are orders and production has its own section; both show up in the
// combined history.

import React, { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, RefreshCw } from "lucide-react";
import { adjustInventoryStock, getInventoryMovements } from "../../../actions";
import { useTr } from "@/app/(admin)/AdminI18n";
import { tracksStock, CATEGORY_LABELS } from "@/utils/inventory/categories";
import { EntradasTab, KARDEX_ORIGIN, SalidasTab, fmtDate, fmtQty, type MovementRecord } from "../InventoryClient";
import { useInventory } from "../InventoryContext";
import { useWarehouses, type WarehousesState } from "../bodegas/useWarehouses";
import TransfersPanel from "../bodegas/TransfersPanel";
import WarehouseSelect from "../bodegas/WarehouseSelect";
import { MigrationNotice } from "../bodegas/BodegasClient";
import { stockIn } from "@/utils/inventory/warehouses";

export type MovementView = "entrada" | "salida" | "ajuste" | "transferencia" | "historial";

const VIEWS: { id: MovementView; label: string; hint: string; disabled?: boolean }[] = [
  { id: "entrada", label: "Entrada", hint: "Sin factura de proveedor" },
  { id: "salida", label: "Salida", hint: "Muestras, regalos, daños" },
  { id: "ajuste", label: "Ajuste de conteo", hint: "Diferencia del conteo físico" },
  { id: "transferencia", label: "Transferencia entre bodegas", hint: "De una bodega a otra" },
  { id: "historial", label: "Todos los movimientos", hint: "Los últimos 100, juntos" },
];

export default function MovimientosClient({ initialView }: { initialView: MovementView }) {
  const tr = useTr();
  const { inventory, updateStock } = useInventory();
  const [view, setView] = useState<MovementView>(initialView);
  const wh = useWarehouses();
  const whList = wh.migrated ? wh.warehouses : undefined;

  function pick(v: MovementView) {
    setView(v);
    // Keep the choice in the URL so a reload or a shared link opens it.
    window.history.replaceState(null, "", `/admin/inventory/movimientos?tipo=${v}`);
  }

  return (
    <div className="space-y-6">
      <div role="group" aria-label={tr("Tipo de movimiento")} className="grid grid-cols-2 gap-2 md:grid-cols-5">
        {VIEWS.map((v) => {
          const active = v.id === view;
          return (
            <button
              key={v.id}
              type="button"
              aria-pressed={active}
              disabled={v.disabled}
              onClick={() => !v.disabled && pick(v.id as MovementView)}
              className={`min-h-16 rounded-2xl border-[1.5px] px-4 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-55 ${
                active ? "border-foreground bg-white shadow-sm" : "border-foreground/10 bg-white/60 hover:border-foreground/30"
              }`}
            >
              <span className="block font-semibold">{tr(v.label)}</span>
              <span className="block text-xs text-foreground/70">{tr(v.hint)}</span>
            </button>
          );
        })}
      </div>

      {view === "entrada" && (
        <>
          <p className="rounded-2xl border border-[#E6CF9E] bg-[#FBF3E2] px-5 py-3 text-sm">
            💡 <strong>{tr("¿Llegó con factura de proveedor?")}</strong>{" "}
            {tr("Regístrala en Compras: la factura crea la entrada con su costo y, si la anulas, la revierte.")}{" "}
            <Link href="/admin/purchases" className="font-semibold text-[#7A5B22] underline">
              {tr("Ir a Compras →")}
            </Link>
          </p>
          <EntradasTab inventory={inventory} onStockUpdate={updateStock} era="v2" warehouses={whList} />
        </>
      )}
      {view === "salida" && <SalidasTab inventory={inventory} onStockUpdate={updateStock} era="v2" warehouses={whList} />}
      {view === "ajuste" && <AjusteConteo wh={wh} />}
      {view === "transferencia" && (wh.status === "loading" ? null : wh.migrated ? <TransfersPanel wh={wh} /> : <MigrationNotice />)}
      {view === "historial" && <HistorialCompleto />}
    </div>
  );
}

// ─── Count adjustment ─────────────────────────────────────────────────────────

function AjusteConteo({ wh }: { wh: WarehousesState }) {
  const tr = useTr();
  const [warehouseId, setWarehouseId] = useState("");
  const { inventory, updateStock } = useInventory();
  const stocked = useMemo(
    () =>
      inventory
        .filter((i) => tracksStock(i.category, i.product_code))
        .sort((a, b) => a.category.localeCompare(b.category) || a.product_name.localeCompare(b.product_name, "es")),
    [inventory]
  );
  const [itemId, setItemId] = useState("");
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [recent, setRecent] = useState<MovementRecord[] | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getInventoryMovements(undefined, "v2")
      .then((d) => {
        if (!cancelled) setRecent((d as MovementRecord[]).filter((m) => m.type === "ajuste").slice(0, 10));
      })
      .catch(() => {
        if (!cancelled) setRecent([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const item = stocked.find((i) => i.id === itemId) ?? null;
  const countedWh = wh.migrated ? (warehouseId || wh.main?.id || "") : "";
  const system = item ? (countedWh ? stockIn(wh.stock, item.id, countedWh).total : Number(item.current_stock) || 0) : 0;
  const countedNum = counted.trim() === "" ? null : Number(counted.replace(",", "."));
  const diff = countedNum !== null && Number.isFinite(countedNum) ? countedNum - system : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);
    if (!item || diff === null) {
      setFeedback({ ok: false, text: tr("Elige el producto y escribe lo que contaste.") });
      return;
    }
    if (Math.abs(diff) < 1e-9) {
      setFeedback({ ok: true, text: tr("✓ El conteo coincide con el sistema; no hay nada que ajustar.") });
      return;
    }
    if (!reason.trim()) {
      setFeedback({ ok: false, text: tr("Escribe el motivo del ajuste.") });
      return;
    }
    startTransition(async () => {
      try {
        const res = await adjustInventoryStock(item.id, "ajuste", diff, `Conteo físico: ${reason.trim()}`, countedWh || null);
        wh.reload();
        updateStock(item.id, res.newStock);
        setFeedback({ ok: true, text: tr("✓ Ajuste guardado: {name} queda en {n}", { name: item.product_name, n: fmtQty(res.newStock) }) });
        setCounted("");
        setReason("");
        setReload((n) => n + 1);
      } catch (err) {
        setFeedback({ ok: false, text: err instanceof Error ? err.message : tr("Error al ajustar el inventario") });
      }
    });
  }

  const inputCls =
    "w-full min-h-11 px-4 border border-foreground/15 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/30 bg-white";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)] items-start">
      <form onSubmit={submit} className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 space-y-5">
        <div>
          <h2 className="font-serif text-xl">{tr("Ajuste de conteo")}</h2>
          <p className="text-sm text-foreground/70 mt-1">
            {tr("Para diferencias del conteo físico. Escribe lo que contaste y el sistema calcula la diferencia.")}
          </p>
        </div>
        {wh.migrated && (
          <WarehouseSelect
            id="adj-wh"
            label={tr("Bodega que contaste")}
            className={inputCls}
            warehouses={wh.warehouses}
            value={warehouseId}
            onChange={setWarehouseId}
          />
        )}
        <div className="space-y-1.5">
          <label htmlFor="adj-item" className="block text-sm font-medium">{tr("Producto")}</label>
          <select id="adj-item" value={itemId} onChange={(e) => setItemId(e.target.value)} className={inputCls}>
            <option value="">{tr("Seleccionar producto...")}</option>
            {stocked.map((i) => (
              <option key={i.id} value={i.id}>
                {i.product_name} · {i.product_code} ({tr.msg(CATEGORY_LABELS[i.category] ?? i.category)})
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-[#f9f7f0] px-3 py-2">
            <p className="text-xs text-foreground/70">{tr("En sistema")}</p>
            <p className="text-lg font-semibold tabular-nums">{item ? fmtQty(system) : "—"}</p>
          </div>
          <div className="space-y-1">
            <label htmlFor="adj-count" className="block text-xs text-foreground/70">{tr("Contado")}</label>
            <input
              id="adj-count"
              inputMode="decimal"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              className="w-full min-h-11 rounded-xl border-[1.5px] border-foreground px-3 font-semibold tabular-nums focus:outline-none"
            />
          </div>
          <div className={`rounded-xl px-3 py-2 ${diff === null || diff === 0 ? "bg-[#f9f7f0]" : diff < 0 ? "bg-red-50" : "bg-emerald-50"}`}>
            <p className="text-xs text-foreground/70">{tr("Diferencia")}</p>
            <p className={`text-lg font-semibold tabular-nums ${diff !== null && diff < 0 ? "text-red-700" : diff ? "text-emerald-800" : ""}`}>
              {diff === null ? "—" : `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${fmtQty(Math.abs(diff))}`}
            </p>
          </div>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="adj-reason" className="block text-sm font-medium">{tr("Motivo")}</label>
          <input
            id="adj-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={tr("ej. Conteo mensual de noviembre")}
            className={inputCls}
          />
        </div>
        <p className="text-xs text-foreground/70">
          {tr("Va al costo de ventas, en una línea aparte del café vendido.")}
        </p>
        {feedback && (
          <p role="status" className={`rounded-xl px-4 py-3 text-sm font-medium ${feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
            {feedback.text}
          </p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full min-h-11 rounded-xl bg-foreground text-sm font-semibold text-white hover:bg-[#7A5B22] disabled:opacity-60 inline-flex items-center justify-center gap-2"
        >
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {tr("Guardar ajuste")}
        </button>
      </form>

      <section aria-label={tr("Ajustes recientes")} className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
        <h3 className="px-6 py-4 border-b border-foreground/5 font-semibold">{tr("Ajustes recientes")}</h3>
        {recent === null ? (
          <p className="flex items-center gap-2 px-6 py-6 text-sm text-foreground/60"><Loader2 className="w-4 h-4 animate-spin" /> {tr("Cargando…")}</p>
        ) : recent.length === 0 ? (
          <p className="px-6 py-6 text-sm text-foreground/60">{tr("Sin ajustes recientes.")}</p>
        ) : (
          <ul>
            {recent.map((m) => {
              const qty = Number(m.quantity);
              return (
                <li key={m.id} className="grid grid-cols-[1fr_auto] gap-x-4 border-b border-foreground/5 px-6 py-3 text-sm">
                  <span className="font-medium">{m.inventory?.product_name ?? "—"}</span>
                  <span className={`font-semibold tabular-nums ${qty < 0 ? "text-red-700" : "text-emerald-800"}`}>
                    {qty > 0 ? "+" : "−"}{fmtQty(Math.abs(qty))}
                  </span>
                  <span className="text-xs text-foreground/60">{fmtDate(m.movement_date ?? m.created_at)}{m.reason ? ` · ${m.reason}` : ""}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── Combined history ─────────────────────────────────────────────────────────

type Group = "entrada" | "salida" | "ajuste" | "produccion" | "transferencia";
const GROUP_LABEL: Record<Group, string> = { entrada: "Entradas", salida: "Salidas", ajuste: "Ajustes", produccion: "Producción", transferencia: "Transferencias" };
const GROUP_CHIP: Record<Group, string> = {
  entrada: "bg-emerald-50 text-emerald-800",
  salida: "bg-amber-50 text-amber-800",
  ajuste: "bg-red-50 text-red-700",
  produccion: "bg-blue-50 text-blue-800",
  transferencia: "bg-[#FBF3E2] text-[#7A5B22]",
};

function groupOf(m: MovementRecord): Group {
  if (m.type === "ajuste") return "ajuste";
  if (m.tab_source === "transferencia") return "transferencia";
  if (m.tab_source === "entrada") return "entrada";
  if (m.tab_source === "salida") return "salida";
  if (m.tab_source && ["trilla", "prod_consumo", "prod_alta", "cold_brew", "reempaque"].includes(m.tab_source)) return "produccion";
  return Number(m.quantity) >= 0 ? "entrada" : "salida";
}

function HistorialCompleto() {
  const tr = useTr();
  const [rows, setRows] = useState<MovementRecord[] | null>(null);
  const [filter, setFilter] = useState<Group | "all">("all");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getInventoryMovements(undefined, "v2")
      .then((d) => {
        if (!cancelled) setRows(d as MovementRecord[]);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  const counts = useMemo(() => {
    const c: Record<Group | "all", number> = { all: 0, entrada: 0, salida: 0, ajuste: 0, produccion: 0, transferencia: 0 };
    for (const m of rows ?? []) {
      c.all += 1;
      c[groupOf(m)] += 1;
    }
    return c;
  }, [rows]);

  const shown = (rows ?? []).filter((m) => filter === "all" || groupOf(m) === filter);

  return (
    <section aria-label={tr("Todos los movimientos")} className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-foreground/5 px-6 py-4">
        <div className="flex flex-wrap gap-1.5">
          {(["all", "entrada", "salida", "ajuste", "produccion", "transferencia"] as const).map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={filter === g}
              onClick={() => setFilter(g)}
              className={`min-h-9 rounded-full border px-3 text-sm font-medium ${
                filter === g ? "bg-foreground text-white border-foreground" : "bg-white border-foreground/15 hover:border-foreground/40"
              }`}
            >
              {g === "all" ? tr("Todos") : tr(GROUP_LABEL[g])} <span className="tabular-nums opacity-70">{counts[g]}</span>
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-foreground/60">{tr("Los últimos 100 movimientos. El histórico completo está en Kardex.")}</span>
        <button
          type="button"
          onClick={() => {
            setRows(null);
            setReload((n) => n + 1);
          }}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-foreground/15 px-3 text-sm hover:border-foreground/40"
        >
          <RefreshCw aria-hidden="true" className="w-3.5 h-3.5" /> {tr("Recargar")}
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-[0.7fr_1.1fr_minmax(180px,1.6fr)_0.7fr_1.6fr] gap-4 bg-[#fdfbf7] px-6 py-3 text-xs font-semibold text-foreground/70 border-b border-foreground/5">
            <div>{tr("Fecha")}</div>
            <div>{tr("Movimiento")}</div>
            <div>{tr("Producto")}</div>
            <div className="text-right">{tr("Cantidad")}</div>
            <div>{tr("Detalle")}</div>
          </div>
          {rows === null ? (
            <p className="flex items-center gap-2 px-6 py-8 text-sm text-foreground/60"><Loader2 className="w-4 h-4 animate-spin" /> {tr("Cargando…")}</p>
          ) : shown.length === 0 ? (
            <p className="px-6 py-8 text-sm text-foreground/60">{tr("Sin movimientos")}</p>
          ) : (
            shown.map((m) => {
              const g = groupOf(m);
              const qty = Number(m.quantity);
              const origin = m.tab_source && KARDEX_ORIGIN[m.tab_source] ? KARDEX_ORIGIN[m.tab_source] : m.type === "ajuste" ? "Ajuste" : m.type;
              const detail = [m.reason, m.lote ? tr("Lote {lote}", { lote: m.lote }) : null, m.molienda, m.responsable].filter(Boolean).join(" · ");
              return (
                <div key={m.id} className="grid grid-cols-[0.7fr_1.1fr_minmax(180px,1.6fr)_0.7fr_1.6fr] items-center gap-4 border-b border-foreground/5 px-6 py-3 text-sm">
                  <span className="tabular-nums text-foreground/70">{fmtDate(m.movement_date ?? m.created_at)}</span>
                  <span><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${GROUP_CHIP[g]}`}>{tr.msg(origin)}</span></span>
                  <span className="min-w-0">
                    <span className="block font-medium">{m.inventory?.product_name ?? "—"}</span>
                    <span className="block font-mono text-xs text-foreground/60">{m.inventory?.product_code ?? ""}</span>
                  </span>
                  <span className={`text-right font-semibold tabular-nums ${qty > 0 ? "text-emerald-800" : ""}`}>
                    {qty > 0 ? "+" : "−"}{fmtQty(Math.abs(qty))}
                  </span>
                  <span className="truncate text-foreground/70" title={detail}>{detail || "—"}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}

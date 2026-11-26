"use client";

// Existencias: what is in stock, what it is worth and what needs attention.
// Coffee is grouped by stage; each row shows the grano/molido split, days of
// cover (stock ÷ the last 28 days' outflow) and its value. Clicking a row
// opens its detail: recent movements, actions and settings.

import React, { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Loader2, Plus, Search, X } from "lucide-react";
import {
  getCostingData,
  getInventoryMovements,
  getKardexGeneral,
  setInventorySellable,
  updateInventoryItem,
} from "../../actions";
import { useTr } from "@/app/(admin)/AdminI18n";
import { CATEGORY_LABELS, tracksStock } from "@/utils/inventory/categories";
import { isSellable } from "@/utils/inventory/sellable";
import { RECONCILE_EPS } from "@/utils/inventory/kardex";
import { isGrindTracked } from "../../coffeeProfiles";
import {
  KARDEX_ORIGIN,
  NewProductModal,
  fmtDate,
  fmtQty,
  type InventoryItem,
  type MovementRecord,
} from "./InventoryClient";
import { useInventory } from "./InventoryContext";
import StageStrip from "./StageStrip";
import { STAGE_LABELS, STAGE_ORDER, coffeeStageOf, stageTotals, type CoffeeStage } from "./stages";
import { useWarehouses, type WarehousesState } from "./bodegas/useWarehouses";
import WarehouseSelect from "./bodegas/WarehouseSelect";
import { stockIn } from "@/utils/inventory/warehouses";

const COVER_WINDOW_DAYS = 28;
const COVER_ALERT_DAYS = 14;

type Kind = "cafe" | "insumos" | "equipos";
const KIND_CATEGORIES: Record<Kind, string[]> = {
  cafe: ["cafe"],
  insumos: ["empaque", "accesorio"],
  equipos: ["equipo", "enseres", "repuesto"],
};
const KIND_LABELS: Record<Kind, string> = {
  cafe: "Café",
  insumos: "Empaques e insumos",
  equipos: "Equipos y repuestos",
};

function kindOf(category: string): Kind | null {
  return (Object.keys(KIND_CATEGORIES) as Kind[]).find((k) => KIND_CATEGORIES[k].includes(category)) ?? null;
}

type Status = "out" | "low" | "ok";
const STATUS: Record<Status, { label: string; chip: string; bar: string; rank: number }> = {
  out: { label: "Agotado", chip: "bg-red-50 text-red-700", bar: "bg-red-600", rank: 2 },
  low: { label: "Reponer", chip: "bg-amber-50 text-amber-800", bar: "bg-amber-500", rank: 1 },
  ok: { label: "Bien", chip: "bg-emerald-50 text-emerald-800", bar: "bg-emerald-600", rank: 0 },
};

type Stats = { grano: number; molido: number; sinDefinir: number; outflow: number };
type Loaded<T> = { state: "loading" } | { state: "error" } | { state: "ready"; data: T };

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function ExistenciasClient() {
  const tr = useTr();
  const { inventory, addItem, patchItem } = useInventory();
  const [kind, setKind] = useState<Kind>("cafe");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const wh = useWarehouses();
  // "all" = every bodega; otherwise the stock shown is that bodega's.
  const [whFilter, setWhFilter] = useState("all");
  const whSel = wh.migrated && whFilter !== "all" ? whFilter : null;

  // Per-product stats from the kardex: grind split, 28-day outflow, mismatches.
  const [kardex, setKardex] = useState<Loaded<{ stats: Record<string, Stats>; mismatches: Record<string, number> }>>({ state: "loading" });
  const [costs, setCosts] = useState<Loaded<Record<string, number | null>>>({ state: "loading" });

  useEffect(() => {
    let cancelled = false;
    getKardexGeneral({ era: "v2" })
      .then((k) => {
        if (cancelled) return;
        const since = new Date();
        since.setDate(since.getDate() - COVER_WINDOW_DAYS);
        const from = ymd(since);
        const stats: Record<string, Stats> = {};
        for (const h of k.history) {
          const s = (stats[h.inventory_id] ??= { grano: 0, molido: 0, sinDefinir: 0, outflow: 0 });
          const net = h.entrada - h.salida;
          if (h.molienda === "grano") s.grano += net;
          else if (h.molienda === "molido") s.molido += net;
          else s.sinDefinir += net;
          // A transfer between bodegas is not consumption.
          if (h.date >= from && h.tab_source !== "transferencia") s.outflow += h.salida;
        }
        const mismatches: Record<string, number> = {};
        for (const p of k.products) if (Math.abs(p.difference) > RECONCILE_EPS) mismatches[p.id] = p.difference;
        setKardex({ state: "ready", data: { stats, mismatches } });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setKardex({ state: "error" });
      });
    getCostingData()
      .then((c) => {
        if (cancelled) return;
        const out: Record<string, number | null> = {};
        for (const [id, v] of Object.entries(c.unitCosts)) out[id] = v.cost;
        setCosts({ state: "ready", data: out });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setCosts({ state: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const stocked = useMemo(() => inventory.filter((i) => tracksStock(i.category, i.product_code)), [inventory]);

  const rows = useMemo(() => {
    const stats = kardex.state === "ready" ? kardex.data.stats : {};
    return stocked.map((item) => {
      const inWh = whSel ? stockIn(wh.stock, item.id, whSel) : null;
      const stock = inWh ? inWh.total : Number(item.current_stock) || 0;
      const k = stats[item.id];
      // In one bodega the grind split is that bodega's; the outflow stays the company's.
      const s = k && inWh ? { ...k, grano: inWh.grano, molido: inWh.molido, sinDefinir: inWh.sinDefinir } : k;
      const daily = s ? s.outflow / COVER_WINDOW_DAYS : null;
      const cover = daily && daily > 0 ? stock / daily : null;
      let status: Status = "ok";
      if (stock <= 0) status = "out";
      else if ((item.min_stock > 0 && stock <= item.min_stock) || (cover !== null && cover < COVER_ALERT_DAYS)) status = "low";
      const unitCost = costs.state === "ready" ? costs.data[item.id] ?? null : null;
      return { item, stock, stats: s, daily, cover, status, value: unitCost !== null ? stock * unitCost : null, unitCost };
    });
  }, [stocked, kardex, costs, whSel, wh.stock]);
  type Row = (typeof rows)[number];

  const counts = useMemo(() => {
    const c: Record<Kind, number> = { cafe: 0, insumos: 0, equipos: 0 };
    for (const r of rows) {
      const k = kindOf(r.item.category);
      if (k) c[k] += 1;
    }
    return c;
  }, [rows]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = rows.filter(
      (r) =>
        kindOf(r.item.category) === kind &&
        (!alertsOnly || r.status !== "ok") &&
        (!q || r.item.product_name.toLowerCase().includes(q) || r.item.product_code.toLowerCase().includes(q))
    );
    const byKey = new Map<string, Row[]>();
    for (const r of visible) {
      const key = kind === "cafe" ? coffeeStageOf(r.item.product_code) : r.item.category;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(r);
    }
    const order = kind === "cafe" ? (STAGE_ORDER as string[]) : KIND_CATEGORIES[kind];
    return order
      .filter((k) => byKey.has(k))
      .map((k) => ({
        key: k,
        label: kind === "cafe" ? STAGE_LABELS[k as CoffeeStage] : CATEGORY_LABELS[k] ?? k,
        rows: byKey.get(k)!.sort((a, b) => STATUS[b.status].rank - STATUS[a.status].rank || a.item.product_name.localeCompare(b.item.product_name, "es")),
      }));
  }, [rows, kind, alertsOnly, search]);

  const totals = useMemo(
    () => stageTotals(whSel ? stocked.map((i) => ({ ...i, current_stock: stockIn(wh.stock, i.id, whSel).total })) : stocked),
    [stocked, whSel, wh.stock]
  );
  const totalValue = useMemo(() => rows.reduce((sum, r) => sum + Math.max(r.value ?? 0, 0), 0), [rows]);
  const missingCost = rows.filter((r) => r.value === null && r.stock > 0).length;

  const attention = useMemo(() => {
    const list = rows
      .filter((r) => r.status !== "ok")
      .sort((a, b) => STATUS[b.status].rank - STATUS[a.status].rank || (a.cover ?? 0) - (b.cover ?? 0));
    const mism = kardex.state === "ready" ? Object.entries(kardex.data.mismatches) : [];
    return { list, mism };
  }, [rows, kardex]);

  const selected = rows.find((r) => r.item.id === selectedId) ?? null;

  const valueText =
    costs.state === "ready" ? (
      <>
        {tr("Valor del inventario")}{" "}
        <strong className="text-foreground tabular-nums">{cop(totalValue)}</strong>
        {missingCost > 0 && <span> · {tr("{n} sin costo", { n: missingCost })}</span>}
      </>
    ) : costs.state === "loading" ? (
      <span className="inline-flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> {tr("Calculando valor…")}
      </span>
    ) : null;

  return (
    <div className="space-y-6">
      <StageStrip totals={totals} valueText={valueText} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label={tr("Tipo de producto")} className="flex flex-wrap gap-1 rounded-2xl bg-[#efebe3] p-1">
          {(Object.keys(KIND_LABELS) as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={kind === k}
              onClick={() => {
                setKind(k);
                setSelectedId(null);
              }}
              className={`min-h-10 rounded-xl px-4 text-sm font-medium transition-all ${
                kind === k ? "bg-white text-foreground shadow-sm" : "text-foreground/70 hover:text-foreground"
              }`}
            >
              {tr(KIND_LABELS[k])} <span className="tabular-nums opacity-70">{counts[k]}</span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {wh.migrated && (
            <WarehouseSelect
              id="existencias-wh"
              label={tr("Bodega")}
              labelClassName="sr-only"
              className="min-h-11 rounded-xl border border-foreground/15 bg-white px-3 text-sm"
              warehouses={wh.warehouses}
              value={whFilter}
              onChange={(v) => setWhFilter(v)}
              allowAll
            />
          )}
          <button
            type="button"
            aria-pressed={alertsOnly}
            onClick={() => setAlertsOnly((v) => !v)}
            className={`min-h-10 rounded-full border px-4 text-sm font-medium transition-all ${
              alertsOnly ? "bg-foreground text-white border-foreground" : "bg-white border-foreground/15 hover:border-foreground/40"
            }`}
          >
            {tr("Solo con alertas")}
          </button>
          <div className="relative">
            <label htmlFor="existencias-search" className="sr-only">
              {tr("Buscar por nombre o código...")}
            </label>
            <Search aria-hidden="true" className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/50" />
            <input
              id="existencias-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tr("Buscar por nombre o código...")}
              className="min-h-11 w-64 max-w-full rounded-xl border border-foreground/15 bg-white pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/30"
            />
          </div>
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="min-h-11 inline-flex items-center gap-2 rounded-xl bg-foreground px-4 text-sm font-semibold text-white hover:bg-[#7A5B22] transition-colors"
          >
            <Plus aria-hidden="true" className="w-4 h-4" />
            {tr("Nuevo producto")}
          </button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] items-start">
        <section aria-label={tr("Productos")} className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[minmax(200px,2fr)_1.4fr_1.2fr_0.9fr_1fr] gap-4 px-5 py-3 text-xs font-semibold text-foreground/70 bg-[#fdfbf7] border-b border-foreground/5">
                <div>{tr("Producto")}</div>
                <div>{tr("Disponible")}</div>
                <div>{tr("Cobertura")}</div>
                <div className="text-right">{tr("Valor")}</div>
                <div>{tr("Estado")}</div>
              </div>
              {groups.length === 0 && (
                <p className="py-14 text-center text-sm text-foreground/60">{tr("No se encontraron productos")}</p>
              )}
              {groups.map((g) => (
                <div key={g.key}>
                  <div className="flex justify-between bg-[#f5f2ea] px-5 py-2 text-sm border-b border-foreground/5">
                    <span className="font-semibold">{tr(g.label)}</span>
                    <span className="tabular-nums text-foreground/70">{tr("{n} productos", { n: g.rows.length })}</span>
                  </div>
                  {g.rows.map((r) => (
                    <ProductRow
                      key={r.item.id}
                      row={r}
                      selected={r.item.id === selectedId}
                      loading={kardex.state === "loading"}
                      onPick={() => setSelectedId(r.item.id === selectedId ? null : r.item.id)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-4 border-t border-foreground/5 bg-[#fdfbf7] px-5 py-3 text-xs text-foreground/70">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#6B4F2C]" />{tr("Grano")}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#D2B98A]" />{tr("Molido")}</span>
            <span className="ml-auto">{tr("Cobertura = disponible ÷ consumo diario de los últimos 28 días")}</span>
          </div>
        </section>

        <aside className="space-y-4">
          {selected ? (
            <ProductDetail
              key={selected.item.id}
              row={selected}
              mismatch={kardex.state === "ready" ? kardex.data.mismatches[selected.item.id] ?? null : null}
              wh={wh}
              onClose={() => setSelectedId(null)}
              onPatch={patchItem}
            />
          ) : (
            <AttentionPanel
              list={attention.list}
              mismatches={attention.mism}
              inventory={inventory}
              loading={kardex.state === "loading"}
              onPick={(id) => setSelectedId(id)}
            />
          )}
        </aside>
      </div>

      {creating && (
        <NewProductModal
          existingCodes={inventory.map((i) => i.product_code)}
          onClose={() => setCreating(false)}
          onCreated={(item) => {
            addItem(item);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

type RowData = {
  item: InventoryItem;
  stock: number;
  stats: Stats | undefined;
  daily: number | null;
  cover: number | null;
  status: Status;
  value: number | null;
  unitCost: number | null;
};

function unitOf(item: InventoryItem) {
  return item.unit === "kg" ? "kg" : "uds";
}

function ProductRow({ row, selected, loading, onPick }: { row: RowData; selected: boolean; loading: boolean; onPick: () => void }) {
  const tr = useTr();
  const { item, stock, stats, daily, cover, status, value } = row;
  const grind = isGrindTracked(item.product_code) && stats && stock > 0 ? stats : null;
  const grindTotal = grind ? Math.max(grind.grano, 0) + Math.max(grind.molido, 0) + Math.max(grind.sinDefinir, 0) : 0;
  const st = STATUS[status];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      className={`grid w-full grid-cols-[minmax(200px,2fr)_1.4fr_1.2fr_0.9fr_1fr] items-center gap-4 border-b border-foreground/5 px-5 py-3.5 text-left transition-colors ${
        selected ? "bg-[#f3eee3]" : "bg-white hover:bg-[#fdfbf7]"
      }`}
    >
      <span className="min-w-0">
        <span className="block font-semibold text-foreground">{item.product_name}</span>
        <span className="block font-mono text-xs text-foreground/60">{item.product_code}</span>
      </span>
      <span className="space-y-1">
        <span className="block font-semibold tabular-nums">
          {fmtQty(stock)} {tr(unitOf(item))}
        </span>
        {grind && grindTotal > 0 && (
          <>
            <span className="flex h-1.5 max-w-40 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
              <span className="bg-[#6B4F2C]" style={{ width: `${(Math.max(grind.grano, 0) / grindTotal) * 100}%` }} />
              <span className="bg-[#D2B98A]" style={{ width: `${(Math.max(grind.molido, 0) / grindTotal) * 100}%` }} />
            </span>
            <span className="block text-xs tabular-nums text-foreground/70">
              {tr("Grano {g} · Molido {m}", { g: fmtQty(round(grind.grano)), m: fmtQty(round(grind.molido)) })}
              {Math.abs(grind.sinDefinir) > 0.0005 && ` · ${tr("Sin definir {n}", { n: fmtQty(round(grind.sinDefinir)) })}`}
            </span>
          </>
        )}
      </span>
      <span className="space-y-1.5">
        {loading ? (
          <span className="text-xs text-foreground/60">{tr("Calculando…")}</span>
        ) : (
          <>
            <span className="flex justify-between text-sm">
              <span className="font-semibold tabular-nums">
                {cover === null ? tr("Sin consumo") : tr("{n} días", { n: Math.round(cover) })}
              </span>
              {daily !== null && daily > 0 && (
                <span className="text-xs tabular-nums text-foreground/60">
                  {tr("{n}/día", { n: fmtQty(round(daily)) })}
                </span>
              )}
            </span>
            {cover !== null && (
              <span className="block h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
                <span
                  className={`block h-1.5 ${stock <= 0 ? STATUS.out.bar : cover < COVER_ALERT_DAYS ? STATUS.low.bar : STATUS.ok.bar}`}
                  style={{ width: `${Math.min(cover / 45, 1) * 100}%` }}
                />
              </span>
            )}
          </>
        )}
      </span>
      <span className="text-right text-sm tabular-nums text-foreground/80">{value === null ? "—" : cop(value)}</span>
      <span className="flex flex-col items-start gap-0.5">
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${st.chip}`}>{tr(st.label)}</span>
        {item.min_stock > 0 && <span className="text-xs text-foreground/60">{tr("mín. {n}", { n: fmtQty(item.min_stock) })}</span>}
      </span>
    </button>
  );
}

// ─── Attention panel ──────────────────────────────────────────────────────────

function AttentionPanel({
  list,
  mismatches,
  inventory,
  loading,
  onPick,
}: {
  list: RowData[];
  mismatches: [string, number][];
  inventory: InventoryItem[];
  loading: boolean;
  onPick: (id: string) => void;
}) {
  const tr = useTr();
  const MAX = 8;
  const nameOf = (id: string) => inventory.find((i) => i.id === id)?.product_name ?? id;
  const total = list.length + mismatches.length;
  return (
    <section aria-label={tr("Requiere atención")} className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-foreground/5 px-5 py-4">
        <h2 className="font-semibold">⚠️ {tr("Requiere atención")}</h2>
        <span className="text-xs tabular-nums text-foreground/60">{tr("{n} pendientes", { n: total })}</span>
      </div>
      {loading && (
        <p className="flex items-center gap-2 px-5 py-4 text-sm text-foreground/60">
          <Loader2 className="w-4 h-4 animate-spin" /> {tr("Revisando cobertura y kardex…")}
        </p>
      )}
      {!loading && total === 0 && <p className="px-5 py-6 text-sm text-foreground/60">✓ {tr("Todo al día.")}</p>}
      <ul>
        {mismatches.map(([id, diff]) => (
          <li key={`m-${id}`} className="flex items-start gap-3 border-b border-foreground/5 px-5 py-3">
            <span className="mt-0.5 shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">{tr("Descuadre")}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{nameOf(id)}</span>
              <span className="block text-xs text-foreground/70">
                {tr("El stock difiere de la suma de movimientos en {n}", { n: fmtQty(round(diff)) })}
              </span>
            </span>
            <Link href="/admin/inventory/kardex" className="shrink-0 rounded-lg border border-foreground/15 px-2.5 py-1.5 text-xs font-semibold text-[#7A5B22] hover:border-foreground/40">
              {tr("Revisar")}
            </Link>
          </li>
        ))}
        {list.slice(0, MAX).map((r) => (
          <li key={r.item.id}>
            <button
              type="button"
              onClick={() => onPick(r.item.id)}
              className="flex w-full items-start gap-3 border-b border-foreground/5 px-5 py-3 text-left hover:bg-[#fdfbf7]"
            >
              <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS[r.status].chip}`}>
                {tr(STATUS[r.status].label)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{r.item.product_name}</span>
                <span className="block text-xs tabular-nums text-foreground/70">
                  {r.status === "out"
                    ? tr("Sin existencias")
                    : r.cover !== null
                      ? tr("{n} días de cobertura · {s} {u}", { n: Math.round(r.cover), s: fmtQty(r.stock), u: tr(unitOf(r.item)) })
                      : tr("{s} {u} · mínimo {m}", { s: fmtQty(r.stock), u: tr(unitOf(r.item)), m: fmtQty(r.item.min_stock) })}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {list.length > MAX && (
        <p className="px-5 py-3 text-xs text-foreground/60">{tr("y {n} más — usa «Solo con alertas»", { n: list.length - MAX })}</p>
      )}
    </section>
  );
}

// ─── Product detail ───────────────────────────────────────────────────────────

function ProductDetail({
  row,
  mismatch,
  onClose,
  onPatch,
  wh,
}: {
  row: RowData;
  mismatch: number | null;
  wh: WarehousesState;
  onClose: () => void;
  onPatch: (id: string, patch: Partial<InventoryItem>) => void;
}) {
  const tr = useTr();
  const { item, stock, stats, cover, value, unitCost } = row;
  const [moves, setMoves] = useState<MovementRecord[] | null>(null);
  const [minDraft, setMinDraft] = useState(String(item.min_stock ?? 0));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const sellable = isSellable(item);

  useEffect(() => {
    let cancelled = false;
    getInventoryMovements(item.id, "v2")
      .then((d) => {
        if (!cancelled) setMoves((d as MovementRecord[]).slice(0, 6));
      })
      .catch(() => {
        if (!cancelled) setMoves([]);
      });
    return () => {
      cancelled = true;
    };
  }, [item.id]);

  function toggleSellable() {
    const next = !sellable;
    onPatch(item.id, { is_sellable: next });
    setMsg(null);
    startTransition(async () => {
      try {
        await setInventorySellable(item.id, next);
      } catch (err) {
        onPatch(item.id, { is_sellable: !next });
        setMsg({ ok: false, text: err instanceof Error ? err.message : tr("No se pudo actualizar") });
      }
    });
  }

  function saveMin(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(minDraft.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) {
      setMsg({ ok: false, text: tr("Ingresa un número válido") });
      return;
    }
    startTransition(async () => {
      try {
        await updateInventoryItem(item.id, { min_stock: n });
        onPatch(item.id, { min_stock: n });
        setMsg({ ok: true, text: tr("✓ Stock mínimo guardado") });
      } catch (err) {
        setMsg({ ok: false, text: err instanceof Error ? err.message : tr("No se pudo guardar") });
      }
    });
  }

  const unit = tr(unitOf(item));
  return (
    <section aria-label={tr("Detalle del producto")} className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b border-foreground/5 px-5 py-4">
        <div className="min-w-0">
          <h2 className="font-serif text-xl">{item.product_name}</h2>
          <p className="font-mono text-xs text-foreground/60">
            {item.product_code} · {tr.msg(CATEGORY_LABELS[item.category] ?? item.category)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr("Cerrar detalle")}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-foreground/10 hover:bg-foreground/5"
        >
          <X aria-hidden="true" className="w-4 h-4" />
        </button>
      </div>

      {mismatch !== null && (
        <p className="mx-5 mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          ⚠️ {tr("El stock difiere de la suma de movimientos en {n}", { n: fmtQty(round(mismatch)) })}.{" "}
          <Link href="/admin/inventory/kardex" className="font-semibold underline">
            {tr("Revisar en Kardex")}
          </Link>
        </p>
      )}

      <dl className="grid grid-cols-2 gap-2 px-5 py-4">
        <Stat label={tr("Disponible")} value={`${fmtQty(stock)} ${unit}`} />
        <Stat label={tr("Valor")} value={value === null ? "—" : cop(value)} />
        <Stat label={tr("Cobertura")} value={cover === null ? tr("Sin consumo") : tr("{n} días", { n: Math.round(cover) })} />
        <Stat
          label={tr("Costo unitario")}
          value={unitCost === null ? "—" : cop(unitCost)}
        />
        {isGrindTracked(item.product_code) && stats && (
          <div className="col-span-2 rounded-xl bg-[#f9f7f0] px-3 py-2">
            <dt className="text-xs text-foreground/70">{tr("Molienda")}</dt>
            <dd className="text-sm font-semibold tabular-nums">
              {tr("Grano {g} · Molido {m}", { g: fmtQty(round(stats.grano)), m: fmtQty(round(stats.molido)) })}
            </dd>
          </div>
        )}
      </dl>

      {wh.migrated && (
        <div className="border-t border-foreground/5 px-5 py-4 space-y-2">
          <h3 className="text-sm font-medium text-foreground/70">{tr("Por bodega")}</h3>
          <ul className="space-y-1.5">
            {wh.warehouses.map((w) => {
              const s = stockIn(wh.stock, item.id, w.id);
              return (
                <li key={w.id} className="flex justify-between gap-3 text-sm">
                  <span>
                    {w.name}
                    {w.is_default && <span className="text-xs text-foreground/60"> · {tr("principal")}</span>}
                  </span>
                  <span className={`tabular-nums font-semibold ${Math.abs(s.total) < 0.0005 ? "text-foreground/40" : ""}`}>
                    {fmtQty(round(s.total))} {tr(unitOf(item))}
                  </span>
                </li>
              );
            })}
          </ul>
          <Link href={`/admin/inventory/bodegas?producto=${item.id}`} className="inline-block pt-1 text-sm font-medium text-[#7A5B22] hover:underline">
            {tr("Transferir entre bodegas →")}
          </Link>
        </div>
      )}

      <div className="border-t border-foreground/5 px-5 py-4 space-y-2">
        <h3 className="text-sm font-medium text-foreground/70">{tr("Últimos movimientos")}</h3>
        {moves === null ? (
          <p className="flex items-center gap-2 text-sm text-foreground/60"><Loader2 className="w-4 h-4 animate-spin" /> {tr("Cargando…")}</p>
        ) : moves.length === 0 ? (
          <p className="text-sm text-foreground/60">{tr("Sin movimientos")}</p>
        ) : (
          <ul className="space-y-2">
            {moves.map((m) => {
              const qty = Number(m.quantity);
              const origin = m.tab_source && KARDEX_ORIGIN[m.tab_source] ? KARDEX_ORIGIN[m.tab_source] : m.type === "ajuste" ? "Ajuste" : m.type;
              return (
                <li key={m.id} className="grid grid-cols-[1fr_auto] gap-x-3 text-sm">
                  <span className="font-medium">{tr.msg(origin)}</span>
                  <span className={`text-right font-semibold tabular-nums ${qty > 0 ? "text-emerald-800" : ""}`}>
                    {qty > 0 ? "+" : "−"}
                    {fmtQty(Math.abs(qty))}
                  </span>
                  <span className="text-xs text-foreground/60 truncate">
                    {fmtDate(m.movement_date ?? m.created_at)}
                    {m.reason ? ` · ${m.reason}` : ""}
                    {m.lote ? ` · ${tr("Lote {lote}", { lote: m.lote })}` : ""}
                  </span>
                  <span />
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/admin/inventory/kardex" className="inline-block pt-1 text-sm font-medium text-[#7A5B22] hover:underline">
          {tr("Ver kardex completo →")}
        </Link>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-foreground/5 px-5 py-4">
        <Link
          href="/admin/inventory/movimientos?tipo=salida"
          className="min-h-11 flex-1 inline-flex items-center justify-center rounded-xl bg-foreground px-4 text-sm font-semibold text-white hover:bg-[#7A5B22]"
        >
          {tr("Registrar salida")}
        </Link>
        <Link
          href={`/admin/inventory/movimientos?tipo=ajuste&producto=${item.id}`}
          className="min-h-11 flex-1 inline-flex items-center justify-center rounded-xl border border-foreground/15 px-4 text-sm font-medium hover:border-foreground/40"
        >
          {tr("Hacer comprobante de ajuste")}
        </Link>
      </div>

      <div className="border-t border-foreground/5 px-5 py-4 space-y-4">
        <h3 className="text-sm font-medium text-foreground/70">{tr("Configuración")}</h3>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-medium">{tr("Se vende")}</p>
            <p className="text-xs text-foreground/60">{tr("Aparece al crear pedidos")}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={sellable}
            aria-label={tr("Se vende")}
            disabled={pending}
            onClick={toggleSellable}
            className={`relative h-8 w-14 shrink-0 rounded-full transition-colors disabled:opacity-60 ${sellable ? "bg-foreground" : "bg-foreground/25"}`}
          >
            <span className={`absolute top-1 h-6 w-6 rounded-full bg-white transition-all ${sellable ? "left-7" : "left-1"}`} />
          </button>
        </div>
        <form onSubmit={saveMin} className="flex items-end gap-2">
          <div className="flex-1">
            <label htmlFor="min-stock" className="block font-medium">
              {tr("Stock mínimo")}
            </label>
            <p className="text-xs text-foreground/60">{tr("Avisa «Reponer» cuando el stock llega a este número")}</p>
          </div>
          <input
            id="min-stock"
            inputMode="decimal"
            value={minDraft}
            onChange={(e) => setMinDraft(e.target.value)}
            className="min-h-11 w-20 rounded-xl border border-foreground/15 px-3 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-[#C59F59]/30"
          />
          <button type="submit" disabled={pending} className="min-h-11 rounded-xl border border-foreground/15 px-3 text-sm font-semibold hover:border-foreground/40 disabled:opacity-60">
            {tr("Guardar")}
          </button>
        </form>
        {msg && (
          <p role="status" className={`rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
            {msg.text}
          </p>
        )}
        <Link href={`/admin/settings/auditoria?producto=${item.id}`} className="inline-block text-sm font-medium text-[#7A5B22] hover:underline">
          {tr("Historial de cambios de este producto")}
        </Link>
      </div>

    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[#f9f7f0] px-3 py-2">
      <dt className="text-xs text-foreground/70">{label}</dt>
      <dd className="text-base font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

function cop(n: number) {
  return `$${Math.round(n).toLocaleString("es-CO")}`;
}

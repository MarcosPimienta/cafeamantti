"use client";

// Bodegas: what each bodega holds, transfers between them, and their
// settings (name, main bodega, active).

import React, { useMemo, useState, useTransition } from "react";
import { Loader2, Search } from "lucide-react";
import { useTr } from "@/app/(admin)/AdminI18n";
import { tracksStock } from "@/utils/inventory/categories";
import { WAREHOUSE_KIND_LABEL, WAREHOUSES_MIGRATION, stockIn, type Warehouse, type WarehouseKind } from "@/utils/inventory/warehouses";
import { isGrindTracked } from "../../../coffeeProfiles";
import { fmtQty } from "../InventoryClient";
import { useInventory } from "../InventoryContext";
import { stageTotals } from "../stages";
import { saveWarehouse, setDefaultWarehouse, setWarehouseActive } from "./actions";
import TransfersPanel from "./TransfersPanel";
import { useWarehouses, type WarehousesState } from "./useWarehouses";

export type BodegasView = "stock" | "transferir" | "administrar";

type Kind = "all" | "cafe" | "insumos" | "equipos";
const KIND_CATEGORIES: Record<Exclude<Kind, "all">, string[]> = {
  cafe: ["cafe"],
  insumos: ["empaque", "accesorio"],
  equipos: ["equipo", "enseres", "repuesto"],
};

export default function BodegasClient({ initialView, initialProduct }: { initialView: BodegasView; initialProduct: string | null }) {
  const tr = useTr();
  const wh = useWarehouses();
  const [view, setView] = useState<BodegasView>(initialView);
  const [product, setProduct] = useState(initialProduct ?? "");

  function pick(v: BodegasView) {
    setView(v);
    window.history.replaceState(null, "", `/admin/inventory/bodegas?vista=${v}`);
  }

  if (wh.status === "loading") {
    return (
      <p className="flex items-center gap-2 py-10 text-sm text-foreground/70">
        <Loader2 className="w-4 h-4 animate-spin" /> {tr("Cargando bodegas…")}
      </p>
    );
  }
  if (wh.status === "error") return <p className="rounded-2xl bg-red-50 px-5 py-4 text-sm text-red-700">{tr("No se pudieron cargar las bodegas.")}</p>;
  if (!wh.migrated) return <MigrationNotice />;

  return (
    <div className="space-y-6">
      <WarehouseCards wh={wh} />

      <div role="group" aria-label={tr("Vista de bodegas")} className="inline-flex flex-wrap gap-1 rounded-2xl bg-[#efebe3] p-1">
        {(
          [
            ["stock", "Stock por bodega"],
            ["transferir", "Transferir"],
            ["administrar", "Administrar bodegas"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={view === id}
            onClick={() => pick(id)}
            className={`min-h-10 rounded-xl px-4 text-sm font-medium transition-all ${view === id ? "bg-white text-foreground shadow-sm" : "text-foreground/70 hover:text-foreground"}`}
          >
            {tr(label)}
          </button>
        ))}
      </div>

      {view === "stock" && (
        <StockMatrix
          wh={wh}
          onTransfer={(id) => {
            setProduct(id);
            pick("transferir");
          }}
        />
      )}
      {view === "transferir" && <TransfersPanel wh={wh} productId={product} onProductChange={setProduct} />}
      {view === "administrar" && <ManageWarehouses wh={wh} />}
    </div>
  );
}

export function MigrationNotice() {
  const tr = useTr();
  return (
    <div className="rounded-3xl border border-amber-200 bg-amber-50 px-6 py-5 text-sm text-amber-900 space-y-2">
      <p className="font-semibold">⚠️ {tr("Las bodegas aún no están activas en la base de datos.")}</p>
      <p>
        {tr("Falta aplicar la migración {file}. Mientras tanto todo el stock sigue siendo un solo número por producto.", { file: WAREHOUSES_MIGRATION })}
      </p>
    </div>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function WarehouseCards({ wh }: { wh: WarehousesState }) {
  const tr = useTr();
  const { inventory } = useInventory();
  return (
    <section aria-label={tr("Bodegas")} className="grid gap-3 md:grid-cols-3">
      {wh.warehouses.map((w) => {
        const items = inventory.map((it) => ({ ...it, current_stock: stockIn(wh.stock, it.id, w.id).total }));
        const t = stageTotals(items);
        const coffeeKg = t.pergaminoKg + t.verdeKg + t.granelKg + t.empacadoKg;
        const products = items.filter((i) => tracksStock(i.category, i.product_code) && i.current_stock > 0.0005).length;
        return (
          <div key={w.id} className="rounded-3xl border border-foreground/5 bg-white p-5 shadow-sm space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-serif text-lg">{w.name}</h2>
              {w.is_default && <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-white">{tr("Principal")}</span>}
              <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${w.kind === "maquila" ? "bg-[#FBF3E2] text-[#7A5B22]" : "bg-[#efebe3] text-foreground/80"}`}>
                {tr(WAREHOUSE_KIND_LABEL[w.kind])}
              </span>
            </div>
            <p className="text-2xl font-semibold tabular-nums">
              {fmtQty(Math.round(coffeeKg * 10) / 10)} <span className="text-sm font-medium text-foreground/60">{tr("kg de café")}</span>
            </p>
            <p className="text-xs text-foreground/70 tabular-nums">
              {tr("{n} productos con stock", { n: products })}
              {t.empacadoUds > 0 && ` · ${tr("{n} bolsas", { n: fmtQty(t.empacadoUds) })}`}
            </p>
            {w.is_default && <p className="text-xs text-foreground/60">{tr("Pedidos, compras y producción mueven stock aquí.")}</p>}
            {w.kind === "maquila" && <p className="text-xs text-foreground/60">{tr("El café para Cold Brew se consume aquí.")}</p>}
          </div>
        );
      })}
    </section>
  );
}

// ─── Stock matrix ─────────────────────────────────────────────────────────────

function StockMatrix({ wh, onTransfer }: { wh: WarehousesState; onTransfer: (id: string) => void }) {
  const tr = useTr();
  const { inventory } = useInventory();
  const [kind, setKind] = useState<Kind>("cafe");
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inventory
      .filter((i) => tracksStock(i.category, i.product_code))
      .filter((i) => kind === "all" || KIND_CATEGORIES[kind].includes(i.category))
      .filter((i) => !q || i.product_name.toLowerCase().includes(q) || i.product_code.toLowerCase().includes(q))
      .map((i) => ({ item: i, per: wh.warehouses.map((w) => stockIn(wh.stock, i.id, w.id)) }))
      .filter((r) => r.per.some((s) => Math.abs(s.total) > 0.0005))
      .sort((a, b) => a.item.product_name.localeCompare(b.item.product_name, "es"));
  }, [inventory, kind, search, wh.warehouses, wh.stock]);

  const cols = `minmax(200px,2fr) repeat(${wh.warehouses.length}, minmax(110px,1fr)) minmax(90px,0.8fr) auto`;

  return (
    <section aria-label={tr("Stock por bodega")} className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-foreground/5 px-5 py-4">
        {(
          [
            ["cafe", "Café"],
            ["insumos", "Empaques e insumos"],
            ["equipos", "Equipos y repuestos"],
            ["all", "Todos"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={kind === id}
            onClick={() => setKind(id)}
            className={`min-h-9 rounded-full border px-3 text-sm font-medium ${kind === id ? "bg-foreground text-white border-foreground" : "bg-white border-foreground/15 hover:border-foreground/40"}`}
          >
            {tr(label)}
          </button>
        ))}
        <div className="relative ml-auto">
          <label htmlFor="bod-search" className="sr-only">{tr("Buscar por nombre o código...")}</label>
          <Search aria-hidden="true" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground/50" />
          <input
            id="bod-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr("Buscar por nombre o código...")}
            className="min-h-10 w-60 rounded-xl border border-foreground/15 bg-white pl-9 pr-3 text-sm"
          />
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div className="grid gap-4 bg-[#fdfbf7] px-5 py-3 text-xs font-semibold text-foreground/70 border-b border-foreground/5" style={{ gridTemplateColumns: cols }}>
            <div>{tr("Producto")}</div>
            {wh.warehouses.map((w) => (
              <div key={w.id} className="text-right">{w.name}</div>
            ))}
            <div className="text-right">{tr("Total")}</div>
            <div className="w-24" />
          </div>
          {rows.length === 0 && <p className="px-5 py-10 text-center text-sm text-foreground/60">{tr("No se encontraron productos")}</p>}
          {rows.map(({ item, per }) => {
            const total = per.reduce((t, s) => t + s.total, 0);
            const grind = isGrindTracked(item.product_code);
            return (
              <div key={item.id} className="grid items-center gap-4 border-b border-foreground/5 px-5 py-3 text-sm" style={{ gridTemplateColumns: cols }}>
                <div className="min-w-0">
                  <p className="font-semibold">{item.product_name}</p>
                  <p className="font-mono text-xs text-foreground/60">{item.product_code} · {item.unit}</p>
                </div>
                {per.map((s, i) => (
                  <div key={wh.warehouses[i].id} className="text-right tabular-nums">
                    <span className={Math.abs(s.total) < 0.0005 ? "text-foreground/40" : s.total < 0 ? "font-semibold text-red-700" : "font-semibold"}>
                      {fmtQty(round(s.total))}
                    </span>
                    {grind && Math.abs(s.total) > 0.0005 && (
                      <span className="block text-[11px] text-foreground/60">
                        {tr("G {g} · M {m}", { g: fmtQty(round(s.grano)), m: fmtQty(round(s.molido)) })}
                      </span>
                    )}
                  </div>
                ))}
                <div className="text-right font-semibold tabular-nums">{fmtQty(round(total))}</div>
                <div className="w-24 text-right">
                  <button
                    type="button"
                    onClick={() => onTransfer(item.id)}
                    className="min-h-9 rounded-lg border border-foreground/15 px-2.5 text-xs font-semibold text-[#7A5B22] hover:border-foreground/40"
                  >
                    {tr("Transferir")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Manage ───────────────────────────────────────────────────────────────────

function ManageWarehouses({ wh }: { wh: WarehousesState }) {
  const tr = useTr();
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ success: true } | { success: false; error: string }>, ok: string) {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.success) setMsg({ ok: false, text: tr.msg(res.error) });
      else {
        setMsg({ ok: true, text: ok });
        setEditing(null);
        wh.reload();
      }
    });
  }

  const sorted = [...wh.all].sort((a, b) => Number(b.active) - Number(a.active) || Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name, "es"));

  return (
    <section aria-label={tr("Administrar bodegas")} className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-foreground/5 px-6 py-4">
        <h2 className="font-semibold">{tr("Bodegas")}</h2>
        <button
          type="button"
          onClick={() => setEditing("new")}
          className="min-h-10 rounded-xl bg-foreground px-4 text-sm font-semibold text-white hover:bg-[#7A5B22]"
        >
          {tr("Nueva bodega")}
        </button>
      </div>
      {msg && (
        <p role="status" className={`mx-6 mt-4 rounded-xl px-4 py-3 text-sm font-medium ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700"}`}>
          {msg.text}
        </p>
      )}
      {editing === "new" && (
        <WarehouseForm
          pending={pending}
          onCancel={() => setEditing(null)}
          onSave={(v) => run(() => saveWarehouse(v), tr("✓ Bodega creada"))}
        />
      )}
      <ul>
        {sorted.map((w) => (
          <li key={w.id} className={`border-b border-foreground/5 px-6 py-4 ${w.active ? "" : "bg-[#fafaf8]"}`}>
            {editing === w.id ? (
              <WarehouseForm
                initial={w}
                pending={pending}
                onCancel={() => setEditing(null)}
                onSave={(v) => run(() => saveWarehouse({ ...v, id: w.id }), tr("✓ Bodega actualizada"))}
              />
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{w.name}</span>
                    <span className="font-mono text-xs text-foreground/60">{w.code}</span>
                    {w.is_default && <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-semibold text-white">{tr("Principal")}</span>}
                    <span className="rounded-full bg-[#efebe3] px-2 py-0.5 text-[11px] font-semibold text-foreground/80">{tr(WAREHOUSE_KIND_LABEL[w.kind])}</span>
                    {!w.active && <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] font-semibold text-foreground/70">{tr("Inactiva")}</span>}
                  </p>
                  {w.address && <p className="text-xs text-foreground/60">{w.address}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={pending} onClick={() => setEditing(w.id)} className="min-h-9 rounded-lg border border-foreground/15 px-3 text-sm hover:border-foreground/40">
                    {tr("Editar")}
                  </button>
                  {!w.is_default && w.active && (
                    <button type="button" disabled={pending} onClick={() => run(() => setDefaultWarehouse(w.id), tr("✓ {name} es ahora la bodega principal", { name: w.name }))} className="min-h-9 rounded-lg border border-foreground/15 px-3 text-sm hover:border-foreground/40">
                      {tr("Hacer principal")}
                    </button>
                  )}
                  {!w.is_default && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => setWarehouseActive(w.id, !w.active), w.active ? tr("✓ Bodega desactivada") : tr("✓ Bodega activada"))}
                      className="min-h-9 rounded-lg border border-foreground/15 px-3 text-sm hover:border-foreground/40"
                    >
                      {w.active ? tr("Desactivar") : tr("Activar")}
                    </button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="px-6 py-4 text-xs text-foreground/70">
        💡 {tr("La bodega principal es de donde descuentan los pedidos y donde entran las compras y la producción. Una bodega con stock no se puede desactivar: transfiérelo primero.")}
      </p>
    </section>
  );
}

function WarehouseForm({
  initial,
  pending,
  onSave,
  onCancel,
}: {
  initial?: Warehouse;
  pending: boolean;
  onSave: (v: { name: string; code: string; kind: WarehouseKind; address: string; notes: string }) => void;
  onCancel: () => void;
}) {
  const tr = useTr();
  const [name, setName] = useState(initial?.name ?? "");
  const [code, setCode] = useState(initial?.code ?? "");
  const [kind, setKind] = useState<WarehouseKind>(initial?.kind ?? "propia");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const cls = "w-full min-h-10 px-3 border border-foreground/15 rounded-xl text-sm bg-white";
  const idp = initial?.id ?? "new";
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ name, code, kind, address, notes });
      }}
      className="grid gap-3 px-6 py-4 md:grid-cols-2"
    >
      <div>
        <label htmlFor={`wh-name-${idp}`} className="block text-sm font-medium mb-1">{tr("Nombre")}</label>
        <input id={`wh-name-${idp}`} value={name} onChange={(e) => setName(e.target.value)} className={cls} required />
      </div>
      <div>
        <label htmlFor={`wh-code-${idp}`} className="block text-sm font-medium mb-1">{tr("Código corto")}</label>
        <input id={`wh-code-${idp}`} value={code} onChange={(e) => setCode(e.target.value)} placeholder="MATEO" className={`${cls} font-mono uppercase`} required />
      </div>
      <div>
        <label htmlFor={`wh-kind-${idp}`} className="block text-sm font-medium mb-1">{tr("Tipo")}</label>
        <select id={`wh-kind-${idp}`} value={kind} onChange={(e) => setKind(e.target.value as WarehouseKind)} className={cls}>
          <option value="propia">{tr("Propia")}</option>
          <option value="maquila">{tr("Maquilador")}</option>
        </select>
      </div>
      <div>
        <label htmlFor={`wh-addr-${idp}`} className="block text-sm font-medium mb-1">{tr("Dirección (opcional)")}</label>
        <input id={`wh-addr-${idp}`} value={address} onChange={(e) => setAddress(e.target.value)} className={cls} />
      </div>
      <div className="md:col-span-2">
        <label htmlFor={`wh-notes-${idp}`} className="block text-sm font-medium mb-1">{tr("Notas (opcional)")}</label>
        <input id={`wh-notes-${idp}`} value={notes} onChange={(e) => setNotes(e.target.value)} className={cls} />
      </div>
      <div className="flex gap-2 md:col-span-2">
        <button type="submit" disabled={pending} className="min-h-10 rounded-xl bg-foreground px-4 text-sm font-semibold text-white disabled:opacity-60">
          {tr("Guardar")}
        </button>
        <button type="button" onClick={onCancel} className="min-h-10 rounded-xl border border-foreground/15 px-4 text-sm">
          {tr("Cancelar")}
        </button>
      </div>
    </form>
  );
}

function round(n: number) {
  return Math.round(n * 1000) / 1000;
}

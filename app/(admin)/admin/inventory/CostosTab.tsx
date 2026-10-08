"use client";

import React, { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Check, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react";
import { getCostingData, savePackagingRecipe, updateCostSettings, updateStandardCost } from "../../actions";
import type { PackagingLine } from "@/utils/costing/packaging";
import { PROFILE_LABELS, type CoffeeProfileId } from "../../coffeeProfiles";
import type { CostLine, CostSettings } from "@/utils/costing/costPerKg";

type CostingData = Awaited<ReturnType<typeof getCostingData>>;

const cardCls = "bg-white rounded-3xl border border-foreground/5 shadow-sm";
const labelCls = "block text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5";
const inputCls =
  "w-full px-3 py-2 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20";
const thCls = "px-4 py-3 text-[10px] font-bold uppercase tracking-widest text-foreground/40 whitespace-nowrap";
const tdCls = "px-4 py-3 text-sm whitespace-nowrap";

const cop = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${(n * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;

function marginTone(m: number | null) {
  if (m === null) return "text-foreground/30";
  if (m < 0) return "text-red-600";
  if (m < 30) return "text-amber-600";
  return "text-emerald-700";
}

/** A money/number input that saves on blur or Enter and shows when it saved. */
function SaveField({
  value,
  onSave,
  placeholder,
  suffix,
  step = "any",
  ariaLabel,
}: {
  value: number | null;
  onSave: (v: number | null) => Promise<unknown>;
  placeholder?: string;
  suffix?: string;
  step?: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [snapshot, setSnapshot] = useState(value);
  if (snapshot !== value) {
    setSnapshot(value);
    setDraft(value === null ? "" : String(value));
  }

  async function commit() {
    const next = draft.trim() === "" ? null : Number(draft);
    if (next === value || (next !== null && !Number.isFinite(next))) return;
    setState("saving");
    try {
      await onSave(next);
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    } catch (err) {
      setState("error");
      alert(err instanceof Error ? err.message : "No se pudo guardar");
    }
  }

  return (
    <div className="relative flex items-center gap-2">
      <input
        type="number"
        min="0"
        step={step}
        inputMode="decimal"
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className={`${inputCls} ${state === "error" ? "border-red-300" : ""}`}
      />
      {suffix && <span className="text-xs text-foreground/40 whitespace-nowrap">{suffix}</span>}
      <span className="w-4 shrink-0">
        {state === "saving" && <Loader2 className="w-4 h-4 animate-spin text-[#C59F59]" />}
        {state === "saved" && <Check className="w-4 h-4 text-emerald-600" />}
      </span>
    </div>
  );
}

/**
 * Edits what packing one unit of a reference consumes (bag, sticker,
 * label…). "Predeterminado" drops the saved recipe (bag + sticker).
 */
function RecipeEditor({
  line,
  options,
  onClose,
  onSaved,
}: {
  line: CostLine;
  options: { code: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [rows, setRows] = useState<{ code: string; qty: string }[]>(
    line.packaging.map((p) => ({ code: p.code, qty: String(p.qty) }))
  );
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const nameOf = (code: string) => options.find((o) => o.code === code)?.name ?? code;

  function save(lines: PackagingLine[] | null) {
    startTransition(async () => {
      try {
        await savePackagingRecipe(line.product_code, lines);
        onSaved();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 bg-black/30" onClick={onClose}>
      <div
        className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Empaque de ${line.product_name}`}
      >
        <div className="px-6 py-5 border-b border-foreground/5 flex items-start justify-between gap-4">
          <div>
            <p className={labelCls}>Receta de empaque</p>
            <h3 className="font-serif text-lg">{line.product_name}</h3>
            <p className="text-xs text-foreground/50 mt-1">
              Lo que consume empacar <strong>una unidad</strong>. Se usa en el costo y en el consumo sugerido de
              Empaque/Altas y Reempaque.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-foreground/5" aria-label="Cerrar">
            <X className="w-5 h-5 text-foreground/40" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          {rows.length === 0 && (
            <p className="text-sm text-foreground/50 bg-[#fdfbf7] rounded-xl px-4 py-3">Sin empaque: esta referencia no consume insumos.</p>
          )}
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_auto] gap-2 items-center">
              <select
                value={r.code}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))}
                aria-label="Insumo"
                className={inputCls}
              >
                <option value="">Seleccionar…</option>
                {r.code && !options.some((o) => o.code === r.code) && <option value={r.code}>{r.code}</option>}
                {options.map((o) => (
                  <option key={o.code} value={o.code}>
                    {o.name} ({o.code})
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="0"
                step="any"
                value={r.qty}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))}
                aria-label={`Cantidad de ${nameOf(r.code)}`}
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => setRows(rows.filter((_, j) => j !== i))}
                className="p-2 rounded-lg text-foreground/30 hover:text-red-500 hover:bg-red-50"
                aria-label={`Quitar ${nameOf(r.code)}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows([...rows, { code: "", qty: "1" }])}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-foreground/20 text-xs font-bold uppercase tracking-widest text-foreground/50 hover:bg-foreground/5"
          >
            <Plus className="w-3.5 h-3.5" /> Agregar insumo
          </button>
          {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}
        </div>

        <div className="px-6 pb-6 flex flex-col-reverse sm:flex-row gap-2 sm:justify-between">
          <button
            type="button"
            disabled={isPending || !line.customPackaging}
            onClick={() => save(null)}
            className="px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest text-foreground/50 hover:bg-foreground/5 disabled:opacity-40"
            title="Volver a bolsa + sticker del perfil"
          >
            Predeterminado
          </button>
          <button
            type="button"
            disabled={isPending}
            onClick={() => save(rows.filter((r) => r.code).map((r) => ({ code: r.code, qty: Number(r.qty) })))}
            className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#C59F59] hover:bg-[#b08d4f] text-white text-xs font-bold uppercase tracking-widest disabled:opacity-60"
          >
            {isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar receta
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Direct cost per kg of every roasted reference (coffee, toll roasting,
 * packaging, dispatch) with the margin against recent selling prices, plus
 * the prices and parameters it is built from.
 */
export default function CostosTab() {
  const [data, setData] = useState<CostingData | null>(null);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState<CostLine | null>(null);

  function load() {
    startTransition(async () => {
      try {
        setData(await getCostingData());
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar los costos");
      }
    });
  }

  useEffect(() => {
    load();
  }, []);

  const saveSetting = async (patch: Partial<CostSettings>) => {
    await updateCostSettings(patch);
    load();
  };
  const saveCost = async (id: string, v: number | null) => {
    await updateStandardCost(id, v);
    load();
  };

  if (error) return <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>;
  if (!data) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-8 h-8 text-[#C59F59] animate-spin" />
      </div>
    );
  }

  const { sheet, settings, pricedItems, packagingOptions, salesWindowDays, migrated } = data;
  const optionName = (code: string) => packagingOptions.find((o) => o.code === code)?.name ?? code;
  const profiles = Object.keys(sheet.yields) as CoffeeProfileId[];
  const coffeeItems = pricedItems.filter((i) => /^(CAFV|CAPG)-/.test(i.product_code));
  const packagingItems = pricedItems.filter((i) => !/^(CAFV|CAPG)-/.test(i.product_code));
  const linesByProfile = profiles.map((p) => [p, sheet.lines.filter((l) => l.profile === p)] as const).filter(([, l]) => l.length);

  return (
    <div className="space-y-6">
      <div className={`${cardCls} p-6 sm:p-8`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-serif">Costo directo por kg</h2>
            <p className="text-sm text-foreground/50 mt-1 max-w-3xl">
              Cuánto cuesta cada kilo de café tostado, empacado y despachado: café (verde o pergamino según cómo
              llegó, ajustado por los rendimientos reales), maquila de tostión, empaque y despacho. Solo costos
              directos. El margen usa el precio promedio de venta de los últimos {salesWindowDays} días.
            </p>
          </div>
          <button
            onClick={load}
            className="self-start p-2 rounded-xl hover:bg-foreground/5 text-foreground/40"
            aria-label="Recalcular"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          </button>
        </div>
        {!migrated && (
          <div className="mt-4 flex items-start gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            Falta aplicar la migración <code className="font-mono">20261009000000_costing.sql</code>: hasta entonces no se
            pueden guardar precios ni parámetros.
          </div>
        )}
      </div>

      {/* Cost sheet */}
      <div className={`${cardCls} overflow-hidden`}>
        <div className="px-6 py-5 border-b border-foreground/5 bg-[#fdfbf7]">
          <h3 className="font-serif text-lg">Costo por referencia</h3>
          <p className="text-xs text-foreground/50 mt-0.5">Valores por kg de café tostado; la última columna de costo es por bolsa.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-foreground/5">
                <th className={thCls}>Referencia</th>
                <th className={`${thCls} text-right`}>Café</th>
                <th className={`${thCls} text-right`}>Tostión</th>
                <th className={`${thCls} text-right`}>Empaque</th>
                <th className={`${thCls} text-right`}>Despacho</th>
                <th className={`${thCls} text-right`}>Costo / kg</th>
                <th className={`${thCls} text-right`}>Costo / unidad</th>
                <th className={`${thCls} text-right`}>Venta / kg</th>
                <th className={`${thCls} text-right`}>Margen</th>
              </tr>
            </thead>
            <tbody>
              {linesByProfile.map(([profile, lines]) => (
                <React.Fragment key={profile}>
                  <tr className="bg-[#fdfbf7]">
                    <td colSpan={9} className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-[#C59F59]">
                      {PROFILE_LABELS[profile]}
                    </td>
                  </tr>
                  {lines.map((l: CostLine) => (
                    <tr key={l.product_code} className="border-b border-foreground/5 hover:bg-[#fdfbf7]">
                      <td className={tdCls}>
                        <div className="font-bold">{l.product_name}</div>
                        <div className="font-mono text-[10px] text-foreground/40">
                          {l.product_code} · {l.kgPerUnit} kg
                        </div>
                      </td>
                      <td className={`${tdCls} text-right`}>{cop(l.cafe)}</td>
                      <td className={`${tdCls} text-right`}>{cop(l.tostion)}</td>
                      <td className={`${tdCls} text-right`}>
                        <div>{cop(l.empaque)}</div>
                        <button
                          type="button"
                          onClick={() => setEditing(l)}
                          className="inline-flex items-center gap-1 text-[10px] text-foreground/40 hover:text-[#C59F59] max-w-[180px] truncate"
                          title="Editar receta de empaque"
                        >
                          <Pencil className="w-3 h-3 shrink-0" />
                          <span className="truncate">
                            {l.packaging.length
                              ? l.packaging.map((p) => `${p.qty !== 1 ? `${p.qty}× ` : ""}${optionName(p.code)}`).join(" + ")
                              : "Sin empaque"}
                          </span>
                          {!l.customPackaging && <span className="shrink-0">· predet.</span>}
                        </button>
                      </td>
                      <td className={`${tdCls} text-right`}>{cop(l.despacho)}</td>
                      <td className={`${tdCls} text-right font-bold`}>
                        {l.costPerKg === null ? (
                          <span className="inline-flex items-center gap-1 text-amber-600 text-xs" title={l.missing.join("\n")}>
                            <AlertTriangle className="w-3.5 h-3.5" /> Falta precio
                          </span>
                        ) : (
                          cop(l.costPerKg)
                        )}
                      </td>
                      <td className={`${tdCls} text-right`}>{cop(l.costPerUnit)}</td>
                      <td className={`${tdCls} text-right text-foreground/60`}>{l.salePerKg === null ? "Sin ventas" : cop(l.salePerKg)}</td>
                      <td className={`${tdCls} text-right font-bold ${marginTone(l.marginPct)}`}>
                        {l.marginPct === null ? "—" : `${l.marginPct.toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`}
                      </td>
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        {sheet.lines.some((l) => l.missing.length) && (
          <div className="px-6 py-4 border-t border-foreground/5 text-xs text-amber-800 bg-amber-50/60">
            <p className="font-bold mb-1">Para completar los costos falta:</p>
            <ul className="list-disc pl-5 space-y-0.5">
              {[...new Set(sheet.lines.flatMap((l) => l.missing))].map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {editing && (
        <RecipeEditor line={editing} options={packagingOptions} onClose={() => setEditing(null)} onSaved={load} />
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Purchase prices */}
        <div className={`${cardCls} p-6`}>
          <h3 className="font-serif text-lg">Precios de compra</h3>
          <p className="text-xs text-foreground/50 mt-0.5 mb-5">Lo que pagas hoy por cada insumo. Se guarda al salir del campo.</p>

          <p className={labelCls}>Café (por kg)</p>
          <div className="space-y-3 mb-6">
            {coffeeItems.length === 0 && <p className="text-sm text-foreground/40">No hay café verde ni pergamino en el inventario.</p>}
            {coffeeItems.map((i) => (
              <div key={i.id} className="grid grid-cols-[1fr_170px] gap-3 items-center">
                <div>
                  <div className="text-sm font-bold">{i.product_name}</div>
                  <div className="font-mono text-[10px] text-foreground/40">{i.product_code}</div>
                </div>
                <SaveField
                  value={i.standard_cost}
                  onSave={(v) => saveCost(i.id, v)}
                  placeholder="$ / kg"
                  ariaLabel={`Precio por kg de ${i.product_name}`}
                  step="100"
                />
              </div>
            ))}
          </div>

          <p className={labelCls}>Empaque (por unidad)</p>
          <div className="space-y-3">
            {packagingItems.length === 0 && <p className="text-sm text-foreground/40">No hay empaques asociados a las referencias.</p>}
            {packagingItems.map((i) => (
              <div key={i.id} className="grid grid-cols-[1fr_170px] gap-3 items-center">
                <div>
                  <div className="text-sm font-bold">{i.product_name}</div>
                  <div className="font-mono text-[10px] text-foreground/40">{i.product_code}</div>
                </div>
                <SaveField
                  value={i.standard_cost}
                  onSave={(v) => saveCost(i.id, v)}
                  placeholder="$ / unidad"
                  ariaLabel={`Costo por unidad de ${i.product_name}`}
                  step="10"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          {/* Roasting & dispatch */}
          <div className={`${cardCls} p-6`}>
            <h3 className="font-serif text-lg mb-5">Maquila y despacho</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Maquila de tostión ($ / kg)</label>
                <SaveField
                  value={settings.roasting_fee_per_kg}
                  onSave={(v) => saveSetting({ roasting_fee_per_kg: v ?? 0 })}
                  ariaLabel="Tarifa de maquila por kg"
                  step="100"
                />
              </div>
              <div>
                <label htmlFor="cost-basis" className={labelCls}>La maquila se cobra sobre</label>
                <select
                  id="cost-basis"
                  value={settings.roasting_fee_basis}
                  onChange={(e) => saveSetting({ roasting_fee_basis: e.target.value as "verde" | "tostado" })}
                  className={inputCls}
                >
                  <option value="verde">Kg de verde entregado</option>
                  <option value="tostado">Kg de tostado recibido</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Costo promedio por despacho</label>
                <SaveField
                  value={settings.dispatch_cost_per_order}
                  onSave={(v) => saveSetting({ dispatch_cost_per_order: v ?? 0 })}
                  ariaLabel="Costo promedio por despacho"
                  step="500"
                />
              </div>
              <div>
                <label className={labelCls}>Kg por despacho</label>
                <SaveField
                  value={settings.dispatch_kg_per_order}
                  onSave={(v) => saveSetting({ dispatch_kg_per_order: v })}
                  placeholder={sheet.dispatch.source === "real" ? `Medido: ${sheet.dispatch.kgPerOrder?.toFixed(2)} kg` : "Ej. 2"}
                  ariaLabel="Kg promedio por despacho"
                  suffix="kg"
                />
                <p className="text-[11px] text-foreground/40 mt-1">
                  {sheet.dispatch.source === "manual"
                    ? "Valor fijado a mano. Déjalo vacío para medirlo de las órdenes."
                    : sheet.dispatch.source === "real"
                    ? `Medido de las órdenes pagadas de los últimos ${salesWindowDays} días.`
                    : "Sin órdenes para medirlo: escribe un valor."}
                  {sheet.dispatch.costPerKg ? ` → ${cop(sheet.dispatch.costPerKg)} por kg.` : ""}
                </p>
              </div>
            </div>
          </div>

          {/* Yields */}
          <div className={`${cardCls} p-6`}>
            <h3 className="font-serif text-lg">Rendimientos y origen del verde</h3>
            <p className="text-xs text-foreground/50 mt-0.5 mb-4">
              Medidos de tus lotes de Trilla y Tostión. Sin lotes se usa el valor por defecto.
            </p>
            <div className="overflow-x-auto -mx-6 px-6">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-foreground/5">
                    <th className={`${thCls} px-2`}>Perfil</th>
                    <th className={`${thCls} px-2 text-right`}>Tostión</th>
                    <th className={`${thCls} px-2 text-right`}>Trilla</th>
                    <th className={`${thCls} px-2 text-right`}>Verde desde pergamino</th>
                  </tr>
                </thead>
                <tbody>
                  {profiles.map((p) => {
                    const y = sheet.yields[p];
                    const src = (m: { source: string; batches: number }) =>
                      m.source === "real" ? `${m.batches} lote${m.batches === 1 ? "" : "s"}` : "por defecto";
                    return (
                      <tr key={p} className="border-b border-foreground/5">
                        <td className="px-2 py-3 text-sm font-bold">{PROFILE_LABELS[p]}</td>
                        <td className="px-2 py-3 text-sm text-right">
                          {pct(y.tostion.value)} <span className="block text-[10px] text-foreground/40">{src(y.tostion)}</span>
                        </td>
                        <td className="px-2 py-3 text-sm text-right">
                          {pct(y.trilla.value)} <span className="block text-[10px] text-foreground/40">{src(y.trilla)}</span>
                        </td>
                        <td className="px-2 py-3 text-sm text-right">
                          {y.pergaminoShare === null ? (
                            <span className="text-foreground/40" title="Sin entradas de verde ni trillas: se promedian ambos precios">
                              sin datos
                            </span>
                          ) : (
                            pct(y.pergaminoShare)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-5">
              <div>
                <label className={labelCls}>Tostión por defecto</label>
                <SaveField
                  value={Math.round(settings.default_roast_yield * 1000) / 10}
                  onSave={(v) => saveSetting({ default_roast_yield: (v ?? 0) / 100 })}
                  ariaLabel="Rendimiento de tostión por defecto"
                  suffix="%"
                  step="0.1"
                />
              </div>
              <div>
                <label className={labelCls}>Trilla por defecto</label>
                <SaveField
                  value={Math.round(settings.default_trilla_yield * 1000) / 10}
                  onSave={(v) => saveSetting({ default_trilla_yield: (v ?? 0) / 100 })}
                  ariaLabel="Rendimiento de trilla por defecto"
                  suffix="%"
                  step="0.1"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

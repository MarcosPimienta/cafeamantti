"use client";

import React, { useState, useTransition, useMemo, useEffect } from "react";
import {
  Package,
  PackagePlus,
  PackageMinus,
  ArrowLeftRight,
  Search,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  X,
  History,
  TrendingUp,
  TrendingDown,
  SlidersHorizontal,
  Check,
  Loader2,
  FlaskConical,
  Factory,
  RefreshCw,
  BarChart2,
  Pencil,
  Trash2,
  Archive,
  Sparkles,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from "recharts";
import {
  adjustInventoryStock,
  getInventoryMovements,
  getMovementsByTab,
  getTrillaBatches,
  getTostionBatches,
  createEntrada,
  createSalida,
  createProdConsumo,
  createProdAlta,
  createTostionBatch,
  createTrillaBatch,
  createColdBrewBatch,
  getColdBrewBatches,
  getInventoryReportData,
  deleteMovement,
  updateMovement,
  deleteProductionBatch,
  getAuditLogs,
  getInventory,
  getMoliendaBalances,
} from "../../actions";
import {
  MOLIENDAS,
  MOLIENDA_LABELS,
  type Molienda,
  isGrindTracked,
  isMolienda,
} from "../../coffeeProfiles";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string;
  product_code: string;
  product_name: string;
  category: string;
  unit: string;
  current_stock: number;
  legacy_stock?: number;
  min_stock: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

interface MovementRecord {
  id: string;
  inventory_id: string;
  type: string;
  quantity: number;
  reason: string | null;
  lote: string | null;
  movement_date: string | null;
  responsable: string | null;
  entry_type: string | null;
  tab_source: string | null;
  molienda: string | null;
  production_batch_id?: string | null;
  income_id?: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  income?: any;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inventory?: any;
}

interface TrillaBatch {
  id: string;
  process_type: string;
  input_quantity_kg: number;
  output_quantity_kg: number;
  weight_loss_pct: number;
  rendimiento_pct: number | null;
  movement_date: string | null;
  notes: string | null;
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  input_inventory?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  output_inventory?: any;
}

// ─── Constants + Helpers ──────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  cafe: "Café",
  empaque: "Empaque",
  accesorio: "Accesorio",
};

const TABS = [
  { id: "inventario", label: "Inventario", Icon: Package },
  { id: "entradas", label: "Entradas", Icon: PackagePlus },
  { id: "trilla", label: "Trilla", Icon: FlaskConical },
  { id: "tostion", label: "Proceso Tostión", Icon: Factory },
  { id: "prod_altas", label: "Empaque/Altas", Icon: TrendingUp },
  { id: "cold_brew", label: "Cold Brew (11:11)", Icon: Sparkles },
  { id: "salidas", label: "Salidas", Icon: PackageMinus },
  { id: "reportes", label: "Reportes", Icon: BarChart2 },
  { id: "auditoria", label: "Auditoría", Icon: History },
] as const;

type TabId = (typeof TABS)[number]["id"];

const inputCls =
  "w-full px-4 py-3 border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/30 bg-white transition-all";
const labelCls =
  "text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5 block";
const thCls =
  "px-5 py-3.5 text-[10px] font-bold uppercase tracking-widest text-foreground/50 text-left";
const tdCls = "px-5 py-4 text-sm text-foreground/80";

function today() {
  return new Date().toISOString().split("T")[0];
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-CO", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }
  return new Date(iso).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function fmtCOP(n: number) {
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);
}

/** Value collected for a paid-sale salida (its linked cashflow income). */
function saleAmountOf(record: MovementRecord): number | null {
  if (!record.income_id) return null;
  const inc = Array.isArray(record.income) ? record.income[0] : record.income;
  return inc ? Number(inc.gross_amount ?? 0) : null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getRelation(rel: any): { product_code: string; product_name: string; unit?: string } | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function StockBadge({ stock, min }: { stock: number; min: number }) {
  if (stock === 0)
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-700">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
        Sin stock
      </span>
    );
  if (stock <= min)
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-700">
        <AlertTriangle className="w-3 h-3" />
        Bajo mín.
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
      <Check className="w-3 h-3" />
      OK
    </span>
  );
}

function ProductSelect({
  id,
  value,
  onChange,
  inventory,
  filter,
  placeholder = "Seleccionar producto...",
  searchable = false,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  inventory: InventoryItem[];
  filter?: (i: InventoryItem) => boolean;
  placeholder?: string;
  searchable?: boolean;
}) {
  const items = filter ? inventory.filter(filter) : inventory;
  const [search, setSearch] = useState("");

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      const haystack = `${item.product_code} ${item.product_name}`.toLowerCase();
      return haystack.includes(term);
    });
  }, [items, search]);

  return (
    <div className="space-y-2">
      {searchable && (
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto..."
          className={`${inputCls} w-full`}
        />
      )}

      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} appearance-none cursor-pointer`}
      >
        <option value="">{placeholder}</option>
        {filteredItems.map((item) => (
          <option key={item.id} value={item.id}>
            {item.product_code} — {item.product_name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Grano / Molido picker. The grind is decided when the movement is registered,
 * not baked into the SKU, so every form that moves packaged roasted coffee
 * asks for it. Items with no grind (bulk coffee, bags, stickers) say so
 * instead of showing a choice.
 */
function MoliendaField({
  idPrefix,
  value,
  onChange,
  productCode,
}: {
  idPrefix: string;
  value: Molienda | "";
  onChange: (v: Molienda | "") => void;
  productCode: string | null | undefined;
}) {
  const applies = isGrindTracked(productCode);
  return (
    <div>
      <label className={labelCls}>
        Molienda {applies && <span className="text-red-400">*</span>}
      </label>
      {applies ? (
        <div className="flex flex-wrap gap-2 pt-1">
          {MOLIENDAS.map((opt) => {
            const isActive = value === opt;
            return (
              <button
                key={opt}
                id={`${idPrefix}-molienda-${opt}`}
                type="button"
                aria-pressed={isActive}
                onClick={() => onChange(isActive ? "" : opt)}
                className={`px-4 py-2.5 rounded-xl border text-xs font-bold uppercase tracking-wider transition-all ${
                  isActive
                    ? "bg-[#C59F59] text-white border-[#C59F59] shadow-sm"
                    : "bg-white text-foreground/60 border-foreground/10 hover:border-[#C59F59]/40 hover:text-foreground"
                }`}
              >
                {MOLIENDA_LABELS[opt]}
              </button>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-foreground/30 pt-3">
          {productCode ? "No aplica a este producto" : "Selecciona un producto"}
        </p>
      )}
    </div>
  );
}

function MoliendaBadge({ value }: { value: string | null | undefined }) {
  if (!isMolienda(value)) return <span className="text-foreground/30">—</span>;
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
        value === "grano"
          ? "bg-[#C59F59]/10 text-[#C59F59]"
          : "bg-purple-50 text-purple-600"
      }`}
    >
      {MOLIENDA_LABELS[value]}
    </span>
  );
}

function FeedbackBanner({
  feedback,
}: {
  feedback: { type: "success" | "error"; msg: string } | null;
}) {
  if (!feedback) return null;
  return (
    <p
      className={`px-4 py-3 rounded-xl text-sm ${
        feedback.type === "success"
          ? "bg-emerald-50 text-emerald-700"
          : "bg-red-50 text-red-600"
      }`}
    >
      {feedback.msg}
    </p>
  );
}

function HistoryLoadingOrEmpty({
  loading,
  empty,
}: {
  loading: boolean;
  empty: boolean;
}) {
  if (loading)
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 text-[#C59F59] animate-spin" />
      </div>
    );
  if (empty)
    return (
      <div className="text-center py-16">
        <History className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
        <p className="font-serif text-foreground/60">Sin registros aún</p>
        <p className="text-sm text-foreground/40 mt-1">
          Los registros aparecerán aquí.
        </p>
      </div>
    );
  return null;
}

// ─── Adjust Modal ─────────────────────────────────────────────────────────────

function AdjustModal({
  item,
  onClose,
  onSuccess,
}: {
  item: InventoryItem;
  onClose: () => void;
  onSuccess: (id: string, newStock: number) => void;
}) {
  const [type, setType] = useState<"entrada" | "salida" | "ajuste">("ajuste");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const qty = parseFloat(quantity);
    if (isNaN(qty) || (type !== "ajuste" && qty <= 0)) {
      setError("Ingresa una cantidad válida");
      return;
    }
    startTransition(async () => {
      try {
        const res = await adjustInventoryStock(
          item.id,
          type,
          qty,
          reason || undefined
        );
        onSuccess(item.id, res.newStock);
        onClose();
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Error al ajustar el inventario"
        );
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 pt-8 pb-6 border-b border-foreground/5 flex items-start justify-between gap-4">
          <div>
            <p className={labelCls}>{item.product_code}</p>
            <h3 className="text-xl font-serif">{item.product_name}</h3>
            <p className="text-sm text-foreground/50 mt-1">
              Stock:{" "}
              <span className="font-bold text-foreground">
                {item.current_stock} {item.unit}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-foreground/5"
          >
            <X className="w-5 h-5 text-foreground/40" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div>
            <label className={labelCls}>Tipo de ajuste</label>
            <div className="grid grid-cols-3 gap-2">
              {(["entrada", "salida", "ajuste"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex flex-col items-center gap-2 px-3 py-3 rounded-xl border-2 text-xs font-bold uppercase tracking-wider transition-all ${
                    type === t
                      ? "border-[#C59F59] bg-[#C59F59]/10 text-[#C59F59]"
                      : "border-foreground/10 text-foreground/50 hover:border-foreground/20"
                  }`}
                >
                  {t === "entrada" ? (
                    <PackagePlus className="w-4 h-4" />
                  ) : t === "salida" ? (
                    <PackageMinus className="w-4 h-4" />
                  ) : (
                    <ArrowLeftRight className="w-4 h-4" />
                  )}
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="adj-qty" className={labelCls}>
              Cantidad ({item.unit})
            </label>
            <input
              id="adj-qty"
              type="number"
              step="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={type === "ajuste" ? "ej. -5 o +10" : "ej. 20"}
              className={inputCls}
              required
            />
          </div>

          <div>
            <label htmlFor="adj-reason" className={labelCls}>
              Motivo (opcional)
            </label>
            <input
              id="adj-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ej. Conteo físico, Corrección..."
              className={inputCls}
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-widest text-sm rounded-2xl transition-all disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Package className="w-4 h-4" />
            )}
            {isPending ? "Guardando..." : "Confirmar ajuste"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── History Drawer ───────────────────────────────────────────────────────────

function HistoryDrawer({
  item,
  onClose,
  era = 'v2',
}: {
  item: InventoryItem;
  onClose: () => void;
  era?: 'v1' | 'v2';
}) {
  const [movements, setMovements] = useState<MovementRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInventoryMovements(item.id, era)
      .then((data) => setMovements(data as MovementRecord[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [item.id, era]);

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white px-8 pt-8 pb-6 border-b border-foreground/5 flex items-start justify-between gap-4">
          <div>
            <p className={labelCls}>Historial de movimientos</p>
            <h3 className="text-xl font-serif">{item.product_name}</h3>
            <p className="text-xs text-foreground/50 font-mono">
              {item.product_code}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-foreground/5"
          >
            <X className="w-5 h-5 text-foreground/40" />
          </button>
        </div>

        <div className="flex-1 p-8">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-8 h-8 text-[#C59F59] animate-spin" />
            </div>
          ) : movements.length === 0 ? (
            <div className="text-center py-20">
              <History className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
              <p className="font-serif text-foreground/50">Sin movimientos</p>
            </div>
          ) : (
            <div className="space-y-3">
              {movements.map((mov) => {
                const isPositive = mov.quantity > 0;
                return (
                  <div
                    key={mov.id}
                    className="flex items-start gap-4 p-4 rounded-2xl border border-foreground/5 hover:bg-foreground/[0.02]"
                  >
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        isPositive
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {isPositive ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : (
                        <TrendingDown className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm">
                          {mov.quantity > 0 ? "+" : ""}
                          {mov.quantity} {item.unit}
                        </span>
                        {mov.tab_source && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-foreground/5 text-foreground/50">
                            {mov.tab_source}
                          </span>
                        )}
                      </div>
                      {mov.reason && (
                        <p className="text-xs text-foreground/60 mt-0.5 truncate">
                          {mov.reason}
                        </p>
                      )}
                      <p className="text-[10px] text-foreground/40 mt-1">
                        {mov.movement_date
                          ? fmtDate(mov.movement_date)
                          : fmtDate(mov.created_at)}
                        {mov.responsable ? ` · ${mov.responsable}` : ""}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SortingIcon({
  field,
  sortField,
  sortAsc,
}: {
  field: string;
  sortField: string;
  sortAsc: boolean;
}) {
  if (sortField !== field) return <span className="w-3 h-3 block" />;
  return sortAsc ? (
    <ChevronUp className="w-3 h-3 text-[#C59F59]" />
  ) : (
    <ChevronDown className="w-3 h-3 text-[#C59F59]" />
  );
}

function SortableTh({
  label,
  field,
  sortField,
  sortAsc,
  onSort,
  className = "",
}: {
  label: string;
  field: string;
  sortField: string;
  sortAsc: boolean;
  onSort: (f: string) => void;
  className?: string;
}) {
  const isRight = className.includes("text-right");
  return (
    <th
      className={`${thCls} cursor-pointer hover:bg-black/5 transition-colors select-none ${className}`}
      onClick={() => onSort(field)}
    >
      <span className={`flex items-center gap-1 ${isRight ? "justify-end" : ""}`}>
        {label} <SortingIcon field={field} sortField={sortField} sortAsc={sortAsc} />
      </span>
    </th>
  );
}

function sortRecordsList<T>(data: T[], sortField: string, sortAsc: boolean): T[] {
  return [...data].sort((a: any, b: any) => {
    const getValue = (obj: any, path: string) => {
      if (path === "date") return obj.movement_date || obj.created_at;
      if (!path.includes(".")) return obj[path];
      return path.split(".").reduce((o, i) => (o ? o[i] : undefined), obj);
    };

    let aVal = getValue(a, sortField);
    let bVal = getValue(b, sortField);
    
    if (Array.isArray(aVal)) aVal = aVal[0];
    if (Array.isArray(bVal)) bVal = bVal[0];

    if (sortField === "date") {
      const cmp = new Date(aVal || 0).getTime() - new Date(bVal || 0).getTime();
      return sortAsc ? cmp : -cmp;
    }

    const aNum = Number(aVal);
    const bNum = Number(bVal);
    let cmp = 0;
    if (!isNaN(aNum) && !isNaN(bNum) && typeof aVal !== "boolean" && aVal !== null && aVal !== "") {
      cmp = aNum - bNum;
    } else {
      cmp = String(aVal ?? "").localeCompare(String(bVal ?? ""), "es");
    }
    return sortAsc ? cmp : -cmp;
  });
}

/**
 * Roasted coffee split by profile and grind.
 *
 * There is no per-grind stock column: the grind is stamped on the movement
 * that determined it (Entrada, Empaque/Alta, Salida, Tostión), so this is the
 * signed sum of those movements. Bulk and packaged are shown as two tables
 * because kg and unidades cannot be added together. "Sin definir" only
 * appears where rows predate the grind field.
 */
type MoliendaTotals = { grano: number; molido: number; sin_definir: number; total: number };
type MoliendaGroup = {
  rows: ({ id: string; label: string } & MoliendaTotals)[];
  totals: MoliendaTotals;
};

function MoliendaGroupTable({
  group,
  unit,
}: {
  group: MoliendaGroup;
  unit: string;
}) {
  const showUndefined = group.totals.sin_definir !== 0;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));

  if (group.totals.total === 0 && group.rows.every((r) => r.total === 0)) {
    return (
      <p className="text-sm text-foreground/40 px-6 py-8">
        Sin movimientos registrados.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-[#fdfbf7] border-b border-foreground/5">
            <th className={thCls}>Perfil</th>
            <th className={`${thCls} text-right`}>Grano ({unit})</th>
            <th className={`${thCls} text-right`}>Molido ({unit})</th>
            {showUndefined && <th className={`${thCls} text-right`}>Sin definir</th>}
            <th className={`${thCls} text-right`}>Total ({unit})</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-foreground/5">
          {group.rows.map((r) => (
            <tr key={r.id} className="hover:bg-[#fdfbf7]">
              <td className={`${tdCls} font-bold`}>{r.label}</td>
              <td className={`${tdCls} text-right`}>{fmt(r.grano)}</td>
              <td className={`${tdCls} text-right`}>{fmt(r.molido)}</td>
              {showUndefined && (
                <td className={`${tdCls} text-right text-foreground/40`}>
                  {fmt(r.sin_definir)}
                </td>
              )}
              <td className={`${tdCls} text-right font-bold`}>{fmt(r.total)}</td>
            </tr>
          ))}
          <tr className="bg-[#fdfbf7]">
            <td className={`${tdCls} font-bold`}>Total</td>
            <td className={`${tdCls} text-right font-bold`}>{fmt(group.totals.grano)}</td>
            <td className={`${tdCls} text-right font-bold`}>{fmt(group.totals.molido)}</td>
            {showUndefined && (
              <td className={`${tdCls} text-right font-bold text-foreground/40`}>
                {fmt(group.totals.sin_definir)}
              </td>
            )}
            <td className={`${tdCls} text-right font-bold`}>{fmt(group.totals.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function MoliendaBreakdown({ era }: { era: "v1" | "v2" }) {
  type Balances = { packaged: MoliendaGroup; bulk: MoliendaGroup };
  // Tag the result with the era it belongs to, so switching eras reads as
  // loading without a synchronous setState in the effect body.
  const [loaded, setLoaded] = useState<{ era: string; data: Balances | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMoliendaBalances(era)
      .then((d) => {
        if (!cancelled) setLoaded({ era, data: d as Balances });
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setLoaded({ era, data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [era]);

  const loading = loaded?.era !== era;
  const data = loaded?.era === era ? loaded.data : null;

  return (
    <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-foreground/5 bg-[#fdfbf7]">
        <h3 className="font-serif text-lg">Café tostado por perfil y molienda</h3>
        <p className="text-sm text-foreground/50 mt-1">
          La molienda se define al registrar la entrada, el alta de producción
          o la salida. El café a granel sale del tostador en grano.
        </p>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-[#C59F59] animate-spin" />
        </div>
      ) : !data ? (
        <p className="text-sm text-foreground/40 text-center py-12">
          No se pudo cargar el desglose por molienda.
        </p>
      ) : (
        <>
          <div className="px-6 pt-5 pb-1">
            <p className={labelCls}>Empacado — unidades</p>
          </div>
          <MoliendaGroupTable group={data.packaged} unit="ud" />
          <div className="px-6 pt-6 pb-1 border-t border-foreground/5">
            <p className={labelCls}>A granel — kilogramos</p>
          </div>
          <MoliendaGroupTable group={data.bulk} unit="kg" />
        </>
      )}
    </div>
  );
}

// ─── Inventario Tab ───────────────────────────────────────────────────────────

function InventarioTab({
  inventory,
  onStockUpdate,
  era,
}: {
  inventory: InventoryItem[];
  onStockUpdate: (id: string, newStock: number) => void;
  era: 'v1' | 'v2';
}) {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [sortField, setSortField] = useState<keyof InventoryItem>("product_name");
  const [sortAsc, setSortAsc] = useState(true);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);

  const totalSKUs = inventory.length;
  const lowStockCount = inventory.filter((i) => i.current_stock <= i.min_stock).length;
  const zeroStockCount = inventory.filter((i) => i.current_stock === 0).length;

  const filtered = useMemo(() => {
    let data = [...inventory];
    if (search) {
      const q = search.toLowerCase();
      data = data.filter(
        (i) =>
          i.product_name.toLowerCase().includes(q) ||
          i.product_code.toLowerCase().includes(q)
      );
    }
    if (categoryFilter !== "all")
      data = data.filter((i) => i.category === categoryFilter);
    if (lowStockOnly)
      data = data.filter((i) => i.current_stock <= i.min_stock);
    data.sort((a, b) => {
      const cmp = String(a[sortField] ?? "").localeCompare(
        String(b[sortField] ?? ""),
        "es"
      );
      return sortAsc ? cmp : -cmp;
    });
    return data;
  }, [inventory, search, categoryFilter, lowStockOnly, sortField, sortAsc]);

  function toggleSort(field: keyof InventoryItem) {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  return (
    <>
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 flex items-center gap-5">
          <div className="w-14 h-14 rounded-2xl bg-[#C59F59]/10 flex items-center justify-center shrink-0">
            <Package className="w-7 h-7 text-[#C59F59]" />
          </div>
          <div>
            <p className={labelCls}>Total SKUs</p>
            <p className="text-3xl font-serif">{totalSKUs}</p>
          </div>
        </div>

        <div
          className={`rounded-3xl border shadow-sm p-6 flex items-center gap-5 ${
            lowStockCount > 0
              ? "bg-amber-50 border-amber-200"
              : "bg-white border-foreground/5"
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle
              className={`w-7 h-7 ${
                lowStockCount > 0 ? "text-amber-600" : "text-foreground/30"
              }`}
            />
          </div>
          <div>
            <p className={labelCls}>Stock Bajo</p>
            <p className="text-3xl font-serif">
              {lowStockCount}
              <span className="text-base font-sans text-foreground/40 ml-1">
                / {totalSKUs}
              </span>
            </p>
          </div>
        </div>

        <div
          className={`rounded-3xl border shadow-sm p-6 flex items-center gap-5 ${
            zeroStockCount > 0
              ? "bg-red-50 border-red-200"
              : "bg-white border-foreground/5"
          }`}
        >
          <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
            <PackageMinus
              className={`w-7 h-7 ${
                zeroStockCount > 0 ? "text-red-600" : "text-foreground/30"
              }`}
            />
          </div>
          <div>
            <p className={labelCls}>Sin Stock</p>
            <p className="text-3xl font-serif">
              {zeroStockCount}
              <span className="text-base font-sans text-foreground/40 ml-1">
                / {totalSKUs}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Packaged coffee split by profile x grind */}
      <MoliendaBreakdown era={era} />

      {/* Table card */}
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="p-5 border-b border-foreground/5 flex flex-col md:flex-row gap-4 items-center justify-between bg-[#f9f7f0]">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40" />
            <input
              type="text"
              placeholder="Buscar por nombre o código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              suppressHydrationWarning={true}
              className="w-full pl-11 pr-4 py-2.5 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
            />
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative">
              <SlidersHorizontal className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 pointer-events-none" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                suppressHydrationWarning={true}
                className="pl-9 pr-4 py-2.5 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none appearance-none cursor-pointer"
              >
                <option value="all">Todas las categorías</option>
                <option value="cafe">Café</option>
                <option value="empaque">Empaque</option>
                <option value="accesorio">Accesorio</option>
              </select>
            </div>
            <button
              onClick={() => setLowStockOnly(!lowStockOnly)}
              suppressHydrationWarning={true}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all whitespace-nowrap ${
                lowStockOnly
                  ? "bg-amber-500 text-white border-amber-500"
                  : "bg-white border-foreground/10 text-foreground/60 hover:bg-foreground/5"
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              Stock bajo
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-[#fdfbf7] border-b border-foreground/5">
                <SortableTh 
                  label="Código" 
                  field="product_code" 
                  sortField={sortField} 
                  sortAsc={sortAsc} 
                  onSort={(f) => toggleSort(f as keyof InventoryItem)} 
                />
                <SortableTh 
                  label="Producto" 
                  field="product_name" 
                  sortField={sortField} 
                  sortAsc={sortAsc} 
                  onSort={(f) => toggleSort(f as keyof InventoryItem)} 
                />
                <th className={thCls}>Categoría</th>
                <SortableTh 
                  label="Stock" 
                  field="current_stock" 
                  className="text-right"
                  sortField={sortField} 
                  sortAsc={sortAsc} 
                  onSort={(f) => toggleSort(f as keyof InventoryItem)} 
                />
                <th className={`${thCls} text-right`}>Mín.</th>
                <th className={`${thCls} text-center`}>Estado</th>
                <th className={`${thCls} text-center`}>Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Package className="w-10 h-10 text-foreground/20 mx-auto mb-3" />
                    <p className="font-serif text-foreground/60">
                      No se encontraron productos
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((item) => (
                  <tr
                    key={item.id}
                    className="hover:bg-[#fdfbf7] transition-colors"
                  >
                    <td className={tdCls}>
                      <span className="font-mono text-xs bg-foreground/5 px-2 py-1 rounded-lg text-foreground/70">
                        {item.product_code}
                      </span>
                    </td>
                    <td className={tdCls}>
                      <p className="font-medium text-foreground">
                        {item.product_name}
                      </p>
                      <p className="text-xs text-foreground/40">{item.unit}</p>
                    </td>
                    <td className={tdCls}>
                      <span
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          item.category === "cafe"
                            ? "bg-[#C59F59]/10 text-[#C59F59]"
                            : item.category === "empaque"
                            ? "bg-blue-50 text-blue-600"
                            : "bg-purple-50 text-purple-600"
                        }`}
                      >
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </span>
                    </td>
                    <td className={`${tdCls} text-right`}>
                      <span
                        className={`text-lg font-bold ${
                          item.current_stock === 0
                            ? "text-red-600"
                            : item.current_stock <= item.min_stock
                            ? "text-amber-600"
                            : "text-foreground"
                        }`}
                      >
                        {item.current_stock}
                      </span>
                    </td>
                    <td className={`${tdCls} text-right text-foreground/40 font-mono`}>
                      {item.min_stock}
                    </td>
                    <td className={`${tdCls} text-center`}>
                      <StockBadge
                        stock={item.current_stock}
                        min={item.min_stock}
                      />
                    </td>
                    <td className={`${tdCls} text-center`}>
                      <div className="flex items-center justify-center gap-2">
                        {era === 'v2' && (
                          <button
                            id={`adjust-${item.product_code}`}
                            onClick={() => setAdjustItem(item)}
                            title="Ajuste manual"
                            className="p-2 rounded-xl bg-[#C59F59]/10 text-[#C59F59] hover:bg-[#C59F59] hover:text-white transition-all"
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          id={`history-${item.product_code}`}
                          onClick={() => setHistoryItem(item)}
                          title="Ver historial"
                          className="p-2 rounded-xl bg-foreground/5 text-foreground/50 hover:bg-foreground/10 transition-all"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <div className="px-5 py-3 bg-[#fdfbf7] border-t border-foreground/5 text-xs text-foreground/40">
            {filtered.length} de {totalSKUs} productos
          </div>
        )}
      </div>

      {adjustItem && (
        <AdjustModal
          item={adjustItem}
          onClose={() => setAdjustItem(null)}
          onSuccess={onStockUpdate}
        />
      )}
      {historyItem && (
        <HistoryDrawer
          item={historyItem}
          onClose={() => setHistoryItem(null)}
          era={era}
        />
      )}
    </>
  );
}

// ─── Edit Movement Modal ──────────────────────────────────────────────────────

function EditMovementModal({
  record,
  onClose,
  onSuccess,
}: {
  record: MovementRecord;
  onClose: () => void;
  onSuccess: (inventoryId: string, newStock: number) => void;
}) {
  const origSign = record.quantity < 0 ? -1 : 1;
  const [date, setDate] = useState(record.movement_date ?? today());
  const [qty, setQty] = useState(String(Math.abs(record.quantity)));
  const [reason, setReason] = useState(record.reason ?? "");
  const [responsable, setResponsable] = useState(record.responsable ?? "");
  const [molienda, setMolienda] = useState<Molienda | "">(
    isMolienda(record.molienda) ? record.molienda : ""
  );
  const initialSale = saleAmountOf(record);
  const [saleAmount, setSaleAmount] = useState(initialSale !== null ? String(initialSale) : "");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const productCode = getRelation(record.inventory)?.product_code;
  const needsMolienda = isGrindTracked(productCode);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedQty = parseFloat(qty);
    if (isNaN(parsedQty) || parsedQty <= 0) { setError("Cantidad inválida"); return; }
    if (needsMolienda && !molienda) { setError("Selecciona la molienda (Grano o Molido)"); return; }
    const parsedSale = parseFloat(saleAmount);
    if (initialSale !== null && !(parsedSale > 0)) { setError("Valor cobrado inválido"); return; }
    const signedQty = origSign * parsedQty;
    startTransition(async () => {
      try {
        const res = await updateMovement(record.id, signedQty, date, reason || undefined, responsable || undefined, record.entry_type || undefined, molienda || undefined, initialSale !== null ? parsedSale : undefined);
        onSuccess(res.inventoryId, res.newStock);
        onClose();
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error al guardar");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-8 pt-8 pb-5 border-b border-foreground/5 flex items-center justify-between">
          <div>
            <p className={labelCls}>Editar movimiento</p>
            <h3 className="text-xl font-serif">{record.quantity > 0 ? "+" : ""}{record.quantity}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-foreground/5"><X className="w-5 h-5 text-foreground/40" /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-8 space-y-4">
          <div><label className={labelCls}>Fecha</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} required /></div>
          <div><label className={labelCls}>Cantidad (valor absoluto)</label><input type="number" min="0.001" step="0.001" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} required /></div>
          <div><label className={labelCls}>Motivo / Notas</label><input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo..." className={inputCls} /></div>
          <div><label className={labelCls}>Responsable</label><input type="text" value={responsable} onChange={(e) => setResponsable(e.target.value)} placeholder="Nombre..." className={inputCls} /></div>
          {needsMolienda && (
            <MoliendaField
              idPrefix={`edit-${record.id}`}
              value={molienda}
              onChange={setMolienda}
              productCode={productCode}
            />
          )}
          {initialSale !== null && (
            <div>
              <label className={labelCls}>Valor cobrado (COP)</label>
              <input type="number" min="1" step="any" value={saleAmount} onChange={(e) => setSaleAmount(e.target.value)} className={inputCls} required />
              <p className="text-[11px] text-foreground/40 mt-1">Venta pagada: fecha, cantidad y valor se actualizan también en el Flujo de Caja.</p>
            </div>
          )}
          {error && <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-3 border border-foreground/10 rounded-2xl text-sm font-bold uppercase tracking-widest text-foreground/60 hover:bg-foreground/5">Cancelar</button>
            <button type="submit" disabled={isPending} className="flex-1 py-3 bg-[#C59F59] hover:bg-[#b08d4f] text-white rounded-2xl text-sm font-bold uppercase tracking-widest disabled:opacity-60">{isPending ? "Guardando..." : "Guardar"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Pagination helpers ───────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 10;

function PaginationControls({
  currentPage,
  totalItems,
  onPageChange,
}: {
  currentPage: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between border-t border-foreground/5 px-6 py-4 bg-[#fdfbf7] gap-4">
      <span className="text-[11px] font-bold uppercase tracking-widest text-foreground/50">
        Página <span className="text-[#C59F59] text-sm">{currentPage}</span> de {totalPages}
      </span>
      <div className="flex gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest bg-white border border-foreground/10 rounded-xl disabled:opacity-30 disabled:pointer-events-none hover:bg-foreground/5 transition-colors"
        >
          Anterior
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-4 py-2 text-[10px] font-bold uppercase tracking-widest bg-white border border-foreground/10 rounded-xl disabled:opacity-30 disabled:pointer-events-none hover:bg-foreground/5 transition-colors"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

// ─── Acciones cell helpers ────────────────────────────────────────────────────

function AccionesCell({
  id,
  deletingId,
  onEdit,
  onConfirmDelete,
  onCancelDelete,
  onDelete,
}: {
  id: string;
  deletingId: string | null;
  onEdit: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  if (deletingId === id) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-red-600">¿Eliminar?</span>
        <button onClick={onConfirmDelete} className="px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded-lg">Sí</button>
        <button onClick={onCancelDelete} className="px-2 py-1 bg-foreground/10 text-[10px] font-bold rounded-lg">No</button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <button onClick={onEdit} title="Editar" className="p-1.5 rounded-lg hover:bg-foreground/5 text-foreground/40 hover:text-[#C59F59]"><Pencil className="w-3.5 h-3.5" /></button>
      <button onClick={onDelete} title="Eliminar" className="p-1.5 rounded-lg hover:bg-red-50 text-foreground/40 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
    </div>
  );
}

// ─── Entradas Tab ─────────────────────────────────────────────────────────────

function EntradasTab({
  inventory,
  onStockUpdate,
  era,
}: {
  inventory: InventoryItem[];
  onStockUpdate: (id: string, newStock: number) => void;
  era: 'v1' | 'v2';
}) {
  const initForm = {
    inventoryId: "",
    qty: "",
    date: today(),
    entryType: "MP" as "MP" | "MAT",
    responsable: "",
    lote: "",
    molienda: "" as Molienda | "",
  };
  const [form, setForm] = useState(initForm);
  const [records, setRecords] = useState<MovementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [search, setSearch] = useState("");

  const selectedItem = useMemo(
    () => inventory.find((i) => i.id === form.inventoryId) ?? null,
    [inventory, form.inventoryId]
  );

  // Free-text filter over the history — every whitespace-separated term must
  // match somewhere in the row, so "honey 250" narrows down as you type.
  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    const terms = q.split(/\s+/);
    return records.filter((r) => {
      const inv = getRelation(r.inventory);
      const haystack = [
        inv?.product_code,
        inv?.product_name,
        r.lote,
        r.responsable,
        r.entry_type,
        r.reason,
        r.molienda,
        isMolienda(r.molienda) ? MOLIENDA_LABELS[r.molienda] : null,
        r.movement_date,
        fmtDate(r.movement_date ?? r.created_at),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [records, search]);

  const sortedRecords = useMemo(() => sortRecordsList(filteredRecords, sortField, sortAsc), [filteredRecords, sortField, sortAsc]);

  // Clamp rather than store: deleting the last row of the last page must not
  // leave the table blank while the page number catches up.
  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / ITEMS_PER_PAGE));
  const page = Math.min(currentPage, totalPages);
  const paginatedRecords = sortedRecords.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

  function handleSearch(value: string) {
    setSearch(value);
    setCurrentPage(1);
  }

  function handleSort(field: string) {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  const [editingRecord, setEditingRecord] = useState<MovementRecord | null>(null);

  function loadHistory() {
    setLoading(true);
    getMovementsByTab("entrada", era)
      .then((d) => setRecords(d as MovementRecord[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadHistory();
  }, [era]);
  useEffect(() => {
    if (feedback?.type === "success") {
      const t = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.inventoryId || !form.qty || !form.date) {
      setFeedback({ type: "error", msg: "Completa los campos obligatorios" });
      return;
    }
    if (isGrindTracked(selectedItem?.product_code) && !form.molienda) {
      setFeedback({ type: "error", msg: "Selecciona la molienda (Grano o Molido)" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await createEntrada(
          form.inventoryId,
          parseFloat(form.qty),
          form.date,
          form.entryType,
          form.responsable || undefined,
          form.lote || undefined,
          form.molienda || undefined
        );
        
        if (!res.success) {
          setFeedback({ type: "error", msg: res.error || "Error al registrar" });
          return;
        }

        onStockUpdate(form.inventoryId, res.newStock ?? 0);
        setFeedback({ type: "success", msg: "✓ Entrada registrada exitosamente" });
        setForm(initForm);
        loadHistory();
      } catch (err: unknown) {
        setFeedback({
          type: "error",
          msg: err instanceof Error ? err.message : "Error al registrar",
        });
      }
    });
  }

  function handleDeleteRecord(record: MovementRecord) {
    startTransition(async () => {
      try {
        const res = await deleteMovement(record.id);
        onStockUpdate(res.inventoryId as string, res.newStock);
        setDeletingId(null);
        loadHistory();
      } catch (err: unknown) {
        setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Error al eliminar" });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Form — only in v2 (current era) */}
      {era === 'v2' && (
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-8">
        <div className="mb-6">
          <h2 className="text-xl font-serif">Registrar Entrada</h2>
          <p className="text-sm text-foreground/50 mt-1">
            Registra una compra o ingreso de cualquier producto al inventario.
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            <div>
              <label htmlFor="ent-date" className={labelCls}>
                Fecha <span className="text-red-400">*</span>
              </label>
              <input
                id="ent-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                suppressHydrationWarning={true}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label htmlFor="ent-product" className={labelCls}>
                Producto <span className="text-red-400">*</span>
              </label>
              <ProductSelect
                id="ent-product"
                value={form.inventoryId}
                onChange={(v) => {
                  const next = inventory.find((i) => i.id === v);
                  setForm({
                    ...form,
                    inventoryId: v,
                    // A grind on a bag of stickers makes no sense — drop it.
                    molienda: isGrindTracked(next?.product_code) ? form.molienda : "",
                  });
                }}
                inventory={inventory}
                searchable
              />
            </div>
            <MoliendaField
              idPrefix="ent"
              value={form.molienda}
              onChange={(v) => setForm({ ...form, molienda: v })}
              productCode={selectedItem?.product_code}
            />
            <div>
              <label htmlFor="ent-qty" className={labelCls}>
                Cantidad <span className="text-red-400">*</span>
              </label>
              <input
                id="ent-qty"
                type="number"
                min="0.001"
                step="0.001"
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                placeholder="ej. 100"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label htmlFor="ent-type" className={labelCls}>
                Tipo
              </label>
              <select
                id="ent-type"
                value={form.entryType}
                onChange={(e) =>
                  setForm({ ...form, entryType: e.target.value as "MP" | "MAT" })
                }
                className={`${inputCls} appearance-none cursor-pointer`}
              >
                <option value="MP">MP — Materia Prima</option>
                <option value="MAT">MAT — Material</option>
              </select>
            </div>
            <div>
              <label htmlFor="ent-resp" className={labelCls}>
                Responsable (opcional)
              </label>
              <input
                id="ent-resp"
                type="text"
                value={form.responsable}
                onChange={(e) =>
                  setForm({ ...form, responsable: e.target.value })
                }
                placeholder="Nombre..."
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="ent-lote" className={labelCls}>
                Lote (opcional)
              </label>
              <input
                id="ent-lote"
                type="text"
                value={form.lote}
                onChange={(e) => setForm({ ...form, lote: e.target.value })}
                placeholder="ej. L2025-01-P00"
                className={inputCls}
              />
            </div>
          </div>
          <FeedbackBanner feedback={feedback} />
          <button
            type="submit"
            disabled={isPending}
            className="mt-4 flex items-center gap-2 px-8 py-3.5 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-widest text-sm rounded-2xl transition-all disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PackagePlus className="w-4 h-4" />
            )}
            {isPending ? "Registrando..." : "Registrar Entrada"}
          </button>
        </form>
      </div>
      )}

      {/* History */}
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-foreground/5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-[#fdfbf7]">
          <h3 className="font-serif text-lg">
            Historial{" "}
            <span className="text-foreground/40 text-base font-sans">
              · {filteredRecords.length}
              {filteredRecords.length !== records.length && (
                <span className="text-foreground/30"> de {records.length}</span>
              )}
            </span>
          </h3>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-72 sm:flex-none">
              <Search className="w-4 h-4 text-foreground/30 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Buscar código, producto, lote..."
                aria-label="Buscar en el historial de entradas"
                className={`${inputCls} pl-10 ${search ? "pr-10" : ""}`}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => handleSearch("")}
                  aria-label="Limpiar búsqueda"
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-lg text-foreground/30 hover:text-foreground/60 hover:bg-foreground/5"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <button
              onClick={loadHistory}
              title="Recargar"
              className="p-2 rounded-xl hover:bg-foreground/5 text-foreground/40 shrink-0"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
        {loading || records.length === 0 ? (
          <HistoryLoadingOrEmpty loading={loading} empty={records.length === 0} />
        ) : filteredRecords.length === 0 ? (
          <div className="text-center py-16">
            <Search className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
            <p className="font-serif text-foreground/60">Sin coincidencias</p>
            <p className="text-sm text-foreground/40 mt-1">
              Ningún registro coincide con “{search.trim()}”.
            </p>
            <button
              type="button"
              onClick={() => handleSearch("")}
              className="mt-4 px-4 py-2 text-[10px] font-bold uppercase tracking-widest bg-white border border-foreground/10 rounded-xl hover:bg-foreground/5"
            >
              Limpiar búsqueda
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdfbf7] border-b border-foreground/5">
                  <SortableTh label="Fecha" field="date" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Código" field="inventory.product_code" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Producto" field="inventory.product_name" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Cantidad" field="quantity" className="text-right" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Molienda" field="molienda" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Lote" field="lote" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Tipo" field="entry_type" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Responsable" field="responsable" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <th className={thCls}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {paginatedRecords.map((r) => {
                  const inv = getRelation(r.inventory);
                  return (
                    <tr key={r.id} className="hover:bg-[#fdfbf7]">
                      <td className={tdCls}>
                        {r.movement_date
                          ? fmtDate(r.movement_date)
                          : fmtDate(r.created_at)}
                      </td>
                      <td className={tdCls}>
                        <span className="font-mono text-xs bg-foreground/5 px-2 py-1 rounded-lg">
                          {inv?.product_code ?? "—"}
                        </span>
                      </td>
                      <td className={tdCls}>{inv?.product_name ?? "—"}</td>
                      <td className={`${tdCls} text-right font-bold text-emerald-700`}>
                        +{r.quantity}
                      </td>
                      <td className={tdCls}>
                        <MoliendaBadge value={r.molienda} />
                      </td>
                      <td className={tdCls}>
                        {r.lote ? (
                          <span className="font-mono text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg">
                            {r.lote}
                          </span>
                        ) : (
                          <span className="text-foreground/30">—</span>
                        )}
                      </td>
                      <td className={tdCls}>
                        {r.entry_type && (
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              r.entry_type === "MP"
                                ? "bg-[#C59F59]/10 text-[#C59F59]"
                                : "bg-blue-50 text-blue-600"
                            }`}
                          >
                            {r.entry_type}
                          </span>
                        )}
                      </td>
                      <td className={`${tdCls} text-foreground/50`}>
                        {r.responsable || "—"}
                      </td>
                      <td className={tdCls}>
                        <AccionesCell id={r.id} deletingId={deletingId} onEdit={() => setEditingRecord(r)} onConfirmDelete={() => handleDeleteRecord(r)} onCancelDelete={() => setDeletingId(null)} onDelete={() => setDeletingId(r.id)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={page}
            totalItems={filteredRecords.length}
            onPageChange={setCurrentPage}
          />
        </>
        )}
      </div>
      {editingRecord && (
        <EditMovementModal record={editingRecord} onClose={() => setEditingRecord(null)} onSuccess={(invId, s) => { onStockUpdate(invId, s); loadHistory(); setEditingRecord(null); }} />
      )}
    </div>
  );
}

// ─── Trilla Tab ───────────────────────────────────────────────────────────────

function TrillaTab({
  inventory,
  onStocksUpdate,
  era,
}: {
  inventory: InventoryItem[];
  onStocksUpdate: (updates: { id: string; newStock: number }[]) => void;
  era: 'v1' | 'v2';
}) {
  const pergaminoOptions = useMemo(() => {
    return inventory.filter((i) => i.category === "cafe" && i.product_code.startsWith("CAPG"));
  }, [inventory]);

  const [selectedPergaminoId, setSelectedPergaminoId] = useState(() => {
    const defaultPerg = inventory.find((i) => i.product_code === "CAPG-001");
    return defaultPerg?.id || "";
  });

  // Keep state in sync if inventory loads later
  useEffect(() => {
    if (!selectedPergaminoId && inventory.length > 0) {
      const defaultPerg = inventory.find((i) => i.product_code === "CAPG-001");
      if (defaultPerg) {
        setSelectedPergaminoId(defaultPerg.id);
      } else if (pergaminoOptions.length > 0) {
        setSelectedPergaminoId(pergaminoOptions[0].id);
      }
    }
  }, [inventory, selectedPergaminoId, pergaminoOptions]);

  const selectedPergamino = inventory.find((i) => i.id === selectedPergaminoId) ?? null;
  const selectedVerde = useMemo(() => {
    if (!selectedPergamino) return null;
    const expectedVerdeCode = selectedPergamino.product_code.replace("CAPG", "CAFV");
    return inventory.find((i) => i.product_code === expectedVerdeCode) ?? null;
  }, [selectedPergamino, inventory]);

  const [inputQty, setInputQty] = useState("");
  const [rendimiento, setRendimiento] = useState("73.5");
  const [outputQty, setOutputQty] = useState("");
  const [date, setDate] = useState(today());
  const [notes, setNotes] = useState("");
  const [batches, setBatches] = useState<TrillaBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState("date");
  const [sortAsc, setSortAsc] = useState(false);

  const sortedBatches = useMemo(() => sortRecordsList(batches, sortField, sortAsc), [batches, sortField, sortAsc]);
  const paginatedBatches = sortedBatches.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  function handleSort(field: string) {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  // Auto-calculate output whenever input or rendimiento changes
  useEffect(() => {
    const input = parseFloat(inputQty);
    const rend = parseFloat(rendimiento);
    if (!isNaN(input) && input > 0 && !isNaN(rend) && rend > 0) {
      setOutputQty((input * (rend / 100)).toFixed(3));
    } else {
      setOutputQty("");
    }
  }, [inputQty, rendimiento]);

  function loadHistory() {
    setLoading(true);
    getTrillaBatches(era)
      .then((d) => setBatches(d as TrillaBatch[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadHistory();
  }, [era]);
  useEffect(() => {
    if (feedback?.type === "success") {
      const t = setTimeout(() => setFeedback(null), 5000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPergamino || !selectedVerde) {
      setFeedback({
        type: "error",
        msg: "No se encontró el pergamino o su café verde correspondiente en el inventario",
      });
      return;
    }
    const inputNum = parseFloat(inputQty);
    const rendNum = parseFloat(rendimiento) / 100;
    const outputNum = parseFloat(outputQty);
    if (!inputNum || inputNum <= 0 || !rendNum || rendNum <= 0 || !outputNum) {
      setFeedback({ type: "error", msg: "Ingresa cantidades válidas" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await createTrillaBatch(
          selectedPergamino.id,
          selectedVerde.id,
          inputNum,
          rendNum,
          date,
          notes || undefined
        );
        
        if (!res.success) {
          setFeedback({ type: "error", msg: res.error || "Error al registrar la Trilla" });
          return;
        }

        onStocksUpdate([
          { id: selectedPergamino.id, newStock: res.newPergaminoStock ?? 0 },
          { id: selectedVerde.id, newStock: res.newVerdeStock ?? 0 },
        ]);

        setFeedback({
          type: "success",
          msg: `✓ Trilla registrada — ${inputNum.toFixed(2)} kg Pergamino → ${outputNum.toFixed(2)} kg Verde`,
        });
        setInputQty("");
        setOutputQty("");
        setNotes("");
        loadHistory();
      } catch (err: unknown) {
        setFeedback({
          type: "error",
          msg: err instanceof Error ? err.message : "Error al registrar la Trilla",
        });
      }
    });
  }

  function handleDeleteBatch(batchId: string) {
    startTransition(async () => {
      try {
        const res = await deleteProductionBatch(batchId);
        onStocksUpdate([
          { id: res.inputInventoryId, newStock: res.newInputStock },
          { id: res.outputInventoryId, newStock: res.newOutputStock },
        ]);
        setDeletingBatchId(null);
        loadHistory();
      } catch (err: unknown) {
        setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Error al eliminar lote" });
      }
    });
  }

  const inputNum = parseFloat(inputQty) || 0;
  const outputNum = parseFloat(outputQty) || 0;
  const lossKg = inputNum - outputNum;
  const lossPct = inputNum > 0 ? (lossKg / inputNum) * 100 : 0;

  if (pergaminoOptions.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-12 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <p className="font-serif text-xl text-foreground/70">
          Productos no encontrados
        </p>
        <p className="text-sm text-foreground/50 mt-2">
          Asegúrate de que existen productos Café Pergamino (ej. CAPG-001) en el inventario.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Form — only in v2 */}
      {era === 'v2' && (
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-8">
        <div className="mb-6">
          <h2 className="text-xl font-serif">Registrar Trilla</h2>
          <p className="text-sm text-foreground/50 mt-1">
            Café Pergamino → Café Verde. La salida se auto-calcula por el rendimiento, pero puedes ajustarla al peso real.
          </p>
        </div>

        {/* Live stock minicard */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-[#f9f7f0] rounded-2xl p-4">
            <p className={`${labelCls} text-[9px]`}>
              Pergamino disponible ({selectedPergamino?.product_code || "—"})
            </p>
            <p className="text-2xl font-serif font-bold">
              {selectedPergamino ? selectedPergamino.current_stock : 0}{" "}
              <span className="text-sm font-sans text-foreground/50">kg</span>
            </p>
          </div>
          <div className="bg-[#f9f7f0] rounded-2xl p-4">
            <p className={`${labelCls} text-[9px]`}>
              Verde disponible ({selectedVerde?.product_code || "—"})
            </p>
            <p className="text-2xl font-serif font-bold">
              {selectedVerde ? selectedVerde.current_stock : 0}{" "}
              <span className="text-sm font-sans text-foreground/50">kg</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-4">
            <div>
              <label htmlFor="tri-product" className={labelCls}>
                Tipo de Café <span className="text-red-400">*</span>
              </label>
              <select
                id="tri-product"
                value={selectedPergaminoId}
                onChange={(e) => setSelectedPergaminoId(e.target.value)}
                className={`${inputCls} appearance-none cursor-pointer`}
                required
              >
                <option value="">Seleccionar café...</option>
                {pergaminoOptions.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.product_name} ({item.product_code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="tri-date" className={labelCls}>
                Fecha <span className="text-red-400">*</span>
              </label>
              <input
                id="tri-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                suppressHydrationWarning={true}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label htmlFor="tri-input" className={labelCls}>
                Pergamino entrada (kg) <span className="text-red-400">*</span>
              </label>
              <input
                id="tri-input"
                type="number"
                min="0.001"
                step="0.001"
                value={inputQty}
                onChange={(e) => setInputQty(e.target.value)}
                placeholder="ej. 287.9"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label htmlFor="tri-rend" className={labelCls}>
                Rendimiento (%)
              </label>
              <input
                id="tri-rend"
                type="number"
                min="1"
                max="100"
                step="0.01"
                value={rendimiento}
                onChange={(e) => setRendimiento(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="tri-output" className={labelCls}>
                Verde salida (kg) — real{" "}
                <span className="text-amber-500">auto</span>
              </label>
              <input
                id="tri-output"
                type="number"
                min="0.001"
                step="0.001"
                value={outputQty}
                onChange={(e) => setOutputQty(e.target.value)}
                placeholder="Auto-calculado"
                className={`${inputCls} border-amber-200 bg-amber-50/50`}
                required
              />
            </div>
          </div>

          {/* Live loss widget */}
          {inputNum > 0 && outputNum > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-4 bg-[#f9f7f0] rounded-2xl p-4 text-center">
              <div>
                <p className={labelCls}>Entrada</p>
                <p className="font-bold">{inputNum.toFixed(2)} kg</p>
              </div>
              <div>
                <p className={labelCls}>Pérdida</p>
                <p className="font-bold text-red-600">{lossKg.toFixed(2)} kg</p>
              </div>
              <div>
                <p className={labelCls}>% Pérdida</p>
                <p
                  className={`font-bold text-xl ${
                    lossPct > 35 ? "text-red-600" : "text-foreground"
                  }`}
                >
                  {lossPct.toFixed(1)}%
                </p>
              </div>
            </div>
          )}

          <div className="mb-5">
            <label htmlFor="tri-notes" className={labelCls}>
              Notas (opcional)
            </label>
            <input
              id="tri-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ej. Lote #3 — Finca La Esperanza"
              className={inputCls}
            />
          </div>

          <FeedbackBanner feedback={feedback} />
          <button
            type="submit"
            disabled={isPending}
            className="mt-4 flex items-center gap-2 px-8 py-3.5 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-widest text-sm rounded-2xl transition-all disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FlaskConical className="w-4 h-4" />
            )}
            {isPending ? "Registrando..." : "Registrar Trilla"}
          </button>
        </form>
      </div>
      )}

      {/* History */}
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-foreground/5 flex items-center justify-between bg-[#fdfbf7]">
          <h3 className="font-serif text-lg">
            Historial de Trillas{" "}
            <span className="text-foreground/40 text-base font-sans">
              · {batches.length}
            </span>
          </h3>
          <button
            onClick={loadHistory}
            className="p-2 rounded-xl hover:bg-foreground/5 text-foreground/40"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {loading || batches.length === 0 ? (
          <HistoryLoadingOrEmpty loading={loading} empty={batches.length === 0} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdfbf7] border-b border-foreground/5">
                  <SortableTh label="Fecha" field="date" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Café / Tipo" field="input_inventory.product_name" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Pergamino (kg)" field="input_quantity_kg" className="text-right" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Rendimiento" field="rendimiento_pct" className="text-right" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Verde (kg)" field="output_quantity_kg" className="text-right" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Pérdida %" field="weight_loss_pct" className="text-right" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Notas" field="notes" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <th className={thCls}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {paginatedBatches.map((b) => (
                  <tr key={b.id} className="hover:bg-[#fdfbf7]">
                    <td className={tdCls}>
                      {b.movement_date
                        ? fmtDate(b.movement_date)
                        : fmtDate(b.created_at)}
                    </td>
                    <td className={tdCls}>
                      {b.input_inventory?.product_name || "—"}
                    </td>
                    <td className={`${tdCls} text-right font-mono`}>
                      {Number(b.input_quantity_kg).toFixed(2)}
                    </td>
                    <td className={`${tdCls} text-right`}>
                      {b.rendimiento_pct != null
                        ? `${(Number(b.rendimiento_pct) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td className={`${tdCls} text-right font-mono font-bold text-emerald-700`}>
                      {Number(b.output_quantity_kg).toFixed(2)}
                    </td>
                    <td className={`${tdCls} text-right`}>
                      {Number(b.weight_loss_pct).toFixed(1)}%
                    </td>
                    <td className={`${tdCls} text-foreground/50`}>
                      {b.notes || "—"}
                    </td>
                    <td className={tdCls}>
                      {deletingBatchId === b.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-red-600">¿Eliminar?</span>
                          <button onClick={() => handleDeleteBatch(b.id)} className="px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded-lg">Sí</button>
                          <button onClick={() => setDeletingBatchId(null)} className="px-2 py-1 bg-foreground/10 text-[10px] font-bold rounded-lg">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setDeletingBatchId(b.id)} title="Eliminar" className="p-1.5 rounded-lg hover:bg-red-50 text-foreground/40 hover:text-red-500">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={currentPage}
            totalItems={batches.length}
            onPageChange={setCurrentPage}
          />
        </>
        )}
      </div>
    </div>
  );
}

// ─── Producción Consumos Tab ──────────────────────────────────────────────────

// ─── Proceso de Tostión Tab ───────────────────────────────────────────────────

function TostionTab({
  inventory,
  onStocksUpdate,
  era,
}: {
  inventory: InventoryItem[];
  onStocksUpdate: (updates: { id: string; newStock: number }[]) => void;
  era: 'v1' | 'v2';
}) {
  const initForm = {
    inputInventoryId: "",
    outputInventoryId: "",
    inputQty: "",
    rendimiento: "81", // Promedio típico de tostión (19% merma)
    outputQty: "",
    date: today(),
    notes: "",
  };

  const [form, setForm] = useState(initForm);
  const [batches, setBatches] = useState<TrillaBatch[]>([]);
  const [legacyRecords, setLegacyRecords] = useState<MovementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState("date");
  const [sortAsc, setSortAsc] = useState(false);

  const unifiedRecords = useMemo(() => {
    const list: any[] = [
      ...batches.map(b => ({
        id: b.id,
        date: b.movement_date || b.created_at,
        inputQty: Number(b.input_quantity_kg),
        outputQty: Number(b.output_quantity_kg),
        rend: Number(b.rendimiento_pct) * 100,
        loss: Number(b.weight_loss_pct),
        notes: b.notes,
        isLegacy: false
      })),
      ...legacyRecords
        .filter(r => !r.production_batch_id)
        .map(r => {
          const inv = getRelation(r.inventory);
          const input = Math.abs(Number(r.quantity));
          return {
            id: r.id,
            date: r.movement_date || r.created_at,
            inputQty: input,
            outputQty: input,
            rend: 100,
            loss: 0,
            notes: r.reason || `Historial: ${inv?.product_name || 'Café'}`,
            isLegacy: true
          };
        })
    ];
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [batches, legacyRecords]);

  const paginatedRecords = unifiedRecords.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  function loadHistory() {
    setLoading(true);
    Promise.all([
      getTostionBatches(era),
      getMovementsByTab("prod_consumo", era)
    ])
      .then(([b, m]) => {
        setBatches(b as TrillaBatch[]);
        setLegacyRecords(m as MovementRecord[]);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadHistory();
  }, [era]);

  // Auto-calculate output whenever input or rendimiento changes
  useEffect(() => {
    const input = parseFloat(form.inputQty);
    const rend = parseFloat(form.rendimiento);
    if (!isNaN(input) && input > 0 && !isNaN(rend) && rend > 0) {
      setForm(prev => ({ ...prev, outputQty: (input * (rend / 100)).toFixed(3) }));
    } else {
      setForm(prev => ({ ...prev, outputQty: "" }));
    }
  }, [form.inputQty, form.rendimiento]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const { inputInventoryId, outputInventoryId, inputQty, rendimiento, outputQty, date, notes } = form;

    if (!inputInventoryId || !outputInventoryId || !inputQty || !outputQty) {
      setFeedback({ type: "error", msg: "Completa los campos obligatorios" });
      return;
    }

    startTransition(async () => {
      try {
        const res = await createTostionBatch(
          inputInventoryId,
          outputInventoryId,
          parseFloat(inputQty),
          parseFloat(rendimiento) / 100,
          date,
          notes || undefined
        );

        if (!res.success) {
          setFeedback({ type: "error", msg: res.error || "Error al registrar" });
          return;
        }

        onStocksUpdate([
          { id: inputInventoryId, newStock: res.newVerdeStock ?? 0 },
          { id: outputInventoryId, newStock: res.newTostadoStock ?? 0 },
        ]);

        setFeedback({ type: "success", msg: "✓ Proceso de Tostión registrado con éxito" });
        setForm(initForm);
        loadHistory();
      } catch (err: unknown) {
        setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Error al registrar" });
      }
    });
  }

  function handleDeleteBatch(batchId: string) {
    startTransition(async () => {
      try {
        const res = await deleteProductionBatch(batchId); 
        onStocksUpdate([
          { id: res.inputInventoryId, newStock: res.newInputStock },
          { id: res.outputInventoryId, newStock: res.newOutputStock },
        ]);
        setDeletingId(null);
        loadHistory();
      } catch (err: unknown) {
        setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Error al eliminar" });
      }
    });
  }

  const inputNum = parseFloat(form.inputQty) || 0;
  const outputNum = parseFloat(form.outputQty) || 0;
  const lossKg = inputNum - outputNum;
  const lossPct = inputNum > 0 ? (lossKg / inputNum) * 100 : 0;

  return (
    <div className="space-y-6">
      {era === 'v2' && (
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-8">
        <div className="mb-6">
          <h2 className="text-xl font-serif">Proceso de Tostión</h2>
          <p className="text-sm text-foreground/50 mt-1">
            Convierte café verde en café tostado. El sistema descontará el verde e incrementará el tostado.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            <div>
              <label htmlFor="tos-date" className={labelCls}>Fecha <span className="text-red-400">*</span></label>
              <input
                id="tos-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label htmlFor="tos-input-product" className={labelCls}>Café Verde (In) <span className="text-red-400">*</span></label>
              <ProductSelect
                id="tos-input-product"
                value={form.inputInventoryId}
                onChange={(v) => setForm({ ...form, inputInventoryId: v })}
                inventory={inventory}
                filter={(i) => i.category === 'cafe' && i.product_code.startsWith('CAFV')}
                placeholder="Seleccionar café verde..."
              />
            </div>
            <div>
              <label htmlFor="tos-output-product" className={labelCls}>Café Tostado (Out) <span className="text-red-400">*</span></label>
              <ProductSelect
                id="tos-output-product"
                value={form.outputInventoryId}
                onChange={(v) => setForm({ ...form, outputInventoryId: v })}
                inventory={inventory}
                filter={(i) => i.category === 'cafe' && (i.product_code.startsWith('CAFT') || i.product_name.toLowerCase().includes('tostado'))}
                placeholder="Seleccionar café tostado..."
              />
            </div>
            <div>
              <label htmlFor="tos-input-qty" className={labelCls}>Cant. Verde (kg) <span className="text-red-400">*</span></label>
              <input
                id="tos-input-qty"
                type="number"
                min="0.001"
                step="0.001"
                value={form.inputQty}
                onChange={(e) => setForm({ ...form, inputQty: e.target.value })}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label htmlFor="tos-rend" className={labelCls}>Rendimiento Tostión (%)</label>
              <input
                id="tos-rend"
                type="number"
                min="1"
                max="100"
                step="0.1"
                value={form.rendimiento}
                onChange={(e) => setForm({ ...form, rendimiento: e.target.value })}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="tos-output-qty" className={labelCls}>Cant. Tostado (kg) <span className="text-amber-500">auto</span></label>
              <input
                id="tos-output-qty"
                type="number"
                min="0.001"
                step="0.001"
                value={form.outputQty}
                onChange={(e) => setForm({ ...form, outputQty: e.target.value })}
                className={`${inputCls} border-amber-200 bg-amber-50/50`}
                required
              />
            </div>
          </div>

          {inputNum > 0 && outputNum > 0 && (
            <div className="grid grid-cols-3 gap-3 mb-4 bg-[#f9f7f0] rounded-2xl p-4 text-center">
              <div><p className={labelCls}>Entrada Verde</p><p className="font-bold">{inputNum.toFixed(2)} kg</p></div>
              <div><p className={labelCls}>Pérdida (Merma)</p><p className="font-bold text-red-600">{lossKg.toFixed(2)} kg</p></div>
              <div><p className={labelCls}>% Pérdida</p><p className="font-bold text-xl">{lossPct.toFixed(1)}%</p></div>
            </div>
          )}

          <div className="mb-5">
            <label htmlFor="tos-notes" className={labelCls}>Notas</label>
            <input
              id="tos-notes"
              type="text"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={inputCls}
              placeholder="ej. Tostión media-alta, Lote #..."
            />
          </div>

          <FeedbackBanner feedback={feedback} />
          <button
            type="submit"
            disabled={isPending}
            className="mt-4 flex items-center gap-2 px-8 py-3.5 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-widest text-sm rounded-2xl transition-all disabled:opacity-60"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Factory className="w-4 h-4" />}
            {isPending ? "Registrando..." : "Registrar Tostión"}
          </button>
        </form>
      </div>
      )}

      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-foreground/5 flex items-center justify-between bg-[#fdfbf7]">
          <h3 className="font-serif text-lg">Historial de Tostión <span className="text-foreground/40 text-base font-sans">· {unifiedRecords.length}</span></h3>
          <button onClick={loadHistory} className="p-2 rounded-xl hover:bg-foreground/5 text-foreground/40"><RefreshCw className="w-4 h-4" /></button>
        </div>
        {loading || unifiedRecords.length === 0 ? (
          <HistoryLoadingOrEmpty loading={loading} empty={unifiedRecords.length === 0} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdfbf7] border-b border-foreground/5">
                  <th className={thCls}>Fecha</th>
                  <th className={`${thCls} text-right`}>Verde (In)</th>
                  <th className={`${thCls} text-right`}>Rend.</th>
                  <th className={`${thCls} text-right`}>Tostado (Out)</th>
                  <th className={`${thCls} text-right`}>Merma %</th>
                  <th className={thCls}>Notas</th>
                  <th className={thCls}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {paginatedRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-[#fdfbf7]">
                    <td className={tdCls}>{fmtDate(r.date)}</td>
                    <td className={`${tdCls} text-right font-mono`}>{r.inputQty.toFixed(2)} kg</td>
                    <td className={`${tdCls} text-right`}>{r.rend !== null ? `${r.rend.toFixed(1)}%` : "—"}</td>
                    <td className={`${tdCls} text-right font-mono font-bold text-emerald-700`}>{r.outputQty !== null ? `${r.outputQty.toFixed(2)} kg` : "—"}</td>
                    <td className={`${tdCls} text-right text-red-500`}>{r.loss !== null ? `${r.loss.toFixed(1)}%` : "—"}</td>
                    <td className={`${tdCls} text-foreground/50 text-xs`}>{r.notes || "—"}</td>
                    <td className={tdCls}>
                      {!r.isLegacy ? (
                        deletingId === r.id ? (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-red-600">¿Eliminar?</span>
                            <button onClick={() => handleDeleteBatch(r.id)} className="px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded-lg">Sí</button>
                            <button onClick={() => setDeletingId(null)} className="px-2 py-1 bg-foreground/10 text-[10px] font-bold rounded-lg">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeletingId(r.id)} title="Eliminar" className="p-1.5 rounded-lg hover:bg-red-50 text-foreground/40 hover:text-red-500">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )
                      ) : (
                        <span className="text-[9px] font-bold text-foreground/20 uppercase tracking-tighter">Legacy</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <PaginationControls currentPage={currentPage} totalItems={unifiedRecords.length} onPageChange={setCurrentPage} />
          </div>
        )}
      </div>


    </div>
  );
}

// ─── Producción Altas Tab ─────────────────────────────────────────────────────

const FINISHED_CODES = [
  "CAFT-001",
  "CAFT-125G",
  "CAFT-250G",
  "CAFT-500G",
  "CAFT-2K5",
  // Honey Process Limitado
  "CAFT-HON-001",
  "CAFT-HON-125G",
  "CAFT-HON-250G",
  "CAFT-HON-500G",
  // Microlote del Mes
  "CAFT-MIC-001",
  "CAFT-MIC-125G",
  "CAFT-MIC-250G",
  "CAFT-MIC-500G",
  // Cold Brew
  "CAFC-340ML",
];

function ProdAltasTab({
  inventory,
  onStocksUpdate,
  era,
}: {
  inventory: InventoryItem[];
  onStocksUpdate: (updates: { id: string; newStock: number }[]) => void;
  era: 'v1' | 'v2';
}) {
  const initForm = {
    inventoryId: "",
    qty: "",
    date: today(),
    lote: "",
    notes: "",
    molienda: "" as Molienda | "",
  };
  const [form, setForm] = useState(initForm);
  const [consumos, setConsumos] = useState<{ id: string; qty: string }[]>([]);
  const [records, setRecords] = useState<MovementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState("date");
  const [sortAsc, setSortAsc] = useState(false);

  const sortedRecords = useMemo(() => sortRecordsList(records, sortField, sortAsc), [records, sortField, sortAsc]);
  const paginatedRecords = sortedRecords.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  function handleSort(field: string) {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  const [editingRecord, setEditingRecord] = useState<MovementRecord | null>(null);

  const selectedProduct = useMemo(
    () => inventory.find((i) => i.id === form.inventoryId) ?? null,
    [inventory, form.inventoryId]
  );

  function loadHistory() {
    setLoading(true);
    getMovementsByTab("prod_alta", era)
      .then((d) => setRecords(d as MovementRecord[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadHistory();
  }, [era]);
  useEffect(() => {
    if (feedback?.type === "success") {
      const t = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.inventoryId || !form.qty) {
      setFeedback({ type: "error", msg: "Completa los campos obligatorios" });
      return;
    }
    if (isGrindTracked(selectedProduct?.product_code) && !form.molienda) {
      setFeedback({ type: "error", msg: "Selecciona la molienda (Grano o Molido)" });
      return;
    }
    startTransition(async () => {
      try {
        const consumosParsed = consumos
          .filter(c => c.id && c.qty && parseFloat(c.qty) > 0)
          .map(c => ({ id: c.id, qty: parseFloat(c.qty) }));

        const res = await createProdAlta(
          form.inventoryId,
          parseFloat(form.qty),
          form.date,
          consumosParsed,
          form.lote || undefined,
          form.notes || undefined,
          form.molienda || undefined
        );

        if (!res.success) {
          setFeedback({ type: "error", msg: res.error || "Error al registrar" });
          return;
        }

        const updates = [{ id: form.inventoryId, newStock: res.newStock ?? 0 }];
        if (res.consumedResults) {
          res.consumedResults.forEach((cr: { id: string; newStock: number }) => {
            updates.push({ id: cr.id, newStock: cr.newStock });
          });
        }
        onStocksUpdate(updates);
        setFeedback({ type: "success", msg: "✓ Alta de producción registrada" });
        setForm(initForm);
        setConsumos([]);
        loadHistory();
      } catch (err: unknown) {
        setFeedback({
          type: "error",
          msg: err instanceof Error ? err.message : "Error al registrar",
        });
      }
    });
  }

  function handleDeleteRecord(record: MovementRecord) {
    startTransition(async () => {
      try {
        const res = await deleteMovement(record.id);
        onStocksUpdate([{ id: res.inventoryId as string, newStock: res.newStock }]);
        setDeletingId(null);
        loadHistory();
      } catch (err: unknown) {
        setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Error al eliminar" });
      }
    });
  }

  function getUnitWeight(code: string): number {
    if (code.includes("-125G")) return 0.125;
    if (code.includes("-250G")) return 0.250;
    if (code.includes("-500G")) return 0.500;
    if (code.includes("-2K5")) return 2.5;
    return 0;
  }

  // Auto-calculate coffee, bag, and sticker consumption when product or qty changes
  useEffect(() => {
    const selectedProd = inventory.find(i => i.id === form.inventoryId);
    if (!selectedProd || !selectedProd.product_code.startsWith("CAFT-") || selectedProd.product_code.endsWith("001")) {
      setConsumos([]);
      return;
    }

    const unitWeight = getUnitWeight(selectedProd.product_code);
    if (unitWeight === 0) return;

    const qtyNum = parseFloat(form.qty) || 0;
    if (qtyNum <= 0) {
      setConsumos([]);
      return;
    }

    const list: { id: string; qty: string }[] = [];

    // 1. Bulk Coffee
    let bulkCode = "CAFT-001";
    if (selectedProd.product_code.includes("-HON-")) {
      bulkCode = "CAFT-HON-001";
    } else if (selectedProd.product_code.includes("-MIC-")) {
      bulkCode = "CAFT-MIC-001";
    }
    const bulkCoffee = inventory.find(i => i.product_code === bulkCode);
    if (bulkCoffee) {
      const coffeeNeeded = qtyNum * unitWeight;
      list.push({ id: bulkCoffee.id, qty: coffeeNeeded.toFixed(3) });
    }

    // 2. Bag
    let flavor = "FIR";
    if (selectedProd.product_code.includes("-HON-")) flavor = "HON";
    else if (selectedProd.product_code.includes("-MIC-")) flavor = "MIC";

    let size = "";
    if (selectedProd.product_code.includes("125G")) size = "125G";
    else if (selectedProd.product_code.includes("250G")) size = "250G";
    else if (selectedProd.product_code.includes("500G")) size = "500G";
    else if (selectedProd.product_code.includes("2K5")) size = "2K5";

    if (size) {
      const bagCode = `EMP-BOLSA-${flavor}-${size}`;
      const bagItem = inventory.find(i => i.product_code === bagCode);
      if (bagItem) {
        list.push({ id: bagItem.id, qty: String(qtyNum) });
      }
    }

    // 3. Sticker
    const stickerCode = `STK-AMT-${flavor}`;
    const stickerItem = inventory.find(i => i.product_code === stickerCode);
    if (stickerItem) {
      list.push({ id: stickerItem.id, qty: String(qtyNum) });
    }

    setConsumos(list);
  }, [form.inventoryId, form.qty, inventory]);

  return (
    <div className="space-y-6">
      {era === 'v2' && (
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-8">
        <div className="mb-6">
          <h2 className="text-xl font-serif">Producción — Altas</h2>
          <p className="text-sm text-foreground/50 mt-1">
            Registra los productos terminados que salen de la Tostión (café tostado empacado).
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            <div>
              <label htmlFor="pa-date" className={labelCls}>
                Fecha <span className="text-red-400">*</span>
              </label>
              <input
                id="pa-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                suppressHydrationWarning={true}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label htmlFor="pa-product" className={labelCls}>
                Producto terminado <span className="text-red-400">*</span>
              </label>
              <ProductSelect
                id="pa-product"
                value={form.inventoryId}
                onChange={(v) => {
                  const next = inventory.find((i) => i.id === v);
                  setForm({
                    ...form,
                    inventoryId: v,
                    molienda: isGrindTracked(next?.product_code) ? form.molienda : "",
                  });
                }}
                inventory={inventory}
                filter={(i) => FINISHED_CODES.includes(i.product_code)}
                placeholder="Seleccionar café tostado..."
              />
            </div>
            <MoliendaField
              idPrefix="pa"
              value={form.molienda}
              onChange={(v) => setForm({ ...form, molienda: v })}
              productCode={selectedProduct?.product_code}
            />
            <div>
              <label htmlFor="pa-qty" className={labelCls}>
                Cantidad (kg / ud) <span className="text-red-400">*</span>
              </label>
              <input
                id="pa-qty"
                type="number"
                min="0.001"
                step="0.001"
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                placeholder="ej. 50"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label htmlFor="pa-lote" className={labelCls}>
                Lote referencia (opcional)
              </label>
              <input
                id="pa-lote"
                type="text"
                value={form.lote}
                onChange={(e) => setForm({ ...form, lote: e.target.value })}
                placeholder="ej. Lote #5"
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="pa-notes" className={labelCls}>
                Notas (opcional)
              </label>
              <input
                id="pa-notes"
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Observaciones..."
                className={inputCls}
              />
            </div>
          </div>

          {/* Materiales Consumidos */}
          <div className="mb-6 p-5 rounded-2xl border border-foreground/10 bg-[#fdfbf7]">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-foreground">Materiales Consumidos</h3>
                <p className="text-xs text-foreground/50">Opcional. Registra bolsas o stickers utilizados.</p>
              </div>
              <button
                type="button"
                onClick={() => setConsumos([...consumos, { id: "", qty: "" }])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-foreground/5 hover:bg-foreground/10 text-xs font-bold text-foreground transition-colors"
              >
                <PackagePlus className="w-3.5 h-3.5" />
                Agregar Material
              </button>
            </div>
            
            {consumos.length > 0 ? (
              <div className="space-y-3">
                {consumos.map((c, i) => (
                  <div key={i} className="flex flex-col sm:flex-row gap-3 items-end">
                    <div className="flex-1">
                      <label className="text-[10px] uppercase font-bold text-foreground/40 mb-1 block">Material</label>
                      <ProductSelect
                        value={c.id}
                        onChange={(v) => {
                          const newC = [...consumos];
                          newC[i].id = v;
                          setConsumos(newC);
                        }}
                        inventory={inventory}
                        filter={(inv) => inv.category === "empaque" || inv.category === "accesorio" || inv.category === "cafe"}
                        placeholder="Seleccionar bolsa o sticker..."
                      />
                    </div>
                    <div className="w-full sm:w-32">
                      <label className="text-[10px] uppercase font-bold text-foreground/40 mb-1 block">Cantidad</label>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={c.qty}
                        onChange={(e) => {
                          const newC = [...consumos];
                          newC[i].qty = e.target.value;
                          setConsumos(newC);
                        }}
                        placeholder="ej. 50"
                        className={inputCls}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setConsumos(consumos.filter((_, idx) => idx !== i))}
                      className="p-3.5 mb-px rounded-xl border border-red-200 text-red-500 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-center text-foreground/40 border-2 border-dashed border-foreground/5 rounded-xl py-6">
                No has agregado materiales consumidos.
              </p>
            )}
          </div>

          <FeedbackBanner feedback={feedback} />
          <button
            type="submit"
            disabled={isPending}
            className="mt-4 flex items-center gap-2 px-8 py-3.5 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-widest text-sm rounded-2xl transition-all disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <TrendingUp className="w-4 h-4" />
            )}
            {isPending ? "Registrando..." : "Registrar Alta"}
          </button>
        </form>
      </div>
      )}

      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-foreground/5 flex items-center justify-between bg-[#fdfbf7]">
          <h3 className="font-serif text-lg">
            Historial{" "}
            <span className="text-foreground/40 text-base font-sans">
              · {records.length}
            </span>
          </h3>
          <button
            onClick={loadHistory}
            className="p-2 rounded-xl hover:bg-foreground/5 text-foreground/40"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {loading || records.length === 0 ? (
          <HistoryLoadingOrEmpty loading={loading} empty={records.length === 0} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdfbf7] border-b border-foreground/5">
                  <SortableTh label="Fecha" field="date" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Código" field="inventory.product_code" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Producto" field="inventory.product_name" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Cantidad" field="quantity" className="text-right" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Molienda" field="molienda" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Lote / Notas" field="reason" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <th className={thCls}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {paginatedRecords.map((r) => {
                  const inv = getRelation(r.inventory);
                  return (
                    <tr key={r.id} className="hover:bg-[#fdfbf7]">
                      <td className={tdCls}>
                        {r.movement_date
                          ? fmtDate(r.movement_date)
                          : fmtDate(r.created_at)}
                      </td>
                      <td className={tdCls}>
                        <span className="font-mono text-xs bg-foreground/5 px-2 py-1 rounded-lg">
                          {inv?.product_code ?? "—"}
                        </span>
                      </td>
                      <td className={tdCls}>{inv?.product_name ?? "—"}</td>
                      <td className={`${tdCls} text-right font-bold ${r.quantity > 0 ? "text-emerald-700" : "text-red-600"}`}>
                        {r.quantity > 0 ? "+" : ""}{r.quantity}
                      </td>
                      <td className={tdCls}>
                        <MoliendaBadge value={r.molienda} />
                      </td>
                      <td className={`${tdCls} text-foreground/50`}>
                        {r.reason || "—"}
                      </td>
                      <td className={tdCls}>
                        <AccionesCell id={r.id} deletingId={deletingId} onEdit={() => setEditingRecord(r)} onConfirmDelete={() => handleDeleteRecord(r)} onCancelDelete={() => setDeletingId(null)} onDelete={() => setDeletingId(r.id)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={currentPage}
            totalItems={records.length}
            onPageChange={setCurrentPage}
          />
        </>
        )}
      </div>
      {editingRecord && (
        <EditMovementModal record={editingRecord} onClose={() => setEditingRecord(null)} onSuccess={(invId, s) => { onStocksUpdate([{ id: invId, newStock: s }]); loadHistory(); setEditingRecord(null); }} />
      )}
    </div>
  );
}

// ─── Cold Brew (Café 11:11) Tab ───────────────────────────────────────────────

function ColdBrewTab({
  inventory,
  onStocksUpdate,
  era,
}: {
  inventory: InventoryItem[];
  onStocksUpdate: (updates: { id: string; newStock: number }[]) => void;
  era: 'v1' | 'v2';
}) {
  const defaultCoffee = inventory.find(i => i.product_code === "CAFT-001") || inventory.find(i => i.product_code.startsWith("CAFT-"));
  const defaultColdBrew = inventory.find(i => i.product_code === "CAFC-340ML") || inventory.find(i => i.product_name.toLowerCase().includes("cold brew"));

  const initForm = {
    coffeeId: defaultCoffee?.id || "",
    coldBrewId: defaultColdBrew?.id || "",
    inputQtyKg: "",
    outputBottles: "",
    date: today(),
    lote: "",
    notes: "",
    thirdParty: "Café 11:11",
  };

  const [form, setForm] = useState(initForm);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState("date");
  const [sortAsc, setSortAsc] = useState(false);

  // Auto-fill default IDs when inventory updates
  useEffect(() => {
    if (!form.coffeeId && inventory.length > 0) {
      const c = inventory.find(i => i.product_code === "CAFT-001") || inventory.find(i => i.product_code.startsWith("CAFT-"));
      if (c) setForm(prev => ({ ...prev, coffeeId: c.id }));
    }
    if (!form.coldBrewId && inventory.length > 0) {
      const cb = inventory.find(i => i.product_code === "CAFC-340ML") || inventory.find(i => i.product_name.toLowerCase().includes("cold brew"));
      if (cb) setForm(prev => ({ ...prev, coldBrewId: cb.id }));
    }
  }, [inventory, form.coffeeId, form.coldBrewId]);

  function loadHistory() {
    setLoading(true);
    getColdBrewBatches(era)
      .then((d) => setBatches(d || []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadHistory();
  }, [era]);

  const selectedCoffee = inventory.find(i => i.id === form.coffeeId);
  const selectedColdBrew = inventory.find(i => i.id === form.coldBrewId);

  const inputNum = parseFloat(form.inputQtyKg) || 0;
  const bottlesNum = parseFloat(form.outputBottles) || 0;
  const ratio = inputNum > 0 ? (bottlesNum / inputNum).toFixed(1) : "0.0";
  const totalLiters = (bottlesNum * 0.34).toFixed(1);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.coffeeId || !form.coldBrewId || !form.inputQtyKg || !form.outputBottles) {
      setFeedback({ type: "error", msg: "Completa los campos obligatorios (*)" });
      return;
    }

    if (selectedCoffee && Number(selectedCoffee.current_stock) < inputNum) {
      setFeedback({
        type: "error",
        msg: `Stock insuficiente de café tostado (${selectedCoffee.product_name}). Disponible: ${selectedCoffee.current_stock} kg`,
      });
      return;
    }

    startTransition(async () => {
      try {
        const res = await createColdBrewBatch(
          form.coffeeId,
          form.coldBrewId,
          inputNum,
          bottlesNum,
          form.date,
          form.lote || undefined,
          form.notes || undefined,
          form.thirdParty || "Café 11:11"
        );

        if (!res.success) {
          setFeedback({ type: "error", msg: res.error || "Error al registrar el lote de Cold Brew" });
          return;
        }

        onStocksUpdate([
          { id: form.coffeeId, newStock: res.newCoffeeStock ?? 0 },
          { id: form.coldBrewId, newStock: res.newColdBrewStock ?? 0 },
        ]);

        setFeedback({
          type: "success",
          msg: `✓ Lote de Cold Brew 340ml registrado con éxito (+${bottlesNum} botellas, -${inputNum} kg café)`,
        });

        setForm(prev => ({
          ...initForm,
          coffeeId: prev.coffeeId,
          coldBrewId: prev.coldBrewId,
        }));
        loadHistory();
      } catch (err: unknown) {
        setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Error al registrar" });
      }
    });
  }

  function handleDeleteBatch(batchId: string) {
    startTransition(async () => {
      try {
        const res = await deleteProductionBatch(batchId);
        onStocksUpdate([
          { id: res.inputInventoryId, newStock: res.newInputStock },
          { id: res.outputInventoryId, newStock: res.newOutputStock },
        ]);
        setDeletingId(null);
        setFeedback({ type: "success", msg: "✓ Lote eliminado e inventario revertido correctamente" });
        loadHistory();
      } catch (err: unknown) {
        setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Error al eliminar lote" });
      }
    });
  }

  const sortedBatches = useMemo(() => sortRecordsList(batches, sortField, sortAsc), [batches, sortField, sortAsc]);
  const paginatedBatches = sortedBatches.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  function handleSort(field: string) {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  return (
    <div className="space-y-6">
      {era === 'v2' && (
        <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-8">
          <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2 className="text-xl font-serif">Pipeline Cold Brew — Tercero Café 11:11</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-[#C59F59]/15 text-[#C59F59] uppercase tracking-wider">
                  Maquila Café 11:11
                </span>
              </div>
              <p className="text-sm text-foreground/60 max-w-2xl">
                Registra la salida de café tostado a granel entregado al maquilador y la entrada de unidades de Cold Brew 340ml terminadas.
                Las botellas y tapas son suministradas directamente por el tercero.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
              <div>
                <label htmlFor="cb-date" className={labelCls}>
                  Fecha <span className="text-red-400">*</span>
                </label>
                <input
                  id="cb-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  suppressHydrationWarning={true}
                  className={inputCls}
                  required
                />
              </div>

              <div>
                <label htmlFor="cb-coffee" className={labelCls}>
                  Café Tostado a Enviar <span className="text-red-400">*</span>
                </label>
                <ProductSelect
                  id="cb-coffee"
                  value={form.coffeeId}
                  onChange={(v) => setForm({ ...form, coffeeId: v })}
                  inventory={inventory}
                  filter={(i) =>
                    i.category === "cafe" &&
                    (i.product_code.startsWith("CAFT") || i.product_name.toLowerCase().includes("tostado"))
                  }
                  placeholder="Seleccionar café tostado..."
                />
                {selectedCoffee && (
                  <p className="text-xs text-foreground/50 mt-1">
                    Disponible: <span className="font-semibold text-foreground">{Number(selectedCoffee.current_stock).toFixed(2)} kg</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="cb-qty-coffee" className={labelCls}>
                  Cantidad Café Tostado (kg) <span className="text-red-400">*</span>
                </label>
                <input
                  id="cb-qty-coffee"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.inputQtyKg}
                  onChange={(e) => setForm({ ...form, inputQtyKg: e.target.value })}
                  placeholder="ej. 5.0"
                  className={inputCls}
                  required
                />
              </div>

              <div>
                <label htmlFor="cb-product" className={labelCls}>
                  Producto Terminado <span className="text-red-400">*</span>
                </label>
                <ProductSelect
                  id="cb-product"
                  value={form.coldBrewId}
                  onChange={(v) => setForm({ ...form, coldBrewId: v })}
                  inventory={inventory}
                  filter={(i) =>
                    i.product_code === "CAFC-340ML" ||
                    i.product_name.toLowerCase().includes("cold brew")
                  }
                  placeholder="Seleccionar producto Cold Brew..."
                />
                {selectedColdBrew && (
                  <p className="text-xs text-foreground/50 mt-1">
                    Stock actual: <span className="font-semibold text-foreground">{selectedColdBrew.current_stock} uds</span>
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="cb-qty-bottles" className={labelCls}>
                  Botellas Recibidas (340ml) <span className="text-red-400">*</span>
                </label>
                <input
                  id="cb-qty-bottles"
                  type="number"
                  min="1"
                  step="1"
                  value={form.outputBottles}
                  onChange={(e) => setForm({ ...form, outputBottles: e.target.value })}
                  placeholder="ej. 50"
                  className={inputCls}
                  required
                />
              </div>

              <div>
                <label htmlFor="cb-lote" className={labelCls}>
                  Lote / Referencia (opcional)
                </label>
                <input
                  id="cb-lote"
                  type="text"
                  value={form.lote}
                  onChange={(e) => setForm({ ...form, lote: e.target.value })}
                  placeholder="ej. CB-2026-Lote1"
                  className={inputCls}
                />
              </div>
            </div>

            {/* Live Metrics Card */}
            <div className="mb-6 p-4 rounded-2xl border border-[#C59F59]/20 bg-[#fdfbf7] flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-6">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 block">Tercero Responsable</span>
                  <span className="text-sm font-semibold text-[#8a6b32]">Café 11:11 (Maquila)</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 block">Volumen Total</span>
                  <span className="text-sm font-semibold text-foreground">{totalLiters} Litros</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 block">Rendimiento Extracción</span>
                  <span className="text-sm font-semibold text-foreground">{ratio} botellas / kg</span>
                </div>
              </div>
              <div className="text-xs text-foreground/50">
                ✓ Botellas y tapas suministradas directamente por Café 11:11
              </div>
            </div>

            <div className="mb-6">
              <label htmlFor="cb-notes" className={labelCls}>
                Notas / Observaciones (opcional)
              </label>
              <input
                id="cb-notes"
                type="text"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Detalles del lote, entrega o características de la extracción..."
                className={inputCls}
              />
            </div>

            {feedback && (
              <div
                className={`p-4 rounded-xl text-sm mb-4 ${
                  feedback.type === "success"
                    ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                    : "bg-rose-50 text-rose-800 border border-rose-200"
                }`}
              >
                {feedback.msg}
              </div>
            )}

            <button
              type="submit"
              disabled={isPending}
              className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-[#C59F59] text-white font-medium hover:bg-[#b08d4b] transition-all shadow-sm disabled:opacity-50"
            >
              {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Registrar Lote Cold Brew
            </button>
          </form>
        </div>
      )}

      {/* History Table */}
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-serif">Historial de Lotes — Cold Brew (Café 11:11)</h3>
            <p className="text-xs text-foreground/50 mt-0.5">
              Registro de producciones y lotes elaborados por el tercero Café 11:11.
            </p>
          </div>
          <button
            onClick={loadHistory}
            className="p-2 text-foreground/40 hover:text-foreground hover:bg-foreground/5 rounded-xl transition-all"
            title="Refrescar historial"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-foreground/40 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm">Cargando lotes de Cold Brew...</span>
          </div>
        ) : batches.length === 0 ? (
          <div className="text-center py-12 text-foreground/40">
            <p className="text-sm">No hay lotes de Cold Brew registrados en este periodo.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-foreground/5">
                  <th className={`${thCls} cursor-pointer select-none`} onClick={() => handleSort("date")}>
                    <div className="flex items-center gap-1">Fecha {sortField === "date" && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}</div>
                  </th>
                  <th className={thCls}>Café Tostado Salida</th>
                  <th className={thCls}>Cold Brew 340ml Entrada</th>
                  <th className={thCls}>Rendimiento</th>
                  <th className={thCls}>Maquila</th>
                  <th className={thCls}>Notas / Lote</th>
                  <th className={`${thCls} text-right`}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {paginatedBatches.map((b) => {
                  const inputInv = getRelation(b.input_inventory);
                  const outputInv = getRelation(b.output_inventory);
                  const inputKg = Number(b.input_quantity_kg);
                  const outputUds = Number(b.output_quantity_kg);
                  const rend = inputKg > 0 ? (outputUds / inputKg).toFixed(1) : "-";

                  return (
                    <tr key={b.id} className="hover:bg-foreground/[0.01] transition-colors">
                      <td className={tdCls}>{fmtDate(b.movement_date || b.created_at)}</td>
                      <td className={tdCls}>
                        <span className="font-semibold text-rose-600">-{inputKg} kg</span>
                        <span className="text-xs text-foreground/50 block">{inputInv?.product_name || "Café Tostado"}</span>
                      </td>
                      <td className={tdCls}>
                        <span className="font-semibold text-emerald-600">+{outputUds} uds</span>
                        <span className="text-xs text-foreground/50 block">{outputInv?.product_name || "Cold Brew 340ml"} ({(outputUds * 0.34).toFixed(1)} L)</span>
                      </td>
                      <td className={tdCls}>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-[#C59F59]/10 text-[#8a6b32]">
                          {rend} bot/kg
                        </span>
                      </td>
                      <td className={tdCls}>
                        <span className="text-xs font-semibold text-foreground/70">Café 11:11</span>
                      </td>
                      <td className={`${tdCls} max-w-xs truncate text-xs text-foreground/60`}>
                        {b.notes || "—"}
                      </td>
                      <td className={tdCls}>
                        {deletingId === b.id ? (
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-[10px] font-bold text-red-600">¿Revertir lote?</span>
                            <button onClick={() => handleDeleteBatch(b.id)} className="px-2 py-1 bg-red-500 text-white text-[10px] font-bold rounded-lg hover:bg-red-600">Sí</button>
                            <button onClick={() => setDeletingId(null)} className="px-2 py-1 bg-foreground/10 text-[10px] font-bold rounded-lg hover:bg-foreground/20">No</button>
                          </div>
                        ) : (
                          <div className="flex justify-end">
                            <button onClick={() => setDeletingId(b.id)} title="Eliminar y revertir lote" className="p-1.5 rounded-lg hover:bg-red-50 text-foreground/40 hover:text-red-500 transition-colors">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <PaginationControls
          currentPage={currentPage}
          totalItems={batches.length}
          onPageChange={setCurrentPage}
        />
      </div>
    </div>
  );
}

// ─── Salidas Tab ──────────────────────────────────────────────────────────────

function SalidasTab({
  inventory,
  onStockUpdate,
  era,
}: {
  inventory: InventoryItem[];
  onStockUpdate: (id: string, newStock: number) => void;
  era: 'v1' | 'v2';
}) {
  const initForm = {
    inventoryId: "",
    qty: "",
    date: today(),
    motivo: "",
    responsable: "",
    molienda: "" as Molienda | "",
    esVenta: false,
    valor: "",
  };
  const [form, setForm] = useState(initForm);
  const [records, setRecords] = useState<MovementRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    msg: string;
  } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortField, setSortField] = useState("date");
  const [sortAsc, setSortAsc] = useState(false);

  const sortedRecords = useMemo(() => sortRecordsList(records, sortField, sortAsc), [records, sortField, sortAsc]);
  const paginatedRecords = sortedRecords.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  function handleSort(field: string) {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  const [editingRecord, setEditingRecord] = useState<MovementRecord | null>(null);

  const selectedItem = useMemo(
    () => inventory.find((i) => i.id === form.inventoryId) ?? null,
    [inventory, form.inventoryId]
  );

  function loadHistory() {
    setLoading(true);
    getMovementsByTab("salida", era)
      .then((d) => setRecords(d as MovementRecord[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadHistory();
  }, [era]);
  useEffect(() => {
    if (feedback?.type === "success") {
      const t = setTimeout(() => setFeedback(null), 4000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.inventoryId || !form.qty) {
      setFeedback({ type: "error", msg: "Completa los campos obligatorios" });
      return;
    }
    if (isGrindTracked(selectedItem?.product_code) && !form.molienda) {
      setFeedback({ type: "error", msg: "Selecciona la molienda (Grano o Molido)" });
      return;
    }
    const valor = parseFloat(form.valor);
    if (form.esVenta && !(valor > 0)) {
      setFeedback({ type: "error", msg: "Ingresa el valor cobrado de la venta" });
      return;
    }
    startTransition(async () => {
      try {
        const res = await createSalida(
          form.inventoryId,
          parseFloat(form.qty),
          form.date,
          form.motivo || undefined,
          form.responsable || undefined,
          form.molienda || undefined,
          form.esVenta ? { amount: valor } : null
        );

        if (!res.success) {
          setFeedback({ type: "error", msg: res.error || "Error al registrar" });
          return;
        }

        onStockUpdate(form.inventoryId, res.newStock ?? 0);
        setFeedback({
          type: "success",
          msg: form.esVenta
            ? "✓ Venta registrada: stock descontado e ingreso creado en Flujo de Caja"
            : "✓ Salida registrada exitosamente",
        });
        setForm(initForm);
        loadHistory();
      } catch (err: unknown) {
        setFeedback({
          type: "error",
          msg: err instanceof Error ? err.message : "Error al registrar",
        });
      }
    });
  }

  function handleDeleteRecord(record: MovementRecord) {
    startTransition(async () => {
      try {
        const res = await deleteMovement(record.id);
        onStockUpdate(res.inventoryId as string, res.newStock);
        setDeletingId(null);
        loadHistory();
      } catch (err: unknown) {
        setFeedback({ type: "error", msg: err instanceof Error ? err.message : "Error al eliminar" });
      }
    });
  }

  return (
    <div className="space-y-6">
      {era === 'v2' && (
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-8">
        <div className="mb-6">
          <h2 className="text-xl font-serif">Registrar Salida</h2>
          <p className="text-sm text-foreground/50 mt-1">
            Registra una salida de stock: ventas directas, muestras, merma, etc.
            Si es una venta pagada, márcala para que el ingreso quede en el Flujo
            de Caja con la misma fecha de pago.
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            <div>
              <label htmlFor="sal-date" className={labelCls}>
                Fecha <span className="text-red-400">*</span>
              </label>
              <input
                id="sal-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                suppressHydrationWarning={true}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label htmlFor="sal-product" className={labelCls}>
                Producto <span className="text-red-400">*</span>
              </label>
              <ProductSelect
                id="sal-product"
                value={form.inventoryId}
                onChange={(v) => {
                  const next = inventory.find((i) => i.id === v);
                  setForm({
                    ...form,
                    inventoryId: v,
                    molienda: isGrindTracked(next?.product_code) ? form.molienda : "",
                  });
                }}
                inventory={inventory}
                searchable
              />
            </div>
            <MoliendaField
              idPrefix="sal"
              value={form.molienda}
              onChange={(v) => setForm({ ...form, molienda: v })}
              productCode={selectedItem?.product_code}
            />
            <div>
              <label htmlFor="sal-qty" className={labelCls}>
                Cantidad <span className="text-red-400">*</span>
              </label>
              <input
                id="sal-qty"
                type="number"
                min="0.001"
                step="0.001"
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                placeholder="ej. 10"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label htmlFor="sal-motivo" className={labelCls}>
                Motivo (opcional)
              </label>
              <input
                id="sal-motivo"
                type="text"
                value={form.motivo}
                onChange={(e) => setForm({ ...form, motivo: e.target.value })}
                placeholder="ej. Venta, Muestra, Merma..."
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="sal-resp" className={labelCls}>
                Responsable (opcional)
              </label>
              <input
                id="sal-resp"
                type="text"
                value={form.responsable}
                onChange={(e) =>
                  setForm({ ...form, responsable: e.target.value })
                }
                placeholder="Nombre..."
                className={inputCls}
              />
            </div>
          </div>
          <div className="mb-5 p-4 rounded-2xl bg-[#fdfbf7] border border-foreground/5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 items-end">
            <label htmlFor="sal-venta" className="flex items-center gap-3 cursor-pointer md:col-span-1">
              <input
                id="sal-venta"
                type="checkbox"
                checked={form.esVenta}
                onChange={(e) => setForm({ ...form, esVenta: e.target.checked, valor: e.target.checked ? form.valor : "" })}
                className="w-4 h-4 accent-[#C59F59]"
              />
              <span className="text-sm">
                <span className="font-bold">Venta pagada</span>
                <span className="block text-xs text-foreground/50">
                  Registra el ingreso en Flujo de Caja (Ventas Físicas)
                </span>
              </span>
            </label>
            {form.esVenta && (
              <div>
                <label htmlFor="sal-valor" className={labelCls}>
                  Valor cobrado (COP) <span className="text-red-400">*</span>
                </label>
                <input
                  id="sal-valor"
                  type="number"
                  min="1"
                  step="any"
                  value={form.valor}
                  onChange={(e) => setForm({ ...form, valor: e.target.value })}
                  placeholder="ej. 45000"
                  className={inputCls}
                  required
                />
              </div>
            )}
          </div>
          <FeedbackBanner feedback={feedback} />
          <button
            type="submit"
            disabled={isPending}
            className="mt-4 flex items-center gap-2 px-8 py-3.5 bg-red-500 hover:bg-red-600 text-white font-bold uppercase tracking-widest text-sm rounded-2xl transition-all disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <PackageMinus className="w-4 h-4" />
            )}
            {isPending ? "Registrando..." : "Registrar Salida"}
          </button>
        </form>
      </div>
      )}

      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-foreground/5 flex items-center justify-between bg-[#fdfbf7]">
          <h3 className="font-serif text-lg">
            Historial{" "}
            <span className="text-foreground/40 text-base font-sans">
              · {records.length}
            </span>
          </h3>
          <button
            onClick={loadHistory}
            className="p-2 rounded-xl hover:bg-foreground/5 text-foreground/40"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
        {loading || records.length === 0 ? (
          <HistoryLoadingOrEmpty loading={loading} empty={records.length === 0} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdfbf7] border-b border-foreground/5">
                  <SortableTh label="Fecha" field="date" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Código" field="inventory.product_code" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Producto" field="inventory.product_name" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Cantidad" field="quantity" className="text-right" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Molienda" field="molienda" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Motivo" field="reason" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Responsable" field="responsable" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <th className={thCls}>Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {paginatedRecords.map((r) => {
                  const inv = getRelation(r.inventory);
                  return (
                    <tr key={r.id} className="hover:bg-[#fdfbf7]">
                      <td className={tdCls}>
                        {r.movement_date
                          ? fmtDate(r.movement_date)
                          : fmtDate(r.created_at)}
                      </td>
                      <td className={tdCls}>
                        <span className="font-mono text-xs bg-foreground/5 px-2 py-1 rounded-lg">
                          {inv?.product_code ?? "—"}
                        </span>
                      </td>
                      <td className={tdCls}>{inv?.product_name ?? "—"}</td>
                      <td className={`${tdCls} text-right font-bold text-red-600`}>
                        {r.quantity}
                      </td>
                      <td className={tdCls}>
                        <MoliendaBadge value={r.molienda} />
                      </td>
                      <td className={`${tdCls} text-foreground/50`}>
                        {r.reason || "—"}
                        {r.income_id && (
                          <span
                            className="ml-2 inline-block px-2 py-0.5 text-[10px] font-black rounded-full bg-green-100 text-green-700"
                            title="Venta pagada — vinculada al Flujo de Caja"
                          >
                            {fmtCOP(saleAmountOf(r) ?? 0)}
                          </span>
                        )}
                      </td>
                      <td className={`${tdCls} text-foreground/50`}>
                        {r.responsable || "—"}
                      </td>
                      <td className={tdCls}>
                        <AccionesCell id={r.id} deletingId={deletingId} onEdit={() => setEditingRecord(r)} onConfirmDelete={() => handleDeleteRecord(r)} onCancelDelete={() => setDeletingId(null)} onDelete={() => setDeletingId(r.id)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={currentPage}
            totalItems={records.length}
            onPageChange={setCurrentPage}
          />
        </>
        )}
      </div>
      {editingRecord && (
        <EditMovementModal record={editingRecord} onClose={() => setEditingRecord(null)} onSuccess={(invId, s) => { onStockUpdate(invId, s); loadHistory(); setEditingRecord(null); }} />
      )}
    </div>
  );
}

// ─── Reportes Tab ────────────────────────────────────────────────────────────

const PIE_COLORS = [
  "#C59F59",
  "#10b981",
  "#ef4444",
  "#6366f1",
  "#f59e0b",
  "#3b82f6",
];

const TAB_LABELS: Record<string, string> = {
  entrada: "Entradas",
  salida: "Salidas",
  trilla: "Trilla",
  prod_consumo: "Prod. Consumos",
  prod_alta: "Prod. Altas",
};

function KpiCard({
  label,
  value,
  sub,
  color = "text-foreground",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6">
      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-2">
        {label}
      </p>
      <p className={`text-3xl font-serif font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-foreground/40 mt-1">{sub}</p>}
    </div>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6">
      <h3 className="font-serif text-lg mb-5">{title}</h3>
      {children}
    </div>
  );
}

function ReportesTab({ inventory, era }: { inventory: InventoryItem[]; era: 'v1' | 'v2' }) {
  const [reportData, setReportData] = useState<{
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    movements: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    trillaBatches: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tostionBatches: any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allMovements: any[];
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInventoryReportData(era)
      .then(setReportData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [era]);

  // ── derived data ──────────────────────────────────────────────────────────

  // 1. Stock vs Mínimo — bar chart
  const stockData = inventory
    .filter((i) => i.current_stock !== 0 || i.min_stock !== 0)
    .sort((a, b) => b.current_stock - a.current_stock)
    .map((i) => ({
      name: i.product_code,
      Stock: i.current_stock,
      Mínimo: i.min_stock,
    }));

  // 2. Category donut
  const categoryData = Object.entries(
    inventory.reduce((acc, i) => {
      acc[i.category] = (acc[i.category] ?? 0) + 1;
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  // 3. Pie by tab_source
  const pieData = useMemo(() => {
    if (!reportData) return [];
    const counts: Record<string, number> = {};
    for (const m of reportData.allMovements) {
      if (!m.tab_source) continue;
      counts[m.tab_source] = (counts[m.tab_source] ?? 0) + 1;
    }
    return Object.entries(counts).map(([key, value]) => ({
      name: TAB_LABELS[key] ?? key,
      value,
    }));
  }, [reportData]);

  // 4. Weekly line chart — entradas vs salidas (last 8 weeks)
  const weeklyData = useMemo(() => {
    if (!reportData) return [];
    const weeks: Record<string, { semana: string; Entradas: number; Salidas: number }> = {};
    for (const m of reportData.movements) {
      const date = new Date(m.movement_date ?? m.created_at);
      // ISO week label: YYYY-Www
      const year = date.getFullYear();
      const week = Math.ceil(
        ((date.getTime() - new Date(year, 0, 1).getTime()) / 86400000 +
          new Date(year, 0, 1).getDay() +
          1) /
          7
      );
      const key = `${year}-S${String(week).padStart(2, "0")}`;
      if (!weeks[key]) weeks[key] = { semana: key, Entradas: 0, Salidas: 0 };
      if (m.quantity > 0) weeks[key].Entradas += m.quantity;
      else weeks[key].Salidas += Math.abs(m.quantity);
    }
    return Object.values(weeks).slice(-8);
  }, [reportData]);

  // 5. Trilla bar chart
  const trillaData = useMemo(() => {
    if (!reportData) return [];
    return reportData.trillaBatches.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (b: any, i: number) => ({
        name: b.movement_date
          ? new Date(b.movement_date).toLocaleDateString("es-CO", {
              day: "numeric",
              month: "short",
            })
          : `#${i + 1}`,
        Pergamino: Number(b.input_quantity_kg),
        Verde: Number(b.output_quantity_kg),
        Rendimiento: b.rendimiento_pct
          ? Math.round(Number(b.rendimiento_pct) * 100)
          : null,
      })
    );
  }, [reportData]);

  // 6. Tostion Weekly aggregation (Verde vs Tostado)
  const tostionData = useMemo(() => {
    if (!reportData) return [];

    const weightMap: Record<string, number> = {
      "CAFT-125G": 0.125,
      "CAFT-250G": 0.25,
      "CAFT-500G": 0.5,
      "CAFT-2K5": 2.5,
      "CAFT-001": 1.0,
      "CAFT-HON-125G": 0.125,
      "CAFT-HON-250G": 0.25,
      "CAFT-HON-500G": 0.5,
      "CAFT-HON-001": 1.0,
      "CAFT-MIC-125G": 0.125,
      "CAFT-MIC-250G": 0.25,
      "CAFT-MIC-500G": 0.5,
      "CAFT-MIC-001": 1.0,
    };

    const weeks: Record<
      string,
      { name: string; Verde: number; Tostado: number; Rendimiento: number | null }
    > = {};

    for (const m of reportData.movements) {
      if (m.tab_source !== "prod_consumo" && m.tab_source !== "prod_alta") continue;

      const inv = inventory.find((i) => i.id === m.inventory_id);
      if (!inv) continue;

      const date = new Date(m.movement_date ?? m.created_at);
      const year = date.getFullYear();
      const week = Math.ceil(
        ((date.getTime() - new Date(year, 0, 1).getTime()) / 86400000 +
          new Date(year, 0, 1).getDay() +
          1) /
          7
      );
      const key = `${year}-S${String(week).padStart(2, "0")}`;

      if (!weeks[key]) {
        weeks[key] = { name: key, Verde: 0, Tostado: 0, Rendimiento: null };
      }

      if (m.tab_source === "prod_consumo" && inv.product_code.startsWith("CAFV")) {
        weeks[key].Verde += Math.abs(m.quantity);
      } else if (m.tab_source === "prod_alta") {
        const weight = weightMap[inv.product_code];
        if (weight) {
          weeks[key].Tostado += Math.abs(m.quantity) * weight;
        }
      }
    }

    return Object.values(weeks)
      .map((w) => {
        if (w.Verde > 0) {
          w.Rendimiento = Math.round((w.Tostado / w.Verde) * 100);
        }
        return w;
      })
      .slice(-8); // Show last 8 active weeks
  }, [reportData, inventory]);

  // ── KPI summary ───────────────────────────────────────────────────────────
  const totalEntradas = reportData
    ? reportData.allMovements
        .filter((m) => m.tab_source === "entrada")
        .length
    : 0;
  const totalSalidas = reportData
    ? reportData.allMovements
        .filter((m) => m.tab_source === "salida")
        .length
    : 0;
  const totalTrilla = reportData ? reportData.trillaBatches.length : 0;
  const totalPergaminoKg = reportData
    ? reportData.trillaBatches.reduce(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (acc: number, b: any) => acc + Number(b.input_quantity_kg),
        0
      )
    : 0;
  const lowStock = inventory.filter((i) => i.current_stock <= i.min_stock).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-10 h-10 text-[#C59F59] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-serif">Reportes y Estadísticas</h2>
        <p className="text-sm text-foreground/50 mt-1">
          Resumen visual del estado del inventario y flujo de producción.
        </p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="SKUs totales" value={inventory.length} />
        <KpiCard
          label="Stock bajo"
          value={lowStock}
          sub="productos en alerta"
          color={lowStock > 0 ? "text-amber-600" : "text-emerald-600"}
        />
        <KpiCard label="Entradas (total)" value={totalEntradas} color="text-emerald-600" />
        <KpiCard label="Salidas (total)" value={totalSalidas} color="text-red-600" />
        <KpiCard
          label="Trillas realizadas"
          value={totalTrilla}
          sub={`${totalPergaminoKg.toFixed(1)} kg procesados`}
          color="text-[#C59F59]"
        />
      </div>

      {/* Row 1: Stock bar + Category donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ChartCard title="Stock Actual vs Mínimo por Producto">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart
                data={stockData}
                margin={{ top: 5, right: 10, left: 0, bottom: 60 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f0ece4" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#9c8f78" }}
                  angle={-40}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis tick={{ fontSize: 11, fill: "#9c8f78" }} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e8e0d0",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
                <Bar dataKey="Stock" fill="#C59F59" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Mínimo" fill="#e8d8b4" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="SKUs por Categoría">
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={categoryData}
                cx="50%"
                cy="45%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={4}
                dataKey="value"
                label={({ name, value }) => `${name} (${value})`}
                labelLine={false}
              >
                {categoryData.map((_, idx) => (
                  <Cell
                    key={idx}
                    fill={PIE_COLORS[idx % PIE_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e8e0d0",
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Row 2: Weekly line + Movements pie */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <ChartCard title="Tendencia Semanal — Entradas vs Salidas (últimas 8 semanas)">
            {weeklyData.length === 0 ? (
              <div className="flex items-center justify-center h-48 text-foreground/40 text-sm">
                Sin datos de movimientos aún.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart
                  data={weeklyData}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ece4" />
                  <XAxis
                    dataKey="semana"
                    tick={{ fontSize: 10, fill: "#9c8f78" }}
                  />
                  <YAxis tick={{ fontSize: 11, fill: "#9c8f78" }} />
                  <Tooltip
                    contentStyle={{
                      borderRadius: 12,
                      border: "1px solid #e8e0d0",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line
                    type="monotone"
                    dataKey="Entradas"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#10b981" }}
                    activeDot={{ r: 6 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="Salidas"
                    stroke="#ef4444"
                    strokeWidth={2.5}
                    dot={{ r: 4, fill: "#ef4444" }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>

        <ChartCard title="Movimientos por Tipo">
          {pieData.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-foreground/40 text-sm">
              Sin movimientos aún.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, idx) => (
                    <Cell
                      key={idx}
                      fill={PIE_COLORS[idx % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e8e0d0",
                    fontSize: 12,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  iconType="circle"
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Row 3: Trilla efficiency bar */}
      <ChartCard title="Historial de Trillas — Pergamino Entrada vs Verde Salida (kg)">
        {trillaData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-foreground/40 text-sm">
            Sin trillas registradas aún.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={trillaData}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ece4" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9c8f78" }} />
              <YAxis
                yAxisId="kg"
                tick={{ fontSize: 11, fill: "#9c8f78" }}
                label={{
                  value: "kg",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 10, fill: "#9c8f78" },
                }}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={{ fontSize: 11, fill: "#9c8f78" }}
                unit="%"
                domain={[60, 100]}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e8e0d0",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                yAxisId="kg"
                dataKey="Pergamino"
                fill="#d4b47a"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                yAxisId="kg"
                dataKey="Verde"
                fill="#10b981"
                radius={[6, 6, 0, 0]}
              />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="Rendimiento"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 4 }}
                name="Rendimiento %"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Row 4: Tostión efficiency bar */}
      <ChartCard title="Historial de Tostión — Verde Entrada vs Procesado Salida (kg)">
        {tostionData.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-foreground/40 text-sm">
            Sin datos de tostión aún.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart
              data={tostionData}
              margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#f0ece4" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9c8f78" }} />
              <YAxis
                yAxisId="kg"
                tick={{ fontSize: 11, fill: "#9c8f78" }}
                label={{
                  value: "kg",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 10, fill: "#9c8f78" },
                }}
              />
              <YAxis
                yAxisId="pct"
                orientation="right"
                tick={{ fontSize: 11, fill: "#9c8f78" }}
                unit="%"
                domain={[60, 100]}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid #e8e0d0",
                  fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                yAxisId="kg"
                dataKey="Verde"
                fill="#10b981"
                radius={[6, 6, 0, 0]}
              />
              <Bar
                yAxisId="kg"
                dataKey="Tostado"
                fill="#C59F59"
                radius={[6, 6, 0, 0]}
              />
              <Line
                yAxisId="pct"
                type="monotone"
                dataKey="Rendimiento"
                stroke="#6366f1"
                strokeWidth={2}
                dot={{ r: 4 }}
                name="Rendimiento %"
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

// ─── Auditoría Tab ─────────────────────────────────────────────────────────────

function AuditoriaTab({ inventory }: { inventory: InventoryItem[] }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState("date");
  const [sortAsc, setSortAsc] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");

  useEffect(() => {
    getAuditLogs()
      .then(setLogs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const users = useMemo(() => {
    if (!Array.isArray(logs)) return [];
    const uMap = new Map();
    logs.forEach(l => {
      if (l && l.profiles) {
        const fullName = `${l.profiles.first_name} ${l.profiles.last_name}`;
        uMap.set(l.admin_id, fullName);
      }
    });
    return Array.from(uMap.entries()).map(([id, name]) => ({ id, name }));
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (!Array.isArray(logs)) return [];
    let data = [...logs];

    if (search) {
      const q = search.toLowerCase();
      data = data.filter(l => 
        l.entity_id?.toLowerCase().includes(q) ||
        JSON.stringify(l.details || {}).toLowerCase().includes(q)
      );
    }

    if (userFilter !== "all") {
      data = data.filter(l => l.admin_id === userFilter);
    }

    if (actionFilter !== "all") {
      data = data.filter(l => l.action_type === actionFilter);
    }

    if (entityFilter !== "all") {
      data = data.filter(l => l.entity_type === entityFilter);
    }

    return sortRecordsList(data, sortField, sortAsc);
  }, [logs, search, userFilter, actionFilter, entityFilter, sortField, sortAsc]);

  const paginatedLogs = filteredLogs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  function handleSort(field: string) {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(true);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-foreground/5 bg-[#fdfbf7] flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="font-serif text-lg">Historial de Auditoría</h3>
            <p className="text-sm text-foreground/50">Registro completo de creaciones, modificaciones y eliminaciones</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-black text-[#C59F59] mr-2">FILTROS:</span>
            <div className="relative min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-foreground/30" />
              <input 
                type="text"
                placeholder="Buscar en detalles..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                className="w-full pl-9 pr-4 py-2 bg-white border border-foreground/10 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
              />
            </div>
            <select
              value={userFilter}
              onChange={(e) => { setUserFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 bg-white border border-foreground/10 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
            >
              <option value="all">Todos los Usuarios</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
            <select
              value={actionFilter}
              onChange={(e) => { setActionFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 bg-white border border-foreground/10 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
            >
              <option value="all">Todas las Acciones</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
            </select>
            <select
              value={entityFilter}
              onChange={(e) => { setEntityFilter(e.target.value); setCurrentPage(1); }}
              className="px-3 py-2 bg-white border border-foreground/10 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
            >
              <option value="all">Todas las Entidades</option>
              <option value="MOVEMENT">MOVEMENT</option>
              <option value="TRILLA_BATCH">TRILLA_BATCH</option>
            </select>
          </div>
        </div>
        {loading ? (
          <div className="py-20 text-center text-foreground/40 text-sm font-bold tracking-widest flex items-center justify-center gap-2">
             <Loader2 className="w-4 h-4 animate-spin" /> CARGANDO AUDITORÍA...
          </div>
        ) : logs.length === 0 ? (
          <div className="py-20 text-center text-foreground/40 text-sm font-bold tracking-widest">
            NO HAY REGISTROS DE AUDITORÍA
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
              <thead>
                <tr className="bg-[#fdfbf7] border-b border-foreground/5">
                  <SortableTh label="Fecha" field="date" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Usuario (Admin)" field="profiles.first_name" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Acción" field="action_type" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <SortableTh label="Entidad / Ref" field="entity_type" sortField={sortField} sortAsc={sortAsc} onSort={handleSort} />
                  <th className={thCls}>Detalle Base</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {paginatedLogs.map((log) => {
                  const inv = inventory.find((i) => i.id === log.inventory_id);
                  const isDel = log.action_type === "DELETE";
                  const isUpd = log.action_type === "UPDATE";
                  
                  return (
                    <tr key={log.id} className="hover:bg-[#fdfbf7]">
                      <td className={`${tdCls} whitespace-nowrap`}>
                        {new Date(log.created_at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td className={tdCls}>
                        <div className="font-bold">{log.profiles?.first_name} {log.profiles?.last_name}</div>
                        <div className="text-[10px] text-foreground/50 truncate max-w-[120px]">{log.profiles?.email}</div>
                      </td>
                      <td className={tdCls}>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${isDel ? "bg-red-50 text-red-600" : isUpd ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}`}>
                          {log.action_type}
                        </span>
                      </td>
                      <td className={tdCls}>
                        <div className="font-bold">{log.entity_type}</div>
                        {inv && <div className="text-[10px] font-mono text-foreground/50">{inv.product_code}</div>}
                      </td>
                      <td className={`${tdCls} text-foreground/60`}>
                        <pre className="text-[10px] bg-foreground/5 p-2 rounded-lg whitespace-pre-wrap max-w-xs overflow-hidden">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationControls
            currentPage={currentPage}
            totalItems={filteredLogs.length}
            onPageChange={setCurrentPage}
          />
        </>
        )}
      </div>
    </div>
  );
}

// ─── Main Client Component ────────────────────────────────────────────────────

export default function InventoryClient({
  inventory: initialInventory,
}: {
  inventory: InventoryItem[];
}) {
  const [inventory, setInventory] = useState<InventoryItem[]>(initialInventory);
  const [activeTab, setActiveTab] = useState<TabId>("inventario");
  const [era, setEra] = useState<'v1' | 'v2'>('v2');

  const isLegacy = era === 'v1';

  const displayedInventory = useMemo(() => {
    if (isLegacy) {
      return inventory.map((item) => ({
        ...item,
        current_stock: Number(item.legacy_stock ?? item.current_stock),
      }));
    }
    return inventory;
  }, [inventory, isLegacy]);

  useEffect(() => {
    getInventory()
      .then((data) => {
        if (data && data.length > 0) {
          setInventory(data as InventoryItem[]);
        }
      })
      .catch(console.error);
  }, [era]);

  function updateStock(id: string, newStock: number) {
    setInventory((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, current_stock: newStock } : item
      )
    );
  }

  function updateStocks(updates: { id: string; newStock: number }[]) {
    setInventory((prev) =>
      prev.map((item) => {
        const u = updates.find((x) => x.id === item.id);
        return u ? { ...item, current_stock: u.newStock } : item;
      })
    );
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-1">Inventario</h1>
          <p className="text-foreground/60">
            Control de stock y flujo de producción de Café Amantti.
          </p>
        </div>
        <button
          id="toggle-legacy-era"
          onClick={() => setEra(prev => prev === 'v2' ? 'v1' : 'v2')}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${
            isLegacy
              ? 'bg-amber-100 text-amber-800 border-amber-300 shadow-sm'
              : 'bg-white text-foreground/50 border-foreground/10 hover:bg-foreground/5'
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          {isLegacy ? 'Viendo: Archivo (pre-Sept 2026)' : 'Ver datos anteriores'}
        </button>
      </div>

      {/* Legacy mode banner */}
      {isLegacy && (
        <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <Archive className="w-5 h-5 flex-shrink-0" />
          <div>
            <span className="font-bold">Modo archivo</span> — Estás viendo datos anteriores a septiembre 2026. Estos datos son de solo lectura.
          </div>
          <button
            onClick={() => setEra('v2')}
            className="ml-auto px-3 py-1.5 rounded-lg bg-amber-200/60 hover:bg-amber-200 text-xs font-bold uppercase tracking-widest transition-colors"
          >
            Volver a datos actuales
          </button>
        </div>
      )}

      {/* Tab bar */}
      <div className="flex overflow-x-auto gap-1 bg-white rounded-2xl p-1.5 border border-foreground/5 shadow-sm">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            id={`tab-${id}`}
            onClick={() => setActiveTab(id)}
            suppressHydrationWarning={true}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest whitespace-nowrap transition-all ${
              activeTab === id
                ? "bg-[#C59F59] text-white shadow-sm"
                : "text-foreground/60 hover:bg-foreground/5 hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "inventario" && (
        <InventarioTab inventory={displayedInventory} onStockUpdate={updateStock} era={era} />
      )}
      {activeTab === "entradas" && (
        <EntradasTab inventory={displayedInventory} onStockUpdate={updateStock} era={era} />
      )}
      {activeTab === "trilla" && (
        <TrillaTab inventory={displayedInventory} onStocksUpdate={updateStocks} era={era} />
      )}
      {activeTab === "tostion" && (
        <TostionTab inventory={displayedInventory} onStocksUpdate={updateStocks} era={era} />
      )}
      {activeTab === "prod_altas" && (
        <ProdAltasTab inventory={displayedInventory} onStocksUpdate={updateStocks} era={era} />
      )}
      {activeTab === "cold_brew" && (
        <ColdBrewTab inventory={displayedInventory} onStocksUpdate={updateStocks} era={era} />
      )}
      {activeTab === "salidas" && (
        <SalidasTab inventory={displayedInventory} onStockUpdate={updateStock} era={era} />
      )}
      {activeTab === "reportes" && <ReportesTab inventory={displayedInventory} era={era} />}
      {activeTab === "auditoria" && <AuditoriaTab inventory={displayedInventory} />}
    </div>
  );
}

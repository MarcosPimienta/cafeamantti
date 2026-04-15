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
  createEntrada,
  createSalida,
  createProdConsumo,
  createProdAlta,
  createTrillaBatch,
  getInventoryReportData,
  deleteMovement,
  updateMovement,
  deleteTrillaBatch,
  getAuditLogs,
} from "../../actions";

// ─── Types ────────────────────────────────────────────────────────────────────

interface InventoryItem {
  id: string;
  product_code: string;
  product_name: string;
  category: string;
  unit: string;
  current_stock: number;
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
  { id: "prod_consumos", label: "Prod. Consumos", Icon: Factory },
  { id: "prod_altas", label: "Prod. Altas", Icon: TrendingUp },
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
  return new Date(iso).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  inventory: InventoryItem[];
  filter?: (i: InventoryItem) => boolean;
  placeholder?: string;
}) {
  const items = filter ? inventory.filter(filter) : inventory;
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} appearance-none cursor-pointer`}
    >
      <option value="">{placeholder}</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.product_code} — {item.product_name}
        </option>
      ))}
    </select>
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
}: {
  item: InventoryItem;
  onClose: () => void;
}) {
  const [movements, setMovements] = useState<MovementRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getInventoryMovements(item.id)
      .then((data) => setMovements(data as MovementRecord[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [item.id]);

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

// ─── Inventario Tab ───────────────────────────────────────────────────────────

function InventarioTab({
  inventory,
  onStockUpdate,
}: {
  inventory: InventoryItem[];
  onStockUpdate: (id: string, newStock: number) => void;
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

  function SortIcon({ field }: { field: keyof InventoryItem }) {
    if (sortField !== field) return null;
    return sortAsc ? (
      <ChevronUp className="w-3 h-3" />
    ) : (
      <ChevronDown className="w-3 h-3" />
    );
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
              className="w-full pl-11 pr-4 py-2.5 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
            />
          </div>
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative">
              <SlidersHorizontal className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 pointer-events-none" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
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
                <th
                  className={`${thCls} cursor-pointer`}
                  onClick={() => toggleSort("product_code")}
                >
                  <span className="flex items-center gap-1">
                    Código <SortIcon field="product_code" />
                  </span>
                </th>
                <th
                  className={`${thCls} cursor-pointer`}
                  onClick={() => toggleSort("product_name")}
                >
                  <span className="flex items-center gap-1">
                    Producto <SortIcon field="product_name" />
                  </span>
                </th>
                <th className={thCls}>Categoría</th>
                <th
                  className={`${thCls} cursor-pointer text-right`}
                  onClick={() => toggleSort("current_stock")}
                >
                  <span className="flex items-center gap-1 justify-end">
                    Stock <SortIcon field="current_stock" />
                  </span>
                </th>
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
                        <button
                          id={`adjust-${item.product_code}`}
                          onClick={() => setAdjustItem(item)}
                          title="Ajuste manual"
                          className="p-2 rounded-xl bg-[#C59F59]/10 text-[#C59F59] hover:bg-[#C59F59] hover:text-white transition-all"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                        </button>
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
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsedQty = parseFloat(qty);
    if (isNaN(parsedQty) || parsedQty <= 0) { setError("Cantidad inválida"); return; }
    const signedQty = origSign * parsedQty;
    startTransition(async () => {
      try {
        const res = await updateMovement(record.id, signedQty, date, reason || undefined, responsable || undefined, record.entry_type || undefined);
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
}: {
  inventory: InventoryItem[];
  onStockUpdate: (id: string, newStock: number) => void;
}) {
  const initForm = {
    inventoryId: "",
    qty: "",
    date: today(),
    entryType: "MP" as "MP" | "MAT",
    responsable: "",
    lote: "",
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
  const paginatedRecords = records.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const [editingRecord, setEditingRecord] = useState<MovementRecord | null>(null);

  function loadHistory() {
    setLoading(true);
    getMovementsByTab("entrada")
      .then((d) => setRecords(d as MovementRecord[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadHistory();
  }, []);
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
    startTransition(async () => {
      try {
        const res = await createEntrada(
          form.inventoryId,
          parseFloat(form.qty),
          form.date,
          form.entryType,
          form.responsable || undefined,
          form.lote || undefined
        );
        onStockUpdate(form.inventoryId, res.newStock);
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
      {/* Form */}
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
                onChange={(v) => setForm({ ...form, inventoryId: v })}
                inventory={inventory}
              />
            </div>
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

      {/* History */}
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
                  <th className={thCls}>Fecha</th>
                  <th className={thCls}>Código</th>
                  <th className={thCls}>Producto</th>
                  <th className={`${thCls} text-right`}>Cantidad</th>
                  <th className={thCls}>Lote</th>
                  <th className={thCls}>Tipo</th>
                  <th className={thCls}>Responsable</th>
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

// ─── Trilla Tab ───────────────────────────────────────────────────────────────

function TrillaTab({
  inventory,
  onStocksUpdate,
}: {
  inventory: InventoryItem[];
  onStocksUpdate: (updates: { id: string; newStock: number }[]) => void;
}) {
  const pergamino = inventory.find((i) => i.product_code === "CAPG-001") ?? null;
  const verde = inventory.find((i) => i.product_code === "CAFV-001") ?? null;

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
  const paginatedBatches = batches.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

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
    getTrillaBatches()
      .then((d) => setBatches(d as TrillaBatch[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadHistory();
  }, []);
  useEffect(() => {
    if (feedback?.type === "success") {
      const t = setTimeout(() => setFeedback(null), 5000);
      return () => clearTimeout(t);
    }
  }, [feedback]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pergamino || !verde) {
      setFeedback({
        type: "error",
        msg: "No se encontró CAPG-001 o CAFV-001 en el inventario",
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
          pergamino.id,
          verde.id,
          inputNum,
          rendNum,
          date,
          notes || undefined
        );
        onStocksUpdate([
          { id: pergamino.id, newStock: res.newPergaminoStock },
          { id: verde.id, newStock: res.newVerdeStock },
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
        const res = await deleteTrillaBatch(batchId);
        onStocksUpdate([
          { id: res.pergaminoId, newStock: res.newPergaminoStock },
          { id: res.verdeId, newStock: res.newVerdeStock },
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

  if (!pergamino || !verde) {
    return (
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-12 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
        <p className="font-serif text-xl text-foreground/70">
          Productos no encontrados
        </p>
        <p className="text-sm text-foreground/50 mt-2">
          Asegúrate que CAPG-001 y CAFV-001 existen en el inventario.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Form */}
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
            <p className={`${labelCls} text-[9px]`}>Pergamino disponible (CAPG-001)</p>
            <p className="text-2xl font-serif font-bold">
              {pergamino.current_stock}{" "}
              <span className="text-sm font-sans text-foreground/50">kg</span>
            </p>
          </div>
          <div className="bg-[#f9f7f0] rounded-2xl p-4">
            <p className={`${labelCls} text-[9px]`}>Verde disponible (CAFV-001)</p>
            <p className="text-2xl font-serif font-bold">
              {verde.current_stock}{" "}
              <span className="text-sm font-sans text-foreground/50">kg</span>
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label htmlFor="tri-date" className={labelCls}>
                Fecha <span className="text-red-400">*</span>
              </label>
              <input
                id="tri-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
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
                  <th className={thCls}>Fecha</th>
                  <th className={`${thCls} text-right`}>Pergamino (kg)</th>
                  <th className={`${thCls} text-right`}>Rendimiento</th>
                  <th className={`${thCls} text-right`}>Verde (kg)</th>
                  <th className={`${thCls} text-right`}>Pérdida %</th>
                  <th className={thCls}>Notas</th>
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

function ProdConsumosTab({
  inventory,
  onStockUpdate,
}: {
  inventory: InventoryItem[];
  onStockUpdate: (id: string, newStock: number) => void;
}) {
  const initForm = {
    inventoryId: "",
    qty: "",
    date: today(),
    entryType: "MP" as "MP" | "MAT",
    responsable: "",
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
  const paginatedRecords = records.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const [editingRecord, setEditingRecord] = useState<MovementRecord | null>(null);

  function loadHistory() {
    setLoading(true);
    getMovementsByTab("prod_consumo")
      .then((d) => setRecords(d as MovementRecord[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadHistory();
  }, []);
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
    startTransition(async () => {
      try {
        const res = await createProdConsumo(
          form.inventoryId,
          parseFloat(form.qty),
          form.date,
          form.entryType,
          form.responsable || undefined
        );
        onStockUpdate(form.inventoryId, res.newStock);
        setFeedback({ type: "success", msg: "✓ Consumo de producción registrado" });
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
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-8">
        <div className="mb-6">
          <h2 className="text-xl font-serif">Producción — Consumos</h2>
          <p className="text-sm text-foreground/50 mt-1">
            Registra materias primas (MP) y materiales (MAT) consumidos en un lote de producción.
          </p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5">
            <div>
              <label htmlFor="pc-date" className={labelCls}>
                Fecha <span className="text-red-400">*</span>
              </label>
              <input
                id="pc-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
                className={inputCls}
                required
              />
            </div>
            <div>
              <label htmlFor="pc-product" className={labelCls}>
                Producto <span className="text-red-400">*</span>
              </label>
              <ProductSelect
                id="pc-product"
                value={form.inventoryId}
                onChange={(v) => setForm({ ...form, inventoryId: v })}
                inventory={inventory}
              />
            </div>
            <div>
              <label htmlFor="pc-qty" className={labelCls}>
                Cantidad <span className="text-red-400">*</span>
              </label>
              <input
                id="pc-qty"
                type="number"
                min="0.001"
                step="0.001"
                value={form.qty}
                onChange={(e) => setForm({ ...form, qty: e.target.value })}
                placeholder="ej. 24"
                className={inputCls}
                required
              />
            </div>
            <div>
              <label htmlFor="pc-type" className={labelCls}>
                Tipo (MP / MAT)
              </label>
              <select
                id="pc-type"
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
              <label htmlFor="pc-resp" className={labelCls}>
                Responsable (opcional)
              </label>
              <input
                id="pc-resp"
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
          <FeedbackBanner feedback={feedback} />
          <button
            type="submit"
            disabled={isPending}
            className="mt-4 flex items-center gap-2 px-8 py-3.5 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-widest text-sm rounded-2xl transition-all disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Factory className="w-4 h-4" />
            )}
            {isPending ? "Registrando..." : "Registrar Consumo"}
          </button>
        </form>
      </div>

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
                  <th className={thCls}>Fecha</th>
                  <th className={thCls}>Código</th>
                  <th className={thCls}>Producto</th>
                  <th className={`${thCls} text-right`}>Cantidad</th>
                  <th className={thCls}>Tipo</th>
                  <th className={thCls}>Responsable</th>
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

// ─── Producción Altas Tab ─────────────────────────────────────────────────────

const FINISHED_CODES = [
  "CAFT-001",
  "CAFT-125G",
  "CAFT-250G",
  "CAFT-500G",
  "CAFT-2K5",
];

function ProdAltasTab({
  inventory,
  onStockUpdate,
}: {
  inventory: InventoryItem[];
  onStockUpdate: (id: string, newStock: number) => void;
}) {
  const initForm = {
    inventoryId: "",
    qty: "",
    date: today(),
    lote: "",
    notes: "",
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
  const paginatedRecords = records.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const [editingRecord, setEditingRecord] = useState<MovementRecord | null>(null);

  function loadHistory() {
    setLoading(true);
    getMovementsByTab("prod_alta")
      .then((d) => setRecords(d as MovementRecord[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadHistory();
  }, []);
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
    startTransition(async () => {
      try {
        const res = await createProdAlta(
          form.inventoryId,
          parseFloat(form.qty),
          form.date,
          form.lote || undefined,
          form.notes || undefined
        );
        onStockUpdate(form.inventoryId, res.newStock);
        setFeedback({ type: "success", msg: "✓ Alta de producción registrada" });
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
                onChange={(v) => setForm({ ...form, inventoryId: v })}
                inventory={inventory}
                filter={(i) => FINISHED_CODES.includes(i.product_code)}
                placeholder="Seleccionar café tostado..."
              />
            </div>
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
                  <th className={thCls}>Fecha</th>
                  <th className={thCls}>Código</th>
                  <th className={thCls}>Producto</th>
                  <th className={`${thCls} text-right`}>Cantidad</th>
                  <th className={thCls}>Lote / Notas</th>
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
        <EditMovementModal record={editingRecord} onClose={() => setEditingRecord(null)} onSuccess={(invId, s) => { onStockUpdate(invId, s); loadHistory(); setEditingRecord(null); }} />
      )}
    </div>
  );
}

// ─── Salidas Tab ──────────────────────────────────────────────────────────────

function SalidasTab({
  inventory,
  onStockUpdate,
}: {
  inventory: InventoryItem[];
  onStockUpdate: (id: string, newStock: number) => void;
}) {
  const initForm = {
    inventoryId: "",
    qty: "",
    date: today(),
    motivo: "",
    responsable: "",
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
  const paginatedRecords = records.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const [editingRecord, setEditingRecord] = useState<MovementRecord | null>(null);

  function loadHistory() {
    setLoading(true);
    getMovementsByTab("salida")
      .then((d) => setRecords(d as MovementRecord[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadHistory();
  }, []);
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
    startTransition(async () => {
      try {
        const res = await createSalida(
          form.inventoryId,
          parseFloat(form.qty),
          form.date,
          form.motivo || undefined,
          form.responsable || undefined
        );
        onStockUpdate(form.inventoryId, res.newStock);
        setFeedback({ type: "success", msg: "✓ Salida registrada exitosamente" });
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
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-8">
        <div className="mb-6">
          <h2 className="text-xl font-serif">Registrar Salida</h2>
          <p className="text-sm text-foreground/50 mt-1">
            Registra una salida de stock: ventas directas, muestras, merma, etc.
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
                onChange={(v) => setForm({ ...form, inventoryId: v })}
                inventory={inventory}
              />
            </div>
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
                  <th className={thCls}>Fecha</th>
                  <th className={thCls}>Código</th>
                  <th className={thCls}>Producto</th>
                  <th className={`${thCls} text-right`}>Cantidad</th>
                  <th className={thCls}>Motivo</th>
                  <th className={thCls}>Responsable</th>
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
                      <td className={`${tdCls} text-foreground/50`}>
                        {r.reason || "—"}
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

function ReportesTab({ inventory }: { inventory: InventoryItem[] }) {
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
    getInventoryReportData()
      .then(setReportData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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

      if (m.tab_source === "prod_consumo" && inv.product_code === "CAFV-001") {
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
  const [currentPage, setCurrentPage] = useState(1);
  const paginatedLogs = logs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  useEffect(() => {
    getAuditLogs()
      .then(setLogs)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-foreground/5 bg-[#fdfbf7]">
          <h3 className="font-serif text-lg">Historial de Auditoría</h3>
          <p className="text-sm text-foreground/50">Registro completo de creaciones, modificaciones y eliminaciones</p>
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
                  <th className={thCls}>Fecha</th>
                  <th className={thCls}>Usuario (Admin)</th>
                  <th className={thCls}>Acción</th>
                  <th className={thCls}>Entidad / Ref</th>
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
            totalItems={logs.length}
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
      <div>
        <h1 className="text-3xl font-serif text-foreground mb-1">Inventario</h1>
        <p className="text-foreground/60">
          Control de stock y flujo de producción de Café Amantti.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex overflow-x-auto gap-1 bg-white rounded-2xl p-1.5 border border-foreground/5 shadow-sm">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            id={`tab-${id}`}
            onClick={() => setActiveTab(id)}
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
        <InventarioTab inventory={inventory} onStockUpdate={updateStock} />
      )}
      {activeTab === "entradas" && (
        <EntradasTab inventory={inventory} onStockUpdate={updateStock} />
      )}
      {activeTab === "trilla" && (
        <TrillaTab inventory={inventory} onStocksUpdate={updateStocks} />
      )}
      {activeTab === "prod_consumos" && (
        <ProdConsumosTab inventory={inventory} onStockUpdate={updateStock} />
      )}
      {activeTab === "prod_altas" && (
        <ProdAltasTab inventory={inventory} onStockUpdate={updateStock} />
      )}
      {activeTab === "salidas" && (
        <SalidasTab inventory={inventory} onStockUpdate={updateStock} />
      )}
      {activeTab === "reportes" && <ReportesTab inventory={inventory} />}
      {activeTab === "auditoria" && <AuditoriaTab inventory={inventory} />}
    </div>
  );
}

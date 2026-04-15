"use client";

import React, { useState, useTransition, useMemo } from "react";
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
} from "lucide-react";
import { adjustInventoryStock, getInventoryMovements } from "../../actions";

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

interface Movement {
  id: string;
  inventory_id: string;
  type: "entrada" | "salida" | "ajuste";
  quantity: number;
  reason: string | null;
  created_at: string;
  inventory?: { product_code: string; product_name: string }[] | { product_code: string; product_name: string } | null;
}

interface Props {
  inventory: InventoryItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<string, string> = {
  cafe: "Café",
  empaque: "Empaque",
  accesorio: "Accesorio",
};

const TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; bg: string }
> = {
  entrada: {
    label: "Entrada",
    icon: <TrendingUp className="w-3.5 h-3.5" />,
    color: "text-emerald-700",
    bg: "bg-emerald-50",
  },
  salida: {
    label: "Salida",
    icon: <TrendingDown className="w-3.5 h-3.5" />,
    color: "text-red-700",
    bg: "bg-red-50",
  },
  ajuste: {
    label: "Ajuste",
    icon: <ArrowLeftRight className="w-3.5 h-3.5" />,
    color: "text-blue-700",
    bg: "bg-blue-50",
  },
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Stock Badge ──────────────────────────────────────────────────────────────

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
        Stock bajo
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-700">
      <Check className="w-3 h-3" />
      OK
    </span>
  );
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
  const [type, setType] = useState<"entrada" | "salida" | "ajuste">("entrada");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) {
      setError("Ingresa una cantidad válida mayor a 0");
      return;
    }

    startTransition(async () => {
      try {
        const res = await adjustInventoryStock(item.id, type, qty, reason || undefined);
        onSuccess(item.id, res.newStock);
        onClose();
      } catch (err: any) {
        setError(err.message || "Error al ajustar el inventario");
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
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-foreground/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1">
                {item.product_code}
              </p>
              <h3 className="text-xl font-serif text-foreground">{item.product_name}</h3>
              <p className="text-sm text-foreground/50 mt-1">
                Stock actual:{" "}
                <span className="font-bold text-foreground">
                  {item.current_stock} {item.unit}
                </span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-foreground/5 transition-colors"
            >
              <X className="w-5 h-5 text-foreground/40" />
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          {/* Type selector */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-3 block">
              Tipo de movimiento
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(["entrada", "salida", "ajuste"] as const).map((t) => {
                const cfg = TYPE_CONFIG[t];
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex flex-col items-center gap-2 px-3 py-4 rounded-2xl border-2 text-xs font-bold uppercase tracking-wider transition-all ${
                      type === t
                        ? `border-[#C59F59] ${cfg.bg} ${cfg.color}`
                        : "border-foreground/10 text-foreground/50 hover:border-foreground/20"
                    }`}
                  >
                    {t === "entrada" ? (
                      <PackagePlus className="w-5 h-5" />
                    ) : t === "salida" ? (
                      <PackageMinus className="w-5 h-5" />
                    ) : (
                      <ArrowLeftRight className="w-5 h-5" />
                    )}
                    {cfg.label}
                  </button>
                );
              })}
            </div>
            {type === "ajuste" && (
              <p className="text-xs text-foreground/50 mt-2">
                Para ajuste, usa valores negativos para reducir el stock.
              </p>
            )}
          </div>

          {/* Quantity */}
          <div>
            <label
              htmlFor="inv-quantity"
              className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-2 block"
            >
              Cantidad ({item.unit})
            </label>
            <input
              id="inv-quantity"
              type="number"
              min={type === "ajuste" ? undefined : "1"}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={type === "ajuste" ? "ej. -5 o +10" : "ej. 20"}
              className="w-full px-4 py-3 border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/30 transition-all"
              required
            />
          </div>

          {/* Reason */}
          <div>
            <label
              htmlFor="inv-reason"
              className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-2 block"
            >
              Motivo (opcional)
            </label>
            <input
              id="inv-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ej. Compra proveedor, Merma, Conteo físico..."
              className="w-full px-4 py-3 border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/30 transition-all"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 py-4 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-widest text-sm rounded-2xl transition-all disabled:opacity-60"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Package className="w-4 h-4" />
            )}
            {isPending ? "Guardando..." : "Confirmar movimiento"}
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
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    getInventoryMovements(item.id)
      .then((data) => setMovements(data as Movement[]))
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
        {/* Header */}
        <div className="sticky top-0 bg-white px-8 pt-8 pb-6 border-b border-foreground/5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1">
              Historial
            </p>
            <h3 className="text-xl font-serif">{item.product_name}</h3>
            <p className="text-xs text-foreground/50 mt-0.5 font-mono">{item.product_code}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-foreground/5 transition-colors"
          >
            <X className="w-5 h-5 text-foreground/40" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-8">
          {loading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 className="w-8 h-8 text-[#C59F59] animate-spin" />
            </div>
          ) : movements.length === 0 ? (
            <div className="text-center py-20">
              <History className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
              <p className="font-serif text-foreground/60">Sin movimientos aún</p>
              <p className="text-sm text-foreground/40 mt-1">
                Los ajustes de stock aparecerán aquí.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {movements.map((mov) => {
                const cfg = TYPE_CONFIG[mov.type];
                return (
                  <div
                    key={mov.id}
                    className="flex items-start gap-4 p-4 rounded-2xl border border-foreground/5 hover:bg-foreground/[0.02] transition-colors"
                  >
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg} ${cfg.color}`}
                    >
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}
                        >
                          {cfg.label}
                        </span>
                        <span className="font-bold text-sm">
                          {mov.quantity > 0 ? "+" : ""}
                          {mov.quantity} {item.unit}
                        </span>
                      </div>
                      {mov.reason && (
                        <p className="text-xs text-foreground/60 mt-1">{mov.reason}</p>
                      )}
                      <p className="text-[10px] text-foreground/40 mt-1.5">
                        {formatDate(mov.created_at)}
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

// ─── Main Client Component ────────────────────────────────────────────────────

export default function InventoryClient({ inventory: initialInventory }: Props) {
  const [inventory, setInventory] = useState<InventoryItem[]>(initialInventory);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [sortField, setSortField] = useState<keyof InventoryItem>("product_name");
  const [sortAsc, setSortAsc] = useState(true);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [historyItem, setHistoryItem] = useState<InventoryItem | null>(null);

  // Derived stats
  const totalSKUs = inventory.length;
  const lowStockCount = inventory.filter(
    (i) => i.current_stock <= i.min_stock
  ).length;
  const zeroStockCount = inventory.filter((i) => i.current_stock === 0).length;

  // Filtered + sorted data
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
    if (categoryFilter !== "all") {
      data = data.filter((i) => i.category === categoryFilter);
    }
    if (lowStockOnly) {
      data = data.filter((i) => i.current_stock <= i.min_stock);
    }
    data.sort((a, b) => {
      const aVal = a[sortField] ?? "";
      const bVal = b[sortField] ?? "";
      const cmp = String(aVal).localeCompare(String(bVal), "es");
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

  function handleStockSuccess(id: string, newStock: number) {
    setInventory((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, current_stock: newStock } : item
      )
    );
  }

  return (
    <>
      <div className="space-y-8">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif text-foreground mb-2">Inventario</h1>
            <p className="text-foreground/60">
              Control de stock de productos Café Amantti.
            </p>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-[#C59F59]/10 flex items-center justify-center shrink-0">
              <Package className="w-7 h-7 text-[#C59F59]" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1">
                Total SKUs
              </p>
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
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1">
                Stock Bajo
              </p>
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
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1">
                Sin Stock
              </p>
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
          <div className="p-6 border-b border-foreground/5 flex flex-col md:flex-row gap-4 justify-between items-center bg-[#f9f7f0]">
            {/* Search */}
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40" />
              <input
                type="text"
                placeholder="Buscar por nombre o código..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
              />
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              {/* Category */}
              <div className="relative">
                <SlidersHorizontal className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 pointer-events-none" />
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="pl-9 pr-4 py-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all appearance-none cursor-pointer"
                >
                  <option value="all">Todas las categorías</option>
                  <option value="cafe">Café</option>
                  <option value="empaque">Empaque</option>
                  <option value="accesorio">Accesorio</option>
                </select>
              </div>

              {/* Low stock toggle */}
              <button
                onClick={() => setLowStockOnly(!lowStockOnly)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-widest border transition-all whitespace-nowrap ${
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
                    className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50 cursor-pointer select-none hover:text-foreground/80 transition-colors"
                    onClick={() => toggleSort("product_code")}
                  >
                    <span className="flex items-center gap-1">
                      Código <SortIcon field="product_code" />
                    </span>
                  </th>
                  <th
                    className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50 cursor-pointer select-none hover:text-foreground/80 transition-colors"
                    onClick={() => toggleSort("product_name")}
                  >
                    <span className="flex items-center gap-1">
                      Producto <SortIcon field="product_name" />
                    </span>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50">
                    Categoría
                  </th>
                  <th
                    className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50 cursor-pointer select-none hover:text-foreground/80 transition-colors text-right"
                    onClick={() => toggleSort("current_stock")}
                  >
                    <span className="flex items-center gap-1 justify-end">
                      Stock <SortIcon field="current_stock" />
                    </span>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50 text-right">
                    Mín.
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50 text-center">
                    Estado
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50 text-center">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center">
                      <Package className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
                      <p className="font-serif text-foreground/60 text-lg">
                        No se encontraron productos
                      </p>
                      <p className="text-sm text-foreground/40">
                        Intenta con otros filtros de búsqueda.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-[#fdfbf7] transition-colors"
                    >
                      {/* Code */}
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs bg-foreground/5 px-2 py-1 rounded-lg text-foreground/70">
                          {item.product_code}
                        </span>
                      </td>

                      {/* Name */}
                      <td className="px-6 py-4">
                        <p className="font-medium text-foreground">{item.product_name}</p>
                        <p className="text-xs text-foreground/40 mt-0.5">{item.unit}</p>
                      </td>

                      {/* Category */}
                      <td className="px-6 py-4">
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

                      {/* Stock */}
                      <td className="px-6 py-4 text-right">
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

                      {/* Min */}
                      <td className="px-6 py-4 text-right text-foreground/40 font-mono text-sm">
                        {item.min_stock}
                      </td>

                      {/* Status */}
                      <td className="px-6 py-4 text-center">
                        <StockBadge stock={item.current_stock} min={item.min_stock} />
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            id={`adjust-${item.product_code}`}
                            onClick={() => setAdjustItem(item)}
                            title="Ajustar stock"
                            className="p-2.5 rounded-xl bg-[#C59F59]/10 text-[#C59F59] hover:bg-[#C59F59] hover:text-white transition-all"
                          >
                            <PackagePlus className="w-4 h-4" />
                          </button>
                          <button
                            id={`history-${item.product_code}`}
                            onClick={() => setHistoryItem(item)}
                            title="Ver historial"
                            className="p-2.5 rounded-xl bg-foreground/5 text-foreground/50 hover:bg-foreground/10 transition-all"
                          >
                            <History className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          {filtered.length > 0 && (
            <div className="px-6 py-4 bg-[#fdfbf7] border-t border-foreground/5 text-xs text-foreground/40">
              Mostrando {filtered.length} de {totalSKUs} productos
            </div>
          )}
        </div>
      </div>

      {/* Adjust modal */}
      {adjustItem && (
        <AdjustModal
          item={adjustItem}
          onClose={() => setAdjustItem(null)}
          onSuccess={handleStockSuccess}
        />
      )}

      {/* History drawer */}
      {historyItem && (
        <HistoryDrawer item={historyItem} onClose={() => setHistoryItem(null)} />
      )}
    </>
  );
}

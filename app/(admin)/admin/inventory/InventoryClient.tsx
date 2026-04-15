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
  Factory,
  FlaskConical,
  Flame,
  ArrowRight,
  Scale,
  ChevronRight,
} from "lucide-react";
import {
  adjustInventoryStock,
  getInventoryMovements,
  runProductionBatch,
  getProductionBatches,
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

interface Movement {
  id: string;
  inventory_id: string;
  type: "entrada" | "salida" | "ajuste";
  quantity: number;
  reason: string | null;
  created_at: string;
  inventory?:
    | { product_code: string; product_name: string }[]
    | { product_code: string; product_name: string }
    | null;
}

interface ProductionBatch {
  id: string;
  process_type: "trilla" | "tostion";
  input_quantity_kg: number;
  output_quantity_kg: number;
  weight_loss_pct: number;
  notes: string | null;
  created_at: string;
  input_inventory:
    | { product_code: string; product_name: string }[]
    | { product_code: string; product_name: string }
    | null;
  output_inventory:
    | { product_code: string; product_name: string }[]
    | { product_code: string; product_name: string }
    | null;
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

const PROCESS_CONFIG = {
  trilla: {
    label: "Trilla",
    description: "Café Pergamino → Café Verde",
    inputCode: "CAPG-001",
    outputCode: "CAFV-001",
    icon: <FlaskConical className="w-7 h-7" />,
    color: "text-teal-700",
    bg: "bg-teal-50",
    border: "border-teal-300",
    activeBg: "bg-teal-600",
  },
  tostion: {
    label: "Tostión",
    description: "Café Verde → Café Tostado KG",
    inputCode: "CAFV-001",
    outputCode: "CAFT-001",
    icon: <Flame className="w-7 h-7" />,
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-300",
    activeBg: "bg-orange-600",
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

function getInventoryRelation(
  rel:
    | { product_code: string; product_name: string }[]
    | { product_code: string; product_name: string }
    | null
    | undefined
): { product_code: string; product_name: string } | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return rel[0] ?? null;
  return rel;
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
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-foreground/5 transition-colors">
              <X className="w-5 h-5 text-foreground/40" />
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
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

          <div>
            <label htmlFor="inv-quantity" className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-2 block">
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

          <div>
            <label htmlFor="inv-reason" className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-2 block">
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
            <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 py-4 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-widest text-sm rounded-2xl transition-all disabled:opacity-60"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
            {isPending ? "Guardando..." : "Confirmar movimiento"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── History Drawer ───────────────────────────────────────────────────────────

function HistoryDrawer({ item, onClose }: { item: InventoryItem; onClose: () => void }) {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
        <div className="sticky top-0 bg-white px-8 pt-8 pb-6 border-b border-foreground/5 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1">Historial</p>
            <h3 className="text-xl font-serif">{item.product_name}</h3>
            <p className="text-xs text-foreground/50 mt-0.5 font-mono">{item.product_code}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-foreground/5 transition-colors">
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
              <p className="font-serif text-foreground/60">Sin movimientos aún</p>
              <p className="text-sm text-foreground/40 mt-1">Los ajustes de stock aparecerán aquí.</p>
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
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.bg} ${cfg.color}`}>
                      {cfg.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        <span className="font-bold text-sm">
                          {mov.quantity > 0 ? "+" : ""}{mov.quantity} {item.unit}
                        </span>
                      </div>
                      {mov.reason && <p className="text-xs text-foreground/60 mt-1">{mov.reason}</p>}
                      <p className="text-[10px] text-foreground/40 mt-1.5">{formatDate(mov.created_at)}</p>
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

// ─── Production Modal ─────────────────────────────────────────────────────────

function ProductionModal({
  inventory,
  onClose,
  onSuccess,
}: {
  inventory: InventoryItem[];
  onClose: () => void;
  onSuccess: (inputId: string, newInputStock: number, outputId: string, newOutputStock: number) => void;
}) {
  const [processType, setProcessType] = useState<"trilla" | "tostion" | null>(null);
  const [inputQty, setInputQty] = useState("");
  const [outputQty, setOutputQty] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const cfg = processType ? PROCESS_CONFIG[processType] : null;
  const inputItem = processType
    ? inventory.find((i) => i.product_code === PROCESS_CONFIG[processType!].inputCode) ?? null
    : null;
  const outputItem = processType
    ? inventory.find((i) => i.product_code === PROCESS_CONFIG[processType!].outputCode) ?? null
    : null;

  const inputQtyNum = parseFloat(inputQty) || 0;
  const outputQtyNum = parseFloat(outputQty) || 0;
  const lossKg = inputQtyNum > 0 ? inputQtyNum - outputQtyNum : 0;
  const lossPct = inputQtyNum > 0 ? (lossKg / inputQtyNum) * 100 : 0;

  // When process or input qty changes, auto-fill the estimated output (18.5% midpoint)
  useEffect(() => {
    if (inputQtyNum > 0) {
      setOutputQty((inputQtyNum * 0.815).toFixed(2));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [processType, inputQty]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!processType || !inputItem || !outputItem) return;
    if (inputQtyNum <= 0 || outputQtyNum <= 0) {
      setError("Ingresa cantidades válidas mayores a 0");
      return;
    }
    if (outputQtyNum >= inputQtyNum) {
      setError("El rendimiento no puede ser mayor o igual al input");
      return;
    }
    if (inputQtyNum > inputItem.current_stock) {
      setError(`Stock insuficiente. Disponible: ${inputItem.current_stock} ${inputItem.unit}`);
      return;
    }

    startTransition(async () => {
      try {
        const res = await runProductionBatch(
          processType,
          inputItem.id,
          inputQtyNum,
          outputItem.id,
          outputQtyNum,
          notes || undefined
        );
        onSuccess(inputItem.id, res.newInputStock, outputItem.id, res.newOutputStock);
        onClose();
      } catch (err: any) {
        setError(err.message || "Error al registrar el lote");
      }
    });
  }

  const lossColor =
    lossPct > 20
      ? "text-red-600"
      : lossPct >= 17
      ? "text-amber-600"
      : lossPct > 0
      ? "text-emerald-600"
      : "text-foreground/40";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 pt-8 pb-6 border-b border-foreground/5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1">
                Lote de Producción
              </p>
              <h3 className="text-2xl font-serif text-foreground">Registrar Proceso</h3>
              <p className="text-sm text-foreground/50 mt-1">
                Selecciona el proceso y registra las cantidades de entrada y salida.
              </p>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-foreground/5 transition-colors">
              <X className="w-5 h-5 text-foreground/40" />
            </button>
          </div>
        </div>

        <div className="p-8 space-y-7 max-h-[80vh] overflow-y-auto">
          {/* Step 1: Select process */}
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-3 block">
              1 · Tipo de proceso
            </label>
            <div className="grid grid-cols-2 gap-3">
              {(["trilla", "tostion"] as const).map((pt) => {
                const c = PROCESS_CONFIG[pt];
                const isActive = processType === pt;
                return (
                  <button
                    key={pt}
                    type="button"
                    onClick={() => { setProcessType(pt); setInputQty(""); setOutputQty(""); setError(""); }}
                    className={`flex flex-col items-start gap-3 p-5 rounded-2xl border-2 text-left transition-all ${
                      isActive
                        ? `${c.border} ${c.bg}`
                        : "border-foreground/10 hover:border-foreground/20 bg-white"
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${isActive ? c.bg : "bg-foreground/5"} ${isActive ? c.color : "text-foreground/40"}`}>
                      {c.icon}
                    </div>
                    <div>
                      <p className={`font-bold text-sm ${isActive ? c.color : "text-foreground"}`}>{c.label}</p>
                      <p className="text-xs text-foreground/50 mt-0.5">{c.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Quantities — shown only after process selected */}
          {processType && inputItem && outputItem && (
            <>
              {/* Flow visualization */}
              <div className="bg-[#f9f7f0] rounded-2xl p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">Entrada</p>
                  <p className="font-semibold text-sm truncate">{inputItem.product_name}</p>
                  <p className="text-xs text-foreground/50">
                    Stock: <span className="font-bold text-foreground">{inputItem.current_stock} {inputItem.unit}</span>
                  </p>
                </div>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${cfg!.bg} ${cfg!.color}`}>
                  <ArrowRight className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">Salida</p>
                  <p className="font-semibold text-sm truncate">{outputItem.product_name}</p>
                  <p className="text-xs text-foreground/50">
                    Stock: <span className="font-bold text-foreground">{outputItem.current_stock} {outputItem.unit}</span>
                  </p>
                </div>
              </div>

              {/* Input qty */}
              <div>
                <label htmlFor="prod-input-qty" className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-2 block">
                  2 · Cantidad de entrada — {inputItem.product_name} (kg)
                </label>
                <input
                  id="prod-input-qty"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={inputQty}
                  onChange={(e) => setInputQty(e.target.value)}
                  placeholder="ej. 100"
                  className="w-full px-4 py-3 border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/30 transition-all"
                  required
                />
              </div>

              {/* Output qty */}
              <div>
                <label htmlFor="prod-output-qty" className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-2 block">
                  3 · Cantidad de salida real — {outputItem.product_name} (kg)
                </label>
                <input
                  id="prod-output-qty"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={outputQty}
                  onChange={(e) => setOutputQty(e.target.value)}
                  placeholder="ej. 81.5"
                  className="w-full px-4 py-3 border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/30 transition-all"
                  required
                />
                <p className="text-xs text-foreground/40 mt-1.5">
                  Pre-calculado al 18.5% de pérdida estimada. Ajusta al peso real.
                </p>
              </div>

              {/* Live weight-loss display */}
              {inputQtyNum > 0 && outputQtyNum > 0 && (
                <div className="bg-[#f9f7f0] rounded-2xl p-5 flex items-center gap-5">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 bg-white`}>
                    <Scale className={`w-6 h-6 ${lossColor}`} />
                  </div>
                  <div className="flex-1 grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1">Entrada</p>
                      <p className="font-bold text-foreground">{inputQtyNum.toFixed(2)} kg</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1">Pérdida</p>
                      <p className={`font-bold ${lossColor}`}>{lossKg.toFixed(2)} kg</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1">% Pérdida</p>
                      <p className={`font-bold text-lg ${lossColor}`}>{lossPct.toFixed(1)}%</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Notes */}
              <div>
                <label htmlFor="prod-notes" className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-2 block">
                  Notas (opcional)
                </label>
                <input
                  id="prod-notes"
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="ej. Lote #3 - Finca La Esperanza"
                  className="w-full px-4 py-3 border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/30 transition-all"
                />
              </div>
            </>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">{error}</p>
          )}

          {/* Submit */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !processType}
            className="w-full flex items-center justify-center gap-2 py-4 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-widest text-sm rounded-2xl transition-all disabled:opacity-40"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Factory className="w-4 h-4" />}
            {isPending ? "Registrando lote..." : "Confirmar lote de producción"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Production Batches Section ───────────────────────────────────────────────

function ProductionBatchesSection() {
  const [batches, setBatches] = useState<ProductionBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getProductionBatches()
      .then((data) => setBatches(data as ProductionBatch[]))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-8 py-6 hover:bg-[#fdfbf7] transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-[#C59F59]/10 flex items-center justify-center">
            <Factory className="w-5 h-5 text-[#C59F59]" />
          </div>
          <div className="text-left">
            <p className="font-bold text-sm text-foreground">Historial de Producción</p>
            <p className="text-xs text-foreground/50">Lotes de Trilla y Tostión registrados</p>
          </div>
        </div>
        <ChevronRight
          className={`w-5 h-5 text-foreground/30 transition-transform ${open ? "rotate-90" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-foreground/5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-7 h-7 text-[#C59F59] animate-spin" />
            </div>
          ) : batches.length === 0 ? (
            <div className="text-center py-16">
              <Factory className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
              <p className="font-serif text-foreground/60">Sin lotes registrados</p>
              <p className="text-sm text-foreground/40 mt-1">Los procesos de Trilla y Tostión aparecerán aquí.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="bg-[#fdfbf7] border-b border-foreground/5">
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50">Proceso</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50">Entrada</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50 text-right">Kg entrada</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50">Salida</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50 text-right">Kg salida</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50 text-right">% Pérdida</th>
                    <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-foreground/5">
                  {batches.map((b) => {
                    const proc = PROCESS_CONFIG[b.process_type];
                    const inp = getInventoryRelation(b.input_inventory);
                    const out = getInventoryRelation(b.output_inventory);
                    const lossWarning = b.weight_loss_pct > 20;
                    return (
                      <tr key={b.id} className="hover:bg-[#fdfbf7] transition-colors">
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${proc.bg} ${proc.color}`}>
                            {b.process_type === "trilla" ? (
                              <FlaskConical className="w-3 h-3" />
                            ) : (
                              <Flame className="w-3 h-3" />
                            )}
                            {proc.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-foreground/70">{inp?.product_name ?? "—"}</td>
                        <td className="px-6 py-4 text-right font-mono">{Number(b.input_quantity_kg).toFixed(2)}</td>
                        <td className="px-6 py-4 text-foreground/70">{out?.product_name ?? "—"}</td>
                        <td className="px-6 py-4 text-right font-mono">{Number(b.output_quantity_kg).toFixed(2)}</td>
                        <td className="px-6 py-4 text-right">
                          <span className={`font-bold ${lossWarning ? "text-red-600" : "text-foreground"}`}>
                            {Number(b.weight_loss_pct).toFixed(1)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 text-foreground/50 text-xs">{formatDate(b.created_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
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
  const [showProduction, setShowProduction] = useState(false);

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
    if (categoryFilter !== "all") data = data.filter((i) => i.category === categoryFilter);
    if (lowStockOnly) data = data.filter((i) => i.current_stock <= i.min_stock);
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
    else { setSortField(field); setSortAsc(true); }
  }

  function SortIcon({ field }: { field: keyof InventoryItem }) {
    if (sortField !== field) return null;
    return sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />;
  }

  function handleStockSuccess(id: string, newStock: number) {
    setInventory((prev) =>
      prev.map((item) => (item.id === id ? { ...item, current_stock: newStock } : item))
    );
  }

  function handleProductionSuccess(
    inputId: string,
    newInputStock: number,
    outputId: string,
    newOutputStock: number
  ) {
    setInventory((prev) =>
      prev.map((item) => {
        if (item.id === inputId) return { ...item, current_stock: newInputStock };
        if (item.id === outputId) return { ...item, current_stock: newOutputStock };
        return item;
      })
    );
  }

  return (
    <>
      <div className="space-y-8">
        {/* Page header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-serif text-foreground mb-2">Inventario</h1>
            <p className="text-foreground/60">Control de stock de productos Café Amantti.</p>
          </div>
          <button
            id="btn-produccion"
            onClick={() => setShowProduction(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-widest text-sm rounded-2xl transition-all shadow-sm"
          >
            <Factory className="w-4 h-4" />
            Registrar Producción
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 flex items-center gap-5">
            <div className="w-14 h-14 rounded-2xl bg-[#C59F59]/10 flex items-center justify-center shrink-0">
              <Package className="w-7 h-7 text-[#C59F59]" />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1">Total SKUs</p>
              <p className="text-3xl font-serif">{totalSKUs}</p>
            </div>
          </div>

          <div className={`rounded-3xl border shadow-sm p-6 flex items-center gap-5 ${lowStockCount > 0 ? "bg-amber-50 border-amber-200" : "bg-white border-foreground/5"}`}>
            <div className="w-14 h-14 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
              <AlertTriangle className={`w-7 h-7 ${lowStockCount > 0 ? "text-amber-600" : "text-foreground/30"}`} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1">Stock Bajo</p>
              <p className="text-3xl font-serif">
                {lowStockCount}
                <span className="text-base font-sans text-foreground/40 ml-1">/ {totalSKUs}</span>
              </p>
            </div>
          </div>

          <div className={`rounded-3xl border shadow-sm p-6 flex items-center gap-5 ${zeroStockCount > 0 ? "bg-red-50 border-red-200" : "bg-white border-foreground/5"}`}>
            <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center shrink-0">
              <PackageMinus className={`w-7 h-7 ${zeroStockCount > 0 ? "text-red-600" : "text-foreground/30"}`} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1">Sin Stock</p>
              <p className="text-3xl font-serif">
                {zeroStockCount}
                <span className="text-base font-sans text-foreground/40 ml-1">/ {totalSKUs}</span>
              </p>
            </div>
          </div>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="p-6 border-b border-foreground/5 flex flex-col md:flex-row gap-4 justify-between items-center bg-[#f9f7f0]">
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
            <div className="flex items-center gap-3 w-full md:w-auto">
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
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50 cursor-pointer select-none hover:text-foreground/80 transition-colors" onClick={() => toggleSort("product_code")}>
                    <span className="flex items-center gap-1">Código <SortIcon field="product_code" /></span>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50 cursor-pointer select-none hover:text-foreground/80 transition-colors" onClick={() => toggleSort("product_name")}>
                    <span className="flex items-center gap-1">Producto <SortIcon field="product_name" /></span>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50">Categoría</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50 cursor-pointer select-none hover:text-foreground/80 transition-colors text-right" onClick={() => toggleSort("current_stock")}>
                    <span className="flex items-center gap-1 justify-end">Stock <SortIcon field="current_stock" /></span>
                  </th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50 text-right">Mín.</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50 text-center">Estado</th>
                  <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest text-foreground/50 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center">
                      <Package className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
                      <p className="font-serif text-foreground/60 text-lg">No se encontraron productos</p>
                      <p className="text-sm text-foreground/40">Intenta con otros filtros de búsqueda.</p>
                    </td>
                  </tr>
                ) : (
                  filtered.map((item) => (
                    <tr key={item.id} className="hover:bg-[#fdfbf7] transition-colors">
                      <td className="px-6 py-4">
                        <span className="font-mono text-xs bg-foreground/5 px-2 py-1 rounded-lg text-foreground/70">
                          {item.product_code}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-medium text-foreground">{item.product_name}</p>
                        <p className="text-xs text-foreground/40 mt-0.5">{item.unit}</p>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          item.category === "cafe" ? "bg-[#C59F59]/10 text-[#C59F59]"
                          : item.category === "empaque" ? "bg-blue-50 text-blue-600"
                          : "bg-purple-50 text-purple-600"
                        }`}>
                          {CATEGORY_LABELS[item.category] ?? item.category}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span className={`text-lg font-bold ${
                          item.current_stock === 0 ? "text-red-600"
                          : item.current_stock <= item.min_stock ? "text-amber-600"
                          : "text-foreground"
                        }`}>
                          {item.current_stock}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-foreground/40 font-mono text-sm">{item.min_stock}</td>
                      <td className="px-6 py-4 text-center">
                        <StockBadge stock={item.current_stock} min={item.min_stock} />
                      </td>
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

          {filtered.length > 0 && (
            <div className="px-6 py-4 bg-[#fdfbf7] border-t border-foreground/5 text-xs text-foreground/40">
              Mostrando {filtered.length} de {totalSKUs} productos
            </div>
          )}
        </div>

        {/* Production history */}
        <ProductionBatchesSection />
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

      {/* Production modal */}
      {showProduction && (
        <ProductionModal
          inventory={inventory}
          onClose={() => setShowProduction(false)}
          onSuccess={handleProductionSuccess}
        />
      )}
    </>
  );
}

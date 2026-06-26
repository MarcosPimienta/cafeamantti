'use client';

import React, { useState, useTransition, useEffect, useRef, useCallback } from "react";
import {
  ArrowDownCircle, ArrowUpCircle, BarChart2, History, Plus, Upload,
  Image as ImageIcon, Trash2, X, Loader2, Check, Calendar, AlertTriangle,
  ChevronDown, ChevronUp, TrendingUp, TrendingDown, DollarSign,
  Activity, Layers, Zap, Package, Pencil,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, Area,
} from "recharts";
import { createClient } from "@/utils/supabase/client";
import {
  getAllExpenses, getAllIncomes, getCashflowHistory,
  createExpenseDirect, deleteExpenseDirect,
  createIncomeDirect, deleteIncomeDirect,
  getMissingCashflowDays, getMonthlyPLReport,
  markDateAsNoMovements,
  updateExpenseDirect, updateIncomeDirect,
  getInventory,
  type PLReportResult,
} from "./actions";
import { EXPENSE_CATEGORY_TYPE_MAP, type ExpenseType } from "./types";

// ─────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────

type TabId = "gastos" | "ingresos" | "reportes" | "auditoria";

const TABS = [
  { id: "gastos",    label: "Gastos",    Icon: ArrowDownCircle },
  { id: "ingresos",  label: "Ingresos",  Icon: ArrowUpCircle   },
  { id: "reportes",  label: "Reportes",  Icon: BarChart2       },
  { id: "auditoria", label: "Auditoría", Icon: History          },
] as const;

const PREDEFINED_CATEGORIES = [
  "Costo de Ventas (Materia prima, insumos, empaques)",
  "Costos de Producción (Maquila, Servicio de tostión)",
  "Gastos de Personal (Nómina, salud, pensión)",
  "Honorarios (Servicios profesionales)",
  "Impuestos (ICA, predial, etc.)",
  "Arrendamientos (Local, equipos)",
  "Servicios Públicos (Agua, luz, internet)",
  "Software y Suscripciones (Hosting, licencias)",
  "Gastos Legales (Cámara de comercio, notarías)",
  "Mantenimiento y Reparaciones",
  "Adecuación e Instalaciones",
  "Gastos de Viaje y Transporte",
  "Diversos (Aseo, papelería, caja menor)",
  "Gastos Financieros (Comisiones, intereses)",
];

const INCOME_CATEGORIES = ["Ventas Físicas", "Ventas Web", "Servicios", "Otros Ingresos"];

const PALETTE = {
  gold:    "#C59F59",
  navy:    "#2E3A59",
  blue:    "#3B82F6",
  green:   "#10B981",
  amber:   "#F59E0B",
  red:     "#EF4444",
  purple:  "#8B5CF6",
  teal:    "#14B8A6",
};
const CHART_COLORS = Object.values(PALETTE);

const EXPENSE_TYPE_META: Record<ExpenseType, { label: string; color: string; bg: string; desc: string }> = {
  OPEX:  { label: "OPEX",  color: "text-blue-700",   bg: "bg-blue-100",   desc: "Gasto operativo corriente" },
  COGS:  { label: "COGS",  color: "text-orange-700", bg: "bg-orange-100", desc: "Costo directo de ventas" },
  CAPEX: { label: "CAPEX", color: "text-purple-700", bg: "bg-purple-100", desc: "Activo fijo / inversión" },
};

const fmt = (val: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

const fmtPct = (val: number) => `${val.toFixed(1)}%`;

// ─────────────────────────────────────────────────────────────
// DROPZONE
// ─────────────────────────────────────────────────────────────

function Dropzone({
  onImageUploaded, isUploading, setIsUploading,
}: {
  onImageUploaded: (url: string) => void;
  isUploading: boolean;
  setIsUploading: (v: boolean) => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleUpload = useCallback(async (file: File) => {
    if (!file) return;
    try {
      setIsUploading(true);
      const ext      = file.name.split(".").pop();
      const filePath = `${new Date().toISOString().split("T")[0]}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("receipts").upload(filePath, file);
      if (error) throw error;
      const { data } = supabase.storage.from("receipts").getPublicUrl(filePath);
      onImageUploaded(data.publicUrl);
    } catch {
      alert("Error al subir la imagen.");
    } finally {
      setIsUploading(false);
    }
  }, [onImageUploaded, setIsUploading, supabase]);

  // window.paste escucha activa mientras el modal está montado
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const f = items[i].getAsFile();
          if (f) handleUpload(f);
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleUpload]);

  const onDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };

  return (
    <div
      className={`relative w-full h-28 rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all
        ${dragActive ? "border-[#C59F59] bg-[#C59F59]/5" : "border-foreground/20 hover:border-[#C59F59]/50"}
        ${isUploading ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}
      onDragEnter={onDrag} onDragLeave={onDrag} onDragOver={onDrag}
      onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files[0]) handleUpload(e.dataTransfer.files[0]); }}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }} />
      {isUploading
        ? <Loader2 className="w-7 h-7 text-[#C59F59] animate-spin mb-1" />
        : <Upload className="w-7 h-7 text-foreground/40 mb-1" />}
      <p className="text-xs font-bold text-foreground/50 text-center px-4">
        {isUploading ? "Subiendo..." : "Clic, arrastra o Ctrl+V para pegar imagen"}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// EXPENSE MODAL — con toggle OPEX/COGS/CAPEX + IVA
// ─────────────────────────────────────────────────────────────

function ExpenseModal({
  onClose,
  onSuccess,
  initialDate,
  expenseToEdit,
}: {
  onClose: () => void;
  onSuccess: () => void;
  initialDate?: string;
  expenseToEdit?: any;
}) {
  const today = new Date().toISOString().split("T")[0];
  const [date,     setDate]     = useState(expenseToEdit?.cashflow?.date || initialDate || today);
  const [concept,  setConcept]  = useState(expenseToEdit?.concept || "");
  const [category, setCategory] = useState(expenseToEdit?.category || "");
  const [amount,   setAmount]   = useState(expenseToEdit?.amount ? String(expenseToEdit.amount) : "");
  const [taxAmt,   setTaxAmt]   = useState(expenseToEdit?.tax_amount ? String(expenseToEdit.tax_amount) : "");
  const [deprMos,  setDeprMos]  = useState(expenseToEdit?.depreciation_months ? String(expenseToEdit.depreciation_months) : "");
  const [imageUrl, setImageUrl] = useState<string | null>(expenseToEdit?.image_url || null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending,   startTransition] = useTransition();
  const [successMessage, setSuccessMessage] = useState("");
  const [shouldClose, setShouldClose] = useState(true);

  // Inferir expense_type desde categoría y permitir override manual
  const inferredType: ExpenseType = EXPENSE_CATEGORY_TYPE_MAP[category] ?? "OPEX";
  const [expenseType, setExpenseType] = useState<ExpenseType>(expenseToEdit?.expense_type || "OPEX");

  // Sincronizar tipo con la categoría seleccionada (pero el usuario puede overridear)
  useEffect(() => { setExpenseType(EXPENSE_CATEGORY_TYPE_MAP[category] ?? "OPEX"); }, [category]);

  const isCapex = expenseType === "CAPEX";

  // IVA auto-sugerido: 19% del monto si hay monto
  const autoTax = amount ? (Number(amount) * 0.19).toFixed(0) : "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!concept || !category || !amount || !date) return;
    if (isCapex && (!deprMos || Number(deprMos) <= 0)) {
      alert("Para un activo CAPEX debes indicar los meses de vida útil (> 0).");
      return;
    }
    startTransition(async () => {
      const payload = {
        concept,
        category,
        amount:              Number(amount),
        expense_type:        expenseType,
        tax_amount:          taxAmt ? Number(taxAmt) : 0,
        net_amount:          Number(amount) - (taxAmt ? Number(taxAmt) : 0),
        depreciation_months: isCapex ? Number(deprMos) : null,
        image_url:           imageUrl,
      };

      const res = expenseToEdit
        ? await updateExpenseDirect(expenseToEdit.id, payload)
        : await createExpenseDirect(date, payload);

      if (res.error) {
        alert(res.error);
      } else {
        onSuccess();
        if (shouldClose) {
          onClose();
        } else {
          setConcept("");
          setCategory("");
          setAmount("");
          setTaxAmt("");
          setDeprMos("");
          setImageUrl(null);
          setSuccessMessage("¡Gasto registrado con éxito!");
          setTimeout(() => setSuccessMessage(""), 4000);
        }
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 pt-7 pb-4 border-b border-foreground/5 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h3 className="text-2xl font-serif">{expenseToEdit ? "Editar Gasto" : "Nuevo Gasto"}</h3>
            <p className="text-sm text-foreground/50 mt-0.5">
              {expenseToEdit ? "Modifica los datos de la salida de dinero registrada." : "Registra una salida de dinero con clasificación contable."}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-foreground/5 shrink-0">
            <X className="w-5 h-5 text-foreground/40" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5 overflow-y-auto">
          {/* Fecha + Monto */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Fecha</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="field-input" />
            </div>
            <div>
              <label className="field-label">Valor total ($)</label>
              <input type="number" min="0" step="1" value={amount} onChange={(e) => setAmount(e.target.value)} required
                placeholder="0" className="field-input" />
            </div>
          </div>

          {/* Concepto */}
          <div>
            <label className="field-label">Concepto</label>
            <input type="text" value={concept} onChange={(e) => setConcept(e.target.value)} required
              placeholder="Ej. Compra de insumos" className="field-input" />
          </div>

          {/* Categoría */}
          <div>
            <label className="field-label">Categoría</label>
            <input type="text" list="exp-categories" value={category}
              onChange={(e) => setCategory(e.target.value)} required
              placeholder="Seleccionar o escribir..." className="field-input" />
            <datalist id="exp-categories">
              {PREDEFINED_CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>

          {/* Toggle OPEX / COGS / CAPEX */}
          <div>
            <label className="field-label">Clasificación contable</label>
            <div className="flex gap-2 mt-1">
              {(["OPEX", "COGS", "CAPEX"] as ExpenseType[]).map((t) => {
                const m = EXPENSE_TYPE_META[t];
                const active = expenseType === t;
                return (
                  <button key={t} type="button"
                    onClick={() => setExpenseType(t)}
                    className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-xl border-2 transition-all text-center ${
                      active
                        ? `border-current ${m.color} ${m.bg}`
                        : "border-foreground/10 text-foreground/40 hover:border-foreground/20"
                    }`}
                  >
                    <span className="text-xs font-black">{m.label}</span>
                    <span className="text-[9px] leading-tight opacity-80">{m.desc}</span>
                  </button>
                );
              })}
            </div>
            {inferredType !== expenseType && (
              <p className="text-[10px] text-amber-600 mt-1.5">
                ⚠️ La categoría sugiere <strong>{inferredType}</strong>, pero seleccionaste <strong>{expenseType}</strong>.
              </p>
            )}
          </div>

          {/* IVA */}
          <div>
            <label className="field-label">
              IVA discriminado ($)
              {autoTax && !taxAmt && (
                <button type="button" onClick={() => setTaxAmt(autoTax)}
                  className="ml-2 text-[10px] text-[#C59F59] font-bold underline-offset-2 underline">
                  Sugerir 19% = ${Number(autoTax).toLocaleString("es-CO")}
                </button>
              )}
            </label>
            <input type="number" min="0" step="1" value={taxAmt} onChange={(e) => setTaxAmt(e.target.value)}
              placeholder="0 si no aplica" className="field-input" />
            {taxAmt && amount && (
              <p className="text-[10px] text-foreground/50 mt-1">
                Neto antes de IVA: <strong>{fmt(Number(amount) - Number(taxAmt))}</strong>
              </p>
            )}
          </div>

          {/* Meses de depreciación (solo CAPEX) */}
          {isCapex && (
            <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl">
              <label className="field-label text-purple-700">Vida útil del activo (meses)</label>
              <input type="number" min="1" step="1" value={deprMos} onChange={(e) => setDeprMos(e.target.value)} required
                placeholder="Ej. 36 meses = 3 años" className="field-input border-purple-200 focus:ring-purple-300 mt-1" />
              {deprMos && amount && (
                <p className="text-[10px] text-purple-700 mt-1.5">
                  Depreciación mensual: <strong>
                    {fmt((Number(amount) - (taxAmt ? Number(taxAmt) : 0)) / Number(deprMos))}
                  </strong> / mes durante {deprMos} meses
                </p>
              )}
            </div>
          )}

          {/* Soporte */}
          <div>
            <label className="field-label">Soporte (Recibo/Factura)</label>
            {imageUrl ? (
              <div className="relative rounded-xl border border-foreground/10 overflow-hidden group h-28">
                <img src={imageUrl} alt="Soporte" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" onClick={() => setImageUrl(null)}
                    className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <Dropzone onImageUploaded={setImageUrl} isUploading={isUploading} setIsUploading={setIsUploading} />
            )}
          </div>

          {successMessage && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-xs font-bold rounded-xl text-center">
              {successMessage}
            </div>
          )}

          {expenseToEdit ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 border border-foreground/15 text-foreground/70 font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-foreground/5 cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                onClick={() => setShouldClose(true)}
                disabled={isPending || isUploading}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-wider text-xs rounded-xl transition-all disabled:opacity-60 cursor-pointer"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Guardar Cambios
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="submit"
                onClick={() => setShouldClose(false)}
                disabled={isPending || isUploading}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-[#C59F59] hover:bg-[#C59F59]/5 text-[#C59F59] font-bold uppercase tracking-wider text-xs rounded-xl transition-all disabled:opacity-60 cursor-pointer"
              >
                {isPending && !shouldClose ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Guardar y agregar otro
              </button>
              <button
                type="submit"
                onClick={() => setShouldClose(true)}
                disabled={isPending || isUploading}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-wider text-xs rounded-xl transition-all disabled:opacity-60 cursor-pointer"
              >
                {isPending && shouldClose ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Guardar y cerrar
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// INCOME MODAL — con IVA, comisión y flete
// ─────────────────────────────────────────────────────────────

function IncomeModal({
  onClose,
  onSuccess,
  initialDate,
  incomeToEdit,
  inventoryList = [],
}: {
  onClose: () => void;
  onSuccess: () => void;
  initialDate?: string;
  incomeToEdit?: any;
  inventoryList?: any[];
}) {
  const today = new Date().toISOString().split("T")[0];
  const [date,     setDate]     = useState(incomeToEdit?.date || incomeToEdit?.cashflow?.date || initialDate || today);
  const [concept,  setConcept]  = useState(incomeToEdit?.concept || "");
  const [category, setCategory] = useState(incomeToEdit?.category || "");
  const [gross,    setGross]    = useState(incomeToEdit?.gross_amount ? String(incomeToEdit.gross_amount) : incomeToEdit?.amount ? String(incomeToEdit.amount) : "");
  const [fee,      setFee]      = useState(incomeToEdit?.fee_amount ? String(incomeToEdit.fee_amount) : "");
  const [shipping, setShipping] = useState(incomeToEdit?.shipping_cost ? String(incomeToEdit.shipping_cost) : "");
  const [tax,      setTax]      = useState(incomeToEdit?.tax_amount ? String(incomeToEdit.tax_amount) : "");
  const [imageUrl, setImageUrl] = useState<string | null>(incomeToEdit?.image_url || null);
  const [inventoryId, setInventoryId]   = useState(incomeToEdit?.inventory_id || "");
  const [quantitySold, setQuantitySold] = useState(incomeToEdit?.quantity_sold ? String(incomeToEdit.quantity_sold) : "");
  const [isUploading, setIsUploading] = useState(false);
  const [isPending,   startTransition] = useTransition();
  const [successMessage, setSuccessMessage] = useState("");
  const [shouldClose, setShouldClose] = useState(true);

  const selectedProduct = inventoryList.find((p) => p.id === inventoryId);

  const isWebSale = category === "Ventas Web";

  // Sugerir valores por defecto para Ventas Web
  useEffect(() => {
    if (isWebSale && gross) {
      const g = Number(gross);
      if (!fee)     setFee(     (g * 0.0356).toFixed(0));
      if (!tax)     setTax(     (g * 0.19).toFixed(0));
    }
  }, [isWebSale, gross]);

  const netRevenue = Math.max(0,
    Number(gross || 0) - Number(fee || 0) - Number(shipping || 0) - Number(tax || 0)
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!concept || !category || !gross || !date) return;
    if (inventoryId && (!quantitySold || Number(quantitySold) <= 0)) {
      alert("Por favor ingresa una cantidad vendida válida (mayor a cero).");
      return;
    }
    startTransition(async () => {
      const payload = {
        concept,
        category,
        amount:        Number(gross),
        gross_amount:  Number(gross),
        fee_amount:    fee      ? Number(fee)      : 0,
        shipping_cost: shipping ? Number(shipping) : 0,
        tax_amount:    tax      ? Number(tax)      : 0,
        net_revenue:   netRevenue,
        image_url:     imageUrl,
        inventory_id:  inventoryId || null,
        quantity_sold: inventoryId ? Number(quantitySold || 0) : 0,
      };

      const res = incomeToEdit
        ? await updateIncomeDirect(incomeToEdit.id, payload)
        : await createIncomeDirect(date, payload);

      if (res.error) {
        alert(res.error);
      } else {
        onSuccess();
        if (shouldClose) {
          onClose();
        } else {
          setConcept("");
          setCategory("");
          setGross("");
          setFee("");
          setShipping("");
          setTax("");
          setImageUrl(null);
          setInventoryId("");
          setQuantitySold("");
          setSuccessMessage("¡Ingreso registrado con éxito!");
          setTimeout(() => setSuccessMessage(""), 4000);
        }
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden max-h-[92vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-8 pt-7 pb-4 border-b border-foreground/5 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h3 className="text-2xl font-serif">{incomeToEdit ? "Editar Ingreso Manual" : "Nuevo Ingreso Manual"}</h3>
            <p className="text-sm text-foreground/50 mt-0.5">
              {incomeToEdit ? "Modifica los datos de la entrada de dinero registrada." : "Registra una entrada de dinero con desglose P&amp;L."}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-foreground/5 shrink-0">
            <X className="w-5 h-5 text-foreground/40" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5 overflow-y-auto">
          {/* Fecha + Bruto */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Fecha</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="field-input" />
            </div>
            <div>
              <label className="field-label">Valor Bruto ($)</label>
              <input type="number" min="0" step="1" value={gross} onChange={(e) => setGross(e.target.value)} required
                placeholder="0" className="field-input" />
            </div>
          </div>

          {/* Concepto */}
          <div>
            <label className="field-label">Concepto</label>
            <input type="text" value={concept} onChange={(e) => setConcept(e.target.value)} required
              placeholder="Ej. Aporte capital" className="field-input" />
          </div>

          {/* Categoría */}
          <div>
            <label className="field-label">Categoría</label>
            <input type="text" list="inc-categories" value={category}
              onChange={(e) => setCategory(e.target.value)} required
              placeholder="Seleccionar..." className="field-input" />
            <datalist id="inc-categories">
              {INCOME_CATEGORIES.map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>

          {/* Desglose financiero */}
          <div className="p-4 bg-[#f9f7f0] rounded-xl space-y-3 border border-foreground/5">
            <p className="text-[10px] font-black uppercase tracking-widest text-foreground/50">Desglose P&amp;L</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="field-label">
                  Comisión pasarela ($)
                  {isWebSale && <span className="ml-1 text-[9px] text-[#C59F59]">≈3.56%</span>}
                </label>
                <input type="number" min="0" step="1" value={fee}
                  onChange={(e) => setFee(e.target.value)} placeholder="0" className="field-input text-xs" />
              </div>
              <div>
                <label className="field-label">Flete / Envío ($)</label>
                <input type="number" min="0" step="1" value={shipping}
                  onChange={(e) => setShipping(e.target.value)} placeholder="0" className="field-input text-xs" />
              </div>
              <div>
                <label className="field-label">
                  IVA ($)
                  {isWebSale && <span className="ml-1 text-[9px] text-[#C59F59]">19%</span>}
                </label>
                <input type="number" min="0" step="1" value={tax}
                  onChange={(e) => setTax(e.target.value)} placeholder="0" className="field-input text-xs" />
              </div>
            </div>
            {/* Net revenue preview */}
            <div className="flex items-center justify-between pt-2 border-t border-foreground/10">
              <span className="text-xs text-foreground/50">Ingreso neto estimado:</span>
              <span className={`text-sm font-black font-mono ${netRevenue >= 0 ? "text-green-600" : "text-red-500"}`}>
                {fmt(netRevenue)}
              </span>
            </div>
          </div>

          {/* Vincular con Inventario (Opcional) */}
          <div className="p-4 bg-[#f9f7f0] rounded-xl space-y-3 border border-foreground/5">
            <p className="text-[10px] font-black uppercase tracking-widest text-foreground/50">Vincular con Inventario (Salida de Stock)</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label">Producto Vendido</label>
                <select
                  value={inventoryId}
                  onChange={(e) => {
                    setInventoryId(e.target.value);
                    if (!e.target.value) setQuantitySold("");
                  }}
                  className="field-input text-xs font-bold"
                >
                  <option value="">Ninguno / Sin stock asociado</option>
                  {inventoryList?.map((prod) => (
                    <option key={prod.id} value={prod.id}>
                      {prod.product_name} ({prod.product_code}) - Stock: {prod.current_stock} {prod.unit || 'und'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Cantidad Vendida</label>
                <input
                  type="number"
                  min="0.001"
                  step="any"
                  value={quantitySold}
                  onChange={(e) => setQuantitySold(e.target.value)}
                  disabled={!inventoryId}
                  required={!!inventoryId}
                  placeholder={selectedProduct ? `En ${selectedProduct.unit || 'unidades'}` : "Cantidad"}
                  className="field-input text-xs"
                />
              </div>
            </div>
            {selectedProduct && (
              <p className="text-[10px] text-foreground/50 italic">
                Nota: Se registrará una salida de {quantitySold || 0} {selectedProduct.unit || 'unidades'} de '{selectedProduct.product_name}' (Stock actual: {selectedProduct.current_stock} {selectedProduct.unit || 'und'}).
              </p>
            )}
          </div>

          {/* Soporte */}
          <div>
            <label className="field-label">Soporte (Opcional)</label>
            {imageUrl ? (
              <div className="relative rounded-xl border border-foreground/10 overflow-hidden group h-28">
                <img src={imageUrl} alt="Soporte" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" onClick={() => setImageUrl(null)}
                    className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <Dropzone onImageUploaded={setImageUrl} isUploading={isUploading} setIsUploading={setIsUploading} />
            )}
          </div>

          {successMessage && (
            <div className="p-3 bg-green-50 border border-green-200 text-green-700 text-xs font-bold rounded-xl text-center">
              {successMessage}
            </div>
          )}

          {incomeToEdit ? (
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-3 border border-foreground/15 text-foreground/70 font-bold uppercase tracking-wider text-xs rounded-xl hover:bg-foreground/5 cursor-pointer transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                onClick={() => setShouldClose(true)}
                disabled={isPending || isUploading}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-wider text-xs rounded-xl transition-all disabled:opacity-60 cursor-pointer"
              >
                {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Guardar Cambios
              </button>
            </div>
          ) : (
            <div className="flex gap-3">
              <button
                type="submit"
                onClick={() => setShouldClose(false)}
                disabled={isPending || isUploading}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border border-[#C59F59] hover:bg-[#C59F59]/5 text-[#C59F59] font-bold uppercase tracking-wider text-xs rounded-xl transition-all disabled:opacity-60 cursor-pointer"
              >
                {isPending && !shouldClose ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Guardar y agregar otro
              </button>
              <button
                type="submit"
                onClick={() => setShouldClose(true)}
                disabled={isPending || isUploading}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-wider text-xs rounded-xl transition-all disabled:opacity-60 cursor-pointer"
              >
                {isPending && shouldClose ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                Guardar y cerrar
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// P&L REPORT TAB CONTENT
// ─────────────────────────────────────────────────────────────

function PLReportView({ formatCurrency }: { formatCurrency: (v: number) => string }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year,  setYear]  = useState(now.getFullYear());
  const [report, setReport] = useState<PLReportResult | null>(null);
  const [loading, setLoading] = useState(false);

  const loadReport = useCallback(async () => {
    setLoading(true);
    try {
      const r = await getMonthlyPLReport(month, year);
      setReport(r);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => { loadReport(); }, [loadReport]);

  const MONTHS_ES = [
    "", "Enero","Febrero","Marzo","Abril","Mayo","Junio",
    "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"
  ];

  const costPieData = report ? [
    { name: "COGS",         value: report.total_cogs         },
    { name: "OPEX",         value: report.opex               },
    { name: "Depreciación", value: report.monthly_depreciation},
  ].filter((d) => d.value > 0) : [];

  const waterfallData = report ? [
    { name: "Ing. Bruto",   value: report.gross_revenue,   fill: PALETTE.green  },
    { name: "Comisiones",   value: -report.gateway_fees,   fill: PALETTE.amber  },
    { name: "IVA Ingreso",  value: -report.sales_tax,      fill: PALETTE.amber  },
    { name: "Ing. Neto",    value: report.net_revenue,     fill: PALETTE.teal   },
    { name: "− COGS",       value: -report.total_cogs,     fill: PALETTE.red    },
    { name: "Ut. Bruta",    value: report.gross_profit,    fill: PALETTE.blue   },
    { name: "− OPEX",       value: -report.opex,           fill: PALETTE.purple },
    { name: "EBITDA",       value: report.ebitda,          fill: PALETTE.gold   },
    { name: "− Deprec.",    value: -report.monthly_depreciation, fill: PALETTE.navy },
    { name: "Ut. Operativa",value: report.operating_income, fill: PALETTE.green },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}
          className="field-input w-auto text-sm font-bold">
          {MONTHS_ES.slice(1).map((m, i) => (
            <option key={i+1} value={i+1}>{m}</option>
          ))}
        </select>
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}
          className="field-input w-auto text-sm font-bold">
          {[2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={loadReport} disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#C59F59] text-white rounded-xl text-sm font-bold hover:bg-[#b08d4f] transition-colors disabled:opacity-60">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
          Calcular
        </button>
        {report && (
          <span className="text-xs text-foreground/50 font-mono">
            {MONTHS_ES[month]} {year}
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-[#C59F59] animate-spin" />
        </div>
      )}

      {!loading && report && (
        <>
          {/* KPI Cards row 1 — Ingresos */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-3">
              Ingresos del período
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Ingreso Bruto",    value: report.gross_revenue,    color: "text-green-600",  icon: TrendingUp    },
                { label: "Comisiones Pasa.", value: report.gateway_fees,     color: "text-amber-600",  icon: DollarSign    },
                { label: "IVA s/ Ingresos",  value: report.sales_tax,        color: "text-amber-600",  icon: Layers        },
                { label: "Ingreso Neto",     value: report.net_revenue,      color: "text-teal-600",   icon: Check         },
              ].map(({ label, value, color, icon: Icon }) => (
                <div key={label} className="bg-white rounded-2xl p-5 border border-foreground/5 shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-4 h-4 ${color}`} />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">{label}</p>
                  </div>
                  <p className={`text-xl font-serif font-bold ${color}`}>{formatCurrency(value)}</p>
                </div>
              ))}
            </div>
          </div>

          {/* KPI Cards row 2 — P&L */}
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-foreground/40 mb-3">
              Estado de Resultados
            </p>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  label: "Margen Bruto",
                  value: report.gross_profit,
                  pct:   report.gross_margin_pct,
                  color: report.gross_profit >= 0 ? "text-green-600" : "text-red-500",
                  icon:  TrendingUp,
                  desc:  `${fmtPct(report.gross_margin_pct)} del ingreso neto`,
                },
                {
                  label: "EBITDA",
                  value: report.ebitda,
                  pct:   report.ebitda_margin_pct,
                  color: report.ebitda >= 0 ? "text-blue-600" : "text-red-500",
                  icon:  Zap,
                  desc:  `${fmtPct(report.ebitda_margin_pct)} del ingreso neto`,
                },
                {
                  label: "Utilidad Operativa",
                  value: report.operating_income,
                  pct:   null,
                  color: report.operating_income >= 0 ? "text-[#C59F59]" : "text-red-500",
                  icon:  Activity,
                  desc:  `Depreciación: ${formatCurrency(report.monthly_depreciation)}`,
                },
              ].map(({ label, value, pct, color, icon: Icon, desc }) => (
                <div key={label} className="bg-white rounded-2xl p-5 border border-foreground/5 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 ${color}`} />
                    <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">{label}</p>
                  </div>
                  <p className={`text-2xl font-serif font-bold ${color}`}>{formatCurrency(value)}</p>
                  <p className="text-[10px] text-foreground/50 mt-1">{desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Burn Rate + COGS breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Burn Rate card */}
            <div className="bg-white rounded-2xl p-6 border border-foreground/5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-5 h-5 text-red-500" />
                <h3 className="text-lg font-serif">Burn Rate Real</h3>
              </div>
              <p className="text-3xl font-serif font-bold text-red-500">{formatCurrency(report.burn_rate)}</p>
              <p className="text-xs text-foreground/50 mt-1">Salidas reales de caja en el período (con IVA)</p>

              <div className="mt-5 space-y-2">
                {[
                  { label: "COGS explícito",  val: report.explicit_cogs,         color: "bg-orange-400" },
                  { label: "COGS inventario", val: report.inventory_cogs,        color: "bg-orange-200" },
                  { label: "OPEX",            val: report.opex,                  color: "bg-blue-400"   },
                  { label: "CAPEX pagado",    val: report.burn_rate - report.opex - report.explicit_cogs - report.inventory_cogs,
                    color: "bg-purple-400" },
                ].filter((r) => r.val > 0).map(({ label, val, color }) => (
                  <div key={label} className="flex items-center gap-2 text-xs">
                    <div className={`w-2.5 h-2.5 rounded-full ${color} shrink-0`} />
                    <span className="text-foreground/60 flex-1">{label}</span>
                    <span className="font-mono font-bold text-foreground/80">{formatCurrency(val)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Distribución de costos — PieChart */}
            <div className="bg-white rounded-2xl p-6 border border-foreground/5 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Package className="w-5 h-5 text-[#C59F59]" />
                <h3 className="text-lg font-serif">Distribución de Costos</h3>
              </div>
              {costPieData.length === 0 ? (
                <div className="flex items-center justify-center h-48 text-foreground/30 text-sm">
                  Sin datos de costos para este período
                </div>
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={costPieData} cx="50%" cy="50%" outerRadius={65}
                        labelLine={false} dataKey="value">
                        {costPieData.map((_, idx) => (
                          <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          {/* Waterfall P&L — BarChart */}
          <div className="bg-white rounded-2xl p-6 border border-foreground/5 shadow-sm">
            <h3 className="text-lg font-serif mb-6">Cascada P&amp;L del Período</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfallData} margin={{ top: 5, right: 10, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0ede6" />
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} />
                  <YAxis tickFormatter={(v) => `${(v / 1_000_000).toFixed(1)}M`} tick={{ fontSize: 9 }} />
                  <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {waterfallData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// CASHFLOW REPORT VIEW (existing cash view)
// ─────────────────────────────────────────────────────────────

function CashflowReportView({
  expenses, incomes, formatCurrency,
}: {
  expenses: any[]; incomes: any[]; formatCurrency: (v: number) => string;
}) {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filteredExpenses = expenses.filter((e) => {
    const dateStr = e.cashflow?.date || (e.created_at ? new Date(e.created_at).toISOString().split("T")[0] : "");
    const matchStart = !startDate || dateStr >= startDate;
    const matchEnd = !endDate || dateStr <= endDate;
    return matchStart && matchEnd;
  });

  const filteredIncomes = incomes.filter((i) => {
    const dateStr = i.date || i.cashflow?.date || (i.created_at ? new Date(i.created_at).toISOString().split("T")[0] : "");
    const matchStart = !startDate || dateStr >= startDate;
    const matchEnd = !endDate || dateStr <= endDate;
    return matchStart && matchEnd;
  });

  const totalInc  = filteredIncomes.reduce((s, i)  => s + Number(i.amount), 0);
  const totalExp  = filteredExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const balance   = totalInc - totalExp;

  const expByCategory = Object.entries(
    filteredExpenses.reduce((acc, e) => {
      acc[e.category] = (acc[e.category] || 0) + Number(e.amount);
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  const incByType = Object.entries(
    filteredIncomes.reduce((acc, i) => {
      const k = String(i.type || "manual").toUpperCase();
      acc[k] = (acc[k] || 0) + Number(i.amount);
      return acc;
    }, {} as Record<string, number>)
  ).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6">
      {/* Date Filters */}
      <div className="bg-white rounded-3xl p-5 border border-foreground/5 shadow-sm flex flex-wrap md:flex-nowrap items-end gap-4">
        <div className="flex-1 min-w-[150px]">
          <label className="field-label">Fecha Inicio (Desde)</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="field-input py-2 px-3 text-xs"
          />
        </div>
        <div className="flex-1 min-w-[150px]">
          <label className="field-label">Fecha Fin (Hasta)</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="field-input py-2 px-3 text-xs"
          />
        </div>
        {(startDate || endDate) && (
          <button
            onClick={() => {
              setStartDate("");
              setEndDate("");
            }}
            className="px-4 py-2 border border-foreground/10 rounded-xl hover:bg-foreground/5 text-foreground/70 font-bold text-xs transition-all h-[38px] flex items-center gap-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
            Limpiar Filtro
          </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <div className="bg-white rounded-2xl p-6 border border-foreground/5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-2">Total Ingresos</p>
          <p className="text-3xl font-serif text-green-600">{formatCurrency(totalInc)}</p>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-foreground/5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-2">Total Gastos</p>
          <p className="text-3xl font-serif text-red-500">{formatCurrency(totalExp)}</p>
        </div>
        <div className="bg-white rounded-2xl p-6 border border-foreground/5 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-2">Balance Neto</p>
          <p className={`text-3xl font-serif ${balance >= 0 ? "text-[#C59F59]" : "text-red-500"}`}>
            {formatCurrency(balance)}
          </p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-2xl p-6 border border-foreground/5 shadow-sm">
          <h3 className="text-lg font-serif mb-5">Gastos por Categoría</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={expByCategory} cx="50%" cy="50%" outerRadius={70}
                  labelLine={false} dataKey="value">
                  {expByCategory.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-6 border border-foreground/5 shadow-sm">
          <h3 className="text-lg font-serif mb-5">Ingresos por Tipo</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={incByType} cx="50%" cy="50%" outerRadius={70}
                  labelLine={false} dataKey="value">
                  {incByType.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function DayActionsModal({
  date,
  onClose,
  onRegisterExpense,
  onRegisterIncome,
  onMarkNoMovements,
  formatMissingDate,
}: {
  date: string;
  onClose: () => void;
  onRegisterExpense: () => void;
  onRegisterIncome: () => void;
  onMarkNoMovements: () => Promise<void>;
  formatMissingDate: (d: string) => string;
}) {
  const [isPending, startTransition] = useTransition();

  const handleMarkNoMovements = () => {
    if (confirm(`¿Marcar el día ${date} como día sin movimientos (ingresos ni egresos)?`)) {
      startTransition(async () => {
        await onMarkNoMovements();
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-foreground/5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-serif text-foreground">Acciones del Día</h3>
            <p className="text-xs text-foreground/50 mt-1 capitalize">{formatMissingDate(date)} ({date})</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-xl hover:bg-foreground/5 text-foreground/45 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action List */}
        <div className="p-6 space-y-3">
          <button
            onClick={onRegisterExpense}
            className="w-full flex items-center gap-4 p-4 rounded-2xl border border-red-100 hover:border-red-300 hover:bg-red-50/50 transition-all duration-200 text-left group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center text-red-600 group-hover:scale-110 transition-transform">
              <ArrowDownCircle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">Registrar Gasto</p>
              <p className="text-xs text-foreground/55">Reportar egresos o compras realizadas este día.</p>
            </div>
          </button>

          <button
            onClick={onRegisterIncome}
            className="w-full flex items-center gap-4 p-4 rounded-2xl border border-green-100 hover:border-green-300 hover:bg-green-50/50 transition-all duration-200 text-left group cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center text-green-600 group-hover:scale-110 transition-transform">
              <ArrowUpCircle className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">Registrar Ingreso</p>
              <p className="text-xs text-foreground/55">Reportar ventas manuales o entradas de dinero.</p>
            </div>
          </button>

          <button
            onClick={handleMarkNoMovements}
            disabled={isPending}
            className="w-full flex items-center gap-4 p-4 rounded-2xl border border-amber-100 hover:border-amber-300 hover:bg-amber-50/50 transition-all duration-200 text-left group disabled:opacity-50 cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
              {isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Activity className="w-5 h-5" />}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-foreground">Día Sin Movimientos</p>
              <p className="text-xs text-foreground/55">Marcar que no hubo ingresos ni egresos en esta fecha.</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

interface DuplicateGroup {
  key: string;
  date: string;
  concept: string;
  amount: number;
  items: any[];
}

function getDuplicateExpenses(expenses: any[]): DuplicateGroup[] {
  const groups: Record<string, any[]> = {};
  
  expenses.forEach((e) => {
    const date = e.cashflow?.date || "";
    const concept = (e.concept || "").trim().toLowerCase();
    const amount = Number(e.amount || 0);
    const key = `${date}|${concept}|${amount}`;
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(e);
  });

  return Object.entries(groups)
    .filter(([_, items]) => items.length > 1)
    .map(([key, items]) => {
      const [date, concept, amount] = key.split("|");
      return {
        key,
        date,
        concept: items[0].concept,
        amount: Number(amount),
        items,
      };
    });
}

function DuplicateExpensesModal({
  expenses,
  onClose,
  onDeleteExpense,
  formatCurrency,
}: {
  expenses: any[];
  onClose: () => void;
  onDeleteExpense: (id: string) => Promise<void>;
  formatCurrency: (v: number) => string;
}) {
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const duplicateGroups = getDuplicateExpenses(expenses);

  const handleDelete = async (id: string) => {
    if (confirm("¿Estás seguro de que deseas eliminar este gasto duplicado?")) {
      setIsDeletingId(id);
      try {
        await onDeleteExpense(id);
      } finally {
        setIsDeletingId(null);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 pt-7 pb-4 border-b border-foreground/5 flex items-start justify-between gap-4 shrink-0">
          <div>
            <h3 className="text-2xl font-serif text-foreground">Revisar Gastos Duplicados</h3>
            <p className="text-sm text-foreground/50 mt-0.5">
              Se detectaron transacciones idénticas en fecha, concepto y valor. Puedes eliminar las copias innecesarias.
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-foreground/5 shrink-0 transition-colors">
            <X className="w-5 h-5 text-foreground/40" />
          </button>
        </div>

        {/* Content */}
        <div className="p-8 space-y-6 overflow-y-auto flex-1">
          {duplicateGroups.length === 0 ? (
            <div className="text-center py-12 text-foreground/40">
              <Check className="w-12 h-12 mx-auto mb-3 text-green-500 bg-green-50 p-2.5 rounded-full" />
              <p className="font-bold text-foreground/70">¡No quedan gastos duplicados!</p>
              <p className="text-xs text-foreground/45 mt-1">Todos los duplicados han sido resueltos.</p>
            </div>
          ) : (
            duplicateGroups.map((group) => (
              <div key={group.key} className="border border-amber-200 bg-amber-50/15 rounded-2xl overflow-hidden shadow-sm">
                {/* Group Summary Header */}
                <div className="px-5 py-3.5 bg-amber-500/10 border-b border-amber-200/50 flex justify-between items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <span className="text-xs font-mono font-bold text-foreground/75 bg-white border border-amber-200 px-2.5 py-0.5 rounded-full mr-2">
                        {group.date}
                      </span>
                      <strong className="text-sm text-foreground/90 font-serif">{group.concept}</strong>
                    </div>
                  </div>
                  <span className="text-sm font-mono font-black text-amber-700 bg-white border border-amber-200 px-3 py-1 rounded-xl">
                    {formatCurrency(group.amount)}
                  </span>
                </div>

                {/* Group Items */}
                <div className="divide-y divide-foreground/5 bg-white">
                  {group.items.map((item) => (
                    <div key={item.id} className="p-4 flex items-center justify-between gap-4 hover:bg-foreground/[0.01] transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] uppercase font-bold text-foreground/40">Categoría:</span>
                          <span className="text-xs font-semibold text-foreground/70">{item.category}</span>
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-foreground/50">
                          <span>Registrado: {new Date(item.created_at).toLocaleString("es-CO")}</span>
                          {item.profiles?.first_name && (
                            <span>• Por: {item.profiles.first_name} {item.profiles.last_name || ""}</span>
                          )}
                        </div>
                      </div>

                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={isDeletingId === item.id}
                        className="p-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all cursor-pointer disabled:opacity-50 shrink-0"
                        title="Eliminar este duplicado"
                      >
                        {isDeletingId === item.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-8 py-5 border-t border-foreground/5 bg-[#fdfbf7] flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-foreground text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-foreground/80 transition-colors cursor-pointer shadow-sm"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

function PaginationControls({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
}: {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
}) {
  const from = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const to = Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="px-5 py-4 border-t border-foreground/5 bg-[#fdfbf7] flex items-center justify-between gap-4 flex-wrap text-xs">
      <span className="text-foreground/50">
        Mostrando <strong className="text-foreground">{from}</strong> a <strong className="text-foreground">{to}</strong> de <strong className="text-foreground">{totalItems}</strong> registros
      </span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-3 py-1.5 border border-foreground/10 rounded-lg hover:bg-foreground/5 text-foreground/70 font-bold transition-all disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
        >
          Anterior
        </button>
        <span className="text-foreground/60 font-medium">
          Página {currentPage} de {totalPages}
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-3 py-1.5 border border-foreground/10 rounded-lg hover:bg-foreground/5 text-foreground/70 font-bold transition-all disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
        >
          Siguiente
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// MAIN CLIENT COMPONENT
// ─────────────────────────────────────────────────────────────

export default function CashflowClient() {
  const [activeTab,      setActiveTab]      = useState<TabId>("gastos");
  const [reportMode,     setReportMode]     = useState<"cash" | "pl">("cash");
  const [expenses,       setExpenses]       = useState<any[]>([]);
  const [incomes,        setIncomes]        = useState<any[]>([]);
  const [historyLogs,    setHistoryLogs]    = useState<any[]>([]);
  const [inventory,      setInventory]      = useState<any[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [missingDays,    setMissingDays]    = useState<string[]>([]);
  const [alertExpanded,  setAlertExpanded]  = useState(false);
  const [showExpModal,   setShowExpModal]   = useState(false);
  const [showIncModal,   setShowIncModal]   = useState(false);
  const [selectedDate,   setSelectedDate]   = useState<string | undefined>(undefined);
  const [showDayActionsModal, setShowDayActionsModal] = useState(false);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);

  // Filters for Gastos
  const [expSearch, setExpSearch] = useState("");
  const [expCategory, setExpCategory] = useState("");
  const [expStart, setExpStart] = useState("");
  const [expEnd, setExpEnd] = useState("");
  const [expPage, setExpPage] = useState(1);

  // Filters for Ingresos
  const [incSearch, setIncSearch] = useState("");
  const [incCategory, setIncCategory] = useState("");
  const [incStart, setIncStart] = useState("");
  const [incEnd, setIncEnd] = useState("");
  const [incPage, setIncPage] = useState(1);

  // Edit states
  const [expenseToEdit, setExpenseToEdit] = useState<any | null>(null);
  const [incomeToEdit, setIncomeToEdit] = useState<any | null>(null);

  // Sorting for Gastos
  const [expSortField, setExpSortField] = useState<"date" | "amount" | "net_amount">("date");
  const [expSortDirection, setExpSortDirection] = useState<"asc" | "desc">("desc");

  // Sorting for Ingresos
  const [incSortField, setIncSortField] = useState<"date" | "amount" | "net_amount">("date");
  const [incSortDirection, setIncSortDirection] = useState<"asc" | "desc">("desc");

  const loadData = useCallback(async () => {
    setLoading(true);
    const [exp, inc, hist, missing, inv] = await Promise.all([
      getAllExpenses(), getAllIncomes(), getCashflowHistory(), getMissingCashflowDays(), getInventory(),
    ]);
    setExpenses(exp   || []);
    setIncomes(inc    || []);
    setHistoryLogs(hist  || []);
    setMissingDays(missing || []);
    setInventory(inv || []);
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const formatCurrency = (val: number) =>
    new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(val);

  const formatMissingDate = (dateStr: string) => {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("es-CO", {
      weekday: "long", day: "numeric", month: "long",
    });
  };

  return (
    <div className="space-y-6 pb-24">
      {/* Title */}
      <div>
        <h1 className="text-3xl font-serif text-foreground mb-2">Flujo de Caja</h1>
        <p className="text-foreground/60">Gestiona y audita los ingresos, gastos y reportes financieros.</p>
      </div>

      {/* ⚠️ Missing days alert */}
      {!loading && missingDays.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50 shadow-lg overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 bg-amber-400/20 border-b border-amber-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center shrink-0 animate-pulse">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-black text-amber-900 text-base leading-tight">
                  ⚠️ {missingDays.length} {missingDays.length === 1 ? "día sin registros" : "días sin registros"} de Flujo de Caja
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Desde el 1 de Mayo 2026 hasta ayer — estos días no tienen gastos ni ingresos registrados.
                </p>
              </div>
            </div>
            <button onClick={() => setAlertExpanded((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-800 bg-amber-200 hover:bg-amber-300 rounded-lg transition-colors">
              {alertExpanded ? "Ocultar" : "Ver días"}
              {alertExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {alertExpanded && (
            <div className="p-6">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-4">Días pendientes:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {missingDays.map((day) => (
                  <button key={day}
                    onClick={() => { setSelectedDate(day); setShowDayActionsModal(true); }}
                    className="group flex items-center gap-3 px-4 py-3 bg-white border border-amber-200 rounded-xl hover:border-amber-400 hover:bg-amber-50 transition-all text-left shadow-sm">
                    <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0 group-hover:bg-red-200 transition-colors">
                      <Calendar className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-bold text-foreground/70">{day}</p>
                      <p className="text-[10px] text-foreground/50 capitalize truncate">{formatMissingDate(day)}</p>
                    </div>
                    <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full shrink-0 group-hover:bg-amber-200 transition-colors">
                      Registrar
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-amber-200 flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs text-amber-700">💡 Haz clic en cualquier día para abrir el formulario.</p>
                <div className="flex gap-2">
                  <button onClick={() => { setSelectedDate(undefined); setActiveTab("gastos"); setShowExpModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors">
                    <ArrowDownCircle className="w-3.5 h-3.5" /> Nuevo Gasto
                  </button>
                  <button onClick={() => { setSelectedDate(undefined); setActiveTab("ingresos"); setShowIncModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors">
                    <ArrowUpCircle className="w-3.5 h-3.5" /> Nuevo Ingreso
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ✅ All up to date */}
      {!loading && missingDays.length === 0 && (
        <div className="flex items-center gap-3 px-6 py-4 bg-green-50 border border-green-200 rounded-2xl">
          <div className="w-8 h-8 rounded-lg bg-green-500 flex items-center justify-center shrink-0">
            <Check className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="font-bold text-green-800 text-sm">¡Flujo de caja al día!</p>
            <p className="text-xs text-green-600">Todos los días desde el 1 de Mayo 2026 tienen registros. Buen trabajo.</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex overflow-x-auto hide-scrollbar gap-2 bg-[#f9f7f0] p-2 rounded-2xl border border-foreground/5">
        {TABS.map(({ id, label, Icon }) => {
          const isActive = activeTab === id;
          return (
            <button key={id} suppressHydrationWarning
              onClick={() => setActiveTab(id as TabId)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
                isActive ? "bg-white text-[#C59F59] shadow-sm border border-foreground/5" : "text-foreground/50 hover:text-foreground hover:bg-foreground/5"
              }`}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-[#C59F59] animate-spin" />
        </div>
      ) : (
        <>
          {/* ── GASTOS ── */}
          {activeTab === "gastos" && (() => {
            const filteredExpenses = expenses.filter((e) => {
              const matchConcept = !expSearch || (e.concept || "").toLowerCase().includes(expSearch.toLowerCase());
              const matchCategory = !expCategory || e.category === expCategory;
              const matchStart = !expStart || (e.cashflow?.date && e.cashflow.date >= expStart);
              const matchEnd = !expEnd || (e.cashflow?.date && e.cashflow.date <= expEnd);
              return matchConcept && matchCategory && matchStart && matchEnd;
            });

            const sortedExpenses = [...filteredExpenses].sort((a, b) => {
              let valA: any;
              let valB: any;

              if (expSortField === "date") {
                valA = a.cashflow?.date || (a.created_at ? new Date(a.created_at).toISOString().split("T")[0] : "");
                valB = b.cashflow?.date || (b.created_at ? new Date(b.created_at).toISOString().split("T")[0] : "");
              } else if (expSortField === "amount") {
                valA = Number(a.amount) || 0;
                valB = Number(b.amount) || 0;
              } else if (expSortField === "net_amount") {
                valA = Number(a.net_amount) || 0;
                valB = Number(b.net_amount) || 0;
              }

              if (valA < valB) return expSortDirection === "asc" ? -1 : 1;
              if (valA > valB) return expSortDirection === "asc" ? 1 : -1;
              return 0;
            });

            const expPerPage = 10;
            const expTotalPages = Math.ceil(sortedExpenses.length / expPerPage) || 1;
            const paginatedExpenses = sortedExpenses.slice(
              (expPage - 1) * expPerPage,
              expPage * expPerPage
            );

            return (
              <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden animate-fadeIn">
                <div className="p-5 border-b border-foreground/5 flex justify-between items-center bg-[#f9f7f0]">
                  <h2 className="text-xl font-serif">Todos los Gastos</h2>
                  <button onClick={() => { setSelectedDate(undefined); setExpenseToEdit(null); setShowExpModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#C59F59] text-white rounded-lg font-bold text-sm hover:bg-[#B38E4D] transition-colors">
                    <Plus className="w-4 h-4" /> Nuevo Gasto
                  </button>
                </div>

                {/* Filter controls */}
                <div className="p-5 border-b border-foreground/5 bg-foreground/[0.01] grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="field-label">Concepto</label>
                    <input
                      type="text"
                      value={expSearch}
                      onChange={(e) => { setExpSearch(e.target.value); setExpPage(1); }}
                      placeholder="Buscar concepto..."
                      className="field-input py-2 px-3 text-xs"
                    />
                  </div>
                  <div>
                    <label className="field-label">Categoría</label>
                    <select
                      value={expCategory}
                      onChange={(e) => { setExpCategory(e.target.value); setExpPage(1); }}
                      className="field-input py-2 px-3 text-xs font-bold"
                    >
                      <option value="">Todas las categorías</option>
                      {PREDEFINED_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Desde</label>
                    <input
                      type="date"
                      value={expStart}
                      onChange={(e) => { setExpStart(e.target.value); setExpPage(1); }}
                      className="field-input py-2 px-3 text-xs"
                    />
                  </div>
                  <div>
                    <label className="field-label">Hasta</label>
                    <input
                      type="date"
                      value={expEnd}
                      onChange={(e) => { setExpEnd(e.target.value); setExpPage(1); }}
                      className="field-input py-2 px-3 text-xs"
                    />
                  </div>
                </div>

                {(expSearch || expCategory || expStart || expEnd) && (
                  <div className="px-5 py-2.5 bg-amber-50/20 border-b border-foreground/5 flex justify-end">
                    <button
                      onClick={() => {
                        setExpSearch("");
                        setExpCategory("");
                        setExpStart("");
                        setExpEnd("");
                        setExpPage(1);
                      }}
                      className="text-xs font-bold text-amber-700 hover:text-amber-800 underline cursor-pointer"
                    >
                      Limpiar Filtros
                    </button>
                  </div>
                )}

                {getDuplicateExpenses(expenses).length > 0 && (
                  <div className="mx-5 mt-5 p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
                        <AlertTriangle className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-amber-800">Se detectaron posibles gastos duplicados</p>
                        <p className="text-xs text-amber-600 mt-0.5">
                          Hay {getDuplicateExpenses(expenses).length} {getDuplicateExpenses(expenses).length === 1 ? "grupo" : "grupos"} de transacciones idénticas en fecha, concepto y valor.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => setShowDuplicatesModal(true)}
                      className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer border-0"
                    >
                      Revisar Duplicados
                    </button>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-foreground/80">
                    <thead className="bg-[#fdfbf7] border-b border-foreground/5 text-xs font-bold uppercase tracking-widest text-foreground/60">
                      <tr>
                        <th className="px-5 py-4 cursor-pointer hover:bg-foreground/[0.03] transition-colors select-none group"
                          onClick={() => {
                            if (expSortField === "date") {
                              setExpSortDirection(expSortDirection === "asc" ? "desc" : "asc");
                            } else {
                              setExpSortField("date");
                              setExpSortDirection("desc");
                            }
                            setExpPage(1);
                          }}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Fecha</span>
                            {expSortField === "date" ? (
                              expSortDirection === "asc" ? <ChevronUp className="w-3.5 h-3.5 text-[#C59F59]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#C59F59]" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                            )}
                          </div>
                        </th>
                        <th className="px-5 py-4">Concepto</th>
                        <th className="px-5 py-4">Categoría</th>
                        <th className="px-5 py-4 text-center">Tipo</th>
                        <th className="px-5 py-4 text-right cursor-pointer hover:bg-foreground/[0.03] transition-colors select-none group"
                          onClick={() => {
                            if (expSortField === "amount") {
                              setExpSortDirection(expSortDirection === "asc" ? "desc" : "asc");
                            } else {
                              setExpSortField("amount");
                              setExpSortDirection("desc");
                            }
                            setExpPage(1);
                          }}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <span>Bruto</span>
                            {expSortField === "amount" ? (
                              expSortDirection === "asc" ? <ChevronUp className="w-3.5 h-3.5 text-[#C59F59]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#C59F59]" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                            )}
                          </div>
                        </th>
                        <th className="px-5 py-4 text-right cursor-pointer hover:bg-foreground/[0.03] transition-colors select-none group"
                          onClick={() => {
                            if (expSortField === "net_amount") {
                              setExpSortDirection(expSortDirection === "asc" ? "desc" : "asc");
                            } else {
                              setExpSortField("net_amount");
                              setExpSortDirection("desc");
                            }
                            setExpPage(1);
                          }}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <span>Neto</span>
                            {expSortField === "net_amount" ? (
                              expSortDirection === "asc" ? <ChevronUp className="w-3.5 h-3.5 text-[#C59F59]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#C59F59]" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                            )}
                          </div>
                        </th>
                        <th className="px-5 py-4 text-center">Soporte</th>
                        <th className="px-5 py-4 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-foreground/5">
                      {paginatedExpenses.length === 0 ? (
                        <tr><td colSpan={8} className="text-center py-10 text-foreground/40">No hay gastos registrados que coincidan.</td></tr>
                      ) : paginatedExpenses.map((exp) => {
                        const meta = EXPENSE_TYPE_META[(exp.expense_type as ExpenseType) ?? "OPEX"];
                        return (
                          <tr key={exp.id} className="hover:bg-foreground/[0.02]">
                            <td className="px-5 py-4 font-mono text-xs">{exp.cashflow?.date}</td>
                            <td className="px-5 py-4 font-bold max-w-[180px] truncate">{exp.concept}</td>
                            <td className="px-5 py-4 text-xs text-foreground/60 max-w-[160px] truncate">{exp.category}</td>
                            <td className="px-5 py-4 text-center">
                              <span className={`px-2 py-0.5 text-[10px] font-black rounded-full ${meta.bg} ${meta.color}`}>
                                {meta.label}
                              </span>
                            </td>
                            <td className="px-5 py-4 font-mono text-right text-red-500 font-bold">{formatCurrency(exp.amount)}</td>
                            <td className="px-5 py-4 font-mono text-right text-foreground/60">{formatCurrency(exp.net_amount ?? exp.amount)}</td>
                            <td className="px-5 py-4 text-center">
                              {exp.image_url
                                ? <a href={exp.image_url} target="_blank" rel="noreferrer"
                                    className="inline-block p-1.5 bg-[#C59F59]/10 text-[#C59F59] rounded-lg hover:bg-[#C59F59]/20 transition-colors">
                                    <ImageIcon className="w-4 h-4" />
                                  </a>
                                : <span className="text-foreground/30">—</span>}
                            </td>
                            <td className="px-5 py-4 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  onClick={() => {
                                    setExpenseToEdit(exp);
                                    setShowExpModal(true);
                                  }}
                                  className="text-[#C59F59] hover:bg-amber-50 p-2 rounded-lg transition-colors cursor-pointer"
                                  title="Editar gasto"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={async () => {
                                  if (confirm("¿Eliminar este gasto?")) {
                                    await deleteExpenseDirect(exp.id);
                                    loadData();
                                  }
                                }} className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors cursor-pointer">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <PaginationControls
                  currentPage={expPage}
                  totalPages={expTotalPages}
                  totalItems={filteredExpenses.length}
                  itemsPerPage={expPerPage}
                  onPageChange={setExpPage}
                />
              </div>
            );
          })()}

          {/* ── INGRESOS ── */}
          {activeTab === "ingresos" && (() => {
            const filteredIncomes = incomes.filter((inc) => {
              const dateStr = inc.date || inc.cashflow?.date || new Date(inc.created_at).toISOString().split("T")[0];
              const matchConcept = !incSearch || (inc.concept || "").toLowerCase().includes(incSearch.toLowerCase());
              const matchCategory = !incCategory || inc.category === incCategory;
              const matchStart = !incStart || (dateStr && dateStr >= incStart);
              const matchEnd = !incEnd || (dateStr && dateStr <= incEnd);
              return matchConcept && matchCategory && matchStart && matchEnd;
            });

            const sortedIncomes = [...filteredIncomes].sort((a, b) => {
              let valA: any;
              let valB: any;

              if (incSortField === "date") {
                valA = a.date || a.cashflow?.date || (a.created_at ? new Date(a.created_at).toISOString().split("T")[0] : "");
                valB = b.date || b.cashflow?.date || (b.created_at ? new Date(b.created_at).toISOString().split("T")[0] : "");
              } else if (incSortField === "amount") {
                valA = Number(a.gross_amount ?? a.amount) || 0;
                valB = Number(b.gross_amount ?? b.amount) || 0;
              } else if (incSortField === "net_amount") {
                valA = Number(a.net_revenue ?? a.amount) || 0;
                valB = Number(b.net_revenue ?? b.amount) || 0;
              }

              if (valA < valB) return incSortDirection === "asc" ? -1 : 1;
              if (valA > valB) return incSortDirection === "asc" ? 1 : -1;
              return 0;
            });

            const incPerPage = 10;
            const incTotalPages = Math.ceil(sortedIncomes.length / incPerPage) || 1;
            const paginatedIncomes = sortedIncomes.slice(
              (incPage - 1) * incPerPage,
              incPage * incPerPage
            );

            return (
              <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden animate-fadeIn">
                <div className="p-5 border-b border-foreground/5 flex justify-between items-center bg-[#f9f7f0]">
                  <h2 className="text-xl font-serif">Todos los Ingresos</h2>
                  <button onClick={() => { setSelectedDate(undefined); setIncomeToEdit(null); setShowIncModal(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-[#C59F59] text-white rounded-lg font-bold text-sm hover:bg-[#B38E4D] transition-colors">
                    <Plus className="w-4 h-4" /> Nuevo Ingreso Manual
                  </button>
                </div>

                {/* Filter controls */}
                <div className="p-5 border-b border-foreground/5 bg-foreground/[0.01] grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
                  <div>
                    <label className="field-label">Concepto</label>
                    <input
                      type="text"
                      value={incSearch}
                      onChange={(e) => { setIncSearch(e.target.value); setIncPage(1); }}
                      placeholder="Buscar concepto..."
                      className="field-input py-2 px-3 text-xs"
                    />
                  </div>
                  <div>
                    <label className="field-label">Categoría</label>
                    <select
                      value={incCategory}
                      onChange={(e) => { setIncCategory(e.target.value); setIncPage(1); }}
                      className="field-input py-2 px-3 text-xs font-bold"
                    >
                      <option value="">Todas las categorías</option>
                      {INCOME_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="field-label">Desde</label>
                    <input
                      type="date"
                      value={incStart}
                      onChange={(e) => { setIncStart(e.target.value); setIncPage(1); }}
                      className="field-input py-2 px-3 text-xs"
                    />
                  </div>
                  <div>
                    <label className="field-label">Hasta</label>
                    <input
                      type="date"
                      value={incEnd}
                      onChange={(e) => { setIncEnd(e.target.value); setIncPage(1); }}
                      className="field-input py-2 px-3 text-xs"
                    />
                  </div>
                </div>

                {(incSearch || incCategory || incStart || incEnd) && (
                  <div className="px-5 py-2.5 bg-amber-50/20 border-b border-foreground/5 flex justify-end">
                    <button
                      onClick={() => {
                        setIncSearch("");
                        setIncCategory("");
                        setIncStart("");
                        setIncEnd("");
                        setIncPage(1);
                      }}
                      className="text-xs font-bold text-amber-700 hover:text-amber-800 underline cursor-pointer"
                    >
                      Limpiar Filtros
                    </button>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm text-foreground/80">
                    <thead className="bg-[#fdfbf7] border-b border-foreground/5 text-xs font-bold uppercase tracking-widest text-foreground/60">
                      <tr>
                        <th className="px-5 py-4 cursor-pointer hover:bg-foreground/[0.03] transition-colors select-none group"
                          onClick={() => {
                            if (incSortField === "date") {
                              setIncSortDirection(incSortDirection === "asc" ? "desc" : "asc");
                            } else {
                              setIncSortField("date");
                              setIncSortDirection("desc");
                            }
                            setIncPage(1);
                          }}
                        >
                          <div className="flex items-center gap-1.5">
                            <span>Fecha</span>
                            {incSortField === "date" ? (
                              incSortDirection === "asc" ? <ChevronUp className="w-3.5 h-3.5 text-[#C59F59]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#C59F59]" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                            )}
                          </div>
                        </th>
                        <th className="px-5 py-4">Concepto</th>
                        <th className="px-5 py-4">Categoría</th>
                        <th className="px-5 py-4 text-center">Tipo</th>
                        <th className="px-5 py-4 text-right cursor-pointer hover:bg-foreground/[0.03] transition-colors select-none group"
                          onClick={() => {
                            if (incSortField === "amount") {
                              setIncSortDirection(incSortDirection === "asc" ? "desc" : "asc");
                            } else {
                              setIncSortField("amount");
                              setIncSortDirection("desc");
                            }
                            setIncPage(1);
                          }}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <span>Bruto</span>
                            {incSortField === "amount" ? (
                              incSortDirection === "asc" ? <ChevronUp className="w-3.5 h-3.5 text-[#C59F59]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#C59F59]" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                            )}
                          </div>
                        </th>
                        <th className="px-5 py-4 text-right cursor-pointer hover:bg-foreground/[0.03] transition-colors select-none group"
                          onClick={() => {
                            if (incSortField === "net_amount") {
                              setIncSortDirection(incSortDirection === "asc" ? "desc" : "asc");
                            } else {
                              setIncSortField("net_amount");
                              setIncSortDirection("desc");
                            }
                            setIncPage(1);
                          }}
                        >
                          <div className="flex items-center justify-end gap-1.5">
                            <span>Neto</span>
                            {incSortField === "net_amount" ? (
                              incSortDirection === "asc" ? <ChevronUp className="w-3.5 h-3.5 text-[#C59F59]" /> : <ChevronDown className="w-3.5 h-3.5 text-[#C59F59]" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 opacity-0 group-hover:opacity-40 transition-opacity" />
                            )}
                          </div>
                        </th>
                        <th className="px-5 py-4 text-center">Soporte / Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-foreground/5">
                      {paginatedIncomes.length === 0 ? (
                        <tr><td colSpan={7} className="text-center py-10 text-foreground/40">No hay ingresos registrados que coincidan.</td></tr>
                      ) : paginatedIncomes.map((inc) => (
                        <tr key={inc.id} className="hover:bg-foreground/[0.02]">
                          <td className="px-5 py-4 font-mono text-xs">{inc.date ?? inc.cashflow?.date ?? new Date(inc.created_at).toISOString().split("T")[0]}</td>
                          <td className="px-5 py-4 font-bold max-w-[180px] truncate">
                            <div>{inc.concept}</div>
                            {inc.inventory && (
                              <div className="text-[10px] font-normal text-[#C59F59] mt-0.5 flex items-center gap-1">
                                <Package className="w-3 h-3 text-[#C59F59]" />
                                <span>
                                  {inc.inventory.product_name} ({inc.quantity_sold} {inc.inventory.unit || 'und'})
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="px-5 py-4 text-xs text-foreground/60">{inc.category}</td>
                          <td className="px-5 py-4 text-center">
                            <span className={`px-2 py-0.5 text-[10px] font-black rounded-full ${
                              inc.type === "manual" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                            }`}>
                              {inc.type}
                            </span>
                          </td>
                          <td className="px-5 py-4 font-mono text-right text-green-600 font-bold">{formatCurrency(inc.gross_amount ?? inc.amount)}</td>
                          <td className="px-5 py-4 font-mono text-right text-foreground/60">{formatCurrency(inc.net_revenue ?? inc.amount)}</td>
                          <td className="px-5 py-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {inc.image_url ? (
                                <a href={inc.image_url} target="_blank" rel="noreferrer"
                                    className="inline-block p-1.5 bg-[#C59F59]/10 text-[#C59F59] rounded-lg hover:bg-[#C59F59]/20 transition-colors">
                                    <ImageIcon className="w-4 h-4" />
                                </a>
                              ) : (
                                <span className="text-foreground/30 px-2">—</span>
                              )}
                              
                              {inc.type === "manual" && (
                                <>
                                  <button
                                    onClick={() => {
                                      setIncomeToEdit(inc);
                                      setShowIncModal(true);
                                    }}
                                    className="text-[#C59F59] hover:bg-amber-50 p-2 rounded-lg transition-colors cursor-pointer"
                                    title="Editar ingreso"
                                  >
                                    <Pencil className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={async () => {
                                      if (confirm("¿Eliminar este ingreso manual?")) {
                                        await deleteIncomeDirect(inc.id);
                                        loadData();
                                      }
                                    }}
                                    className="text-red-500 hover:bg-red-50 p-2 rounded-lg transition-colors cursor-pointer"
                                    title="Eliminar ingreso"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PaginationControls
                  currentPage={incPage}
                  totalPages={incTotalPages}
                  totalItems={filteredIncomes.length}
                  itemsPerPage={incPerPage}
                  onPageChange={setIncPage}
                />
              </div>
            );
          })()}

          {/* ── REPORTES ── */}
          {activeTab === "reportes" && (
            <div className="space-y-6">
              {/* Mode toggle */}
              <div className="inline-flex bg-[#f9f7f0] border border-foreground/5 p-1 rounded-2xl gap-1">
                <button
                  onClick={() => setReportMode("cash")}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    reportMode === "cash"
                      ? "bg-white text-[#C59F59] shadow-sm border border-foreground/5"
                      : "text-foreground/50 hover:text-foreground"
                  }`}>
                  <Activity className="w-4 h-4" />
                  Flujo de Caja (Efectivo Real)
                </button>
                <button
                  onClick={() => setReportMode("pl")}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    reportMode === "pl"
                      ? "bg-white text-[#C59F59] shadow-sm border border-foreground/5"
                      : "text-foreground/50 hover:text-foreground"
                  }`}>
                  <BarChart2 className="w-4 h-4" />
                  Estado de Resultados (P&amp;L Contable)
                </button>
              </div>

              {reportMode === "cash"
                ? <CashflowReportView expenses={expenses} incomes={incomes} formatCurrency={formatCurrency} />
                : <PLReportView formatCurrency={formatCurrency} />}
            </div>
          )}

          {/* ── AUDITORÍA ── */}
          {activeTab === "auditoria" && (
            <div className="bg-white rounded-3xl p-8 border border-foreground/5 shadow-sm">
              {historyLogs.length === 0 ? (
                <div className="text-center py-12 text-foreground/40">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No hay registros en el historial todavía.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {historyLogs.map((log: any) => (
                    <div key={log.id} className="flex gap-4 p-4 border border-foreground/5 rounded-xl bg-[#fdfbf7]">
                      <div className="mt-1">
                        {log.action_type.includes("DELETE")
                          ? <Trash2 className="w-5 h-5 text-red-500" />
                          : <History className="w-5 h-5 text-gray-400" />}
                      </div>
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <p className="font-bold text-foreground text-sm">{log.action_type}</p>
                          <span className="text-xs text-foreground/50 shrink-0">
                            {new Date(log.created_at).toLocaleString("es-CO")}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/60">
                          Por: <span className="font-semibold">
                            {log.profiles?.first_name
                              ? `${log.profiles.first_name} ${log.profiles.last_name || ""}`
                              : "Admin"}
                          </span>
                        </p>
                        <div className="mt-3 bg-white border border-foreground/5 rounded-lg p-3 overflow-x-auto text-xs font-mono text-foreground/55">
                          {log.details?.old && (
                            <div className="mb-1.5">
                              <span className="text-red-500 font-bold">Anterior: </span>
                              {JSON.stringify(log.details.old)}
                            </div>
                          )}
                          {log.details?.new && (
                            <div>
                              <span className="text-green-500 font-bold">Nuevo: </span>
                              {JSON.stringify(log.details.new)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showExpModal && (
        <ExpenseModal
          initialDate={selectedDate}
          expenseToEdit={expenseToEdit}
          onClose={() => {
            setShowExpModal(false);
            setSelectedDate(undefined);
            setExpenseToEdit(null);
          }}
          onSuccess={loadData}
        />
      )}
      {showIncModal && (
        <IncomeModal
          initialDate={selectedDate}
          incomeToEdit={incomeToEdit}
          inventoryList={inventory}
          onClose={() => {
            setShowIncModal(false);
            setSelectedDate(undefined);
            setIncomeToEdit(null);
          }}
          onSuccess={loadData}
        />
      )}
      {showDayActionsModal && selectedDate && (
        <DayActionsModal
          date={selectedDate}
          onClose={() => {
            setShowDayActionsModal(false);
            setSelectedDate(undefined);
          }}
          onRegisterExpense={() => {
            setShowDayActionsModal(false);
            setActiveTab("gastos");
            setShowExpModal(true);
          }}
          onRegisterIncome={() => {
            setShowDayActionsModal(false);
            setActiveTab("ingresos");
            setShowIncModal(true);
          }}
          onMarkNoMovements={async () => {
            const res = await markDateAsNoMovements(selectedDate);
            if (res.error) {
              alert(res.error);
            } else {
              setShowDayActionsModal(false);
              setSelectedDate(undefined);
              loadData();
            }
          }}
          formatMissingDate={formatMissingDate}
        />
      )}
      {showDuplicatesModal && (
        <DuplicateExpensesModal
          expenses={expenses}
          onClose={() => setShowDuplicatesModal(false)}
          onDeleteExpense={async (id) => {
            const res = await deleteExpenseDirect(id);
            if (res.error) {
              alert(res.error);
            } else {
              loadData();
            }
          }}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Inline styles for reusable field classes */}
      <style>{`
        .field-label  { display:block; font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:rgba(0,0,0,.4); margin-bottom:6px; }
        .field-input  { width:100%; padding:10px 14px; border:1px solid rgba(0,0,0,.1); border-radius:12px; font-size:13px; outline:none; transition:box-shadow .15s; }
        .field-input:focus { box-shadow:0 0 0 3px rgba(197,159,89,.2); border-color:rgba(197,159,89,.4); }
      `}</style>
    </div>
  );
}

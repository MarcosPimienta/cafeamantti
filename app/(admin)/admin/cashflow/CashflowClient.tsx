'use client';

import React, { useState, useTransition, useMemo, useEffect, useRef } from "react";
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart2,
  History,
  Plus,
  Search,
  Upload,
  Image as ImageIcon,
  Trash2,
  X,
  Loader2,
  Check,
  TrendingUp,
  TrendingDown,
  Calendar,
  Wallet,
  AlertTriangle,
  Bell,
  ChevronDown,
  ChevronUp
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
import { createClient } from "@/utils/supabase/client";
import {
  getAllExpenses,
  getAllIncomes,
  getCashflowHistory,
  createExpenseDirect,
  deleteExpenseDirect,
  createIncomeDirect,
  deleteIncomeDirect,
  getMissingCashflowDays
} from "./actions";

// --- Types ---
type TabId = "gastos" | "ingresos" | "reportes" | "auditoria";

const TABS = [
  { id: "gastos", label: "Gastos", Icon: ArrowDownCircle },
  { id: "ingresos", label: "Ingresos", Icon: ArrowUpCircle },
  { id: "reportes", label: "Reportes", Icon: BarChart2 },
  { id: "auditoria", label: "Auditoría", Icon: History },
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
  "Gastos Financieros (Comisiones, intereses)"
];

const INCOME_CATEGORIES = [
  "Ventas Físicas",
  "Ventas Web",
  "Servicios",
  "Otros Ingresos"
];

const COLORS = ['#C59F59', '#2E3A59', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

// --- Components ---

function Dropzone({
  onImageUploaded,
  isUploading,
  setIsUploading
}: {
  onImageUploaded: (url: string) => void;
  isUploading: boolean;
  setIsUploading: (v: boolean) => void;
}) {
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleUpload = async (file: File) => {
    if (!file) return;
    try {
      setIsUploading(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const today = new Date().toISOString().split('T')[0];
      const filePath = `${today}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from('receipts').getPublicUrl(filePath);
      onImageUploaded(data.publicUrl);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error al subir la imagen.');
    } finally {
      setIsUploading(false);
    }
  };

  const onDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  };

  // Handle paste anywhere in the window if modal is open (we attach event to window or div)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) handleUpload(file);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  return (
    <div
      className={`relative w-full h-32 rounded-xl border-2 border-dashed flex flex-col items-center justify-center transition-all ${
        dragActive ? "border-[#C59F59] bg-[#C59F59]/5" : "border-foreground/20 hover:border-[#C59F59]/50 hover:bg-foreground/[0.02]"
      } ${isUploading ? "opacity-50 pointer-events-none" : "cursor-pointer"}`}
      onDragEnter={onDrag}
      onDragLeave={onDrag}
      onDragOver={onDrag}
      onDrop={onDrop}
      onClick={() => inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
      />
      {isUploading ? (
        <Loader2 className="w-8 h-8 text-[#C59F59] animate-spin mb-2" />
      ) : (
        <Upload className="w-8 h-8 text-foreground/40 mb-2" />
      )}
      <p className="text-sm font-bold text-foreground/60 text-center px-4">
        {isUploading ? "Subiendo..." : "Haz clic, arrastra o pega (Ctrl+V) una imagen aquí"}
      </p>
    </div>
  );
}

// --- Modals ---

function ExpenseModal({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [concept, setConcept] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!concept || !category || !amount || !date) return;
    
    startTransition(async () => {
      const res = await createExpenseDirect(date, {
        concept,
        category,
        amount: Number(amount),
        image_url: imageUrl
      });
      if (res.error) alert(res.error);
      else {
        onSuccess();
        onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-8 pt-8 pb-4 border-b border-foreground/5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-serif">Nuevo Gasto</h3>
            <p className="text-sm text-foreground/50 mt-1">Registra una salida de dinero.</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-foreground/5">
            <X className="w-5 h-5 text-foreground/40" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5 block">Fecha</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="w-full px-4 py-3 border border-foreground/10 rounded-xl text-sm focus:ring-[#C59F59]/30" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5 block">Valor ($)</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required className="w-full px-4 py-3 border border-foreground/10 rounded-xl text-sm focus:ring-[#C59F59]/30" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5 block">Concepto</label>
            <input type="text" value={concept} onChange={e => setConcept(e.target.value)} required placeholder="Ej. Compra de insumos" className="w-full px-4 py-3 border border-foreground/10 rounded-xl text-sm focus:ring-[#C59F59]/30" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5 block">Categoría</label>
            <input type="text" list="exp-categories" value={category} onChange={e => setCategory(e.target.value)} required placeholder="Seleccionar..." className="w-full px-4 py-3 border border-foreground/10 rounded-xl text-sm focus:ring-[#C59F59]/30" />
            <datalist id="exp-categories">
              {PREDEFINED_CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5 block">Soporte (Recibo/Factura)</label>
            {imageUrl ? (
              <div className="relative rounded-xl border border-foreground/10 overflow-hidden group h-32">
                <img src={imageUrl} alt="Soporte" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" onClick={() => setImageUrl(null)} className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <Dropzone onImageUploaded={setImageUrl} isUploading={isUploading} setIsUploading={setIsUploading} />
            )}
          </div>
          <button type="submit" disabled={isPending || isUploading} className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-widest text-sm rounded-xl transition-all disabled:opacity-60">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Guardar Gasto
          </button>
        </form>
      </div>
    </div>
  );
}

function IncomeModal({
  onClose,
  onSuccess
}: {
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [concept, setConcept] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!concept || !category || !amount || !date) return;
    
    startTransition(async () => {
      const res = await createIncomeDirect(date, {
        concept,
        category,
        amount: Number(amount),
        image_url: imageUrl
      });
      if (res.error) alert(res.error);
      else {
        onSuccess();
        onClose();
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-8 pt-8 pb-4 border-b border-foreground/5 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-2xl font-serif">Nuevo Ingreso Manual</h3>
            <p className="text-sm text-foreground/50 mt-1">Registra una entrada de dinero manual (no ventas web).</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-foreground/5">
            <X className="w-5 h-5 text-foreground/40" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5 block">Fecha</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} required className="w-full px-4 py-3 border border-foreground/10 rounded-xl text-sm focus:ring-[#C59F59]/30" />
            </div>
            <div>
              <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5 block">Valor ($)</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required className="w-full px-4 py-3 border border-foreground/10 rounded-xl text-sm focus:ring-[#C59F59]/30" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5 block">Concepto</label>
            <input type="text" value={concept} onChange={e => setConcept(e.target.value)} required placeholder="Ej. Aporte capital" className="w-full px-4 py-3 border border-foreground/10 rounded-xl text-sm focus:ring-[#C59F59]/30" />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5 block">Categoría</label>
            <input type="text" list="inc-categories" value={category} onChange={e => setCategory(e.target.value)} required placeholder="Seleccionar..." className="w-full px-4 py-3 border border-foreground/10 rounded-xl text-sm focus:ring-[#C59F59]/30" />
            <datalist id="inc-categories">
              {INCOME_CATEGORIES.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-foreground/40 mb-1.5 block">Soporte (Opcional)</label>
            {imageUrl ? (
              <div className="relative rounded-xl border border-foreground/10 overflow-hidden group h-32">
                <img src={imageUrl} alt="Soporte" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <button type="button" onClick={() => setImageUrl(null)} className="bg-red-500 text-white p-2 rounded-full hover:bg-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ) : (
              <Dropzone onImageUploaded={setImageUrl} isUploading={isUploading} setIsUploading={setIsUploading} />
            )}
          </div>
          <button type="submit" disabled={isPending || isUploading} className="w-full flex items-center justify-center gap-2 py-3.5 bg-[#C59F59] hover:bg-[#b08d4f] text-white font-bold uppercase tracking-widest text-sm rounded-xl transition-all disabled:opacity-60">
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Guardar Ingreso
          </button>
        </form>
      </div>
    </div>
  );
}

// --- Main Client Component ---

export default function CashflowClient() {
  const [activeTab, setActiveTab] = useState<TabId>("gastos");
  
  const [expenses, setExpenses] = useState<any[]>([]);
  const [incomes, setIncomes] = useState<any[]>([]);
  const [historyLogs, setHistoryLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [missingDays, setMissingDays] = useState<string[]>([]);
  const [alertExpanded, setAlertExpanded] = useState(false);

  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [showIncomeModal, setShowIncomeModal] = useState(false);

  const loadData = async () => {
    setLoading(true);
    const [exp, inc, hist, missing] = await Promise.all([
      getAllExpenses(),
      getAllIncomes(),
      getCashflowHistory(),
      getMissingCashflowDays()
    ]);
    setExpenses(exp || []);
    setIncomes(inc || []);
    setHistoryLogs(hist || []);
    setMissingDays(missing || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatCurrency = (val: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(val);

  const renderTabs = () => (
    <div className="flex overflow-x-auto hide-scrollbar gap-2 mb-8 bg-[#f9f7f0] p-2 rounded-2xl border border-foreground/5">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        const Icon = tab.Icon;
        return (
          <button
            key={tab.id}
            suppressHydrationWarning
            onClick={() => setActiveTab(tab.id as TabId)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-sm transition-all whitespace-nowrap ${
              isActive
                ? "bg-white text-[#C59F59] shadow-sm border border-foreground/5"
                : "text-foreground/50 hover:text-foreground hover:bg-foreground/5"
            }`}
          >
            <Icon className="w-4 h-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );

  const formatMissingDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const d = new Date(year, month - 1, day);
    return d.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  };

  return (
    <div className="space-y-6 pb-24">
      <div>
        <h1 className="text-3xl font-serif text-foreground mb-2">Flujo de Caja</h1>
        <p className="text-foreground/60">Gestiona y audita los ingresos, gastos y reportes financieros.</p>
      </div>

      {/* ⚠️ ALERTA: Días sin registrar */}
      {!loading && missingDays.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-50 to-orange-50 shadow-lg overflow-hidden">
          {/* Header de la alerta */}
          <div className="flex items-center justify-between px-6 py-4 bg-amber-400/20 border-b border-amber-300">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400 flex items-center justify-center shrink-0 animate-pulse">
                <AlertTriangle className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-black text-amber-900 text-base leading-tight">
                  ⚠️ {missingDays.length} {missingDays.length === 1 ? 'día sin registros' : 'días sin registros'} de Flujo de Caja
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Desde el 1 de Mayo 2026 hasta ayer — estos días no tienen gastos ni ingresos registrados.
                </p>
              </div>
            </div>
            <button
              onClick={() => setAlertExpanded(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-800 bg-amber-200 hover:bg-amber-300 rounded-lg transition-colors"
            >
              {alertExpanded ? 'Ocultar' : 'Ver días'}
              {alertExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Lista expandible de días faltantes */}
          {alertExpanded && (
            <div className="p-6">
              <p className="text-xs font-bold uppercase tracking-widest text-amber-700 mb-4">Días pendientes de registro:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {missingDays.map((day) => (
                  <button
                    key={day}
                    onClick={() => {
                      setActiveTab('gastos');
                      setShowExpenseModal(true);
                    }}
                    className="group flex items-center gap-3 px-4 py-3 bg-white border border-amber-200 rounded-xl hover:border-amber-400 hover:bg-amber-50 transition-all text-left shadow-sm"
                  >
                    <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center shrink-0 group-hover:bg-red-200 transition-colors">
                      <Calendar className="w-4 h-4 text-red-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-mono font-bold text-foreground/70">{day}</p>
                      <p className="text-[10px] text-foreground/50 capitalize truncate">{formatMissingDate(day)}</p>
                    </div>
                    <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full shrink-0 group-hover:bg-amber-200 transition-colors">Registrar</span>
                  </button>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t border-amber-200 flex items-center justify-between">
                <p className="text-xs text-amber-700">
                  💡 Haz clic en cualquier día para abrir el formulario de registro rápido.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setActiveTab('gastos'); setShowExpenseModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                  >
                    <ArrowDownCircle className="w-3.5 h-3.5" /> Nuevo Gasto
                  </button>
                  <button
                    onClick={() => { setActiveTab('ingresos'); setShowIncomeModal(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                  >
                    <ArrowUpCircle className="w-3.5 h-3.5" /> Nuevo Ingreso
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ✅ Todos los días al día */}
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

      {renderTabs()}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-10 h-10 text-[#C59F59] animate-spin" />
        </div>
      ) : (
        <>
          {/* TAB: GASTOS */}
          {activeTab === "gastos" && (
            <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-foreground/5 flex justify-between items-center bg-[#f9f7f0]">
                <h2 className="text-xl font-serif">Todos los Gastos</h2>
                <button onClick={() => setShowExpenseModal(true)} className="flex items-center gap-2 px-4 py-2 bg-[#C59F59] text-white rounded-lg font-bold text-sm hover:bg-[#B38E4D] transition-colors">
                  <Plus className="w-4 h-4" /> Nuevo Gasto
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-foreground/80">
                  <thead className="bg-[#fdfbf7] border-b border-foreground/5 text-xs font-bold uppercase tracking-widest text-foreground/60">
                    <tr>
                      <th className="px-6 py-4">Fecha</th>
                      <th className="px-6 py-4">Concepto</th>
                      <th className="px-6 py-4">Categoría</th>
                      <th className="px-6 py-4 text-right">Valor</th>
                      <th className="px-6 py-4 text-center">Soporte</th>
                      <th className="px-6 py-4 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-foreground/5">
                    {expenses.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-10">No hay gastos registrados.</td></tr>
                    ) : expenses.map(exp => (
                      <tr key={exp.id} className="hover:bg-foreground/[0.02]">
                        <td className="px-6 py-4 font-mono text-xs">{exp.cashflow?.date}</td>
                        <td className="px-6 py-4 font-bold">{exp.concept}</td>
                        <td className="px-6 py-4 text-xs">{exp.category}</td>
                        <td className="px-6 py-4 font-mono text-right text-red-500 font-bold">{formatCurrency(exp.amount)}</td>
                        <td className="px-6 py-4 text-center">
                          {exp.image_url ? (
                            <a href={exp.image_url} target="_blank" rel="noreferrer" className="inline-block p-1.5 bg-[#C59F59]/10 text-[#C59F59] rounded-lg hover:bg-[#C59F59]/20 transition-colors">
                              <ImageIcon className="w-4 h-4" />
                            </a>
                          ) : <span className="text-foreground/30">-</span>}
                        </td>
                        <td className="px-6 py-4 text-center">
                          <button onClick={async () => {
                            if(confirm("¿Eliminar este gasto?")) {
                              await deleteExpenseDirect(exp.id);
                              loadData();
                            }
                          }} className="text-red-500 hover:bg-red-50 p-2 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: INGRESOS */}
          {activeTab === "ingresos" && (
            <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-foreground/5 flex justify-between items-center bg-[#f9f7f0]">
                <h2 className="text-xl font-serif">Todos los Ingresos</h2>
                <button onClick={() => setShowIncomeModal(true)} className="flex items-center gap-2 px-4 py-2 bg-[#C59F59] text-white rounded-lg font-bold text-sm hover:bg-[#B38E4D] transition-colors">
                  <Plus className="w-4 h-4" /> Nuevo Ingreso Manual
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-foreground/80">
                  <thead className="bg-[#fdfbf7] border-b border-foreground/5 text-xs font-bold uppercase tracking-widest text-foreground/60">
                    <tr>
                      <th className="px-6 py-4">Fecha</th>
                      <th className="px-6 py-4">Concepto</th>
                      <th className="px-6 py-4">Categoría</th>
                      <th className="px-6 py-4">Tipo</th>
                      <th className="px-6 py-4 text-right">Valor</th>
                      <th className="px-6 py-4 text-center">Soporte</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-foreground/5">
                    {incomes.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-10">No hay ingresos registrados.</td></tr>
                    ) : incomes.map(inc => (
                      <tr key={inc.id} className="hover:bg-foreground/[0.02]">
                        <td className="px-6 py-4 font-mono text-xs">{inc.date || inc.cashflow?.date || new Date(inc.created_at).toISOString().split('T')[0]}</td>
                        <td className="px-6 py-4 font-bold">{inc.concept}</td>
                        <td className="px-6 py-4 text-xs">{inc.category}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-[10px] uppercase font-bold rounded-full ${inc.type === 'manual' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                            {inc.type}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-right text-green-600 font-bold">{formatCurrency(inc.amount)}</td>
                        <td className="px-6 py-4 text-center">
                          {inc.image_url ? (
                            <a href={inc.image_url} target="_blank" rel="noreferrer" className="inline-block p-1.5 bg-[#C59F59]/10 text-[#C59F59] rounded-lg hover:bg-[#C59F59]/20 transition-colors">
                              <ImageIcon className="w-4 h-4" />
                            </a>
                          ) : (
                            inc.type === 'manual' && (
                              <button onClick={async () => {
                                if(confirm("¿Eliminar este ingreso manual?")) {
                                  await deleteIncomeDirect(inc.id);
                                  loadData();
                                }
                              }} className="text-red-500 hover:bg-red-50 p-2 rounded-lg">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: REPORTES */}
          {activeTab === "reportes" && (
            <div className="space-y-6">
              {/* Aggregated Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white rounded-3xl p-6 border border-foreground/5 shadow-sm">
                  <p className="text-xs font-bold uppercase text-foreground/40 mb-2">Total Ingresos Histórico</p>
                  <p className="text-3xl font-serif text-green-600">{formatCurrency(incomes.reduce((s, i) => s + Number(i.amount), 0))}</p>
                </div>
                <div className="bg-white rounded-3xl p-6 border border-foreground/5 shadow-sm">
                  <p className="text-xs font-bold uppercase text-foreground/40 mb-2">Total Gastos Histórico</p>
                  <p className="text-3xl font-serif text-red-500">{formatCurrency(expenses.reduce((s, e) => s + Number(e.amount), 0))}</p>
                </div>
                <div className="bg-white rounded-3xl p-6 border border-foreground/5 shadow-sm">
                  <p className="text-xs font-bold uppercase text-foreground/40 mb-2">Balance General</p>
                  <p className="text-3xl font-serif text-[#C59F59]">{formatCurrency(incomes.reduce((s, i) => s + Number(i.amount), 0) - expenses.reduce((s, e) => s + Number(e.amount), 0))}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-white rounded-3xl p-6 border border-foreground/5 shadow-sm">
                  <h3 className="text-lg font-serif mb-6">Gastos por Categoría</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={Object.entries(expenses.reduce((acc, curr) => {
                            acc[curr.category] = (acc[curr.category] || 0) + Number(curr.amount);
                            return acc;
                          }, {} as Record<string, number>)).map(([name, value]) => ({ name, value }))}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {Object.entries(expenses.reduce((acc, curr) => {
                            acc[curr.category] = (acc[curr.category] || 0) + Number(curr.amount);
                            return acc;
                          }, {} as Record<string, number>)).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-3xl p-6 border border-foreground/5 shadow-sm">
                  <h3 className="text-lg font-serif mb-6">Ingresos por Tipo</h3>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={Object.entries(incomes.reduce((acc, curr) => {
                            acc[curr.type] = (acc[curr.type] || 0) + Number(curr.amount);
                            return acc;
                          }, {} as Record<string, number>)).map(([name, value]) => ({ name: name.toUpperCase(), value }))}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          outerRadius={100}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          {Object.entries(incomes.reduce((acc, curr) => {
                            acc[curr.type] = (acc[curr.type] || 0) + Number(curr.amount);
                            return acc;
                          }, {} as Record<string, number>)).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: AUDITORIA */}
          {activeTab === "auditoria" && (
            <div className="bg-white rounded-3xl p-8 border border-foreground/5 shadow-sm">
              {historyLogs.length === 0 ? (
                <div className="text-center py-12 text-foreground/40">
                  <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No hay registros en el historial todavía.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {historyLogs.map((log: any) => (
                    <div key={log.id} className="flex gap-4 p-4 border border-foreground/5 rounded-xl bg-[#fdfbf7]">
                      <div className="mt-1">
                        {log.action_type.includes('DELETE') ? <Trash2 className="w-5 h-5 text-red-500" /> : <History className="w-5 h-5 text-gray-500" />}
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between items-start">
                          <p className="font-bold text-foreground">
                            {log.action_type}
                          </p>
                          <span className="text-xs text-foreground/50">
                            {new Date(log.created_at).toLocaleString('es-CO')}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/70">
                          Realizado por: <span className="font-semibold">{log.profiles?.first_name ? `${log.profiles.first_name} ${log.profiles.last_name || ''}` : 'Admin'}</span>
                        </p>
                        <div className="mt-4 bg-white border border-foreground/5 rounded-lg p-3 overflow-x-auto text-xs font-mono text-foreground/60">
                          {log.details?.old && (
                            <div className="mb-2">
                              <span className="text-red-500 font-bold">Anterior:</span> {JSON.stringify(log.details.old)}
                            </div>
                          )}
                          {log.details?.new && (
                            <div>
                              <span className="text-green-500 font-bold">Nuevo:</span> {JSON.stringify(log.details.new)}
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

      {showExpenseModal && <ExpenseModal onClose={() => setShowExpenseModal(false)} onSuccess={loadData} />}
      {showIncomeModal && <IncomeModal onClose={() => setShowIncomeModal(false)} onSuccess={loadData} />}
    </div>
  );
}

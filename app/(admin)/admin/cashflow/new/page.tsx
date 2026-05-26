'use client';

import React, { useState, useEffect } from "react";
import { ArrowLeft, Save, Plus, Trash2, RefreshCw, Calculator, Upload, Image as ImageIcon, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getDailySalesTotal, saveCashflow, getCashflowByDate } from "../actions";
import { createClient } from "@/utils/supabase/client";

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

type ExpenseItem = { id?: string; concept: string; category: string; amount: number; image_url?: string | null; isUploading?: boolean };

export default function NewCashflowPage() {
  const router = useRouter();
  const supabase = createClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingDate, setIsLoadingDate] = useState(false);
  
  const [date, setDate] = useState("");
  const [initialBalance, setInitialBalance] = useState<number>(0);
  const [dailyIncome, setDailyIncome] = useState<number>(0);
  const [observations, setObservations] = useState("");
  
  const [expenses, setExpenses] = useState<ExpenseItem[]>([]);
  const [mode, setMode] = useState<'new' | 'edit'>('new');

  useEffect(() => {
    // Set today's date only on the client after hydration
    const today = new Date().toISOString().split('T')[0];
    setDate(today);
  }, []);

  // Effect to load existing data when date changes
  useEffect(() => {
    if (!date) return;
    const fetchExisting = async () => {
      setIsLoadingDate(true);
      try {
        const existing = await getCashflowByDate(date);
        if (existing) {
          setMode('edit');
          setInitialBalance(existing.initial_balance);
          setDailyIncome(existing.daily_income);
          setObservations(existing.observations || "");
          setExpenses(existing.expenses || []);
        } else {
          setMode('new');
          setInitialBalance(0);
          setDailyIncome(0);
          setObservations("");
          setExpenses([]);
        }
      } catch (err) {
        console.error("Error loading date data:", err);
      } finally {
        setIsLoadingDate(false);
      }
    };
    fetchExisting();
  }, [date]);

  // Calculate final balance automatically
  const totalExpenses = expenses.reduce((sum, exp) => sum + (Number(exp.amount) || 0), 0);
  const finalBalance = (Number(initialBalance) || 0) + (Number(dailyIncome) || 0) - totalExpenses;

  const [isFetchingSales, setIsFetchingSales] = useState(false);

  const handleFetchSales = async () => {
    if (!date) return;
    setIsFetchingSales(true);
    try {
      const total = await getDailySalesTotal(date);
      setDailyIncome(total);
    } catch (e) {
      console.error(e);
    } finally {
      setIsFetchingSales(false);
    }
  };

  const addExpense = () => {
    // No ID means it's a new unsaved expense
    setExpenses([...expenses, { concept: "", category: "", amount: 0, image_url: null }]);
  };

  const removeExpense = (index: number) => {
    setExpenses(expenses.filter((_, i) => i !== index));
  };

  const updateExpense = (index: number, field: keyof ExpenseItem, value: any) => {
    setExpenses(expenses.map((e, i) => i === index ? { ...e, [field]: value } : e));
  };

  const handleFileUpload = async (index: number, file: File) => {
    try {
      updateExpense(index, 'isUploading', true);
      
      const fileExt = file.name.split('.').pop();
      const fileName = `${crypto.randomUUID()}.${fileExt}`;
      const filePath = `${date}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data } = supabase.storage.from('receipts').getPublicUrl(filePath);
      updateExpense(index, 'image_url', data.publicUrl);
    } catch (error) {
      console.error('Error uploading file:', error);
      alert('Error al subir la imagen.');
    } finally {
      updateExpense(index, 'isUploading', false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    try {
      const result = await saveCashflow({
        date,
        initial_balance: initialBalance,
        daily_income: dailyIncome,
        final_balance: finalBalance,
        observations,
        expenses: expenses.map(e => ({
          id: e.id,
          concept: e.concept,
          category: e.category,
          amount: e.amount,
          image_url: e.image_url
        }))
      });

      if (result.error) {
        alert(`Error al guardar: ${result.error}`);
      } else {
        router.push('/admin/cashflow');
      }
    } catch (err) {
      console.error(err);
      alert('Error inesperado al guardar el flujo de caja.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link 
            href="/admin/cashflow" 
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-foreground/10 text-foreground/60 hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-3xl font-serif text-foreground">
              {mode === 'edit' ? 'Editar Registro de Caja' : 'Nuevo Registro de Caja'}
            </h1>
            <p className="text-foreground/60">Registra o modifica el cuadre de caja de una jornada.</p>
          </div>
        </div>
        <Link href="/admin/cashflow/history" className="text-sm font-bold text-[#C59F59] hover:underline">
          Ver Historial de Cambios &rarr;
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Form Details */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white rounded-3xl p-8 border border-foreground/5 shadow-sm space-y-6 relative">
            {isLoadingDate && (
              <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-3xl">
                <Loader2 className="w-8 h-8 text-[#C59F59] animate-spin" />
              </div>
            )}
            <h2 className="text-xl font-bold font-serif border-b border-foreground/5 pb-4">Datos del Día</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground/80">Fecha 📅</label>
                <input 
                  type="date" 
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-4 py-3 bg-[#fdfbf7] border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-foreground/80">Saldo Inicial 💳</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40">$</span>
                  <input 
                    type="number" 
                    min="0"
                    step="0.01"
                    value={initialBalance || ''}
                    onChange={(e) => setInitialBalance(Number(e.target.value))}
                    className="w-full pl-8 pr-4 py-3 bg-[#fdfbf7] border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-end">
                  <label className="text-sm font-bold text-foreground/80">Ingresos del Día 💰</label>
                  <button 
                    type="button" 
                    onClick={handleFetchSales}
                    disabled={isFetchingSales || !date}
                    className="text-xs flex items-center gap-1 text-[#C59F59] font-bold hover:underline disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${isFetchingSales ? 'animate-spin' : ''}`} />
                    Auto-calcular (Órdenes)
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40">$</span>
                  <input 
                    type="number" 
                    min="0"
                    step="0.01"
                    value={dailyIncome || ''}
                    onChange={(e) => setDailyIncome(Number(e.target.value))}
                    className="w-full pl-8 pr-4 py-3 bg-[#fdfbf7] border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                    required
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 border border-foreground/5 shadow-sm space-y-6 relative">
             {isLoadingDate && (
              <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-3xl"></div>
            )}
            <div className="flex justify-between items-center border-b border-foreground/5 pb-4">
              <h2 className="text-xl font-bold font-serif">Gastos 🧾</h2>
              <button 
                type="button"
                onClick={addExpense}
                className="flex items-center gap-2 text-sm font-bold text-[#C59F59] hover:bg-[#C59F59]/10 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" /> Agregar Gasto
              </button>
            </div>
            
            {expenses.length === 0 ? (
              <div className="text-center py-8 text-foreground/40 text-sm">
                No se han registrado gastos para este día.
              </div>
            ) : (
              <div className="space-y-4">
                {expenses.map((expense, index) => (
                  <div key={expense.id || index} className="flex flex-col md:flex-row gap-4 items-start p-4 bg-[#fdfbf7] border border-foreground/5 rounded-xl">
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-foreground/60 uppercase tracking-wide">Concepto</label>
                        <input 
                          type="text" 
                          placeholder="Ej. Compra de leche"
                          value={expense.concept}
                          onChange={(e) => updateExpense(index, 'concept', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
                          required
                        />
                      </div>
                      
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-foreground/60 uppercase tracking-wide">Categoría</label>
                        <input 
                          type="text" 
                          list="categories"
                          placeholder="Selecciona o escribe..."
                          value={expense.category}
                          onChange={(e) => updateExpense(index, 'category', e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
                          required
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-foreground/60 uppercase tracking-wide">Valor</label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 text-sm">$</span>
                          <input 
                            type="number" 
                            min="0"
                            step="0.01"
                            value={expense.amount || ''}
                            onChange={(e) => updateExpense(index, 'amount', Number(e.target.value))}
                            className="w-full pl-7 pr-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
                            required
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-row md:flex-col items-center justify-end gap-2 mt-4 md:mt-0 pt-6">
                      {expense.image_url ? (
                        <a 
                          href={expense.image_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="p-2 text-[#C59F59] hover:bg-[#C59F59]/10 rounded-lg transition-colors border border-[#C59F59]/20"
                          title="Ver Recibo"
                        >
                          <ImageIcon className="w-5 h-5" />
                        </a>
                      ) : (
                        <label className={`p-2 rounded-lg transition-colors border border-dashed cursor-pointer ${expense.isUploading ? 'opacity-50 border-foreground/20' : 'text-foreground/40 hover:text-[#C59F59] hover:border-[#C59F59]/50 border-foreground/20'}`} title="Adjuntar Recibo">
                          {expense.isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
                          <input 
                            type="file" 
                            className="hidden" 
                            accept="image/*"
                            onChange={(e) => e.target.files?.[0] && handleFileUpload(index, e.target.files[0])}
                            disabled={expense.isUploading}
                          />
                        </label>
                      )}

                      <button 
                        type="button" 
                        onClick={() => removeExpense(index)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                        title="Eliminar Gasto"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl p-8 border border-foreground/5 shadow-sm space-y-4 relative">
             {isLoadingDate && (
              <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center rounded-3xl"></div>
            )}
            <h2 className="text-xl font-bold font-serif border-b border-foreground/5 pb-4">Observaciones 📝</h2>
            <textarea 
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Notas adicionales, novedades del turno, descuadres, etc..."
              className="w-full px-4 py-3 bg-[#fdfbf7] border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all min-h-[120px] resize-y"
            ></textarea>
          </div>

        </div>

        {/* Right Column: Sticky Summary */}
        <div className="lg:col-span-1">
          <div className="sticky top-8 bg-[#1a1a1a] rounded-3xl p-8 text-white shadow-xl space-y-6">
            <div className="flex items-center gap-3 border-b border-white/10 pb-4">
              <Calculator className="w-6 h-6 text-[#C59F59]" />
              <h2 className="text-xl font-serif">Resumen del Cierre</h2>
            </div>

            <div className="space-y-4 font-mono text-sm">
              <div className="flex justify-between items-center text-white/70">
                <span>Saldo Inicial:</span>
                <span>{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(initialBalance || 0)}</span>
              </div>
              <div className="flex justify-between items-center text-green-400">
                <span>+ Ingresos:</span>
                <span>{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(dailyIncome || 0)}</span>
              </div>
              <div className="flex justify-between items-center text-red-400">
                <span>- Gastos ({expenses.length}):</span>
                <span>{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(totalExpenses)}</span>
              </div>
              
              <div className="pt-4 border-t border-white/10">
                <div className="flex justify-between items-center text-lg text-white font-bold">
                  <span>Saldo Final:</span>
                  <span>{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(finalBalance)}</span>
                </div>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={isSubmitting || isLoadingDate}
              className="w-full flex items-center justify-center gap-2 bg-[#C59F59] hover:bg-[#B38E4D] text-white py-4 rounded-xl font-bold transition-colors disabled:opacity-70 disabled:cursor-not-allowed mt-8"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  {mode === 'edit' ? 'Actualizar Cierre' : 'Guardar Cierre'}
                </>
              )}
            </button>
          </div>
        </div>

      </form>

      {/* Datalist rendered once for all category inputs */}
      <datalist id="categories">
        {PREDEFINED_CATEGORIES.map(cat => <option key={cat} value={cat} />)}
      </datalist>
    </div>
  );
}

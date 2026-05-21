'use client';

import React, { useState, useEffect } from "react";
import { ArrowLeft, Save, Plus, Trash2, RefreshCw, Calculator } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getDailySalesTotal, saveCashflow } from "../actions";

const PREDEFINED_CATEGORIES = [
  "Costo de Ventas (Materia prima, insumos, empaques)", // PUC 61
  "Costos de Producción (Maquila, Servicio de tostión)", // PUC 73
  "Gastos de Personal (Nómina, salud, pensión)", // PUC 5105 / 5205
  "Honorarios (Servicios profesionales)", // PUC 5110 / 5210
  "Impuestos (ICA, predial, etc.)", // PUC 5115 / 5215
  "Arrendamientos (Local, equipos)", // PUC 5120 / 5220
  "Servicios Públicos (Agua, luz, internet)", // PUC 5135 / 5235
  "Software y Suscripciones (Hosting, licencias)", // PUC 5135 / 5195
  "Gastos Legales (Cámara de comercio, notarías)", // PUC 5140 / 5240
  "Mantenimiento y Reparaciones", // PUC 5145 / 5245
  "Adecuación e Instalaciones", // PUC 5150 / 5250
  "Gastos de Viaje y Transporte", // PUC 5155 / 5255
  "Diversos (Aseo, papelería, caja menor)", // PUC 5195 / 5295
  "Gastos Financieros (Comisiones, intereses)" // PUC 5305
];

export default function NewCashflowPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [date, setDate] = useState("");
  const [initialBalance, setInitialBalance] = useState<number>(0);
  const [dailyIncome, setDailyIncome] = useState<number>(0);
  const [observations, setObservations] = useState("");
  
  const [expenses, setExpenses] = useState<{ id: string; concept: string; category: string; amount: number }[]>([]);

  useEffect(() => {
    // Set today's date only on the client after hydration
    const today = new Date().toISOString().split('T')[0];
    setDate(today);
  }, []);

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
    setExpenses([...expenses, { id: Math.random().toString(), concept: "", category: "", amount: 0 }]);
  };

  const removeExpense = (id: string) => {
    setExpenses(expenses.filter(e => e.id !== id));
  };

  const updateExpense = (id: string, field: string, value: string | number) => {
    setExpenses(expenses.map(e => e.id === id ? { ...e, [field]: value } : e));
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
          concept: e.concept,
          category: e.category,
          amount: e.amount
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
      <div className="flex items-center gap-4">
        <Link 
          href="/admin/cashflow" 
          className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-foreground/10 text-foreground/60 hover:text-foreground hover:border-foreground/30 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-serif text-foreground">Registro de Caja</h1>
          <p className="text-foreground/60">Registra el cuadre de caja de una jornada.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Form Details */}
        <div className="lg:col-span-2 space-y-6">
          
          <div className="bg-white rounded-3xl p-8 border border-foreground/5 shadow-sm space-y-6">
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

          <div className="bg-white rounded-3xl p-8 border border-foreground/5 shadow-sm space-y-6">
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
                  <div key={expense.id} className="flex flex-col md:flex-row gap-4 items-start md:items-end p-4 bg-[#fdfbf7] border border-foreground/5 rounded-xl">
                    <div className="w-full md:w-1/3 space-y-1">
                      <label className="text-xs font-bold text-foreground/60 uppercase tracking-wide">Concepto</label>
                      <input 
                        type="text" 
                        placeholder="Ej. Compra de leche"
                        value={expense.concept}
                        onChange={(e) => updateExpense(expense.id, 'concept', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
                        required
                      />
                    </div>
                    
                    <div className="w-full md:w-1/3 space-y-1">
                      <label className="text-xs font-bold text-foreground/60 uppercase tracking-wide">Categoría</label>
                      <input 
                        type="text" 
                        list="categories"
                        placeholder="Selecciona o escribe..."
                        value={expense.category}
                        onChange={(e) => updateExpense(expense.id, 'category', e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
                        required
                      />

                    </div>

                    <div className="w-full md:w-1/4 space-y-1">
                      <label className="text-xs font-bold text-foreground/60 uppercase tracking-wide">Valor</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/40 text-sm">$</span>
                        <input 
                          type="number" 
                          min="0"
                          step="0.01"
                          value={expense.amount || ''}
                          onChange={(e) => updateExpense(expense.id, 'amount', Number(e.target.value))}
                          className="w-full pl-7 pr-3 py-2 bg-white border border-foreground/10 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
                          required
                        />
                      </div>
                    </div>

                    <button 
                      type="button" 
                      onClick={() => removeExpense(expense.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors mt-2 md:mt-0"
                      title="Eliminar Gasto"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-3xl p-8 border border-foreground/5 shadow-sm space-y-4">
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
              disabled={isSubmitting}
              className="w-full flex items-center justify-center gap-2 bg-[#C59F59] hover:bg-[#B38E4D] text-white py-4 rounded-xl font-bold transition-colors disabled:opacity-70 disabled:cursor-not-allowed mt-8"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Guardar Cierre de Caja
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

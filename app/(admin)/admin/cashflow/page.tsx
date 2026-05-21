'use client';

import React, { useState, useEffect } from "react";
import { Plus, Search, Calendar, DollarSign, TrendingUp, TrendingDown, Wallet } from "lucide-react";
import Link from "next/link";
import { getCashflows } from "./actions";
import { DailyCashflow } from "./types";

export default function CashflowListPage() {
  const [cashflows, setCashflows] = useState<DailyCashflow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      const data = await getCashflows();
      setCashflows(data);
      setIsLoading(false);
    }
    loadData();
  }, []);

  const filteredCashflows = cashflows.filter(c => 
    c.date.includes(search) || 
    (c.observations && c.observations.toLowerCase().includes(search.toLowerCase()))
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(amount);
  };

  // Calculate missing dates
  const getMissingDates = () => {
    if (cashflows.length === 0) return [];
    
    // Find the earliest record to start checking from
    const sortedDates = cashflows.map(c => new Date(c.date).getTime()).sort((a, b) => a - b);
    const earliestDate = new Date(sortedDates[0]);
    
    const missing: string[] = [];
    const current = new Date(earliestDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0); // Ignore time, compare dates only
    
    // Create a Set of existing date strings (YYYY-MM-DD) for fast lookup
    const existingDates = new Set(cashflows.map(c => c.date));

    while (current < now) {
      // getDay() returns 0 for Sunday
      if (current.getDay() !== 0) {
        const dateStr = current.toISOString().split('T')[0];
        if (!existingDates.has(dateStr)) {
          missing.push(dateStr);
        }
      }
      current.setDate(current.getDate() + 1);
    }
    
    return missing;
  };

  const missingDates = getMissingDates();

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-2">Flujo de Caja</h1>
          <p className="text-foreground/60">Gestiona los ingresos y gastos diarios para cuadrar la caja.</p>
        </div>
        <div className="flex gap-3">
          <Link 
            href="/admin/cashflow/new"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#C59F59] text-white rounded-xl font-bold hover:bg-[#B38E4D] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nuevo Registro Diario
          </Link>
        </div>
      </div>

      {missingDates.length > 0 && !isLoading && (
        <div className="bg-amber-50 border-l-4 border-amber-500 p-6 rounded-r-3xl flex flex-col md:flex-row gap-4 justify-between items-start md:items-center">
          <div>
            <h3 className="text-amber-800 font-bold text-lg mb-1 flex items-center gap-2">
              ⚠️ ¡Atención! Faltan registros de caja
            </h3>
            <p className="text-amber-700 text-sm">
              Hemos detectado que no se ha registrado el flujo de caja para los siguientes días (excluyendo domingos):
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              {missingDates.map(date => (
                <span key={date} className="bg-amber-100 text-amber-800 px-3 py-1 rounded-full text-xs font-bold font-mono">
                  {date}
                </span>
              ))}
            </div>
          </div>
          <Link 
            href="/admin/cashflow/new"
            className="shrink-0 bg-amber-500 text-white px-4 py-2 rounded-lg font-bold text-sm hover:bg-amber-600 transition-colors"
          >
            Completar Registros
          </Link>
        </div>
      )}

      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden min-h-[500px]">
        {/* Toolbar */}
        <div className="bg-[#f9f7f0] border-b border-foreground/5 p-6 flex flex-col md:flex-row gap-4 justify-between items-center">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40" />
            <input 
              type="text" 
              placeholder="Buscar por fecha (YYYY-MM-DD) o notas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
            />
          </div>
        </div>

        {/* List Content */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-20 text-center text-foreground/40">Cargando datos...</div>
          ) : (
            <table className="w-full text-left text-sm text-foreground/80">
              <thead className="bg-[#fdfbf7] border-b border-foreground/5 text-xs font-bold uppercase tracking-widest text-foreground/60">
                <tr>
                  <th className="px-6 py-4 font-medium">Fecha</th>
                  <th className="px-6 py-4 font-medium">Saldo Inicial</th>
                  <th className="px-6 py-4 font-medium">Ingresos (Día)</th>
                  <th className="px-6 py-4 font-medium">Gastos</th>
                  <th className="px-6 py-4 font-medium">Saldo Final</th>
                  <th className="px-6 py-4 font-medium">Observaciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {filteredCashflows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center">
                      <Wallet className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
                      <p className="text-lg font-serif text-foreground">No hay registros de caja</p>
                      <p className="text-foreground/50 mt-1">Crea un nuevo registro diario para comenzar.</p>
                    </td>
                  </tr>
                ) : (
                  filteredCashflows.map((cashflow) => {
                    const totalGastos = cashflow.initial_balance + cashflow.daily_income - cashflow.final_balance;
                    
                    return (
                      <tr key={cashflow.id} className="hover:bg-foreground/[0.02] transition-colors">
                        <td className="px-6 py-4 text-sm font-bold text-foreground">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-foreground/40" />
                            {cashflow.date}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono">
                          {formatCurrency(cashflow.initial_balance)}
                        </td>
                        <td className="px-6 py-4 font-mono text-green-600 font-medium">
                          <div className="flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" />
                            {formatCurrency(cashflow.daily_income)}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-red-500 font-medium">
                          <div className="flex items-center gap-1">
                            <TrendingDown className="w-3 h-3" />
                            {formatCurrency(totalGastos)}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-foreground">
                          {formatCurrency(cashflow.final_balance)}
                        </td>
                        <td className="px-6 py-4 text-xs text-foreground/60 max-w-xs truncate">
                          {cashflow.observations || '-'}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

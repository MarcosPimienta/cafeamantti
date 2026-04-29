import React from "react";
import { checkIsAdmin } from "../../actions";
import { redirect } from "next/navigation";
import { FileText, Search, Plus, Calendar } from "lucide-react";
import Link from "next/link";
import { getQuotes } from "./actions";

export default async function QuotesListPage() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect('/dashboard');

  const quotes = await getQuotes();

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-2">Cotizaciones</h1>
          <p className="text-foreground/60">Crea y gestiona cotizaciones para clientes B2B con generación de PDF.</p>
        </div>
        <Link 
          href="/admin/quotes/new"
          className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#C59F59] text-white rounded-xl font-bold hover:bg-[#B38E4D] transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nueva Cotización
        </Link>
      </div>

      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden min-h-[500px]">
        {/* Toolbar */}
        <div className="p-6 border-b border-foreground/5 flex flex-col md:flex-row gap-4 justify-between items-center bg-[#f9f7f0]">
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40" />
            <input 
              type="text" 
              placeholder="Buscar por cliente o referencia..." 
              className="w-full pl-11 pr-4 py-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
            />
          </div>
        </div>

        {/* Quotes List */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-foreground/80">
            <thead className="bg-[#fdfbf7] border-b border-foreground/5 text-xs font-bold uppercase tracking-widest text-foreground/60">
              <tr>
                <th className="px-6 py-4 font-medium">Cliente</th>
                <th className="px-6 py-4 font-medium">Fecha</th>
                <th className="px-6 py-4 font-medium">Total</th>
                <th className="px-6 py-4 font-medium">Estado</th>
                <th className="px-6 py-4 font-medium text-center">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-foreground/5">
              {!quotes || quotes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <FileText className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
                    <p className="text-lg font-serif text-foreground">No hay cotizaciones aún</p>
                    <p className="text-sm text-foreground/50">Crea la primera cotización para empezar a enviarlas.</p>
                  </td>
                </tr>
              ) : (
                quotes.map((quote: any) => (
                  <tr key={quote.id} className="hover:bg-foreground/[0.02] transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-bold text-foreground">{quote.clients?.name || 'Cliente Eliminado'}</div>
                      <div className="text-xs text-foreground/50">{quote.clients?.document_number}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-xs text-foreground/60">
                        <Calendar className="w-4 h-4 text-foreground/40" />
                        {new Date(quote.created_at).toLocaleDateString("es-CO")}
                      </div>
                    </td>
                    <td className="px-6 py-4 font-mono font-bold text-foreground">
                      {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(quote.total_amount)}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                        quote.status === 'Aprobada' ? 'bg-green-100 text-green-800' :
                        quote.status === 'Enviada' ? 'bg-blue-100 text-blue-800' :
                        quote.status === 'Rechazada' ? 'bg-red-100 text-red-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {quote.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button className="text-[#C59F59] hover:text-[#B38E4D] font-bold text-xs underline">
                        Regenerar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

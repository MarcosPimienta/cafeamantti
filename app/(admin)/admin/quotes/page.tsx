'use client';

import React, { useState, useEffect } from "react";
import { FileText, Search, Plus, Calendar, FileType } from "lucide-react";
import Link from "next/link";
import { getQuotes, getProposals } from "./actions";
import QuoteActions from "./QuoteActions";
import ProposalActions from "./proposals/ProposalActions";

export default function QuotesListPage() {
  const [activeTab, setActiveTab] = useState<'quotes' | 'proposals'>('quotes');
  const [quotes, setQuotes] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      const [q, p] = await Promise.all([getQuotes(), getProposals()]);
      setQuotes(q);
      setProposals(p);
      setIsLoading(false);
    }
    loadData();
  }, []);

  const filteredQuotes = quotes.filter(q => 
    q.clients?.name?.toLowerCase().includes(search.toLowerCase()) || 
    q.id.toLowerCase().includes(search.toLowerCase())
  );

  const filteredProposals = proposals.filter(p => 
    p.clients?.name?.toLowerCase().includes(search.toLowerCase()) || 
    p.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-2">CRM Documentos</h1>
          <p className="text-foreground/60">Gestiona cotizaciones técnicas y propuestas de alianzas comerciales.</p>
        </div>
        <div className="flex gap-3">
          <Link 
            href="/admin/quotes/new"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border border-[#C59F59] text-[#C59F59] rounded-xl font-bold hover:bg-[#C59F59]/5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva Cotización
          </Link>
          <Link 
            href="/admin/quotes/proposals/new"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#C59F59] text-white rounded-xl font-bold hover:bg-[#B38E4D] transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva Propuesta
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden min-h-[500px]">
        {/* Tabs & Toolbar */}
        <div className="bg-[#f9f7f0] border-b border-foreground/5">
          <div className="flex border-b border-foreground/5">
            <button 
              onClick={() => setActiveTab('quotes')}
              className={`px-8 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'quotes' ? 'border-[#C59F59] text-[#C59F59] bg-white' : 'border-transparent text-foreground/40 hover:text-foreground/60'}`}
            >
              Cotizaciones
            </button>
            <button 
              onClick={() => setActiveTab('proposals')}
              className={`px-8 py-4 text-sm font-bold transition-all border-b-2 ${activeTab === 'proposals' ? 'border-[#C59F59] text-[#C59F59] bg-white' : 'border-transparent text-foreground/40 hover:text-foreground/60'}`}
            >
              Propuestas
            </button>
          </div>
          
          <div className="p-6 flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40" />
              <input 
                type="text" 
                placeholder={activeTab === 'quotes' ? "Buscar por cliente o referencia..." : "Buscar por cliente o título..."}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-11 pr-4 py-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
              />
            </div>
          </div>
        </div>

        {/* List Content */}
        <div className="overflow-x-auto">
          {isLoading ? (
            <div className="p-20 text-center text-foreground/40">Cargando datos...</div>
          ) : activeTab === 'quotes' ? (
            <table className="w-full text-left text-sm text-foreground/80">
              <thead className="bg-[#fdfbf7] border-b border-foreground/5 text-xs font-bold uppercase tracking-widest text-foreground/60">
                <tr>
                  <th className="px-6 py-4 font-medium">Cliente</th>
                  <th className="px-6 py-4 font-medium">Fecha</th>
                  <th className="px-6 py-4 font-medium">Total</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 font-medium text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {filteredQuotes.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-20 text-center">
                      <FileText className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
                      <p className="text-lg font-serif text-foreground">No hay cotizaciones</p>
                    </td>
                  </tr>
                ) : (
                  filteredQuotes.map((quote) => (
                    <tr key={quote.id} className="hover:bg-foreground/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-foreground">{quote.clients?.name || 'Cliente Eliminado'}</div>
                        <div className="text-xs text-foreground/50">{quote.clients?.document_number}</div>
                      </td>
                      <td className="px-6 py-4 text-xs text-foreground/60">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-foreground/40" />
                          {new Date(quote.created_at).toLocaleDateString("es-CO")}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono font-bold text-foreground">
                        {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(quote.total_amount)}
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <span className={`px-2.5 py-0.5 rounded-full font-bold ${
                          quote.status === 'Aprobada' ? 'bg-green-100 text-green-800' :
                          quote.status === 'Enviada' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {quote.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <QuoteActions id={quote.id} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-left text-sm text-foreground/80">
              <thead className="bg-[#fdfbf7] border-b border-foreground/5 text-xs font-bold uppercase tracking-widest text-foreground/60">
                <tr>
                  <th className="px-6 py-4 font-medium">Cliente / Título</th>
                  <th className="px-6 py-4 font-medium">Fecha</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 font-medium text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {filteredProposals.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-20 text-center">
                      <FileType className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
                      <p className="text-lg font-serif text-foreground">No hay propuestas</p>
                    </td>
                  </tr>
                ) : (
                  filteredProposals.map((proposal) => (
                    <tr key={proposal.id} className="hover:bg-foreground/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-foreground">{proposal.clients?.name || 'Cliente Eliminado'}</div>
                        <div className="text-xs text-[#C59F59] font-medium">{proposal.title}</div>
                      </td>
                      <td className="px-6 py-4 text-xs text-foreground/60">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-foreground/40" />
                          {new Date(proposal.created_at).toLocaleDateString("es-CO")}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <span className={`px-2.5 py-0.5 rounded-full font-bold ${
                          proposal.status === 'Aprobada' ? 'bg-green-100 text-green-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {proposal.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <ProposalActions id={proposal.id} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

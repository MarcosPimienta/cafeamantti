'use client';

import React, { useState, useEffect } from "react";
import { FileText, Search, Plus, Calendar, FileType, Coffee } from "lucide-react";
import Link from "next/link";
import { getQuotes, getProposals, getTechSheets } from "./actions";
import QuoteActions from "./QuoteActions";
import ProposalActions from "./proposals/ProposalActions";
import TechSheetActions from "./tech-sheets/TechSheetActions";

export default function QuotesListPage() {
  const [activeTab, setActiveTab] = useState<'quotes' | 'proposals' | 'tech-sheets'>('quotes');
  const [quotes, setQuotes] = useState<any[]>([]);
  const [proposals, setProposals] = useState<any[]>([]);
  const [techSheets, setTechSheets] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      const [q, p, ts] = await Promise.all([getQuotes(), getProposals(), getTechSheets()]);
      setQuotes(q);
      setProposals(p);
      setTechSheets(ts);
      setIsLoading(false);
    }
    loadData();
  }, []);

  const filteredQuotes = quotes.filter(q => 
    q.clients?.name?.toLowerCase().includes(search.toLowerCase()) || 
    q.custom_client_name?.toLowerCase().includes(search.toLowerCase()) ||
    q.id.toLowerCase().includes(search.toLowerCase())
  );

  const filteredProposals = proposals.filter(p => 
    p.clients?.name?.toLowerCase().includes(search.toLowerCase()) || 
    p.custom_client_name?.toLowerCase().includes(search.toLowerCase()) ||
    p.title.toLowerCase().includes(search.toLowerCase())
  );

  const filteredTechSheets = techSheets.filter(ts =>
    ts.title?.toLowerCase().includes(search.toLowerCase()) ||
    ts.origin?.toLowerCase().includes(search.toLowerCase()) ||
    ts.variety?.toLowerCase().includes(search.toLowerCase()) ||
    ts.farm_name?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-2">CRM Documentos</h1>
          <p className="text-foreground/60">Gestiona cotizaciones técnicas, propuestas de alianzas y fichas técnicas de café.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link 
            href="/admin/quotes/new"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white border border-[#C59F59] text-[#C59F59] rounded-xl font-bold text-xs hover:bg-[#C59F59]/5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva Cotización
          </Link>
          <Link 
            href="/admin/quotes/proposals/new"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white border border-[#717861] text-[#717861] rounded-xl font-bold text-xs hover:bg-[#717861]/5 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Nueva Propuesta
          </Link>
          <Link 
            href="/admin/quotes/tech-sheets/new"
            className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-[#C59F59] text-white rounded-xl font-bold text-xs hover:bg-[#B38E4D] transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Nueva Ficha Técnica
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm overflow-hidden min-h-[500px]">
        {/* Tabs & Toolbar */}
        <div className="bg-[#f9f7f0] border-b border-foreground/5">
          <div className="flex border-b border-foreground/5 overflow-x-auto">
            <button 
              onClick={() => setActiveTab('quotes')}
              className={`px-8 py-4 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === 'quotes' ? 'border-[#C59F59] text-[#C59F59] bg-white' : 'border-transparent text-foreground/40 hover:text-foreground/60'}`}
            >
              Cotizaciones
            </button>
            <button 
              onClick={() => setActiveTab('proposals')}
              className={`px-8 py-4 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === 'proposals' ? 'border-[#C59F59] text-[#C59F59] bg-white' : 'border-transparent text-foreground/40 hover:text-foreground/60'}`}
            >
              Propuestas
            </button>
            <button 
              onClick={() => setActiveTab('tech-sheets')}
              className={`px-8 py-4 text-sm font-bold transition-all border-b-2 whitespace-nowrap ${activeTab === 'tech-sheets' ? 'border-[#C59F59] text-[#C59F59] bg-white' : 'border-transparent text-foreground/40 hover:text-foreground/60'}`}
            >
              Fichas Técnicas
            </button>
          </div>
          
          <div className="p-6 flex flex-col md:flex-row gap-4 justify-between items-center">
            <div className="relative w-full md:w-96">
              <Search className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-foreground/40" />
              <input 
                type="text" 
                placeholder={
                  activeTab === 'quotes' ? "Buscar por cliente o referencia..." : 
                  activeTab === 'proposals' ? "Buscar por cliente o título..." :
                  "Buscar por título, origen o variedad..."
                }
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
                        <div className="font-bold text-foreground">{quote.clients?.name || quote.custom_client_name || 'Cliente Eliminado'}</div>
                        <div className="text-xs text-foreground/50">{quote.clients?.document_number || quote.custom_client_document}</div>
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
          ) : activeTab === 'proposals' ? (
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
                        <div className="font-bold text-foreground">{proposal.clients?.name || proposal.custom_client_name || 'Cliente Eliminado'}</div>
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
          ) : (
            /* TECH SHEETS TABLE */
            <table className="w-full text-left text-sm text-foreground/80">
              <thead className="bg-[#fdfbf7] border-b border-foreground/5 text-xs font-bold uppercase tracking-widest text-foreground/60">
                <tr>
                  <th className="px-6 py-4 font-medium">Nombre de Café / Finca</th>
                  <th className="px-6 py-4 font-medium">Origen / Ubicación</th>
                  <th className="px-6 py-4 font-medium">Variedad & SCA</th>
                  <th className="px-6 py-4 font-medium">Fecha</th>
                  <th className="px-6 py-4 font-medium">Estado</th>
                  <th className="px-6 py-4 font-medium text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/5">
                {filteredTechSheets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-20 text-center">
                      <Coffee className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
                      <p className="text-lg font-serif text-foreground">No hay fichas técnicas registradas</p>
                      <p className="text-xs text-foreground/50 mt-1">Crea una nueva ficha técnica para documentar los perfiles de café.</p>
                    </td>
                  </tr>
                ) : (
                  filteredTechSheets.map((sheet) => (
                    <tr key={sheet.id} className="hover:bg-foreground/[0.02] transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-foreground flex items-center gap-2">
                          <span 
                            className="w-3 h-3 rounded-full inline-block flex-shrink-0" 
                            style={{ backgroundColor: sheet.primary_color || '#717861' }} 
                          />
                          {sheet.title}
                        </div>
                        <div className="text-xs text-foreground/50 pl-5">{sheet.farm_name || 'Finca Sin Nombre'}</div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <div className="font-semibold text-foreground/80">{sheet.origin || 'Origen N/A'}</div>
                        <div className="text-foreground/50">{sheet.location || ''}</div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <div className="font-medium text-foreground">{sheet.variety || 'Castillo'}</div>
                        {sheet.sca_score && (
                          <div className="text-[#C59F59] font-bold">SCA: {sheet.sca_score}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-xs text-foreground/60">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-foreground/40" />
                          {new Date(sheet.created_at).toLocaleDateString("es-CO")}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs">
                        <span className={`px-2.5 py-0.5 rounded-full font-bold ${
                          sheet.status === 'Publicado' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {sheet.status || 'Publicado'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <TechSheetActions sheet={sheet} />
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

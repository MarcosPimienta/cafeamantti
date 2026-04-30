'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, FileDown, Save, Eye, X, MoveUp, MoveDown } from 'lucide-react';
import { generateProposalPDF } from '@/utils/pdf/quoteGenerator';
import { ProposalHTMLTemplate, ProposalSection } from '../ProposalHTMLTemplate';

const DEFAULT_SECTIONS: ProposalSection[] = [
  { title: "Presentación de Amantti Café", text: "Amantti Café es una marca de café especial 100 % colombiano, enfocado en ofrecer una experiencia única de calidad y sabor..." },
  { title: "Objetivo de la Alianza", text: "Proponer una alianza estratégica y de exclusividad entre [Cliente] y Amantti Café..." },
  { title: "Alcance de la Propuesta", text: "Amantti Café se compromete a ofrecer los siguientes beneficios..." },
  { title: "Responsabilidades de las Partes", text: "Amantti Café se compromete a:\n1. Suministrar café de alta calidad...\n\n[Cliente] se compromete a:\n1. Mantener la exclusividad..." },
  { title: "Condiciones Comerciales", text: "Café para Consumo en el Establecimiento:\n• Tiempo de entrega: 2 días hábiles\n• Forma de pago: Crédito a 15 días" },
  { title: "Beneficios del Acuerdo", text: "1. Exclusividad en la oferta de café especial...\n2. Diferenciación frente a otros establecimientos..." }
];

export default function ProposalForm({ clients, initialProposal, sellerName }: { clients: any[], initialProposal?: any, sellerName?: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const [clientId, setClientId] = useState(initialProposal?.client_id || '');
  const [title, setTitle] = useState(initialProposal?.title || 'Propuesta de Alianza Comercial y Exclusividad');
  const [subtitle, setSubtitle] = useState(initialProposal?.subtitle || 'Café Amantti × Cliente');
  const [status, setStatus] = useState(initialProposal?.status || 'Borrador');
  const [sections, setSections] = useState<ProposalSection[]>(initialProposal?.content || DEFAULT_SECTIONS);

  const client = clients.find(c => c.id === clientId);

  const addSection = () => {
    setSections([...sections, { title: 'Nueva Sección', text: '' }]);
  };

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index));
  };

  const updateSection = (index: number, field: 'title' | 'text', value: string) => {
    const newSections = [...sections];
    newSections[index][field] = value;
    setSections(newSections);
  };

  const moveSection = (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === sections.length - 1) return;
    
    const newSections = [...sections];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newSections[index], newSections[targetIndex]] = [newSections[targetIndex], newSections[index]];
    setSections(newSections);
  };

  const buildProposalData = () => ({
    clientName: client?.name || 'Cliente',
    date: new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }),
    title,
    subtitle: subtitle.replace('Cliente', client?.name || 'Cliente'),
    content: sections,
    sellerName: sellerName || 'Asesor Amantti'
  });

  const handleDownloadPDF = async () => {
    try {
      const data = buildProposalData();
      const blob = await generateProposalPDF(data, `Propuesta_${client?.name || 'Comercial'}.pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Propuesta_${client?.name || 'Comercial'}.pdf`;
      a.click();
    } catch (err) {
      console.error(err);
      alert('Error generando PDF');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId) return alert('Selecciona un cliente');

    setIsSubmitting(true);
    try {
      const { createProposal, updateProposal } = await import('../../actions');
      const data = {
        client_id: clientId,
        title,
        subtitle,
        content: sections,
        status
      };

      const res = initialProposal 
        ? await updateProposal(initialProposal.id, data)
        : await createProposal(data);

      if (res.success) {
        router.push('/admin/quotes');
        router.refresh();
      } else {
        throw new Error(res.error);
      }
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={handleSubmit} className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">Cliente *</label>
              <select 
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
                className="w-full p-3 bg-foreground/[0.03] border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
              >
                <option value="">Selecciona un cliente...</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.name} {c.document_number ? `(${c.document_number})` : ''}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">Título de la Propuesta</label>
              <input 
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-3 bg-foreground/[0.03] border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">Subtítulo / Alianza</label>
              <input 
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                className="w-full p-3 bg-foreground/[0.03] border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
                placeholder="Ej: Café Amantti × Magicka"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">Estado</label>
              <select 
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full p-3 bg-foreground/[0.03] border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all"
              >
                <option value="Borrador">Borrador</option>
                <option value="Enviada">Enviada</option>
                <option value="Aprobada">Aprobada</option>
              </select>
            </div>
            
            <div className="pt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-white border-2 border-[#C59F59] text-[#C59F59] rounded-xl font-bold hover:bg-[#C59F59]/5 transition-colors"
              >
                <Eye className="w-5 h-5" />
                Previsualizar
              </button>
              <button
                type="button"
                onClick={handleDownloadPDF}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3 bg-foreground/5 text-foreground/70 rounded-xl font-bold hover:bg-foreground/10 transition-colors"
              >
                <FileDown className="w-5 h-5" />
                Descargar PDF
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-serif text-foreground">Secciones de la Propuesta</h3>
            <button 
              type="button"
              onClick={addSection}
              className="inline-flex items-center gap-2 text-sm font-bold text-[#C59F59] hover:text-[#B38E4D] transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar Sección
            </button>
          </div>

          <div className="space-y-4">
            {sections.map((section, index) => (
              <div key={index} className="p-6 bg-white border border-foreground/10 rounded-2xl shadow-sm space-y-4 relative group">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <input 
                      type="text"
                      value={section.title}
                      onChange={(e) => updateSection(index, 'title', e.target.value)}
                      placeholder="Título de la sección..."
                      className="w-full text-lg font-bold bg-transparent border-none focus:ring-0 p-0 text-foreground"
                    />
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button type="button" onClick={() => moveSection(index, 'up')} className="p-2 hover:bg-foreground/5 rounded-lg text-foreground/40 hover:text-foreground/70"><MoveUp className="w-4 h-4" /></button>
                    <button type="button" onClick={() => moveSection(index, 'down')} className="p-2 hover:bg-foreground/5 rounded-lg text-foreground/40 hover:text-foreground/70"><MoveDown className="w-4 h-4" /></button>
                    <button type="button" onClick={() => removeSection(index)} className="p-2 hover:bg-red-50 rounded-lg text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
                <textarea 
                  value={section.text}
                  onChange={(e) => updateSection(index, 'text', e.target.value)}
                  placeholder="Contenido de la sección..."
                  rows={4}
                  className="w-full p-4 bg-foreground/[0.02] border border-foreground/5 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59F59]/10 transition-all text-sm leading-relaxed"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="pt-8 border-t border-foreground/5">
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full md:w-auto inline-flex items-center justify-center gap-2 px-12 py-4 bg-[#292524] text-white rounded-xl font-bold hover:bg-[#1c1917] transition-all disabled:opacity-50"
          >
            {isSubmitting ? 'Guardando...' : (
              <>
                <Save className="w-5 h-5" />
                Guardar Propuesta
              </>
            )}
          </button>
        </div>
      </form>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col relative">
            <button 
              onClick={() => setShowPreview(false)}
              className="absolute right-6 top-6 z-10 p-2 bg-white/80 backdrop-blur shadow-lg rounded-full hover:bg-white transition-colors"
            >
              <X className="w-6 h-6 text-foreground/60" />
            </button>
            
            <div className="p-8 border-b border-foreground/5 flex justify-between items-center bg-[#f9f7f0]">
              <h2 className="text-2xl font-serif text-foreground">Previsualización de Propuesta</h2>
            </div>

            <div className="flex-1 overflow-auto p-8 bg-foreground/5 flex justify-center">
              <div className="shadow-2xl scale-[0.8] origin-top md:scale-100">
                <ProposalHTMLTemplate data={buildProposalData()} />
              </div>
            </div>

            <div className="p-6 border-t border-foreground/5 bg-white flex justify-end gap-3">
              <button 
                onClick={() => setShowPreview(false)}
                className="px-6 py-3 text-foreground/60 font-bold hover:bg-foreground/5 rounded-xl transition-colors"
              >
                Cerrar
              </button>
              <button 
                onClick={handleDownloadPDF}
                className="px-8 py-3 bg-[#C59F59] text-white rounded-xl font-bold hover:bg-[#B38E4D] transition-colors flex items-center gap-2"
              >
                <FileDown className="w-5 h-5" />
                Descargar PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

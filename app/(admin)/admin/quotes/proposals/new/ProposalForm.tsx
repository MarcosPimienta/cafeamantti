'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, FileDown, Save, X } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { generateProposalPDF } from '@/utils/pdf/quoteGenerator';
import { ProposalHTMLTemplate } from '../ProposalHTMLTemplate';
import type { ProposalData } from '../ProposalHTMLTemplate';
import BlockCard, { ProposalBlock, BlockType } from './blocks/BlockCard';
import RichTextBlock from './blocks/RichTextBlock';
import PriceTableBlock from './blocks/PriceTableBlock';
import ChecklistBlock from './blocks/ChecklistBlock';
import BrandIdentityPanel from './BrandIdentityPanel';

function genId() { return `block_${Math.random().toString(36).substring(2, 9)}`; }

const DEFAULT_BLOCKS: ProposalBlock[] = [
  { id: 'block_def_1', type: 'rich-text', title: 'Presentación de Amantti Café', text: 'Amantti Café es una marca de café especial 100 % colombiano, enfocado en ofrecer una experiencia única de calidad y sabor. A través de nuestro compromiso con los agricultores locales, garantizamos un café de origen que destaca por su frescura, trazabilidad y calidad en cada taza.\n\nNuestro objetivo es aliarnos con establecimientos que busquen diferenciarse, ofreciendo no solo un producto exclusivo, sino una experiencia completa que resalte el valor cultural y gastronómico de Medellín.' },
  { id: 'block_def_2', type: 'rich-text', title: 'Objetivo de la Alianza', text: 'Proponer una alianza estratégica y de exclusividad entre [Cliente] y Amantti Café con los siguientes objetivos:\n\n• Suministrar café especial para consumo directo en el establecimiento.\n• Comercializar café Amantti en presentaciones retail (para llevar).\n• Potenciar la oferta gastronómica mediante un producto exclusivo.' },
  { id: 'block_def_3', type: 'checklist', title: 'Alcance de la Propuesta', checklistItems: ['Suministro continuo de café especial Amantti', 'Entregas rápidas y programadas', 'Asesoría y capacitación en barismo (2 veces por año)', 'Exclusividad de la marca Amantti en el establecimiento'] },
  { id: 'block_def_4', type: 'price-table', title: 'Condiciones Comerciales — Presentaciones Retail', items: [{ item: 'Café Amantti 250g', cost: 30000, pvp: 45000 }, { item: 'Café Amantti 500g', cost: 50000, pvp: 75000 }] },
  { id: 'block_def_5', type: 'rich-text', title: 'Beneficios del Acuerdo', text: '1. Exclusividad en la oferta de café especial dentro del establecimiento.\n2. Diferenciación frente a otros establecimientos de la zona.\n3. Valor agregado a la experiencia de los turistas y clientes.\n4. Oportunidad de generar ingresos adicionales mediante la venta retail.\n5. Apoyo en marketing y promoción para fortalecer la imagen de marca.' },
];

// Convert old-format sections to blocks (retrocompat)
function migrateContent(content: any[]): ProposalBlock[] {
  return content.map((section: any, idx: number) => ({
    id: section.id || `migrated_${idx}`,
    type: section.type || 'rich-text',
    title: section.title || '',
    text: section.text,
    items: section.items,
    checklistItems: section.checklistItems,
  }));
}

interface ProposalFormProps {
  clients: any[];
  initialProposal?: any;
  sellerName?: string;
}

export default function ProposalForm({ clients, initialProposal, sellerName }: ProposalFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Meta fields
  const [clientId, setClientId] = useState(initialProposal?.client_id || '');
  const [title, setTitle] = useState(initialProposal?.title || 'Propuesta de Alianza Comercial y Exclusividad');
  const [subtitle, setSubtitle] = useState(initialProposal?.subtitle || 'Café Amantti × Cliente');
  const [status, setStatus] = useState(initialProposal?.status || 'Borrador');

  // Brand identity
  const [allyLogoUrl, setAllyLogoUrl] = useState(initialProposal?.ally_logo_url || '');
  const [allyLogoSignedUrl, setAllyLogoSignedUrl] = useState('');
  const [backgroundImageUrl, setBackgroundImageUrl] = useState(
    initialProposal?.background_image_url || '/images/Main_Background.jpg'
  );
  const [backgroundSignedUrl, setBackgroundSignedUrl] = useState(
    initialProposal?.background_image_url ? '' : '/images/Main_Background.jpg'
  );
  const [backgroundOpacity, setBackgroundOpacity] = useState(initialProposal?.background_opacity ?? 0.5);

  // Blocks
  const [blocks, setBlocks] = useState<ProposalBlock[]>(
    initialProposal?.content ? migrateContent(initialProposal.content) : DEFAULT_BLOCKS
  );

  // Load signed URLs for existing assets on mount
  useEffect(() => {
    async function loadSignedUrls() {
      if (initialProposal?.ally_logo_url) {
        const { getProposalAssetSignedUrl } = await import('@/utils/supabase/storage');
        const url = await getProposalAssetSignedUrl(initialProposal.ally_logo_url);
        if (url) setAllyLogoSignedUrl(url);
      }
      if (initialProposal?.background_image_url) {
        const { getProposalAssetSignedUrl } = await import('@/utils/supabase/storage');
        const url = await getProposalAssetSignedUrl(initialProposal.background_image_url);
        if (url) setBackgroundSignedUrl(url);
      }
    }
    loadSignedUrls();
  }, [initialProposal?.ally_logo_url, initialProposal?.background_image_url]);

  // Date handling to avoid hydration mismatch
  const [currentDate, setCurrentDate] = useState('');
  useEffect(() => {
    setCurrentDate(new Date().toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' }));
  }, []);

  // Debounced preview data
  const [debouncedPreview, setDebouncedPreview] = useState<ProposalData | null>(null);

  const client = clients.find(c => c.id === clientId);

  const buildProposalData = useCallback((): ProposalData => ({
    clientName: client?.name || 'Cliente',
    date: currentDate || '...',
    title,
    subtitle: subtitle.replace('Cliente', client?.name || 'Cliente'),
    content: blocks,
    sellerName: sellerName || 'Asesor Amantti',
    allyLogoUrl: allyLogoSignedUrl || undefined,
    backgroundImageUrl: backgroundSignedUrl || undefined,
    backgroundOpacity,
  }), [client, currentDate, title, subtitle, blocks, sellerName, allyLogoSignedUrl, backgroundSignedUrl, backgroundOpacity]);

  // Debounce preview updates by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedPreview(buildProposalData());
    }, 300);
    return () => clearTimeout(timer);
  }, [buildProposalData]);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setBlocks(prev => {
        const oldIdx = prev.findIndex(b => b.id === active.id);
        const newIdx = prev.findIndex(b => b.id === over.id);
        return arrayMove(prev, oldIdx, newIdx);
      });
    }
  };

  const addBlock = (type: BlockType = 'rich-text', afterIndex?: number) => {
    const newBlock: ProposalBlock = {
      id: genId(),
      type,
      title: '',
      ...(type === 'rich-text' ? { text: '' } : {}),
      ...(type === 'price-table' ? { items: [{ item: '', cost: 0, pvp: 0 }] } : {}),
      ...(type === 'checklist' ? { checklistItems: [''] } : {}),
    };
    if (afterIndex !== undefined) {
      const newBlocks = [...blocks];
      newBlocks.splice(afterIndex + 1, 0, newBlock);
      setBlocks(newBlocks);
    } else {
      setBlocks([...blocks, newBlock]);
    }
  };

  const updateBlock = (index: number, updated: ProposalBlock) => {
    const newBlocks = [...blocks];
    newBlocks[index] = updated;
    setBlocks(newBlocks);
  };

  const deleteBlock = (index: number) => {
    if (blocks.length <= 1) return;
    setBlocks(blocks.filter((_, i) => i !== index));
  };

  const handleDownloadPDF = async () => {
    try {
      const data = buildProposalData();
      const blob = await generateProposalPDF(data, `Propuesta_${client?.name || 'Comercial'}.pdf`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Propuesta_${client?.name || 'Comercial'}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
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
        content: blocks,
        status,
        ally_logo_url: allyLogoUrl || null,
        background_image_url: backgroundImageUrl || null,
        background_opacity: backgroundOpacity,
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

  const blockIds = useMemo(() => blocks.map(b => b.id), [blocks]);

  if (!mounted) {
    return (
      <div className="flex flex-col items-center justify-center p-20 bg-white border border-foreground/10 rounded-3xl space-y-4">
        <div className="w-12 h-12 border-4 border-[#C59F59]/20 border-t-[#C59F59] rounded-full animate-spin" />
        <p className="text-sm font-medium text-foreground/40">Cargando editor de bloques...</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} suppressHydrationWarning>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_480px] gap-8 items-start">
        {/* ========= LEFT: EDITOR ========= */}
        <div className="space-y-6 min-w-0">
          {/* Brand Identity Panel */}
          <BrandIdentityPanel
            allyLogoUrl={allyLogoUrl}
            allyLogoSignedUrl={allyLogoSignedUrl}
            backgroundImageUrl={backgroundImageUrl}
            backgroundSignedUrl={backgroundSignedUrl}
            backgroundOpacity={backgroundOpacity}
            onAllyLogoChange={(path, signed) => { setAllyLogoUrl(path); setAllyLogoSignedUrl(signed); }}
            onBackgroundChange={(path, signed) => { setBackgroundImageUrl(path); setBackgroundSignedUrl(signed); }}
            onOpacityChange={setBackgroundOpacity}
          />

          {/* Meta fields */}
          <div className="bg-white border border-foreground/10 rounded-2xl p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-1.5">Cliente *</label>
                <select
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  required
                  className="w-full p-3 bg-foreground/[0.03] border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all text-sm"
                >
                  <option value="">Selecciona un cliente...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} {c.document_number ? `(${c.document_number})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-1.5">Estado</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full p-3 bg-foreground/[0.03] border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all text-sm"
                >
                  <option value="Borrador">Borrador</option>
                  <option value="Enviada">Enviada</option>
                  <option value="Aprobada">Aprobada</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-1.5">Título</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-3 bg-foreground/[0.03] border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-1.5">Subtítulo / Alianza</label>
              <input
                type="text"
                value={subtitle}
                onChange={(e) => setSubtitle(e.target.value)}
                placeholder="Ej: Café Amantti × Magicka"
                className="w-full p-3 bg-foreground/[0.03] border border-foreground/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 transition-all text-sm"
              />
            </div>
          </div>

          {/* Blocks Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-foreground">Bloques de Contenido</h3>
              <button
                type="button"
                onClick={() => addBlock('rich-text')}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#C59F59] hover:text-[#B38E4D] transition-colors"
              >
                <Plus className="w-4 h-4" />
                Agregar Bloque
              </button>
            </div>

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={blockIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-3">
                  {blocks.map((block, index) => (
                    <React.Fragment key={block.id}>
                      <BlockCard
                        block={block}
                        onUpdate={(updated) => updateBlock(index, updated)}
                        onDelete={() => deleteBlock(index)}
                      >
                        {block.type === 'rich-text' && (
                          <RichTextBlock block={block} onUpdate={(updated) => updateBlock(index, updated)} />
                        )}
                        {block.type === 'price-table' && (
                          <PriceTableBlock block={block} onUpdate={(updated) => updateBlock(index, updated)} />
                        )}
                        {block.type === 'checklist' && (
                          <ChecklistBlock block={block} onUpdate={(updated) => updateBlock(index, updated)} />
                        )}
                      </BlockCard>

                      {/* Insert button between blocks */}
                      <div className="flex justify-center -my-1">
                        <button
                          type="button"
                          onClick={() => addBlock('rich-text', index)}
                          className="p-1 rounded-full text-foreground/10 hover:text-[#C59F59] hover:bg-[#C59F59]/5 transition-all"
                          title="Insertar bloque aquí"
                        >
                          <Plus className="w-4 h-4" />
                        </button>
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          {/* Actions bar */}
          <div className="flex flex-wrap gap-3 pt-4 border-t border-foreground/5">
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-[#292524] text-white rounded-xl font-bold hover:bg-[#1c1917] transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Guardando...' : <><Save className="w-5 h-5" /> Guardar Propuesta</>}
            </button>
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="inline-flex items-center justify-center gap-2 px-8 py-3.5 bg-foreground/5 text-foreground/70 rounded-xl font-bold hover:bg-foreground/10 transition-colors"
            >
              <FileDown className="w-5 h-5" />
              Descargar PDF
            </button>
          </div>
        </div>

        {/* ========= RIGHT: LIVE PREVIEW ========= */}
        <div className="hidden xl:block sticky top-8">
          <div className="bg-foreground/[0.03] border border-foreground/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 bg-[#FDFBF7] border-b border-foreground/5 flex items-center justify-between">
              <span className="text-xs font-bold text-foreground/50 uppercase tracking-wider">Preview en Vivo</span>
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            </div>
            <div className="p-4 overflow-auto max-h-[calc(100vh-140px)]">
              <div className="origin-top-left scale-[0.55] w-[816px]" style={{ transformOrigin: 'top left' }}>
                {debouncedPreview && <ProposalHTMLTemplate data={debouncedPreview} />}
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

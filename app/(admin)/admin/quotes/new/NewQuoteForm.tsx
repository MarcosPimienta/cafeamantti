'use client';

import React, { useState } from 'react';
import { computeQuoteTotals } from "@/utils/quotes/totals";
import { generateQuotePDF } from '@/utils/pdf/quoteGenerator';
import { Plus, Trash2, FileDown, Save, Eye, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { QuoteHTMLTemplate } from '../QuoteHTMLTemplate';
import { DocLanguagePicker, useTr } from "@/app/(admin)/AdminI18n";
import { translate, type Locale } from "@/utils/i18n/translate";

export default function NewQuoteForm({ clients, inventory, initialQuote, sellerName }: { clients: any[], inventory: any[], initialQuote?: any, sellerName?: string }) {
  const tr = useTr();
  const [docLang, setDocLang] = useState<Locale>(tr.locale);
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  const [clientId, setClientId] = useState(initialQuote?.client_id || (initialQuote?.custom_client_name ? 'custom' : ''));
  const [customClientName, setCustomClientName] = useState(initialQuote?.custom_client_name || '');
  const [customClientDocument, setCustomClientDocument] = useState(initialQuote?.custom_client_document || '');
  const [customClientEmail, setCustomClientEmail] = useState(initialQuote?.custom_client_email || '');
  const [customClientPhone, setCustomClientPhone] = useState(initialQuote?.custom_client_phone || '');
  
  const [discountAmount, setDiscountAmount] = useState(initialQuote?.discount_amount || 0);
  const [status, setStatus] = useState(initialQuote?.status || 'Borrador');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(initialQuote?.orientation || 'portrait');
  
  const formattedDate = initialQuote?.valid_until ? new Date(initialQuote.valid_until).toISOString().split('T')[0] : '';
  const [validUntil, setValidUntil] = useState(formattedDate);
  
  const [items, setItems] = useState<any[]>(() => {
    if (initialQuote?.quote_items) {
      return initialQuote.quote_items.map((qi: any) => ({
        ...qi,
        iva_rate: qi.iva_rate ? Number(qi.iva_rate) : (initialQuote.apply_iva ? (initialQuote.iva_rate || 5) : 0)
      }));
    }
    return [{ product_id: '', description: '', quantity: 1, unit_price: 0, iva_rate: 0, total_price: 0 }];
  });

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...items];
    const item = newItems[index];
    item[field] = value;
    
    if (field === 'product_id' && value !== 'otro') {
      const product = inventory.find(p => p.id === value);
      if (product) {
        item.description = `${product.product_name} ${product.weight ? `- ${product.weight}` : ''}`;
      }
    }
    
    if (field === 'quantity' || field === 'unit_price') {
      item.total_price = Number(item.quantity) * Number(item.unit_price);
    }
    
    setItems(newItems);
  };

  const addItem = () => {
    setItems([...items, { product_id: '', description: '', quantity: 1, unit_price: 0, iva_rate: 0, total_price: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const { subtotal, tax5, tax19, taxAmount, applyIva, ivaRate, totalAmount } = computeQuoteTotals(items, discountAmount);

  const buildPdfData = () => {
    let clientName, clientDocument, clientDocumentType, clientEmail, clientPhone;
    
    if (clientId === 'custom') {
      clientName = customClientName || 'Cliente Personalizado';
      clientDocument = customClientDocument || 'N/A';
      clientDocumentType = 'Documento';
      clientEmail = customClientEmail || 'N/A';
      clientPhone = customClientPhone || 'N/A';
    } else {
      const client = clients.find(c => c.id === clientId);
      clientName = client?.name || 'Cliente';
      clientDocument = client?.document_number || 'N/A';
      clientDocumentType = client?.document_type || 'Documento';
      clientEmail = client?.email || 'N/A';
      clientPhone = client?.phone || 'N/A';
    }

    return {
      clientName,
      clientDocument,
      clientDocumentType,
      clientEmail,
      clientPhone,
      sellerName: sellerName || translate(docLang, 'Asesor Amantti'),
      orientation,
      items: items.map(i => ({
        description: i.description || translate(docLang, 'Sin descripción'),
        quantity: Number(i.quantity) || 1,
        unit_price: Number(i.unit_price) || 0,
        iva_rate: Number(i.iva_rate) || 0,
        total_price: Number(i.total_price) || 0,
      })),
      subtotal,
      discountAmount: Number(discountAmount),
      taxAmount,
      ivaRate: applyIva ? ivaRate : 0,
      tax5,
      tax19,
      totalAmount,
      validUntil: validUntil || translate(docLang, '15 días'),
      date: new Date().toLocaleDateString(docLang === 'en' ? 'en-US' : 'es-CO'),
      lang: docLang,
    };
  };

  const generatePdfBlob = async () => {
    const cName = clientId === 'custom' ? (customClientName || 'Cliente') : (clients.find(c => c.id === clientId)?.name || 'Cliente');
    const filename = `Cotizacion_${cName.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;
    const data = buildPdfData();
    return await generateQuotePDF(data, filename, orientation);
  };

  const handlePreview = () => {
    if (items.length === 0) return alert(tr("Agrega al menos un item para previsualizar"));
    if (!clientId) return alert(tr("Selecciona un cliente para previsualizar"));
    setShowPreview(true);
  };

  const handleSubmit = async (e: React.FormEvent, generatePdf: boolean) => {
    e.preventDefault();
    if (!clientId) return alert(tr("Selecciona un cliente"));
    if (items.length === 0) return alert(tr("Agrega al menos un item"));

    setIsSubmitting(true);
    
    const quoteData = {
      client_id: clientId === 'custom' ? null : clientId,
      status,
      orientation,
      total_amount: totalAmount,
      discount_amount: Number(discountAmount),
      apply_iva: applyIva,
      iva_rate: applyIva ? ivaRate : 0,
      tax_amount: taxAmount,
      valid_until: validUntil ? new Date(validUntil).toISOString() : null,
      custom_client_name: clientId === 'custom' ? customClientName : null,
      custom_client_document: clientId === 'custom' ? customClientDocument : null,
      custom_client_email: clientId === 'custom' ? customClientEmail : null,
      custom_client_phone: clientId === 'custom' ? customClientPhone : null,
    };

    try {
      // 1. Save to database
      let res;
      if (initialQuote) {
        const { updateQuote } = await import('../actions');
        res = await updateQuote(initialQuote.id, quoteData, items);
      } else {
        const { createQuote } = await import('../actions');
        res = await createQuote(quoteData, items);
      }
      if (!res.success) throw new Error(res.error);

      // 2. Generate PDF if requested
      if (generatePdf) {
        const cName = clientId === 'custom' ? (customClientName || 'Nuevo') : (clients.find(c => c.id === clientId)?.name || 'Nuevo');
        const blob = await generatePdfBlob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Cotizacion_${cName.replace(/\s+/g, '_')}_${new Date().getTime()}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }

      router.push('/admin/quotes');
      router.refresh();
    } catch (error) {
      console.error(error);
      alert(tr("Error al guardar la cotización"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form className="space-y-8">
      {/* Client & Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
          <h3 className="font-bold text-foreground">{tr("Datos del Cliente")}</h3>
          
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">{tr("Cliente *")}</label>
            <select 
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              suppressHydrationWarning
              className="w-full p-3 bg-[#fdfbf7] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
            >
              <option value="">{tr("Selecciona un cliente del CRM")}</option>
              <option value="custom" className="font-bold text-[#C59F59]">{tr("+ Cliente Personalizado (No en CRM)")}</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.name} {c.document_number ? `(${c.document_number})` : ''}</option>
              ))}
            </select>
          </div>

          {clientId === 'custom' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 bg-[#f9f7f0] p-4 rounded-xl border border-foreground/5">
              <div className="col-span-full md:col-span-2">
                <label className="block text-sm font-medium text-foreground/70 mb-1">{tr("Nombre Completo *")}</label>
                <input 
                  required 
                  type="text" 
                  value={customClientName} 
                  onChange={e => setCustomClientName(e.target.value)} 
                  className="w-full p-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/70 mb-1">{tr("Documento (Opcional)")}</label>
                <input 
                  type="text" 
                  value={customClientDocument} 
                  onChange={e => setCustomClientDocument(e.target.value)} 
                  className="w-full p-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/70 mb-1">{tr("Email (Opcional)")}</label>
                <input 
                  type="email" 
                  value={customClientEmail} 
                  onChange={e => setCustomClientEmail(e.target.value)} 
                  className="w-full p-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-foreground/70 mb-1">{tr("Teléfono (Opcional)")}</label>
                <input 
                  type="text" 
                  value={customClientPhone} 
                  onChange={e => setCustomClientPhone(e.target.value)} 
                  className="w-full p-3 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-foreground">{tr("Opciones de la Cotización")}</h3>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">{tr("Estado")}</label>
              <select 
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                suppressHydrationWarning
                className="w-full p-3 bg-[#fdfbf7] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
              >
                <option value="Borrador">{tr("Borrador")}</option>
                <option value="Enviada">{tr("Enviada")}</option>
                <option value="Aprobada">{tr("Aprobada")}</option>
                <option value="Rechazada">{tr("Rechazada")}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/70 mb-1">{tr("Orientación PDF")}</label>
              <select 
                value={orientation}
                onChange={(e) => setOrientation(e.target.value as any)}
                suppressHydrationWarning
                className="w-full p-3 bg-[#fdfbf7] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
              >
                <option value="portrait">{tr("Vertical (Carta)")}</option>
                <option value="landscape">{tr("Horizontal (Carta)")}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/70 mb-1">{tr("Válida hasta (Opcional)")}</label>
            <input 
              type="date" 
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              suppressHydrationWarning
              className="w-full p-3 bg-[#fdfbf7] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
            />
          </div>
        </div>
      </div>

      <hr className="border-foreground/5" />

      {/* Items */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-foreground">{tr("Productos a Cotizar")}</h3>
          <button 
            type="button" 
            onClick={addItem}
            suppressHydrationWarning
            className="flex items-center gap-2 text-sm text-[#C59F59] font-bold hover:text-[#B38E4D]"
          >
            <Plus className="w-4 h-4" />{" "}{tr("Agregar Item")}
          </button>
        </div>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div key={index} className="flex flex-col md:flex-row gap-3 p-4 bg-[#f9f7f0] border border-foreground/5 rounded-xl items-start md:items-center">
              <div className="w-full md:w-1/4">
                <label className="block text-xs font-medium text-foreground/50 mb-1">{tr("Producto")}</label>
                <select 
                  value={item.product_id}
                  onChange={(e) => handleItemChange(index, 'product_id', e.target.value)}
                  suppressHydrationWarning
                  className="w-full p-2 bg-white border border-foreground/10 rounded-lg text-sm"
                >
                  <option value="">{tr("Seleccionar...")}</option>
                  <option value="otro">{tr("Otro (Escribir manual)")}</option>
                  {inventory.map(p => (
                    <option key={p.id} value={p.id}>{p.product_name}</option>
                  ))}
                </select>
              </div>
              <div className="w-full md:w-1/3">
                <label className="block text-xs font-medium text-foreground/50 mb-1">{tr("Descripción")}</label>
                <input 
                  type="text" 
                  value={item.description}
                  onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                  placeholder={tr("Descripción del item")}
                  required
                  suppressHydrationWarning
                  className="w-full p-2 bg-white border border-foreground/10 rounded-lg text-sm"
                />
              </div>
              <div className="w-full md:w-24">
                <label className="block text-xs font-medium text-foreground/50 mb-1">{tr("Cantidad")}</label>
                <input 
                  type="number" 
                  min="1"
                  value={item.quantity}
                  onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                  required
                  suppressHydrationWarning
                  className="w-full p-2 bg-white border border-foreground/10 rounded-lg text-sm text-center"
                />
              </div>
              <div className="w-full md:w-32">
                <label className="block text-xs font-medium text-foreground/50 mb-1">{tr("Precio Unit.")}</label>
                <input 
                  type="number" 
                  min="0"
                  value={item.unit_price}
                  onChange={(e) => handleItemChange(index, 'unit_price', e.target.value)}
                  required
                  suppressHydrationWarning
                  className="w-full p-2 bg-white border border-foreground/10 rounded-lg text-sm text-right"
                />
              </div>
              <div className="w-full md:w-24">
                <label className="block text-xs font-medium text-foreground/50 mb-1">{tr("IVA")}</label>
                <select 
                  value={item.iva_rate ?? 0}
                  onChange={(e) => handleItemChange(index, 'iva_rate', Number(e.target.value))}
                  suppressHydrationWarning
                  className="w-full p-2 bg-white border border-foreground/10 rounded-lg text-sm font-bold text-[#C59F59]"
                >
                  <option value={0}>0%</option>
                  <option value={5}>5%</option>
                  <option value={19}>19%</option>
                </select>
              </div>
              <div className="w-full md:w-32">
                <label className="block text-xs font-bold text-foreground/70 mb-1">{tr("Total")}</label>
                <div 
                  suppressHydrationWarning
                  className="p-2 text-sm text-right font-mono font-bold bg-white/50 rounded-lg border border-transparent"
                >
                  {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(item.total_price)}
                </div>
              </div>
              {items.length > 1 && (
                <button 
                  type="button" 
                  onClick={() => removeItem(index)}
                  suppressHydrationWarning
                  className="p-2 mt-4 md:mt-5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="flex justify-end pt-4">
          <div className="bg-[#fdfbf7] p-6 rounded-2xl border border-[#C59F59]/20 w-full md:w-1/3 space-y-3">
            <div className="flex justify-between items-center text-sm text-foreground/70">
              <span>{tr("Subtotal:")}</span>
              <span className="font-mono">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(subtotal)}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-foreground/70">
              <span>{tr("Descuento:")}</span>
              <input 
                type="number"
                min="0"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(e.target.value)}
                className="w-32 p-2 bg-white border border-foreground/10 rounded-lg text-right font-mono focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
              />
            </div>
            {tax5 > 0 && (
              <div className="flex justify-between items-center text-sm text-foreground/70">
                <span>{tr("IVA (5%):")}</span>
                <span className="font-mono">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(tax5)}</span>
              </div>
            )}
            {tax19 > 0 && (
              <div className="flex justify-between items-center text-sm text-foreground/70">
                <span>{tr("IVA (19%):")}</span>
                <span className="font-mono">{new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(tax19)}</span>
              </div>
            )}
            <div className="pt-3 border-t border-foreground/10 flex justify-between items-center text-xl font-bold text-foreground">
              <span>{tr("Gran Total:")}</span>
              <span 
                suppressHydrationWarning
                className="font-mono text-[#C59F59]"
              >
                {new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(totalAmount)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-4 pt-6 border-t border-foreground/5">
        <DocLanguagePicker value={docLang} onChange={setDocLang} className="mr-auto" />
        <button 
          type="button"
          onClick={handlePreview}
          suppressHydrationWarning
          className="flex items-center gap-2 px-6 py-3 bg-white border border-foreground/10 text-foreground font-bold rounded-xl hover:bg-foreground/5 transition-colors"
        >
          <Eye className="w-5 h-5" />{" "}{tr("Previsualizar")}
        </button>
        <button 
          type="button"
          onClick={(e) => handleSubmit(e, false)}
          disabled={isSubmitting}
          suppressHydrationWarning
          className="flex items-center gap-2 px-6 py-3 bg-white border border-foreground/10 text-foreground font-bold rounded-xl hover:bg-foreground/5 transition-colors disabled:opacity-50"
        >
          <Save className="w-5 h-5" />{" "}{tr("Solo Guardar")}
        </button>
        <button 
          type="button"
          onClick={(e) => handleSubmit(e, true)}
          disabled={isSubmitting}
          suppressHydrationWarning
          className="flex items-center gap-2 px-6 py-3 bg-[#2a221f] text-white font-bold rounded-xl hover:bg-[#3d322d] transition-colors disabled:opacity-50"
        >
          <FileDown className="w-5 h-5" />{" "}{tr("Guardar y Generar PDF")}
        </button>
      </div>

      {/* Preview Modal — renders the HTML template directly, no PDF generation */}
      {showPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          {/* Outer shell — NO overflow-hidden so the scrollbar is never clipped */}
          <div className="bg-[#f5f3ee] rounded-3xl w-full max-w-5xl h-[92vh] flex flex-col shadow-2xl" style={{ overflow: 'clip' }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-[#f0ece2] flex-shrink-0 rounded-t-3xl">
              <div>
                <h3 className="font-bold text-lg" style={{ fontFamily: 'serif' }}>{tr("Vista Previa de Cotización")}</h3>
                <p className="text-xs text-stone-400 mt-0.5">{tr("El PDF final se generará exactamente así al guardar")}</p>
              </div>
              <button 
                type="button" 
                onClick={() => setShowPreview(false)}
                className="p-2 hover:bg-stone-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Scrollable area — takes remaining height, scrolls vertically */}
            <div className={`flex-1 min-h-0 overflow-x-auto p-6 ${orientation === 'landscape' ? 'overflow-y-hidden' : 'overflow-y-auto'}`}>
              <div className="flex justify-center min-w-max">
                <div className="shadow-2xl">
                  <QuoteHTMLTemplate data={buildPdfData()} />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

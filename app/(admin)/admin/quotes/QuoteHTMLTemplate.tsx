import React, { forwardRef } from 'react';
import { QuoteData } from '@/utils/pdf/quoteGenerator';

export const QuoteHTMLTemplate = forwardRef<HTMLDivElement, { data: QuoteData }>(({ data }, ref) => {
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(val);
  };

  return (
    <div 
      ref={ref} 
      className="bg-white text-stone-900 relative w-[800px] min-h-[1130px] p-12 overflow-hidden mx-auto font-sans text-[13px]"
      style={{ boxSizing: 'border-box' }}
    >
      {/* Background Image - Absolute Positioning */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          opacity: 0.18, // Subtle opacity for print
          backgroundImage: "url('/images/Main_Background.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          zIndex: 0
        }}
      />
      
      {/* Content Container */}
      <div className="relative z-10 space-y-12">
        {/* Header */}
        <div className="flex justify-between items-start">
          <img src="/images/logo-amantti.png" alt="Amantti Logo" className="w-[220px] h-auto object-contain" />
          <div className="text-right space-y-1">
            <h1 className="text-4xl font-black uppercase tracking-widest text-[#2a221f] mb-3 border-b-2 border-[#C59F59] pb-2">Cotización</h1>
            <p className="text-sm font-medium"><span className="text-stone-500">Fecha:</span> {data.date}</p>
            <p className="text-sm font-medium"><span className="text-stone-500">Válida hasta:</span> {data.validUntil}</p>
            {data.quoteId && <p className="text-xs mt-2 text-stone-400 font-mono">Ref: {data.quoteId.substring(0, 8)}</p>}
          </div>
        </div>

        {/* Client Info */}
        <div className="bg-stone-50/90 backdrop-blur-sm border border-stone-200/60 p-6 rounded-2xl shadow-sm space-y-2 relative overflow-hidden">
          {/* Decorative bar */}
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-[#C59F59]" />
          
          <h2 className="text-sm uppercase tracking-widest font-bold text-stone-500 mb-4">Información del Cliente</h2>
          <div className="grid grid-cols-2 gap-y-3 gap-x-8">
            <p><span className="font-semibold text-stone-500 block text-xs uppercase">Nombre</span> <span className="font-medium text-sm">{data.clientName}</span></p>
            <p><span className="font-semibold text-stone-500 block text-xs uppercase">Documento</span> <span className="text-sm">{data.clientDocument || 'N/A'}</span></p>
            <p><span className="font-semibold text-stone-500 block text-xs uppercase">Email</span> <span className="text-sm">{data.clientEmail || 'N/A'}</span></p>
            <p><span className="font-semibold text-stone-500 block text-xs uppercase">Teléfono</span> <span className="text-sm">{data.clientPhone || 'N/A'}</span></p>
          </div>
        </div>

        {/* Items Table */}
        <div className="rounded-2xl overflow-hidden border border-stone-200/60 shadow-sm bg-white/80 backdrop-blur-sm">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#2a221f] text-white">
                <th className="py-4 px-6 font-semibold tracking-wide text-sm">Descripción</th>
                <th className="py-4 px-6 font-semibold tracking-wide text-sm text-center w-24">Cant</th>
                <th className="py-4 px-6 font-semibold tracking-wide text-sm text-right w-36">Precio Unit.</th>
                <th className="py-4 px-6 font-semibold tracking-wide text-sm text-right w-36">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {data.items.map((item, idx) => (
                <tr key={idx} className={idx % 2 === 0 ? "bg-transparent" : "bg-stone-50/50"}>
                  <td className="py-4 px-6 font-medium text-stone-800">{item.description}</td>
                  <td className="py-4 px-6 text-center font-semibold">{item.quantity}</td>
                  <td className="py-4 px-6 text-right text-stone-600">{formatCurrency(item.unit_price)}</td>
                  <td className="py-4 px-6 text-right font-bold text-stone-900">{formatCurrency(item.total_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Total Amount */}
        <div className="flex justify-end pt-2">
          <div className="bg-[#2a221f] text-white p-6 rounded-2xl shadow-lg min-w-[280px] relative overflow-hidden">
            <div className="absolute right-0 top-0 bottom-0 w-2 bg-[#C59F59]" />
            <p className="text-xs font-bold text-[#C59F59] mb-1 uppercase tracking-widest">Total Cotizado</p>
            <p className="text-3xl font-black">{formatCurrency(data.totalAmount)}</p>
          </div>
        </div>
      </div>
      
      {/* Footer */}
      <div className="absolute bottom-8 left-0 right-0 text-center text-xs font-medium text-stone-400 z-10 flex flex-col items-center gap-2">
        <div className="w-12 h-[1px] bg-[#C59F59]/50" />
        <p>Café Amantti - Pasión por el origen</p>
        <p className="text-[10px] text-stone-300">Documento generado automáticamente</p>
      </div>
    </div>
  );
});

QuoteHTMLTemplate.displayName = 'QuoteHTMLTemplate';

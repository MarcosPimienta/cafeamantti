// @ts-ignore
import html2pdf from 'html2pdf.js';

export interface QuoteItem {
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface QuoteData {
  clientName: string;
  clientDocument: string;
  clientEmail: string;
  clientPhone: string;
  orientation: 'portrait' | 'landscape';
  items: QuoteItem[];
  totalAmount: number;
  validUntil: string;
  quoteId?: string;
  date: string;
}

export async function generateQuotePDF(element: HTMLElement, filename: string = 'cotizacion.pdf'): Promise<Blob> {
  const opt = {
    margin:       0,
    filename:     filename,
    image:        { type: 'jpeg' as const, quality: 0.98 },
    html2canvas:  { scale: 2, useCORS: true, logging: false },
    jsPDF:        { unit: 'in' as const, format: 'letter' as const, orientation: 'portrait' as const }
  };

  // html2pdf returns a promise that resolves to the worker. 
  // We can chain .output('blob') to get the Blob directly.
  return await html2pdf().set(opt).from(element).output('blob');
}

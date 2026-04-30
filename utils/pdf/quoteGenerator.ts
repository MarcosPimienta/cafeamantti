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

export async function generateQuotePDF(
  element: HTMLElement,
  filename: string = 'cotizacion.pdf',
  orientation: 'portrait' | 'landscape' = 'portrait'
): Promise<Blob> {
  // Dynamic import to avoid SSR issues (html2pdf uses window/document)
  const html2pdf = (await import('html2pdf.js')).default;

  const opt = {
    margin:      0,
    filename,
    image:       { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false, allowTaint: true },
    jsPDF:       { unit: 'in' as const, format: 'letter' as const, orientation }
  };

  return await html2pdf().set(opt).from(element).output('blob');
}

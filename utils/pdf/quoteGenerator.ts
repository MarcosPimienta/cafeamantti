import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

// Helper functions to load images as DataURLs
function loadImage(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Removed crossOrigin for same-origin local images which might cause issues
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No 2d context');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png', 1.0));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

function loadTranslucentImage(url: string, opacity: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No 2d context');
        
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        ctx.globalAlpha = opacity;
        ctx.drawImage(img, 0, 0);
        
        resolve(canvas.toDataURL('image/jpeg', 0.9));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

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

export async function generateQuotePDF(data: QuoteData) {
  const doc = new jsPDF({
    orientation: data.orientation,
    unit: 'mm',
    format: 'letter'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // 1. Load images
  try {
    const bgUrl = await loadTranslucentImage('/images/Main_Background.jpg', 0.15);
    const logoUrl = await loadImage('/images/logo-amantti.png');

    doc.addImage(bgUrl, 'JPEG', 0, 0, pageWidth, pageHeight);

    const logoWidth = 40;
    const logoHeight = 40;
    doc.addImage(logoUrl, 'PNG', 15, 15, logoWidth, logoHeight);

  } catch (error) {
    console.error("Error loading images for PDF:", error);
  }

  // 4. Header Text
  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text('COTIZACIÓN', pageWidth - 15, 25, { align: 'right' });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Fecha: ${data.date}`, pageWidth - 15, 32, { align: 'right' });
  doc.text(`Válida hasta: ${data.validUntil}`, pageWidth - 15, 38, { align: 'right' });
  if (data.quoteId) {
    doc.text(`Ref: ${data.quoteId.substring(0, 8)}`, pageWidth - 15, 44, { align: 'right' });
  }

  // 5. Client Information
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  const startY = 65;
  doc.text('Información del Cliente:', 15, startY);
  
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Nombre: ${data.clientName}`, 15, startY + 6);
  doc.text(`Documento: ${data.clientDocument || 'N/A'}`, 15, startY + 12);
  doc.text(`Email: ${data.clientEmail || 'N/A'}`, 15, startY + 18);
  doc.text(`Teléfono: ${data.clientPhone || 'N/A'}`, 15, startY + 24);

  // 6. Items Table
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(val);
  };

  const tableData = data.items.map(item => [
    item.description,
    item.quantity.toString(),
    formatCurrency(item.unit_price),
    formatCurrency(item.total_price)
  ]);

  autoTable(doc, {
    startY: startY + 35,
    head: [['Descripción', 'Cantidad', 'Precio Unitario', 'Total']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [41, 37, 36] }, // Tailwind stone-800
    styles: {
      font: 'helvetica',
      fontSize: 10,
      cellPadding: 5,
    },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { cellWidth: 25, halign: 'center' },
      2: { cellWidth: 35, halign: 'right' },
      3: { cellWidth: 35, halign: 'right' },
    },
    margin: { left: 15, right: 15 }
  });

  // 7. Total Amount
  const finalY = (doc as any).lastAutoTable?.finalY || startY + 50;
  
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text(`Total Cotizado:`, pageWidth - 60, finalY + 15);
  
  doc.setFontSize(14);
  doc.text(`${formatCurrency(data.totalAmount)}`, pageWidth - 15, finalY + 15, { align: 'right' });

  // 8. Footer
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100);
  const footerText = "Café Amantti - Pasión por el origen. Cotización generada automáticamente.";
  doc.text(footerText, pageWidth / 2, pageHeight - 15, { align: 'center' });

  return doc;
}

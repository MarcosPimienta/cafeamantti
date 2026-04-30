import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';

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

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(val);
}

function buildHTMLString(data: QuoteData): string {
  const rows = data.items.map((item, idx) => `
    <tr style="background-color:${idx % 2 === 0 ? '#ffffff' : '#fafaf9'}">
      <td style="padding:14px 16px;font-size:13px;color:#292524;font-weight:500;border-bottom:1px solid #e7e5e4;">${item.description}</td>
      <td style="padding:14px 16px;font-size:13px;text-align:right;color:#57534e;border-bottom:1px solid #e7e5e4;">${item.quantity}</td>
      <td style="padding:14px 16px;font-size:13px;text-align:right;color:#57534e;border-bottom:1px solid #e7e5e4;">${formatCurrency(item.unit_price)}</td>
      <td style="padding:14px 16px;font-size:13px;text-align:right;font-weight:700;color:#292524;border-bottom:1px solid #e7e5e4;">${formatCurrency(item.total_price)}</td>
    </tr>
  `).join('');

  // Use absolute URL for images so html2canvas can fetch them
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Letter size: portrait 816x1056, landscape 1056x816 (at ~96dpi)
  const isLandscape = data.orientation === 'landscape';
  const docWidth  = isLandscape ? 1056 : 816;
  const docHeight = isLandscape ? 816  : 1056;

  return `
    <div style="
      font-family: Arial, Helvetica, sans-serif;
      background-color: #ffffff;
      color: #1c1917;
      position: relative;
      width: ${docWidth}px;
      min-height: ${docHeight}px;
      padding: ${isLandscape ? '48px 64px' : '64px'};
      box-sizing: border-box;
    ">
      <!-- Background Image -->
      <img src="${baseUrl}/images/Main_Background.jpg" style="
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        opacity: 0.5;
        z-index: 0;
        top: 0; left: 0;
      " />

      <!-- Content -->
      <div style="position: relative; z-index: 1;">

        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 48px;">
          <img src="${baseUrl}/images/logo-amantti.png" style="width: 200px; height: auto; object-fit: contain;" />
          <div style="text-align: right;">
            <h1 style="font-size: 36px; font-weight: 900; text-transform: uppercase; letter-spacing: 4px; color: #292524; margin: 0 0 8px 0; padding-bottom: 8px; border-bottom: 2px solid #C59F59;">
              Cotización
            </h1>
            <p style="margin: 4px 0; font-size: 13px; color: #57534e;"><strong>Fecha:</strong> ${data.date}</p>
            <p style="margin: 4px 0; font-size: 13px; color: #57534e;"><strong>Válida hasta:</strong> ${data.validUntil}</p>
            ${data.quoteId ? `<p style="margin: 8px 0 0; font-size: 11px; color: #a8a29e; font-family: monospace;">Ref: ${data.quoteId.substring(0, 8)}</p>` : ''}
          </div>
        </div>

        <!-- Client Info -->
        <div style="background-color: rgba(245,245,244,0.9); border: 1px solid #d6d3d1; border-radius: 12px; padding: 24px 24px 24px 32px; margin-bottom: 40px; position: relative; overflow: hidden;">
          <div style="position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background-color: #C59F59;"></div>
          <p style="font-size: 11px; font-weight: 700; color: #78716c; text-transform: uppercase; letter-spacing: 2px; margin: 0 0 16px 0;">Información del Cliente</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="width: 50%; padding: 4px 16px 4px 0; vertical-align: top;">
                <p style="margin:0; font-size:11px; color:#78716c; text-transform:uppercase; letter-spacing:1px;">Nombre</p>
                <p style="margin:2px 0 0; font-size:13px; font-weight:600; color:#292524;">${data.clientName}</p>
              </td>
              <td style="width: 50%; padding: 4px 0; vertical-align: top;">
                <p style="margin:0; font-size:11px; color:#78716c; text-transform:uppercase; letter-spacing:1px;">Documento</p>
                <p style="margin:2px 0 0; font-size:13px; font-weight:600; color:#292524;">${data.clientDocument || 'N/A'}</p>
              </td>
            </tr>
            <tr>
              <td style="padding: 4px 16px 4px 0; vertical-align: top;">
                <p style="margin:0; font-size:11px; color:#78716c; text-transform:uppercase; letter-spacing:1px;">Email</p>
                <p style="margin:2px 0 0; font-size:13px; font-weight:600; color:#292524;">${data.clientEmail || 'N/A'}</p>
              </td>
              <td style="padding: 4px 0; vertical-align: top;">
                <p style="margin:0; font-size:11px; color:#78716c; text-transform:uppercase; letter-spacing:1px;">Teléfono</p>
                <p style="margin:2px 0 0; font-size:13px; font-weight:600; color:#292524;">${data.clientPhone || 'N/A'}</p>
              </td>
            </tr>
          </table>
        </div>

        <!-- Items Table -->
        <table style="width: 100%; border-collapse: collapse; border-radius: 12px; overflow: hidden; margin-bottom: 32px;">
          <thead>
            <tr style="background-color: #292524;">
              <th style="padding:14px 16px;font-size:12px;font-weight:700;color:#ffffff;text-align:left;letter-spacing:1px;">Descripción</th>
              <th style="padding:14px 16px;font-size:12px;font-weight:700;color:#ffffff;text-align:right;letter-spacing:1px;">Cant.</th>
              <th style="padding:14px 16px;font-size:12px;font-weight:700;color:#ffffff;text-align:right;letter-spacing:1px;">Precio Unit.</th>
              <th style="padding:14px 16px;font-size:12px;font-weight:700;color:#ffffff;text-align:right;letter-spacing:1px;">Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>

        <!-- Total -->
        <div style="display: flex; justify-content: flex-end;">
          <div style="background-color: #292524; color: #ffffff; border-radius: 12px; padding: 24px 32px; min-width: 280px; position: relative; overflow: hidden;">
            <div style="position: absolute; right: 0; top: 0; bottom: 0; width: 6px; background-color: #C59F59;"></div>
            <p style="margin: 0 0 4px; font-size: 11px; font-weight: 700; color: #C59F59; text-transform: uppercase; letter-spacing: 2px;">Total Cotizado</p>
            <p style="margin: 0; font-size: 28px; font-weight: 900; color: #ffffff;">${formatCurrency(data.totalAmount)}</p>
          </div>
        </div>

      </div><!-- end content -->

      <!-- Footer -->
      <div style="position: absolute; bottom: 32px; left: 0; right: 0; text-align: center; z-index: 1;">
        <div style="width: 48px; height: 1px; background-color: rgba(197,159,89,0.5); margin: 0 auto 8px;"></div>
        <p style="margin: 0; font-size: 11px; color: #a8a29e;">Café Amantti — Pasión por el origen</p>
        <p style="margin: 4px 0 0; font-size: 10px; color: #d6d3d1;">Documento generado automáticamente</p>
      </div>

    </div>
  `;
}

export async function generateQuotePDF(
  data: QuoteData,
  filename: string = 'cotizacion.pdf',
  orientation: 'portrait' | 'landscape' = 'portrait'
): Promise<Blob> {
  // Dynamic import — html2pdf.js uses window/document and cannot be imported at module level in Next.js
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const html2pdf = (await import('html2pdf.js')).default;
  const isLandscape = orientation === 'landscape';

  // Build a temporary container and inject the HTML
  const container = document.createElement('div');
  container.innerHTML = buildHTMLString(data);
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.zIndex = '-1';
  document.body.appendChild(container);

  try {
    const element = container.firstElementChild as HTMLElement;

    const opt = {
      margin:      0,
      filename,
      image:       { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: isLandscape ? 1056 : 816,
        windowWidth: isLandscape ? 1056 : 816,
        onclone: (_clonedDoc: Document) => {
          const clonedDoc = _clonedDoc;
          const links = clonedDoc.querySelectorAll('link[rel="stylesheet"]');
          links.forEach(el => el.parentNode?.removeChild(el));
          const styles = clonedDoc.querySelectorAll('style');
          styles.forEach(el => el.parentNode?.removeChild(el));
        },
      },
      jsPDF: {
        unit: 'px' as const,
        format: [816, 1056] as [number, number],
        orientation: orientation === 'landscape' ? 'landscape' as const : 'portrait' as const,
      },
    };

    const blob: Blob = await html2pdf().set(opt).from(element).output('blob');
    return blob;
  } finally {
    document.body.removeChild(container);
  }
}

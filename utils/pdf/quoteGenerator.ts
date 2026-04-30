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

// ─── Constants ────────────────────────────────────────────────────────────────
const ITEMS_PER_PAGE = 10;
const PORTRAIT_W  = 816;
const PORTRAIT_H  = 1056;
const LANDSCAPE_W = 1056;
const LANDSCAPE_H = 816;
const PAD_V_P = 56;
const PAD_V_L = 40;
const PAD_H   = 64;

const H_HEADER        = 100;
const H_HEADER_MARGIN = 40;
const H_CLIENT        = 140;
const H_CLIENT_MARGIN = 32;
const H_TABLE_HEAD    = 46;
const H_FOOTER        = 48;
const H_COMPACT_HEADER = 56;
const H_COMPACT_MARGIN = 24;
const H_TOTAL         = 100;

function fmt(val: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(val);
}

function buildHTMLString(data: QuoteData): string {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  const isLandscape = data.orientation === 'landscape';
  const pageW  = isLandscape ? LANDSCAPE_W : PORTRAIT_W;
  const pageH  = isLandscape ? LANDSCAPE_H : PORTRAIT_H;
  const padV   = isLandscape ? PAD_V_L : PAD_V_P;
  const innerH = pageH - 2 * padV;

  // Paginate
  const allItems = data.items.length > 0 ? data.items : [];
  const itemPages: QuoteItem[][] = [];
  for (let i = 0; i < Math.max(allItems.length, 1); i += ITEMS_PER_PAGE) {
    itemPages.push(allItems.slice(i, i + ITEMS_PER_PAGE));
  }
  const totalPages = itemPages.length;

  // Row heights
  const firstOverhead = H_HEADER + H_HEADER_MARGIN + H_CLIENT + H_CLIENT_MARGIN + H_TABLE_HEAD + H_FOOTER;

  function rowHeightForPage(pageIdx: number): number {
    const count = itemPages[pageIdx].length;
    if (count === 0) return 48;
    const isLast = pageIdx === totalPages - 1;

    if (pageIdx === 0 && totalPages === 1) {
      return Math.max(36, Math.floor((innerH - firstOverhead - H_TOTAL) / count));
    }
    if (pageIdx === 0) {
      return Math.max(36, Math.floor((innerH - firstOverhead) / count));
    }
    const contOverhead = H_COMPACT_HEADER + H_COMPACT_MARGIN + H_TABLE_HEAD + H_FOOTER + (isLast ? H_TOTAL : 0);
    return Math.max(36, Math.floor((innerH - contOverhead) / count));
  }

  const pageStyle = `
    font-family: Arial, Helvetica, sans-serif;
    background-color: #ffffff;
    color: #1c1917;
    position: relative;
    width: ${pageW}px;
    height: ${pageH}px;
    padding: ${padV}px ${PAD_H}px;
    box-sizing: border-box;
    overflow: hidden;
    page-break-after: always;
  `;

  const bgImgStyle = `
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
    opacity: 0.5;
    z-index: 0;
    top: 0; left: 0;
  `;

  const contentStyle = `
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    height: 100%;
  `;

  const tableHeadHtml = `
    <thead>
      <tr style="background-color:#292524;">
        <th style="padding:0 16px;height:${H_TABLE_HEAD}px;font-size:12px;font-weight:700;color:#fff;text-align:left;letter-spacing:1px;">Descripción</th>
        <th style="padding:0 16px;height:${H_TABLE_HEAD}px;font-size:12px;font-weight:700;color:#fff;text-align:right;letter-spacing:1px;">Cant.</th>
        <th style="padding:0 16px;height:${H_TABLE_HEAD}px;font-size:12px;font-weight:700;color:#fff;text-align:right;letter-spacing:1px;">Precio Unit.</th>
        <th style="padding:0 16px;height:${H_TABLE_HEAD}px;font-size:12px;font-weight:700;color:#fff;text-align:right;letter-spacing:1px;">Total</th>
      </tr>
    </thead>
  `;

  const firstPageHeader = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:${H_HEADER_MARGIN}px;">
      <img src="${baseUrl}/images/logo-amantti.png" style="width:200px;height:auto;object-fit:contain;" />
      <div style="text-align:right;">
        <h1 style="font-size:34px;font-weight:900;text-transform:uppercase;letter-spacing:4px;color:#292524;margin:0 0 6px;padding-bottom:6px;border-bottom:2px solid #C59F59;">Cotización</h1>
        <p style="margin:3px 0;font-size:12px;color:#57534e;"><strong>Fecha:</strong> ${data.date}</p>
        <p style="margin:3px 0;font-size:12px;color:#57534e;"><strong>Válida hasta:</strong> ${data.validUntil}</p>
        ${data.quoteId ? `<p style="margin:6px 0 0;font-size:10px;color:#a8a29e;font-family:monospace;">Ref: ${data.quoteId.substring(0, 8)}</p>` : ''}
      </div>
    </div>
    <div style="background-color:rgba(245,245,244,0.92);border:1px solid #d6d3d1;border-radius:10px;padding:18px 20px 18px 26px;margin-bottom:${H_CLIENT_MARGIN}px;position:relative;overflow:hidden;">
      <div style="position:absolute;left:0;top:0;bottom:0;width:4px;background-color:#C59F59;"></div>
      <p style="font-size:10px;font-weight:700;color:#78716c;text-transform:uppercase;letter-spacing:2px;margin:0 0 12px;">Información del Cliente</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="width:50%;padding-right:16px;padding-bottom:8px;vertical-align:top;">
            <p style="margin:0;font-size:10px;color:#78716c;text-transform:uppercase;">Nombre</p>
            <p style="margin:2px 0 0;font-size:13px;font-weight:600;color:#292524;">${data.clientName}</p>
          </td>
          <td style="width:50%;padding-bottom:8px;vertical-align:top;">
            <p style="margin:0;font-size:10px;color:#78716c;text-transform:uppercase;">Documento</p>
            <p style="margin:2px 0 0;font-size:13px;font-weight:600;color:#292524;">${data.clientDocument || 'N/A'}</p>
          </td>
        </tr>
        <tr>
          <td style="padding-right:16px;vertical-align:top;">
            <p style="margin:0;font-size:10px;color:#78716c;text-transform:uppercase;">Email</p>
            <p style="margin:2px 0 0;font-size:13px;font-weight:600;color:#292524;">${data.clientEmail || 'N/A'}</p>
          </td>
          <td style="vertical-align:top;">
            <p style="margin:0;font-size:10px;color:#78716c;text-transform:uppercase;">Teléfono</p>
            <p style="margin:2px 0 0;font-size:13px;font-weight:600;color:#292524;">${data.clientPhone || 'N/A'}</p>
          </td>
        </tr>
      </table>
    </div>
  `;

  const compactHeader = (idx: number) => `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:${H_COMPACT_MARGIN}px;padding-bottom:12px;border-bottom:2px solid #C59F59;">
      <img src="${baseUrl}/images/logo-amantti.png" style="width:120px;height:auto;object-fit:contain;" />
      <div style="text-align:right;">
        <p style="margin:0;font-size:13px;font-weight:700;color:#292524;">COTIZACIÓN — continuación</p>
        <p style="margin:2px 0 0;font-size:11px;color:#78716c;">${data.clientName}</p>
      </div>
    </div>
  `;

  const totalBlock = `
    <div style="display:flex;justify-content:flex-end;margin-top:24px;">
      <div style="background-color:#292524;color:#fff;border-radius:12px;padding:18px 28px;min-width:260px;position:relative;overflow:hidden;">
        <div style="position:absolute;right:0;top:0;bottom:0;width:5px;background-color:#C59F59;"></div>
        <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#C59F59;text-transform:uppercase;letter-spacing:2px;">Total Cotizado</p>
        <p style="margin:0;font-size:26px;font-weight:900;color:#fff;">${fmt(data.totalAmount)}</p>
      </div>
    </div>
  `;

  const pagesHtml = itemPages.map((pageItems, pageIdx) => {
    const isFirst = pageIdx === 0;
    const isLast  = pageIdx === totalPages - 1;
    const rh = rowHeightForPage(pageIdx);
    const fs = rh < 44 ? '11px' : rh < 52 ? '12px' : '13px';

    const rows = pageItems.map((item, idx) => `
      <tr style="background-color:${idx % 2 === 0 ? '#ffffff' : '#fafaf9'};">
        <td style="padding:0 16px;height:${rh}px;font-size:${fs};color:#292524;font-weight:500;border-bottom:1px solid #e7e5e4;vertical-align:middle;">${item.description}</td>
        <td style="padding:0 16px;height:${rh}px;font-size:${fs};text-align:right;color:#57534e;border-bottom:1px solid #e7e5e4;vertical-align:middle;">${item.quantity}</td>
        <td style="padding:0 16px;height:${rh}px;font-size:${fs};text-align:right;color:#57534e;border-bottom:1px solid #e7e5e4;vertical-align:middle;">${fmt(item.unit_price)}</td>
        <td style="padding:0 16px;height:${rh}px;font-size:${fs};text-align:right;font-weight:700;color:#292524;border-bottom:1px solid #e7e5e4;vertical-align:middle;">${fmt(item.total_price)}</td>
      </tr>
    `).join('');

    const footer = `
      <div style="margin-top:auto;padding-top:12px;text-align:center;border-top:1px solid rgba(197,159,89,0.25);">
        <p style="margin:0;font-size:10px;color:#a8a29e;">Café Amantti — Pasión por el origen &nbsp;·&nbsp; Página ${pageIdx + 1} de ${totalPages}</p>
      </div>
    `;

    return `
      <div style="${pageStyle}">
        <img src="${baseUrl}/images/Main_Background.jpg" style="${bgImgStyle}" />
        <div style="${contentStyle}">
          ${isFirst ? firstPageHeader : compactHeader(pageIdx)}
          <table style="width:100%;border-collapse:collapse;border-radius:10px;overflow:hidden;">
            ${tableHeadHtml}
            <tbody>${rows}</tbody>
          </table>
          ${isLast ? totalBlock : ''}
          ${footer}
        </div>
      </div>
    `;
  }).join('');

  return `<div style="display:inline-block;">${pagesHtml}</div>`;
}

export async function generateQuotePDF(
  data: QuoteData,
  filename: string = 'cotizacion.pdf',
  orientation: 'portrait' | 'landscape' = 'portrait'
): Promise<Blob> {
  const html2pdf = (await import('html2pdf.js')).default;
  const isLandscape = orientation === 'landscape';
  const pageW = isLandscape ? LANDSCAPE_W : PORTRAIT_W;
  const pageH = isLandscape ? LANDSCAPE_H : PORTRAIT_H;

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
      margin: 0,
      filename,
      image:       { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        width: pageW,
        windowWidth: pageW,
        onclone: (_doc: Document) => {
          _doc.querySelectorAll('link[rel="stylesheet"]').forEach(el => el.parentNode?.removeChild(el));
          _doc.querySelectorAll('style').forEach(el => el.parentNode?.removeChild(el));
        },
      },
      jsPDF: {
        unit: 'px' as const,
        format: [pageW, pageH] as [number, number],
        orientation: isLandscape ? 'landscape' as const : 'portrait' as const,
        hotfixes: ['px_scaling'],
      },
      pagebreak: { mode: ['css', 'legacy'] },
    };

    const blob: Blob = await html2pdf().set(opt).from(element).output('blob');
    return blob;
  } finally {
    document.body.removeChild(container);
  }
}

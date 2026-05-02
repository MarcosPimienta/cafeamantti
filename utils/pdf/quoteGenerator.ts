export interface QuoteItem {
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

export interface QuoteData {
  clientName: string;
  clientDocument: string;
  clientDocumentType?: string;
  clientEmail: string;
  clientPhone: string;
  sellerName?: string;
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
const H_CLIENT        = 180; // extra room for long client names that wrap
const H_CLIENT_MARGIN = 24;
const H_TABLE_HEAD    = 46;
const H_FOOTER        = 48;
const H_COMPACT_HEADER = 56;
const H_COMPACT_MARGIN = 24;
const H_TOTAL         = 100;

const ROW_MIN = 40;
const ROW_MAX = 80;

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
    if (count === 0) return ROW_MIN;
    const isLast = pageIdx === totalPages - 1;

    let raw: number;
    if (pageIdx === 0 && totalPages === 1) {
      raw = Math.floor((innerH - firstOverhead - H_TOTAL) / count);
    } else if (pageIdx === 0) {
      raw = Math.floor((innerH - firstOverhead) / count);
    } else {
      const contOverhead = H_COMPACT_HEADER + H_COMPACT_MARGIN + H_TABLE_HEAD + H_FOOTER + (isLast ? H_TOTAL : 0);
      raw = Math.floor((innerH - contOverhead) / count);
    }
    return Math.max(ROW_MIN, Math.min(ROW_MAX, raw));
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
            <p style="margin:0;font-size:10px;color:#78716c;text-transform:uppercase;">${data.clientDocumentType || 'Documento'}</p>
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
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:24px;">
      <div style="text-align:left;">
        <p style="margin:0;font-size:11px;font-weight:700;color:#292524;">${data.sellerName || 'Asesor Amantti'}</p>
        <p style="margin:2px 0 0;font-size:10px;color:#57534e;line-height:1.4;">
          Alma Trading Group SAS<br/>
          Nit: 901752308-8<br/>
          cafeamantti@gmail.com<br/>
          CEL: +57 (333)284-3078<br/>
          www.cafeamantti.com
        </p>
      </div>
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

    const currentPageStyle = `
      font-family: Arial, Helvetica, sans-serif;
      background-color: #ffffff;
      color: #1c1917;
      position: relative;
      width: ${pageW}px;
      height: ${pageH}px;
      padding: ${padV}px ${PAD_H}px;
      box-sizing: border-box;
      overflow: hidden;
      ${isLast ? '' : 'page-break-after: always;'}
    `;

    return `
      <div style="${currentPageStyle}">
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

  return `<div style="display: flex; flex-direction: column; width: ${pageW}px; overflow: hidden;">${pagesHtml}</div>`;
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

export interface PriceTableItem {
  item: string;
  cost: number;
  pvp: number;
}

export interface ProposalBlock {
  id: string;
  type: 'rich-text' | 'price-table' | 'checklist';
  title: string;
  text?: string;
  items?: PriceTableItem[];
  checklistItems?: string[];
}

export interface ProposalData {
  clientName: string;
  date: string;
  title: string;
  subtitle?: string;
  content: ProposalBlock[];
  sellerName?: string;
  allyLogoUrl?: string;
  backgroundImageUrl?: string;
  backgroundOpacity?: number;
}

// Keep old interface for backwards compat
export interface ProposalSection {
  title: string;
  text: string;
}

async function imageUrlToBase64(url: string): Promise<string> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url; // fallback to original URL
  }
}

function fmtCOP(val: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
}

function buildBlockHtml(block: ProposalBlock, index: number): string {
  const titleHtml = `<h3 style="font-size:16px; font-weight:800; text-transform:uppercase; color:#292524; border-bottom:1px solid rgba(197, 159, 89, 0.3); padding-bottom:8px; margin-bottom:15px; letter-spacing:1px;">${index + 1}. ${block.title}</h3>`;

  if (block.type === 'price-table' && block.items) {
    const rows = block.items.map((row, i) => {
      const margin = row.pvp > 0 ? ((row.pvp - row.cost) / row.pvp * 100).toFixed(1) + '%' : '—';
      return `<tr style="background-color:${i % 2 === 0 ? '#fff' : '#fafaf9'};">
        <td style="padding:10px 14px; border-bottom:1px solid #e7e5e4; font-weight:500; color:#292524;">${row.item}</td>
        <td style="padding:10px 14px; border-bottom:1px solid #e7e5e4; text-align:right; color:#57534e; font-family:monospace;">${fmtCOP(row.cost)}</td>
        <td style="padding:10px 14px; border-bottom:1px solid #e7e5e4; text-align:right; color:#292524; font-weight:700; font-family:monospace;">${fmtCOP(row.pvp)}</td>
        <td style="padding:10px 14px; border-bottom:1px solid #e7e5e4; text-align:right; color:#C59F59; font-weight:700;">${margin}</td>
      </tr>`;
    }).join('');

    return `<div style="margin-bottom:30px;">
      ${titleHtml}
      <table style="width:100%; border-collapse:collapse; font-size:13px;">
        <thead><tr style="background-color:#292524;">
          <th style="padding:10px 14px; color:#fff; text-align:left; font-weight:700; font-size:11px; letter-spacing:1px; text-transform:uppercase;">Producto</th>
          <th style="padding:10px 14px; color:#fff; text-align:right; font-weight:700; font-size:11px; letter-spacing:1px;">Costo</th>
          <th style="padding:10px 14px; color:#fff; text-align:right; font-weight:700; font-size:11px; letter-spacing:1px;">PVP Sugerido</th>
          <th style="padding:10px 14px; color:#fff; text-align:right; font-weight:700; font-size:11px; letter-spacing:1px;">Margen</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  if (block.type === 'checklist' && block.checklistItems) {
    const items = block.checklistItems.filter(Boolean).map(item =>
      `<div style="display:flex; align-items:flex-start; gap:10px; margin-bottom:10px; font-size:14px; line-height:1.6; color:#44403c;">
        <span style="color:#C59F59; font-weight:700; flex-shrink:0;">•</span>
        <span>${item}</span>
      </div>`
    ).join('');

    return `<div style="margin-bottom:30px;">${titleHtml}<div style="padding-left:8px;">${items}</div></div>`;
  }

  // rich-text (default)
  return `<div style="margin-bottom:30px;">
    ${titleHtml}
    <div style="font-size:14px; line-height:1.7; color:#44403c; white-space:pre-wrap; text-align:justify;">${block.text || ''}</div>
  </div>`;
}

function paginateBlocks(blocks: ProposalBlock[]): ProposalBlock[][] {
  const pages: ProposalBlock[][] = [];
  let currentPage: ProposalBlock[] = [];
  let currentHeight = 0;
  const FIRST_PAGE_LIMIT = 600; // less space due to big title
  const PAGE_LIMIT = 750;

  blocks.forEach((block, idx) => {
    let blockHeight = 80; // base height for title + margin
    if (block.type === 'rich-text') {
      const chars = block.text?.length || 0;
      blockHeight += Math.ceil(chars / 65) * 20; // approx 65 chars per line, 20px per line
    } else if (block.type === 'price-table') {
      blockHeight += 40 + (block.items?.length || 0) * 35; // header + rows
    } else if (block.type === 'checklist') {
      blockHeight += (block.checklistItems?.length || 0) * 30;
    }

    const limit = pages.length === 0 ? FIRST_PAGE_LIMIT : PAGE_LIMIT;

    if (currentHeight + blockHeight > limit && currentPage.length > 0) {
      pages.push(currentPage);
      currentPage = [block];
      currentHeight = blockHeight;
    } else {
      currentPage.push(block);
      currentHeight += blockHeight;
    }
  });

  if (currentPage.length > 0) pages.push(currentPage);
  return pages;
}

export async function generateProposalPDF(
  data: ProposalData,
  filename: string = 'propuesta.pdf'
): Promise<Blob> {
  const html2pdf = (await import('html2pdf.js')).default;
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  // Convert images to base64
  const rawBgUrl = data.backgroundImageUrl || '/images/Main_Background.jpg';
  const bgUrl = rawBgUrl.startsWith('http') ? rawBgUrl : `${baseUrl}${rawBgUrl}`;
  const bgBase64 = await imageUrlToBase64(bgUrl);
  const logoBase64 = await imageUrlToBase64(`${baseUrl}/images/logo-amantti.png`);
  const allyLogoBase64 = data.allyLogoUrl ? await imageUrlToBase64(data.allyLogoUrl) : '';
  const opacity = data.backgroundOpacity ?? 0.5;

  const blockPages = paginateBlocks(data.content);
  const totalPages = blockPages.length;

  const pagesHtml = blockPages.map((pageBlocks, pageIdx) => {
    const isFirst = pageIdx === 0;
    const isLast = pageIdx === totalPages - 1;

    const allyLogoHtml = allyLogoBase64
      ? `<div style="display:flex; align-items:center; gap:16px;">
           <div style="width:1px; height:40px; background-color:#C59F59; opacity:0.4;"></div>
           <img src="${allyLogoBase64}" style="max-width:140px; max-height:60px; object-fit:contain;" />
         </div>`
      : `<p style="font-size:14px; color:#57534e; font-weight:600;">${data.date}</p>`;

    const dateIfAlly = allyLogoBase64
      ? `<div style="text-align:right; margin-top:-40px; margin-bottom:30px;"><p style="margin:0; font-size:13px; color:#78716c;">${data.date}</p></div>`
      : '';

    const firstPageHeader = `
      <div style="margin-bottom:50px; text-align:center;">
        <h1 style="font-size:26px; font-weight:900; text-transform:uppercase; letter-spacing:3px; color:#292524; margin:0 0 10px; line-height:1.2;">${data.title}</h1>
        ${data.subtitle ? `<h2 style="font-size:18px; font-weight:600; color:#C59F59; margin:0; font-style:italic;">${data.subtitle}</h2>` : ''}
        <div style="width:80px; height:3px; background-color:#C59F59; margin:30px auto;"></div>
        <p style="font-size:14px; color:#78716c; margin:20px 0 0;">
          <strong>Para:</strong> ${data.clientName}<br/>
          <strong>De:</strong> Amantti Café
        </p>
      </div>
    `;

    const normalHeader = `
      <div style="display:flex; justify-content:flex-end; align-items:center; margin-bottom:30px; padding-bottom:15px; border-bottom:1px solid rgba(197,159,89,0.2);">
        <p style="font-size:10px; font-weight:700; color:#C59F59; text-transform:uppercase; letter-spacing:1px;">Propuesta Comercial — Pág ${pageIdx + 1}</p>
      </div>
    `;

    const blocksHtml = pageBlocks.map((block, i) => {
      // Correct index across pages
      const absoluteIdx = blockPages.slice(0, pageIdx).reduce((acc, p) => acc + p.length, 0) + i;
      return buildBlockHtml(block, absoluteIdx);
    }).join('');

    const footer = isLast ? `
      <div style="margin-top:60px; border-top:1px solid #e7e5e4; padding-top:40px;">
        <p style="font-size:14px; line-height:1.6; color:#44403c; margin-bottom:40px; font-style:italic;">
          Estamos convencidos de que esta alianza beneficiará a ambas partes y proporcionará una experiencia única para los clientes de ${data.clientName}.<br/>
          ¡Quedamos atentos para avanzar con los siguientes pasos y formalizar la alianza!
        </p>
        <div style="display:flex; justify-content:space-between; align-items:flex-end;">
          <div>
            <p style="margin:0; font-size:12px; font-weight:700; color:#292524;">${data.sellerName || 'Asesor Amantti'}</p>
            <p style="margin:2px 0 0; font-size:11px; color:#57534e;">Alma Trading Group SAS<br/>Nit: 901752308-8<br/>cafeamantti@gmail.com</p>
          </div>
          <img src="${logoBase64}" style="width:80px; opacity:0.3; filter:grayscale(1);" />
        </div>
      </div>
    ` : `
      <div style="margin-top:auto; padding-top:20px; text-align:center; opacity:0.3;">
        <p style="font-size:9px; color:#a8a29e; letter-spacing:1px;">Continúa en la siguiente página...</p>
      </div>
    `;

    return `
      <div style="font-family:Arial, sans-serif; background-color:#fff; color:#1c1917; width:816px; height:1056px; padding:64px 72px; box-sizing:border-box; position:relative; overflow:hidden; page-break-after:always;">
        <div style="position:absolute; inset:0; background-image:url(${bgBase64}); background-size:cover; background-position:center; opacity:${opacity}; z-index:0;"></div>
        <div style="position:relative; z-index:1; display:flex; flex-direction:column; height:100%;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:40px;">
            <img src="${logoBase64}" style="width:160px; height:auto; object-fit:contain;" />
            ${allyLogoHtml}
          </div>
          ${dateIfAlly}
          ${isFirst ? firstPageHeader : normalHeader}
          <div style="flex:1;">
            ${blocksHtml}
          </div>
          ${footer}
        </div>
      </div>
    `;
  }).join('');

  const container = document.createElement('div');
  container.innerHTML = pagesHtml;
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  container.style.zIndex = '-1';
  document.body.appendChild(container);

  try {
    const opt = {
      margin: 0,
      filename,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { 
        scale: 2, 
        useCORS: true,
        width: 816,
        windowWidth: 816,
        logging: false
      },
      jsPDF: { unit: 'px' as const, format: [816, 1056] as [number, number], orientation: 'portrait' as const }
    };
    return await html2pdf().set(opt).from(container).output('blob');
  } finally {
    document.body.removeChild(container);
  }
}


import React from 'react';
import { QuoteData } from '@/utils/pdf/quoteGenerator';

// NOTE: Uses ONLY inline styles with hex/rgb colors.
// Tailwind v4 uses oklch() which html2canvas cannot parse.

const ITEMS_PER_PAGE = 10;

// ─── Layout constants (px) ────────────────────────────────────────────────────
// Portrait  : 816 × 1056
// Landscape : 1056 × 816
const PORTRAIT_W  = 816;
const PORTRAIT_H  = 1056;
const LANDSCAPE_W = 1056;
const LANDSCAPE_H = 816;

// Vertical padding for each page
const PAD_V_P = 56; // portrait
const PAD_V_L = 40; // landscape
const PAD_H   = 64;

// Fixed heights (approx) that appear on the first page only
const H_HEADER        = 100;
const H_HEADER_MARGIN = 40;
const H_CLIENT        = 180; // extra room for long client names that wrap
const H_CLIENT_MARGIN = 24;
const H_TABLE_HEAD    = 46;
const H_FOOTER        = 48;
const H_COMPACT_HEADER = 56;
const H_COMPACT_MARGIN = 24;
const H_TOTAL         = 100;

const ROW_MIN = 40; // px — never shorter than this
const ROW_MAX = 80; // px — never taller than this

export function QuoteHTMLTemplate({ data }: { data: QuoteData }) {
  const fmt = (v: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(v);

  const isLandscape = data.orientation === 'landscape';
  const pageW   = isLandscape ? LANDSCAPE_W : PORTRAIT_W;
  const pageH   = isLandscape ? LANDSCAPE_H : PORTRAIT_H;
  const padV    = isLandscape ? PAD_V_L     : PAD_V_P;
  const innerH  = pageH - 2 * padV;

  // ── Paginate items ──────────────────────────────────────────────────────────
  const allItems = data.items.length > 0 ? data.items : [];
  const itemPages: typeof allItems[] = [];
  for (let i = 0; i < Math.max(allItems.length, 1); i += ITEMS_PER_PAGE) {
    itemPages.push(allItems.slice(i, i + ITEMS_PER_PAGE));
  }
  const totalPages = itemPages.length;

  // ── Row height per page ─────────────────────────────────────────────────────
  // First page: larger fixed overhead
  const firstPageOverhead  = H_HEADER + H_HEADER_MARGIN + H_CLIENT + H_CLIENT_MARGIN + H_TABLE_HEAD + H_FOOTER;
  const firstAvailRows     = innerH - firstPageOverhead;

  const rowHeightForPage = (pageIdx: number): number => {
    const count = itemPages[pageIdx].length;
    if (count === 0) return ROW_MIN;

    let raw: number;
    if (pageIdx === 0 && totalPages === 1) {
      const avail = innerH - firstPageOverhead - H_TOTAL;
      raw = Math.floor(avail / count);
    } else if (pageIdx === 0) {
      raw = Math.floor(firstAvailRows / count);
    } else {
      const isLast = pageIdx === totalPages - 1;
      const contOverhead = H_COMPACT_HEADER + H_COMPACT_MARGIN + H_TABLE_HEAD + H_FOOTER + (isLast ? H_TOTAL : 0);
      const avail = innerH - contOverhead;
      raw = Math.floor(avail / count);
    }
    return Math.max(ROW_MIN, Math.min(ROW_MAX, raw));
  };

  // ── Shared styles ───────────────────────────────────────────────────────────
  const pageStyle: React.CSSProperties = {
    fontFamily: 'Arial, Helvetica, sans-serif',
    backgroundColor: '#ffffff',
    color: '#1c1917',
    position: 'relative',
    width: `${pageW}px`,
    height: `${pageH}px`,
    padding: `${padV}px ${PAD_H}px`,
    boxSizing: 'border-box',
    overflow: 'hidden',
    pageBreakAfter: 'always',
  };

  const bgStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundImage: "url('/images/Main_Background.jpg')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    opacity: 0.5,
    zIndex: 0,
  };

  const contentStyle: React.CSSProperties = {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  };

  // ── Table header row ────────────────────────────────────────────────────────
  const TableHead = () => (
    <thead>
      <tr style={{ backgroundColor: '#292524' }}>
        {(['Descripción', 'Cant.', 'Precio Unit.', 'Total'] as const).map((h, i) => (
          <th key={h} style={{
            padding: '0 16px',
            height: `${H_TABLE_HEAD}px`,
            fontSize: '12px',
            fontWeight: 700,
            color: '#ffffff',
            textAlign: i === 0 ? 'left' : 'right',
            letterSpacing: '1px',
          }}>
            {h}
          </th>
        ))}
      </tr>
    </thead>
  );

  // ── Item rows ───────────────────────────────────────────────────────────────
  const ItemRows = ({ pageIdx }: { pageIdx: number }) => {
    const rh = rowHeightForPage(pageIdx);
    const fontSize = rh < 44 ? '11px' : rh < 52 ? '12px' : '13px';
    return (
      <tbody>
        {itemPages[pageIdx].map((item, idx) => (
          <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafaf9' }}>
            <td style={{ padding: `0 16px`, height: `${rh}px`, fontSize, color: '#292524', fontWeight: 500, borderBottom: '1px solid #e7e5e4', verticalAlign: 'middle' }}>
              {item.description}
            </td>
            <td style={{ padding: `0 16px`, height: `${rh}px`, fontSize, textAlign: 'right', color: '#57534e', borderBottom: '1px solid #e7e5e4', verticalAlign: 'middle' }}>
              {item.quantity}
            </td>
            <td style={{ padding: `0 16px`, height: `${rh}px`, fontSize, textAlign: 'right', color: '#57534e', borderBottom: '1px solid #e7e5e4', verticalAlign: 'middle' }}>
              {fmt(item.unit_price)}
            </td>
            <td style={{ padding: `0 16px`, height: `${rh}px`, fontSize, textAlign: 'right', fontWeight: 700, color: '#292524', borderBottom: '1px solid #e7e5e4', verticalAlign: 'middle' }}>
              {fmt(item.total_price)}
            </td>
          </tr>
        ))}
      </tbody>
    );
  };

  // ── Total block ─────────────────────────────────────────────────────────────
  const TotalBlock = () => (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '24px' }}>
      <div style={{ backgroundColor: '#292524', color: '#ffffff', borderRadius: '12px', padding: '18px 28px', minWidth: '260px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '5px', backgroundColor: '#C59F59' }} />
        <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 700, color: '#C59F59', textTransform: 'uppercase', letterSpacing: '2px' }}>Total Cotizado</p>
        <p style={{ margin: 0, fontSize: '26px', fontWeight: 900, color: '#ffffff' }}>{fmt(data.totalAmount)}</p>
      </div>
    </div>
  );

  // ── Footer ──────────────────────────────────────────────────────────────────
  const Footer = ({ page, total }: { page: number; total: number }) => (
    <div style={{ marginTop: 'auto', paddingTop: '12px', textAlign: 'center', borderTop: '1px solid rgba(197,159,89,0.25)' }}>
      <p style={{ margin: 0, fontSize: '10px', color: '#a8a29e' }}>
        Café Amantti — Pasión por el origen &nbsp;·&nbsp; Página {page + 1} de {total}
      </p>
    </div>
  );

  // ══════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ display: 'inline-block' }}>

      {itemPages.map((_, pageIdx) => {
        const isFirst = pageIdx === 0;
        const isLast  = pageIdx === totalPages - 1;

        return (
          <div key={pageIdx} style={pageStyle}>
            <div style={bgStyle} />

            <div style={contentStyle}>

              {/* ── FIRST PAGE HEADER ── */}
              {isFirst && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: `${H_HEADER_MARGIN}px` }}>
                    <img src="/images/logo-amantti.png" alt="Amantti" style={{ width: '200px', height: 'auto', objectFit: 'contain' }} />
                    <div style={{ textAlign: 'right' }}>
                      <h1 style={{ fontSize: '34px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '4px', color: '#292524', margin: '0 0 6px 0', paddingBottom: '6px', borderBottom: '2px solid #C59F59' }}>
                        Cotización
                      </h1>
                      <p style={{ margin: '3px 0', fontSize: '12px', color: '#57534e' }}><strong>Fecha:</strong> {data.date}</p>
                      <p style={{ margin: '3px 0', fontSize: '12px', color: '#57534e' }}><strong>Válida hasta:</strong> {data.validUntil}</p>
                      {data.quoteId && <p style={{ margin: '6px 0 0', fontSize: '10px', color: '#a8a29e', fontFamily: 'monospace' }}>Ref: {data.quoteId.substring(0, 8)}</p>}
                    </div>
                  </div>

                  {/* Client Info */}
                  <div style={{ backgroundColor: 'rgba(245,245,244,0.92)', border: '1px solid #d6d3d1', borderRadius: '10px', padding: '18px 20px 18px 26px', marginBottom: `${H_CLIENT_MARGIN}px`, position: 'relative', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '4px', backgroundColor: '#C59F59' }} />
                    <p style={{ fontSize: '10px', fontWeight: 700, color: '#78716c', textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 12px 0' }}>Información del Cliente</p>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <tbody>
                        <tr>
                          <td style={{ width: '50%', paddingRight: '16px', paddingBottom: '8px', verticalAlign: 'top' }}>
                            <p style={{ margin: 0, fontSize: '10px', color: '#78716c', textTransform: 'uppercase' }}>Nombre</p>
                            <p style={{ margin: '2px 0 0', fontSize: '13px', fontWeight: 600, color: '#292524' }}>{data.clientName}</p>
                          </td>
                          <td style={{ width: '50%', paddingBottom: '8px', verticalAlign: 'top' }}>
                            <p style={{ margin: 0, fontSize: '10px', color: '#78716c', textTransform: 'uppercase' }}>Documento</p>
                            <p style={{ margin: '2px 0 0', fontSize: '13px', fontWeight: 600, color: '#292524' }}>{data.clientDocument || 'N/A'}</p>
                          </td>
                        </tr>
                        <tr>
                          <td style={{ paddingRight: '16px', verticalAlign: 'top' }}>
                            <p style={{ margin: 0, fontSize: '10px', color: '#78716c', textTransform: 'uppercase' }}>Email</p>
                            <p style={{ margin: '2px 0 0', fontSize: '13px', fontWeight: 600, color: '#292524' }}>{data.clientEmail || 'N/A'}</p>
                          </td>
                          <td style={{ verticalAlign: 'top' }}>
                            <p style={{ margin: 0, fontSize: '10px', color: '#78716c', textTransform: 'uppercase' }}>Teléfono</p>
                            <p style={{ margin: '2px 0 0', fontSize: '13px', fontWeight: 600, color: '#292524' }}>{data.clientPhone || 'N/A'}</p>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {/* ── CONTINUATION HEADER ── */}
              {!isFirst && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: `${H_COMPACT_MARGIN}px`, paddingBottom: '12px', borderBottom: '2px solid #C59F59' }}>
                  <img src="/images/logo-amantti.png" alt="Amantti" style={{ width: '120px', height: 'auto', objectFit: 'contain' }} />
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#292524' }}>COTIZACIÓN — continuación</p>
                    <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#78716c' }}>{data.clientName}</p>
                  </div>
                </div>
              )}

              {/* ── TABLE ── */}
              <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: '10px', overflow: 'hidden' }}>
                <TableHead />
                <ItemRows pageIdx={pageIdx} />
              </table>

              {/* ── TOTAL (last page only) ── */}
              {isLast && <TotalBlock />}

              {/* ── FOOTER ── */}
              <Footer page={pageIdx} total={totalPages} />

            </div>
          </div>
        );
      })}
    </div>
  );
}

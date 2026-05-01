import React from 'react';
import type { ProposalBlock, PriceTableItem } from './new/blocks/BlockCard';

// Reusing layout constants from quoteGenerator but adapted for proposals
const PORTRAIT_W  = 816;
const PORTRAIT_H  = 1056;
const PAD_V       = 64;
const PAD_H       = 72;

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

function formatCurrency(val: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(val);
}

function RenderBlock({ block, index }: { block: ProposalBlock; index: number }) {
  const titleStyle: React.CSSProperties = {
    fontSize: '16px',
    fontWeight: 800,
    textTransform: 'uppercase',
    color: '#292524',
    borderBottom: '1px solid rgba(197, 159, 89, 0.3)',
    paddingBottom: '8px',
    marginBottom: '15px',
    letterSpacing: '1px',
  };

  if (block.type === 'price-table') {
    const items = block.items || [];
    return (
      <div>
        <h3 style={titleStyle}>{index + 1}. {block.title}</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
          <thead>
            <tr style={{ backgroundColor: '#292524' }}>
              <th style={{ padding: '10px 14px', color: '#fff', textAlign: 'left', fontWeight: 700, fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' }}>Producto</th>
              <th style={{ padding: '10px 14px', color: '#fff', textAlign: 'right', fontWeight: 700, fontSize: '11px', letterSpacing: '1px' }}>Costo</th>
              <th style={{ padding: '10px 14px', color: '#fff', textAlign: 'right', fontWeight: 700, fontSize: '11px', letterSpacing: '1px' }}>PVP Sugerido</th>
              <th style={{ padding: '10px 14px', color: '#fff', textAlign: 'right', fontWeight: 700, fontSize: '11px', letterSpacing: '1px' }}>Margen</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row: PriceTableItem, i: number) => {
              const margin = row.pvp > 0 ? ((row.pvp - row.cost) / row.pvp * 100).toFixed(1) : '—';
              return (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? '#ffffff' : '#fafaf9' }}>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #e7e5e4', fontWeight: 500, color: '#292524' }}>{row.item}</td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #e7e5e4', textAlign: 'right', color: '#57534e', fontFamily: 'monospace' }}>{formatCurrency(row.cost)}</td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #e7e5e4', textAlign: 'right', color: '#292524', fontWeight: 700, fontFamily: 'monospace' }}>{formatCurrency(row.pvp)}</td>
                  <td style={{ padding: '10px 14px', borderBottom: '1px solid #e7e5e4', textAlign: 'right', color: '#C59F59', fontWeight: 700 }}>{margin}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (block.type === 'checklist') {
    const items = block.checklistItems || [];
    return (
      <div>
        <h3 style={titleStyle}>{index + 1}. {block.title}</h3>
        <div style={{ paddingLeft: '8px' }}>
          {items.filter(Boolean).map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px', fontSize: '14px', lineHeight: '1.6', color: '#44403c' }}>
              <span style={{ color: '#C59F59', fontWeight: 700, flexShrink: 0 }}>•</span>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Default: rich-text
  return (
    <div>
      <h3 style={titleStyle}>{index + 1}. {block.title}</h3>
      <div style={{
        fontSize: '14px',
        lineHeight: '1.7',
        color: '#44403c',
        whiteSpace: 'pre-wrap',
        textAlign: 'justify'
      }}>
        {block.text}
      </div>
    </div>
  );
}

export function ProposalHTMLTemplate({ data }: { data: ProposalData }) {
  const opacity = data.backgroundOpacity ?? 0.5;
  const bgUrl = data.backgroundImageUrl || '/images/Main_Background.jpg';

  const pageStyle: React.CSSProperties = {
    fontFamily: 'Arial, Helvetica, sans-serif',
    backgroundColor: '#ffffff',
    color: '#1c1917',
    position: 'relative',
    width: `${PORTRAIT_W}px`,
    minHeight: `${PORTRAIT_H}px`,
    padding: `${PAD_V}px ${PAD_H}px`,
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
  };

  const bgStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backgroundImage: `url('${bgUrl}')`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    opacity,
    zIndex: 0,
  };

  const contentStyle: React.CSSProperties = {
    position: 'relative',
    zIndex: 1,
    flex: 1,
  };

  return (
    <div style={{ display: 'inline-block', backgroundColor: '#f5f5f5', padding: '20px' }}>
      <div style={pageStyle}>
        <div style={bgStyle} />

        <div style={contentStyle}>
          {/* Header: Dual logo */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '60px' }}>
            <img src="/images/logo-amantti.png" alt="Amantti" style={{ width: '160px', height: 'auto' }} />

            {data.allyLogoUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{ width: '1px', height: '40px', backgroundColor: '#C59F59', opacity: 0.4 }} />
                <img src={data.allyLogoUrl} alt="Aliado" style={{ maxWidth: '140px', maxHeight: '60px', objectFit: 'contain' }} />
              </div>
            ) : (
              <div style={{ textAlign: 'right' }}>
                <p style={{ margin: 0, fontSize: '14px', color: '#57534e', fontWeight: 600 }}>{data.date}</p>
              </div>
            )}
          </div>

          {/* Date (shown separately when ally logo exists) */}
          {data.allyLogoUrl && (
            <div style={{ textAlign: 'right', marginTop: '-40px', marginBottom: '30px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#78716c' }}>{data.date}</p>
            </div>
          )}

          {/* Title & Subtitle */}
          <div style={{ marginBottom: '50px', textAlign: 'center' }}>
            <h1 style={{
              fontSize: '26px',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '3px',
              color: '#292524',
              margin: '0 0 10px 0',
              lineHeight: '1.2'
            }}>
              {data.title}
            </h1>
            {data.subtitle && (
              <h2 style={{
                fontSize: '18px',
                fontWeight: 600,
                color: '#C59F59',
                margin: 0,
                fontStyle: 'italic'
              }}>
                {data.subtitle}
              </h2>
            )}
            <div style={{ width: '80px', height: '3px', backgroundColor: '#C59F59', margin: '30px auto' }} />

            <p style={{ fontSize: '14px', color: '#78716c', margin: '20px 0 0' }}>
              <strong>Para:</strong> {data.clientName}<br/>
              <strong>De:</strong> Amantti Café
            </p>
          </div>

          {/* Blocks */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
            {data.content.map((block, idx) => (
              <RenderBlock key={block.id || idx} block={block} index={idx} />
            ))}
          </div>

          {/* Closing & Signature */}
          <div style={{ marginTop: '60px', borderTop: '1px solid #e7e5e4', paddingTop: '40px' }}>
            <p style={{ fontSize: '14px', lineHeight: '1.6', color: '#44403c', marginBottom: '40px', fontStyle: 'italic' }}>
              Estamos convencidos de que esta alianza beneficiará a ambas partes y proporcionará una experiencia única para los clientes de {data.clientName}.<br/>
              ¡Quedamos atentos para avanzar con los siguientes pasos y formalizar la alianza!
            </p>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div>
                <p style={{ margin: 0, fontSize: '12px', fontWeight: 700, color: '#292524' }}>{data.sellerName || 'Asesor Amantti'}</p>
                <p style={{ margin: '2px 0 0', fontSize: '11px', color: '#57534e' }}>
                  Alma Trading Group SAS<br/>
                  Nit: 901752308-8<br/>
                  cafeamantti@gmail.com
                </p>
              </div>
              <img src="/images/logo-amantti.png" alt="Logo" style={{ width: '80px', opacity: 0.3 }} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 'auto', paddingTop: '20px', textAlign: 'center', opacity: 0.5 }}>
          <p style={{ margin: 0, fontSize: '10px', color: '#a8a29e', letterSpacing: '1px' }}>
            Café Amantti — Pasión por el origen &nbsp;·&nbsp; www.cafeamantti.com
          </p>
        </div>
      </div>
    </div>
  );
}

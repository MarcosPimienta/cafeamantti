import React, { forwardRef } from 'react';
import { QuoteData } from '@/utils/pdf/quoteGenerator';

// NOTE: This template uses ONLY inline styles with hex/rgb colors.
// Tailwind v4 uses oklch() color functions which html2canvas cannot parse.
// All colors must be explicit hex or rgb() values here.

export const QuoteHTMLTemplate = forwardRef<HTMLDivElement, { data: QuoteData }>(({ data }, ref) => {
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP' }).format(val);

  return (
    <div
      ref={ref}
      style={{
        fontFamily: 'Arial, Helvetica, sans-serif',
        backgroundColor: '#ffffff',
        color: '#1c1917',
        position: 'relative',
        width: '816px',
        minHeight: '1056px',
        padding: '64px',
        boxSizing: 'border-box',
        overflow: 'hidden',
      }}
    >
      {/* Background Image */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: "url('/images/Main_Background.jpg')",
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.18,
          zIndex: 0,
        }}
      />

      {/* Content */}
      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '48px' }}>
          <img
            src="/images/logo-amantti.png"
            alt="Amantti"
            style={{ width: '200px', height: 'auto', objectFit: 'contain' }}
          />
          <div style={{ textAlign: 'right' }}>
            <h1 style={{
              fontSize: '36px',
              fontWeight: '900',
              textTransform: 'uppercase',
              letterSpacing: '4px',
              color: '#292524',
              margin: '0 0 8px 0',
              paddingBottom: '8px',
              borderBottom: '2px solid #C59F59',
            }}>
              Cotización
            </h1>
            <p style={{ margin: '4px 0', fontSize: '13px', color: '#57534e' }}>
              <strong>Fecha:</strong> {data.date}
            </p>
            <p style={{ margin: '4px 0', fontSize: '13px', color: '#57534e' }}>
              <strong>Válida hasta:</strong> {data.validUntil}
            </p>
            {data.quoteId && (
              <p style={{ margin: '8px 0 0', fontSize: '11px', color: '#a8a29e', fontFamily: 'monospace' }}>
                Ref: {data.quoteId.substring(0, 8)}
              </p>
            )}
          </div>
        </div>

        {/* Client Info */}
        <div style={{
          backgroundColor: 'rgba(245, 245, 244, 0.9)',
          border: '1px solid #d6d3d1',
          borderRadius: '12px',
          padding: '24px 24px 24px 32px',
          marginBottom: '40px',
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: '5px',
            backgroundColor: '#C59F59',
          }} />
          <p style={{ fontSize: '11px', fontWeight: 700, color: '#78716c', textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 16px 0' }}>
            Información del Cliente
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 32px' }}>
            {[
              { label: 'Nombre', value: data.clientName },
              { label: 'Documento', value: data.clientDocument || 'N/A' },
              { label: 'Email', value: data.clientEmail || 'N/A' },
              { label: 'Teléfono', value: data.clientPhone || 'N/A' },
            ].map(({ label, value }) => (
              <div key={label}>
                <p style={{ margin: 0, fontSize: '11px', color: '#78716c', textTransform: 'uppercase', letterSpacing: '1px' }}>{label}</p>
                <p style={{ margin: '2px 0 0', fontSize: '13px', fontWeight: 600, color: '#292524' }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Table */}
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          borderRadius: '12px',
          overflow: 'hidden',
          marginBottom: '32px',
        }}>
          <thead>
            <tr style={{ backgroundColor: '#292524' }}>
              {['Descripción', 'Cant.', 'Precio Unit.', 'Total'].map((h, i) => (
                <th key={h} style={{
                  padding: '14px 16px',
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
          <tbody>
            {data.items.map((item, idx) => (
              <tr key={idx} style={{ backgroundColor: idx % 2 === 0 ? '#ffffff' : '#fafaf9' }}>
                <td style={{ padding: '14px 16px', fontSize: '13px', color: '#292524', fontWeight: 500, borderBottom: '1px solid #e7e5e4' }}>
                  {item.description}
                </td>
                <td style={{ padding: '14px 16px', fontSize: '13px', textAlign: 'right', color: '#57534e', borderBottom: '1px solid #e7e5e4' }}>
                  {item.quantity}
                </td>
                <td style={{ padding: '14px 16px', fontSize: '13px', textAlign: 'right', color: '#57534e', borderBottom: '1px solid #e7e5e4' }}>
                  {formatCurrency(item.unit_price)}
                </td>
                <td style={{ padding: '14px 16px', fontSize: '13px', textAlign: 'right', fontWeight: 700, color: '#292524', borderBottom: '1px solid #e7e5e4' }}>
                  {formatCurrency(item.total_price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{
            backgroundColor: '#292524',
            color: '#ffffff',
            borderRadius: '12px',
            padding: '24px 32px',
            minWidth: '280px',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute',
              right: 0, top: 0, bottom: 0,
              width: '6px',
              backgroundColor: '#C59F59',
            }} />
            <p style={{ margin: '0 0 4px', fontSize: '11px', fontWeight: 700, color: '#C59F59', textTransform: 'uppercase', letterSpacing: '2px' }}>
              Total Cotizado
            </p>
            <p style={{ margin: 0, fontSize: '28px', fontWeight: 900, color: '#ffffff' }}>
              {formatCurrency(data.totalAmount)}
            </p>
          </div>
        </div>

      </div>

      {/* Footer */}
      <div style={{
        position: 'absolute',
        bottom: '32px',
        left: 0,
        right: 0,
        textAlign: 'center',
        zIndex: 1,
      }}>
        <div style={{ width: '48px', height: '1px', backgroundColor: 'rgba(197,159,89,0.5)', margin: '0 auto 8px' }} />
        <p style={{ margin: 0, fontSize: '11px', color: '#a8a29e' }}>Café Amantti — Pasión por el origen</p>
        <p style={{ margin: '4px 0 0', fontSize: '10px', color: '#d6d3d1' }}>Documento generado automáticamente</p>
      </div>
    </div>
  );
});

QuoteHTMLTemplate.displayName = 'QuoteHTMLTemplate';

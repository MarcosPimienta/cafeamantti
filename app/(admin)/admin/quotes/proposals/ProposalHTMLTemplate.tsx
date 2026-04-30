import React from 'react';

// Reusing layout constants from quoteGenerator but adapted for proposals
const PORTRAIT_W  = 816;
const PORTRAIT_H  = 1056;
const PAD_V       = 64;
const PAD_H       = 72;

export interface ProposalSection {
  title: string;
  text: string;
}

export interface ProposalData {
  clientName: string;
  date: string;
  title: string;
  subtitle?: string;
  content: ProposalSection[];
  sellerName?: string;
}

export function ProposalHTMLTemplate({ data }: { data: ProposalData }) {
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
    backgroundImage: "url('/images/Main_Background.jpg')",
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    opacity: 0.4,
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
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '60px' }}>
            <img src="/images/logo-amantti.png" alt="Amantti" style={{ width: '180px', height: 'auto' }} />
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: '14px', color: '#57534e', fontWeight: 600 }}>{data.date}</p>
            </div>
          </div>

          {/* Title & Subtitle */}
          <div style={{ marginBottom: '50px', textAlign: 'center' }}>
            <h1 style={{ 
              fontSize: '28px', 
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
                fontSize: '20px', 
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

          {/* Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '35px' }}>
            {data.content.map((section, idx) => (
              <div key={idx}>
                <h3 style={{ 
                  fontSize: '16px', 
                  fontWeight: 800, 
                  textTransform: 'uppercase', 
                  color: '#292524',
                  borderBottom: '1px solid rgba(197, 159, 89, 0.3)',
                  paddingBottom: '8px',
                  marginBottom: '15px',
                  letterSpacing: '1px'
                }}>
                  {idx + 1}. {section.title}
                </h3>
                <div style={{ 
                  fontSize: '14px', 
                  lineHeight: '1.7', 
                  color: '#44403c', 
                  whiteSpace: 'pre-wrap',
                  textAlign: 'justify'
                }}>
                  {section.text}
                </div>
              </div>
            ))}
          </div>

          {/* Final Message & Signature */}
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

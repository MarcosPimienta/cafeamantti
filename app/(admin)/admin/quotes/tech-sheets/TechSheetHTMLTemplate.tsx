import React from 'react';
import { CoffeeTechSheetData } from '../actions';

export interface TechSheetData extends CoffeeTechSheetData {
  signedImageUrl?: string;
  signedLogoUrl?: string;
}

export function TechSheetHTMLTemplate({ data }: { data: TechSheetData }) {
  const primaryColor = data.primary_color || '#717861';
  const bgColor = data.bg_color || '#f2f0eb';
  
  // Calculate softer card color based on primary color or default
  const cardBgColor = '#b5b8a8'; // Olive card background from reference image

  const logoSrc = data.signedLogoUrl || data.logo_url || '/images/logo-amantti.png';
  const imageSrc = data.signedImageUrl || data.image_url || '/images/coffee-beans-sample.jpg';

  return (
    <div 
      className="tech-sheet-container"
      style={{
        width: '900px',
        minHeight: '520px',
        backgroundColor: '#ffffff',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        padding: '24px',
        boxSizing: 'border-box',
        color: '#ffffff',
        borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.08)',
        margin: '0 auto',
      }}
    >
      {/* 1. Header Banner: CAFÉ DE BETULIA */}
      <div 
        style={{
          backgroundColor: primaryColor,
          borderRadius: '16px',
          padding: '12px 24px',
          textAlign: 'center',
          marginBottom: '16px',
        }}
      >
        <h1 
          style={{
            margin: 0,
            color: '#ffffff',
            fontSize: '26px',
            fontWeight: 800,
            letterSpacing: '2px',
            textTransform: 'uppercase',
          }}
        >
          {data.title || 'CAFÉ DE BETULIA'}
        </h1>
      </div>

      {/* 2. Main Content Grid (Left Panel + Right Panel) */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'stretch' }}>
        
        {/* LEFT PANEL: Logo & History */}
        <div 
          style={{
            width: '230px',
            backgroundColor: primaryColor,
            borderRadius: '16px',
            padding: '24px 20px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            boxSizing: 'border-box',
            flexShrink: 0,
          }}
        >
          {/* Logo */}
          <div style={{ minHeight: '70px', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
            <img 
              src={logoSrc} 
              alt="Logo Marca" 
              style={{ maxHeight: '75px', maxWidth: '180px', objectFit: 'contain', filter: logoSrc.includes('logo-amantti') ? 'brightness(0) invert(1)' : 'none' }} 
              onError={(e) => {
                // Fallback to text if image fails to load
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          {/* History Title */}
          <h2 
            style={{
              margin: '0 0 12px 0',
              fontSize: '18px',
              fontWeight: 700,
              color: '#ffffff',
              textAlign: 'center',
              letterSpacing: '0.5px'
            }}
          >
            {data.history_title || 'Historia'}
          </h2>

          {/* History Description */}
          <p 
            style={{
              margin: 0,
              fontSize: '12.5px',
              lineHeight: '1.55',
              color: 'rgba(255, 255, 255, 0.92)',
              textAlign: 'center',
              fontWeight: 400,
              whiteSpace: 'pre-line',
            }}
          >
            {data.history_text || 'Café de origen cultivado en la finca el Mirador, ubicada en la vereda la Cibeles del municipio de Betulia Antioquía. Un café que refleja el cuidado, la dedicación y las condiciones del territorio, ofreciendo una taza dulce, frutal y equilibrada.'}
          </p>
        </div>

        {/* RIGHT PANEL: Technical Sheet Details */}
        <div 
          style={{
            flex: 1,
            backgroundColor: bgColor,
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            boxSizing: 'border-box',
          }}
        >
          {/* FICHA TÉCNICA Banner */}
          <div 
            style={{
              backgroundColor: cardBgColor,
              borderRadius: '12px',
              padding: '10px 16px',
              textAlign: 'center',
            }}
          >
            <h2 
              style={{
                margin: 0,
                color: '#ffffff',
                fontSize: '22px',
                fontWeight: 800,
                letterSpacing: '2px',
                textTransform: 'uppercase',
              }}
            >
              {data.subtitle || 'FICHA TÉCNICA'}
            </h2>
          </div>

          {/* Image + Specs Grid */}
          <div style={{ display: 'flex', gap: '14px', flex: 1 }}>
            
            {/* Coffee Image */}
            <div style={{ width: '270px', flexShrink: 0, borderRadius: '12px', overflow: 'hidden', backgroundColor: '#ddd', display: 'flex' }}>
              <img 
                src={imageSrc} 
                alt={data.title || 'Foto Café'} 
                style={{ width: '100%', height: '100%', minHeight: '290px', objectFit: 'cover' }}
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80';
                }}
              />
            </div>

            {/* Spec Cards Stack */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '10px', color: '#ffffff' }}>
              
              {/* Card 1: Origen */}
              <div 
                style={{
                  backgroundColor: cardBgColor,
                  borderRadius: '10px',
                  padding: '9px 14px',
                  fontSize: '13.5px',
                  lineHeight: '1.4',
                }}
              >
                <span style={{ fontWeight: 800 }}>Origen:</span>{' '}
                <span style={{ fontWeight: 500, color: 'rgba(255, 255, 255, 0.95)' }}>{data.origin || 'Betulia Antioquia'}</span>
              </div>

              {/* Card 2: Finca, Ubicación, Altura, Variedad, Proceso */}
              <div 
                style={{
                  backgroundColor: cardBgColor,
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  lineHeight: '1.5',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '2px',
                }}
              >
                {data.farm_name && (
                  <div>
                    <span style={{ fontWeight: 800 }}>Finca:</span>{' '}
                    <span style={{ fontWeight: 500 }}>{data.farm_name}</span>
                  </div>
                )}
                {data.location && (
                  <div>
                    <span style={{ fontWeight: 800 }}>Ubicación:</span>{' '}
                    <span style={{ fontWeight: 500 }}>{data.location}</span>
                  </div>
                )}
                {data.altitude && (
                  <div>
                    <span style={{ fontWeight: 800 }}>Altura:</span>{' '}
                    <span style={{ fontWeight: 500 }}>{data.altitude}</span>
                  </div>
                )}
                {data.variety && (
                  <div>
                    <span style={{ fontWeight: 800 }}>Variedad:</span>{' '}
                    <span style={{ fontWeight: 500 }}>{data.variety}</span>
                  </div>
                )}
                {data.process && (
                  <div>
                    <span style={{ fontWeight: 800 }}>Proceso:</span>{' '}
                    <span style={{ fontWeight: 500 }}>{data.process}</span>
                  </div>
                )}
              </div>

              {/* Card 3: Tostión & SCA */}
              <div 
                style={{
                  backgroundColor: cardBgColor,
                  borderRadius: '10px',
                  padding: '9px 14px',
                  fontSize: '13px',
                  lineHeight: '1.5',
                }}
              >
                {data.roast_level && (
                  <div>
                    <span style={{ fontWeight: 800 }}>Tostión:</span>{' '}
                    <span style={{ fontWeight: 500 }}>{data.roast_level}</span>
                  </div>
                )}
                {data.sca_score !== undefined && data.sca_score !== null && (
                  <div>
                    <span style={{ fontWeight: 800 }}>Puntaje SCA:</span>{' '}
                    <span style={{ fontWeight: 700 }}>{data.sca_score}</span>
                  </div>
                )}
              </div>

              {/* Card 4: Perfil Sensorial */}
              <div 
                style={{
                  backgroundColor: cardBgColor,
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontSize: '13px',
                  lineHeight: '1.45',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px',
                }}
              >
                {data.sensory_profile && (
                  <div>
                    <span style={{ fontWeight: 800 }}>Perfil sensorial:</span>{' '}
                    <span style={{ fontWeight: 500 }}>{data.sensory_profile}</span>
                  </div>
                )}
                {data.acidity && (
                  <div>
                    <span style={{ fontWeight: 800 }}>Acidez:</span>{' '}
                    <span style={{ fontWeight: 500 }}>{data.acidity}</span>
                  </div>
                )}
                {data.body && (
                  <div>
                    <span style={{ fontWeight: 800 }}>Cuerpo:</span>{' '}
                    <span style={{ fontWeight: 500 }}>{data.body}</span>
                  </div>
                )}
                {data.sweetness && (
                  <div>
                    <span style={{ fontWeight: 800 }}>Dulzor:</span>{' '}
                    <span style={{ fontWeight: 500 }}>{data.sweetness}</span>
                  </div>
                )}
              </div>

            </div>

          </div>

        </div>

      </div>
    </div>
  );
}

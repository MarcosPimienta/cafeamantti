import { CoffeeTechSheetData } from '@/app/(admin)/admin/quotes/actions';

export async function generateTechSheetPDF(
  data: CoffeeTechSheetData,
  filename?: string
): Promise<Blob> {
  const html2pdf = (await import('html2pdf.js')).default;
  const pdfFilename = filename || `ficha-tecnica-${(data.title || 'cafe').toLowerCase().replace(/[^a-z0-9]/g, '-')}.pdf`;

  const primaryColor = data.primary_color || '#717861';
  const bgColor = data.bg_color || '#f2f0eb';
  const cardBgColor = '#b5b8a8';

  const logoSrc = data.logo_url || '/images/logo-amantti.png';
  const imageSrc = data.image_url || 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=600&auto=format&fit=crop&q=80';

  const htmlContent = `
    <div style="width: 1000px; padding: 24px; font-family: Arial, Helvetica, sans-serif; background-color: #ffffff; color: #ffffff; box-sizing: border-box;">
      <!-- Header Banner -->
      <div style="background-color: ${primaryColor}; border-radius: 16px; padding: 14px 24px; text-align: center; margin-bottom: 16px;">
        <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;">
          ${data.title || 'CAFÉ DE BETULIA'}
        </h1>
      </div>

      <!-- Main Grid -->
      <div style="display: flex; gap: 16px; align-items: stretch;">
        
        <!-- Left Panel: Logo & History -->
        <div style="width: 240px; background-color: ${primaryColor}; border-radius: 16px; padding: 24px 20px; display: flex; flex-direction: column; align-items: center; box-sizing: border-box; flex-shrink: 0;">
          <div style="min-height: 70px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
            ${logoSrc ? `<img src="${logoSrc}" style="max-height: 75px; max-width: 180px; object-fit: contain;" />` : ''}
          </div>

          <h2 style="margin: 0 0 12px 0; font-size: 18px; font-weight: 700; color: #ffffff; text-align: center;">
            ${data.history_title || 'Historia'}
          </h2>

          <p style="margin: 0; font-size: 12.5px; line-height: 1.55; color: rgba(255, 255, 255, 0.95); text-align: center; font-weight: 400; white-space: pre-line;">
            ${data.history_text || ''}
          </p>
        </div>

        <!-- Right Panel: Ficha Técnica details -->
        <div style="flex: 1; background-color: ${bgColor}; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 14px; box-sizing: border-box;">
          <!-- FICHA TÉCNICA Subheader -->
          <div style="background-color: ${cardBgColor}; border-radius: 12px; padding: 10px 16px; text-align: center;">
            <h2 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;">
              ${data.subtitle || 'FICHA TÉCNICA'}
            </h2>
          </div>

          <!-- Content Row -->
          <div style="display: flex; gap: 14px; flex: 1;">
            <!-- Coffee Photo -->
            <div style="width: 290px; flex-shrink: 0; border-radius: 12px; overflow: hidden; background-color: #ddd; display: flex;">
              <img src="${imageSrc}" style="width: 100%; height: 100%; min-height: 310px; object-fit: cover;" />
            </div>

            <!-- Spec Cards Stack -->
            <div style="flex: 1; display: flex; flex-direction: column; gap: 10px; color: #ffffff;">
              
              <!-- Card 1: Origen -->
              <div style="background-color: ${cardBgColor}; border-radius: 10px; padding: 10px 14px; font-size: 13.5px;">
                <span style="font-weight: 800;">Origen:</span> <span style="font-weight: 500;">${data.origin || ''}</span>
              </div>

              <!-- Card 2: Cultivo -->
              <div style="background-color: ${cardBgColor}; border-radius: 10px; padding: 10px 14px; font-size: 13px; display: flex; flex-direction: column; gap: 2px;">
                ${data.farm_name ? `<div><span style="font-weight: 800;">Finca:</span> <span style="font-weight: 500;">${data.farm_name}</span></div>` : ''}
                ${data.location ? `<div><span style="font-weight: 800;">Ubicación:</span> <span style="font-weight: 500;">${data.location}</span></div>` : ''}
                ${data.altitude ? `<div><span style="font-weight: 800;">Altura:</span> <span style="font-weight: 500;">${data.altitude}</span></div>` : ''}
                ${data.variety ? `<div><span style="font-weight: 800;">Variedad:</span> <span style="font-weight: 500;">${data.variety}</span></div>` : ''}
                ${data.process ? `<div><span style="font-weight: 800;">Proceso:</span> <span style="font-weight: 500;">${data.process}</span></div>` : ''}
              </div>

              <!-- Card 3: Tostión & SCA -->
              <div style="background-color: ${cardBgColor}; border-radius: 10px; padding: 10px 14px; font-size: 13px;">
                ${data.roast_level ? `<div><span style="font-weight: 800;">Tostión:</span> <span style="font-weight: 500;">${data.roast_level}</span></div>` : ''}
                ${data.sca_score !== undefined && data.sca_score !== null ? `<div><span style="font-weight: 800;">Puntaje SCA:</span> <span style="font-weight: 700;">${data.sca_score}</span></div>` : ''}
              </div>

              <!-- Card 4: Perfil Sensorial -->
              <div style="background-color: ${cardBgColor}; border-radius: 10px; padding: 10px 14px; font-size: 13px; display: flex; flex-direction: column; gap: 3px;">
                ${data.sensory_profile ? `<div><span style="font-weight: 800;">Perfil sensorial:</span> <span style="font-weight: 500;">${data.sensory_profile}</span></div>` : ''}
                ${data.acidity ? `<div><span style="font-weight: 800;">Acidez:</span> <span style="font-weight: 500;">${data.acidity}</span></div>` : ''}
                ${data.body ? `<div><span style="font-weight: 800;">Cuerpo:</span> <span style="font-weight: 500;">${data.body}</span></div>` : ''}
                ${data.sweetness ? `<div><span style="font-weight: 800;">Dulzor:</span> <span style="font-weight: 500;">${data.sweetness}</span></div>` : ''}
              </div>

            </div>

          </div>

        </div>

      </div>
    </div>
  `;

  const container = document.createElement('div');
  container.innerHTML = htmlContent;
  container.style.position = 'fixed';
  container.style.left = '-10000px';
  container.style.top = '0';
  document.body.appendChild(container);

  try {
    const opt = {
      margin: 0,
      filename: pdfFilename,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'pt' as const, format: 'a4' as const, orientation: 'landscape' as const }
    };
    return await html2pdf().set(opt).from(container.firstElementChild as HTMLElement).output('blob');
  } finally {
    document.body.removeChild(container);
  }
}

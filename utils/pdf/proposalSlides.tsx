'use client';

// PDF of a proposal's slides: each slide is rendered off-screen with the same
// component the editor shows, drawn to a canvas and placed on its own 16:9
// page. Photos from storage (signed URLs) are inlined first so the canvas is
// never tainted.
import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { buildSlides, type ProposalData } from '@/utils/proposals/slides';
import { ProposalSlide, SLIDE_W, SLIDE_H } from '@/app/(admin)/admin/quotes/proposals/ProposalSlides';

async function toDataUrl(url?: string): Promise<string | undefined> {
  if (!url || !/^https?:/.test(url)) return url;
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

async function inlineImages(data: ProposalData): Promise<ProposalData> {
  const content = await Promise.all(
    data.content.map(async (b) => ({
      ...b,
      imageUrl: await toDataUrl(b.imageUrl),
      items: b.items ? await Promise.all(b.items.map(async (i) => ({ ...i, imageUrl: await toDataUrl(i.imageUrl) }))) : b.items,
    }))
  );
  return {
    ...data,
    content,
    allyLogoUrl: await toDataUrl(data.allyLogoUrl),
    backgroundImageUrl: await toDataUrl(data.backgroundImageUrl),
  };
}

/** Waits for every <img> and CSS background image inside `el` to load. */
async function imagesReady(el: HTMLElement) {
  const urls = new Set<string>();
  el.querySelectorAll('img').forEach((img) => urls.add(img.src));
  el.querySelectorAll<HTMLElement>('*').forEach((n) => {
    const m = n.style.backgroundImage.match(/url\("?(.*?)"?\)/);
    if (m) urls.add(m[1]);
  });
  await Promise.all(
    [...urls].map(
      (src) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = img.onerror = () => resolve();
          img.src = src;
        })
    )
  );
  await document.fonts?.ready;
}

export async function generateProposalSlidesPDF(raw: ProposalData): Promise<Blob> {
  const data = await inlineImages(raw);
  const slides = buildSlides(data);
  const html2pdf = (await import('html2pdf.js')).default;
  const { jsPDF } = await import('jspdf');

  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '-20000px', top: '0', width: `${SLIDE_W}px`, zIndex: '-1' });
  document.body.appendChild(host);
  const root = createRoot(host);

  const pdf = new jsPDF({ unit: 'px', format: [SLIDE_W, SLIDE_H], orientation: 'landscape', hotfixes: ['px_scaling'], compress: true });
  try {
    for (let i = 0; i < slides.length; i++) {
      flushSync(() => root.render(<ProposalSlide slide={slides[i]} n={i + 1} total={slides.length} data={data} />));
      const el = host.firstElementChild as HTMLElement;
      await imagesReady(el);
      const canvas: HTMLCanvasElement = await html2pdf()
        .set({ margin: 0, jsPDF: { unit: 'px', format: [SLIDE_W, SLIDE_H], orientation: 'landscape' }, html2canvas: { scale: 1.5, useCORS: true, width: SLIDE_W, height: SLIDE_H, windowWidth: SLIDE_W, logging: false, backgroundColor: null } })
        .from(el)
        .toCanvas()
        .get('canvas');
      if (i > 0) pdf.addPage([SLIDE_W, SLIDE_H], 'landscape');
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, SLIDE_W, SLIDE_H);
    }
    return pdf.output('blob');
  } finally {
    root.unmount();
    host.remove();
  }
}

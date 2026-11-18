'use client';

import React, { useEffect, useRef, useState } from 'react';
import { translator } from "@/utils/i18n/translate";
import { buildSlides, fitText, type Product, type ProposalData, type Slide } from "@/utils/proposals/slides";

// Slides follow the Amantti identity manual (Amantti_Brand_Identity.pdf):
// - palette: negro profundo #0B0B0B, beige cálido #F4F1ED, dorado sutil #C2A878;
//   dark backgrounds predominate.
// - type: Bodoni italic for titles, in lowercase; a clean sans for text
//   (Agrandir in the manual; Archivo here), light weights, no heavy bold,
//   generous line spacing ("aire = lujo"), short texts.
// - logo: the amantti wordmark in gold or beige, clean, no effects.
// - thin gold hairlines, square edges, warm photos with negative space.
// Drawn at 1280×720 with inline styles only (no filters, no container units)
// so the same markup renders on screen, in present mode and in the PDF.
export const SLIDE_W = 1280;
export const SLIDE_H = 720;

const BLACK = '#0B0B0B';
const PANEL = '#141312';
const BEIGE = '#F4F1ED';
const GOLD = '#C2A878';
const SOFT = 'rgba(244,241,237,.74)';
const DIM = 'rgba(244,241,237,.5)';
const LINE = 'rgba(194,168,120,.4)';
const DISPLAY = 'var(--font-bodoni), "Bodoni Moda", Didot, "Bodoni 72", Georgia, serif';
const BODY = 'var(--font-archivo), Archivo, "Helvetica Neue", Arial, sans-serif';
const LOGO_GOLD = '/images/logo-amantti-gold.png';
const SLOGAN = 'el lujo de tomarse el tiempo.';

type Tr = ReturnType<typeof translator>;

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

const base: React.CSSProperties = {
  position: 'relative', width: SLIDE_W, height: SLIDE_H, overflow: 'hidden', background: BLACK, color: BEIGE,
  fontFamily: BODY, fontWeight: 300, boxSizing: 'border-box',
};
const inner: React.CSSProperties = { position: 'absolute', inset: 0, padding: '60px 80px 80px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' };
const label: React.CSSProperties = { fontFamily: BODY, fontWeight: 400, fontSize: 12, letterSpacing: '0.32em', textTransform: 'uppercase', color: DIM };
const titleStyle = (title: string, big = 52): React.CSSProperties => ({
  fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 400, fontSize: title.length > 55 ? big * 0.76 : big,
  lineHeight: 1.12, color: GOLD, textTransform: 'lowercase', margin: 0,
});
const photo = (url: string, extra: React.CSSProperties = {}): React.CSSProperties => ({
  backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', ...extra,
});

/** Slide title with the manual's thin gold rule under it. */
function Title({ text, rule = true, big }: { text: string; rule?: boolean; big?: number }) {
  return (
    <div>
      <div style={titleStyle(text, big)}>{text}</div>
      {rule && <div style={{ height: 1, background: LINE, marginTop: 22 }} />}
    </div>
  );
}

function Dot({ top }: { top: number }) {
  return <span style={{ flex: 'none', width: 5, height: 5, borderRadius: '50%', marginTop: top, background: GOLD }} />;
}

function Footer({ clientName, n, total }: { clientName: string; n: number; total: number }) {
  return (
    <div style={{ position: 'absolute', left: 80, right: 80, bottom: 30, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <img src={LOGO_GOLD} alt="amantti" style={{ height: 18, width: 'auto' }} />
      <span style={{ ...label, fontSize: 11 }}>amantti × {clientName} · {n} / {total}</span>
    </div>
  );
}

function Art({ kind, tr }: { kind: NonNullable<Product['art']>; tr: Tr }) {
  const panel: React.CSSProperties = { height: '100%', background: 'radial-gradient(circle at 35% 30%, #2a241e 0%, #0B0B0B 75%)', display: 'flex', alignItems: 'center', justifyContent: 'center' };
  if (kind === 'roast-dark') {
    return <div style={panel}><span style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 26, color: GOLD, textTransform: 'lowercase' }}>{tr("Tostión oscura")}</span></div>;
  }
  const d =
    kind === 'leaf' ? <><path d="M10 38C10 20 22 10 40 8c0 18-10 30-28 30z" /><path d="M10 38 30 18" /></>
    : kind === 'gift' ? <><rect x="8" y="20" width="32" height="20" /><rect x="6" y="14" width="36" height="6" /><path d="M24 14v26" /><path d="M24 14c-4-6-12-6-10 0M24 14c4-6 12-6 10 0" /></>
    : <><path d="M10 18h24v10a10 10 0 0 1-10 10h-4a10 10 0 0 1-10-10z" /><path d="M34 21h3a4 4 0 0 1 0 8h-3" /><path d="M17 8c0 3 3 3 3 6M24 8c0 3 3 3 3 6" /></>;
  return (
    <div style={panel}>
      <svg width="64" height="64" viewBox="0 0 48 48" fill="none" stroke={GOLD} strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
    </div>
  );
}

function Meter({ roast, tr }: { roast: NonNullable<Product['roast']>; tr: Tr }) {
  const on = roast === 'dark' ? 4 : 2;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...label, fontSize: 10.5, letterSpacing: '0.2em' }}>
      <span style={{ display: 'inline-flex', gap: 5 }}>
        {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 16, height: 2, background: i < on ? GOLD : 'rgba(244,241,237,.18)' }} />)}
      </span>
      {roast === 'dark' ? tr("Tostión oscura") : tr("Tostión media")}
    </div>
  );
}

function ProductCard({ p, showPvp, compact, tr }: { p: Product; showPvp: boolean; compact: boolean; tr: Tr }) {
  return (
    <div style={{ background: PANEL, border: `1px solid ${LINE}`, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ height: compact ? 150 : 172, flex: 'none' }}>
        {p.art && !p.photo ? <Art kind={p.art} tr={tr} /> : <div style={photo(p.photo ?? '', { height: '100%' })} />}
      </div>
      <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
        <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 400, fontSize: compact ? 23 : 26, lineHeight: 1.15, color: BEIGE }}>{p.name}</div>
        {p.roast && <Meter roast={p.roast} tr={tr} />}
        {p.detail && <div style={{ fontSize: compact ? 13 : 14, lineHeight: 1.6, color: SOFT }}>{p.detail}</div>}
        <div style={{ marginTop: 'auto', borderTop: `1px solid ${LINE}`, paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 400, fontSize: compact ? 29 : 33, color: GOLD, fontVariantNumeric: 'lining-nums' }}>{money(p.price)}</span>
            <span style={{ fontSize: 12, color: DIM, textAlign: 'right', lineHeight: 1.4 }}>{p.tax ? `+ ${p.tax}` : tr("Antes de IVA")}</span>
          </div>
          {showPvp && p.pvp > 0 && <span style={{ fontSize: 13, color: DIM }}>{tr("PVP sugerido {v}", { v: money(p.pvp) })}</span>}
          {p.note && <span style={{ fontSize: 12.5, color: DIM, lineHeight: 1.5 }}>{p.note}</span>}
        </div>
      </div>
    </div>
  );
}

export function ProposalSlide({ slide, n, total, data }: { slide: Slide; n: number; total: number; data: ProposalData }) {
  const tr = translator(data.lang ?? 'es');
  const client = data.clientName;

  if (slide.kind === 'cover') {
    return (
      <div style={base}>
        <div style={photo(slide.photo, { position: 'absolute', inset: 0 })} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(11,11,11,.96) 0%, rgba(11,11,11,.86) 46%, rgba(11,11,11,.25) 100%)' }} />
        <div style={{ ...inner, justifyContent: 'space-between', padding: '64px 80px 58px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 28 }}>
            <img src={LOGO_GOLD} alt="amantti" style={{ height: 44, width: 'auto' }} />
            {slide.allyLogoUrl && (
              <>
                <span style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 26, color: GOLD }}>×</span>
                <span style={{ background: BEIGE, padding: '10px 16px', display: 'flex' }}>
                  <img src={slide.allyLogoUrl} alt={client} style={{ height: 46, maxWidth: 210, width: 'auto' }} />
                </span>
              </>
            )}
          </div>
          <div style={{ maxWidth: 680 }}>
            <div style={label}>{tr("Propuesta comercial")}</div>
            <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 400, fontSize: slide.title.length > 50 ? 56 : 68, lineHeight: 1.08, margin: '22px 0 0', textTransform: 'lowercase', color: BEIGE }}>{slide.title}</div>
            {slide.subtitle && <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 24, color: GOLD, marginTop: 18 }}>{slide.subtitle}</div>}
            <div style={{ width: 220, height: 1, background: LINE, marginTop: 30 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', maxWidth: 680 }}>
            <span style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 20, color: GOLD }}>{SLOGAN}</span>
            <span style={label}>{slide.date}</span>
          </div>
        </div>
      </div>
    );
  }

  if (slide.kind === 'split') {
    const chars = slide.paragraphs.join(' ').length + slide.items.join(' ').length;
    const size = fitText(chars, [18, 16, 14], [380, 700]);
    return (
      <div style={base}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          <div style={{ width: '54%', padding: '60px 56px 84px 80px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <Title text={slide.title} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: size * 0.9, marginTop: 30, fontSize: size, lineHeight: 1.75, color: SOFT }}>
              {slide.paragraphs.map((p, i) => <p key={i} style={{ margin: 0 }}>{p}</p>)}
              {slide.items.map((it, i) => (
                <div key={`i${i}`} style={{ display: 'flex', gap: 14 }}><Dot top={size * 0.75} /><span>{it}</span></div>
              ))}
            </div>
          </div>
          <div style={photo(slide.photo, { flex: 1 })} />
        </div>
        <div style={{ position: 'absolute', left: 80, bottom: 30 }}>
          <img src={LOGO_GOLD} alt="amantti" style={{ height: 18, width: 'auto' }} />
        </div>
        <div style={{ position: 'absolute', right: 22, bottom: 20, ...label, fontSize: 11, color: BEIGE, background: 'rgba(11,11,11,.55)', padding: '6px 12px' }}>{n} / {total}</div>
      </div>
    );
  }

  if (slide.kind === 'columns') {
    const cols = slide.columns.length;
    const longest = Math.max(...slide.columns.map((c) => c.text.length));
    const size = fitText(longest, [16.5, 15, 13.5], [150, 220]);
    return (
      <div style={base}>
        <div style={inner}>
          <Title text={slide.title} />
          {slide.intro && <p style={{ fontSize: 18, lineHeight: 1.7, color: SOFT, margin: '24px 0 0', maxWidth: 820 }}>{slide.intro}</p>}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 24 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
              {slide.columns.map((c, i) => (
                <div key={i} style={{ padding: '6px 34px', borderLeft: i ? `1px solid ${LINE}` : 'none', paddingLeft: i ? 34 : 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {c.heading && <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: cols > 3 ? 24 : 29, lineHeight: 1.15, color: GOLD, textTransform: 'lowercase' }}>{c.heading}</div>}
                  <div style={{ fontSize: size, lineHeight: 1.75, color: c.heading ? SOFT : BEIGE }}>{c.text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Footer clientName={client} n={n} total={total} />
      </div>
    );
  }

  if (slide.kind === 'list') {
    const groups = slide.groups.filter((g) => g.items.length || g.heading);
    const items = groups.flatMap((g) => g.items);
    const chars = slide.paragraphs.join(' ').length + items.join(' ').length;
    const size = fitText(chars, [17, 15, 13.5], [420, 800]);
    const many = groups.length > 1;
    const cols = many ? Math.min(groups.length, 3) : items.length > 5 ? 2 : 1;
    return (
      <div style={base}>
        <div style={inner}>
          <Title text={slide.title} />
          {slide.paragraphs.length > 0 && (
            <div style={{ marginTop: 22, fontSize: size + 1, lineHeight: 1.7, color: SOFT, maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {slide.paragraphs.map((p, i) => <p key={i} style={{ margin: 0 }}>{p}</p>)}
            </div>
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 24, minHeight: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: many ? 26 : '16px 48px', alignItems: 'start' }}>
              {many
                ? groups.map((g, gi) => (
                    <div key={gi} style={{ border: `1px solid ${LINE}`, padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {g.heading && <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 25, color: GOLD, textTransform: 'lowercase', marginBottom: 4 }}>{g.heading}</div>}
                      {g.items.map((it, i) => (
                        <div key={i} style={{ display: 'flex', gap: 12, fontSize: size, lineHeight: 1.65, color: SOFT }}><Dot top={size * 0.72} /><span>{it}</span></div>
                      ))}
                    </div>
                  ))
                : items.map((it, i) => (
                    <div key={i} style={{ display: 'flex', gap: 14, fontSize: size + 1, lineHeight: 1.7, color: SOFT, borderBottom: `1px solid rgba(194,168,120,.18)`, paddingBottom: 14 }}>
                      <Dot top={(size + 1) * 0.75} /><span>{it}</span>
                    </div>
                  ))}
            </div>
          </div>
        </div>
        <Footer clientName={client} n={n} total={total} />
      </div>
    );
  }

  if (slide.kind === 'products') {
    const compact = slide.products.length === 4;
    return (
      <div style={base}>
        <div style={inner}>
          <Title text={slide.title} />
          <div style={{ marginTop: 30, flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${Math.max(slide.products.length, 2)}, minmax(0, 1fr))`, gap: compact ? 18 : 24, paddingBottom: 8 }}>
            {slide.products.map((p, i) => <ProductCard key={i} p={p} showPvp={slide.showPvp} compact={compact} tr={tr} />)}
          </div>
        </div>
        <Footer clientName={client} n={n} total={total} />
      </div>
    );
  }

  if (slide.kind === 'table') {
    const rows = slide.products;
    const size = rows.length > 8 ? 13.5 : 15;
    const grid = slide.showPvp ? '1fr 170px 170px' : '1fr 190px';
    return (
      <div style={base}>
        <div style={inner}>
          <Title text={slide.title} rule={false} />
          <div style={{ marginTop: 28, borderTop: `1px solid ${LINE}` }}>
            <div style={{ display: 'grid', gridTemplateColumns: grid, ...label, fontSize: 11, padding: '14px 0', borderBottom: `1px solid ${LINE}` }}>
              <span>{tr("Producto")}</span>
              <span style={{ textAlign: 'right' }}>{tr("Precio")}</span>
              {slide.showPvp && <span style={{ textAlign: 'right' }}>{tr("PVP sugerido")}</span>}
            </div>
            {rows.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: grid, padding: rows.length > 8 ? '9px 0' : '13px 0', borderBottom: '1px solid rgba(194,168,120,.16)', alignItems: 'center', fontSize: size }}>
                <span style={{ minWidth: 0, lineHeight: 1.5 }}>
                  <span style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: size + 3, color: BEIGE }}>{p.name}</span>
                  {(p.detail || p.note) && <span style={{ color: DIM }}>{'  ·  '}{[p.detail, p.note].filter(Boolean).join(' · ')}</span>}
                </span>
                <span style={{ textAlign: 'right', fontFamily: DISPLAY, fontSize: size + 5, color: GOLD }}>
                  {money(p.price)}{p.tax && <span style={{ display: 'block', fontFamily: BODY, fontSize: 11.5, color: DIM }}>+ {p.tax}</span>}
                </span>
                {slide.showPvp && <span style={{ textAlign: 'right', color: SOFT }}>{p.pvp > 0 ? money(p.pvp) : '—'}</span>}
              </div>
            ))}
          </div>
        </div>
        <Footer clientName={client} n={n} total={total} />
      </div>
    );
  }

  // close
  const closeText = slide.paragraphs.join(' ');
  return (
    <div style={base}>
      <div style={photo(slide.photo, { position: 'absolute', inset: 0 })} />
      <div style={{ position: 'absolute', inset: 0, background: 'rgba(11,11,11,.72)' }} />
      <div style={{ ...inner, justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '56px 120px 70px' }}>
        <img src={LOGO_GOLD} alt="amantti" style={{ height: 62, width: 'auto' }} />
        <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 21, color: GOLD, marginTop: 12 }}>{SLOGAN}</div>
        <div style={{ width: 160, height: 1, background: LINE, margin: '34px 0' }} />
        <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontWeight: 400, fontSize: slide.title.length > 40 ? 40 : 48, lineHeight: 1.12, color: BEIGE, textTransform: 'lowercase', maxWidth: 820 }}>{slide.title}</div>
        {closeText && <p style={{ fontSize: fitText(closeText.length, [18, 16.5, 15], [220, 360]), lineHeight: 1.75, color: SOFT, maxWidth: 720, margin: '20px 0 0' }}>{closeText}</p>}
        <div style={{ marginTop: 34, border: `1px solid ${GOLD}`, padding: '13px 30px', ...label, color: BEIGE, fontSize: 12 }}>
          amantti <span style={{ color: GOLD }}>×</span> {client}
        </div>
        <div style={{ marginTop: 22, fontSize: 13, lineHeight: 1.7, color: DIM }}>
          {slide.sellerName && <div style={{ color: SOFT }}>{slide.sellerName}</div>}
          <div>Alma Trading Group SAS · Nit 901752308-8 · cafeamantti@gmail.com</div>
        </div>
      </div>
    </div>
  );
}

/** Every slide of the proposal, one under the other, at `scale`. */
export function ProposalDeck({ data, scale = 1, gap = 24 }: { data: ProposalData; scale?: number; gap?: number }) {
  const slides = buildSlides(data);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap }}>
      {slides.map((s, i) => (
        <ScaledSlide key={i} scale={scale}>
          <ProposalSlide slide={s} n={i + 1} total={slides.length} data={data} />
        </ScaledSlide>
      ))}
    </div>
  );
}

export function ScaledSlide({ scale, children, shadow = true }: { scale: number; children: React.ReactNode; shadow?: boolean }) {
  return (
    <div style={{ width: SLIDE_W * scale, height: SLIDE_H * scale, overflow: 'hidden', boxShadow: shadow ? '0 10px 30px rgba(11,11,11,.22)' : 'none', flex: 'none' }}>
      <div style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>{children}</div>
    </div>
  );
}

/** Full-screen presentation: arrows, space or click to move; Esc to leave. */
export function PresentMode({ data, onClose }: { data: ProposalData; onClose: () => void }) {
  const tr = translator(data.lang ?? 'es');
  const slides = buildSlides(data);
  const [i, setI] = useState(0);
  const [size, setSize] = useState({ w: 1280, h: 720 });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fit = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    fit();
    window.addEventListener('resize', fit);
    ref.current?.requestFullscreen?.().catch(() => {});
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowRight', ' ', 'PageDown'].includes(e.key)) { e.preventDefault(); setI((v) => Math.min(slides.length - 1, v + 1)); }
      if (['ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); setI((v) => Math.max(0, v - 1)); }
      if (e.key === 'Escape') onClose();
    };
    const onFs = () => { if (!document.fullscreenElement) onClose(); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('resize', fit);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [slides.length, onClose]);

  const scale = Math.min(size.w / SLIDE_W, size.h / SLIDE_H);
  return (
    <div
      ref={ref}
      onClick={(e) => setI((v) => (e.clientX < window.innerWidth / 3 ? Math.max(0, v - 1) : Math.min(slides.length - 1, v + 1)))}
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0B0B0B', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
    >
      <ScaledSlide scale={scale} shadow={false}>
        <ProposalSlide slide={slides[i]} n={i + 1} total={slides.length} data={data} />
      </ScaledSlide>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{ position: 'fixed', right: 16, bottom: 16, font: `600 13px ${BODY}`, background: 'rgba(11,11,11,.6)', color: '#F4F1ED', border: '1px solid rgba(194,168,120,.5)', padding: '8px 14px', cursor: 'pointer' }}
      >
        {tr("Terminar")} · {i + 1} / {slides.length}
      </button>
    </div>
  );
}

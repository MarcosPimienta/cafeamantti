'use client';

import React, { useEffect, useRef, useState } from 'react';
import { translator } from "@/utils/i18n/translate";
import { buildSlides, fitText, type Product, type ProposalData, type Slide } from "@/utils/proposals/slides";

// Slides are drawn at 1280×720 with inline styles only (no filters, no
// container units) so the same markup renders on screen, in present mode and
// in the PDF (html2canvas). Brand: Amantti gold, dark roast, warm paper.
export const SLIDE_W = 1280;
export const SLIDE_H = 720;

const GOLD = '#C59F59';
const GOLD_SOFT = '#E7D3A8';
const ROAST = '#292524';
const PAPER = '#FAF7F1';
const INK = '#1c1917';
const MUTED = '#6b625b';
const CREAM_TEXT = '#f5efe6';
const DISPLAY = 'var(--font-playfair), "Playfair Display", Georgia, serif';
const BODY = 'var(--font-archivo), Archivo, "Helvetica Neue", Arial, sans-serif';

type Tr = ReturnType<typeof translator>;

const money = (n: number) => `$${Math.round(n).toLocaleString('es-CO')}`;

const base: React.CSSProperties = {
  position: 'relative', width: SLIDE_W, height: SLIDE_H, overflow: 'hidden', background: PAPER, color: INK,
  fontFamily: BODY, boxSizing: 'border-box',
};
const inner: React.CSSProperties = { position: 'absolute', inset: 0, padding: '64px 76px 76px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' };
const eyebrow = (color = GOLD): React.CSSProperties => ({ font: `600 13px/1 ${BODY}`, letterSpacing: '0.28em', textTransform: 'uppercase', color });
const heading = (title: string, big = 46): React.CSSProperties => ({
  fontFamily: DISPLAY, fontWeight: 600, fontSize: title.length > 60 ? big * 0.78 : big, lineHeight: 1.1, margin: '16px 0 0', color: 'inherit',
});
const photo = (url: string, extra: React.CSSProperties = {}): React.CSSProperties => ({
  backgroundImage: `url("${url}")`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat', ...extra,
});

function Diamond({ color = GOLD, top = 8 }: { color?: string; top?: number }) {
  return <span style={{ flex: 'none', width: 7, height: 7, marginTop: top, transform: 'rotate(45deg)', background: color }} />;
}

function Footer({ dark, clientName, n, total }: { dark?: boolean; clientName: string; n: number; total: number }) {
  return (
    <div style={{ position: 'absolute', left: 76, right: 76, bottom: 28, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: dark ? 'rgba(245,239,230,.55)' : MUTED }}>
      <img src={dark ? '/images/logo-amantti-white.png' : '/images/logo-amantti.png'} alt="Amantti" style={{ height: 19, width: 'auto' }} />
      <span>Café Amantti × {clientName} · {n} / {total}</span>
    </div>
  );
}

function Art({ kind, tr }: { kind: NonNullable<Product['art']>; tr: Tr }) {
  const icon = (d: React.ReactNode, bg: string) => (
    <div style={{ height: '100%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="76" height="76" viewBox="0 0 48 48" fill="none" stroke={GOLD_SOFT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
    </div>
  );
  if (kind === 'roast-dark') {
    return (
      <div style={{ height: '100%', background: 'radial-gradient(circle at 30% 30%, #4a3a2e, #1d1612)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 25, color: GOLD_SOFT }}>{tr("Tostión oscura")}</span>
      </div>
    );
  }
  if (kind === 'leaf') return icon(<><path d="M10 38C10 20 22 10 40 8c0 18-10 30-28 30z" /><path d="M10 38 30 18" /></>, '#3d4a36');
  if (kind === 'gift') return icon(<><rect x="8" y="20" width="32" height="20" rx="1" /><rect x="6" y="14" width="36" height="6" rx="1" /><path d="M24 14v26" /><path d="M24 14c-4-6-12-6-10 0M24 14c4-6 12-6 10 0" /></>, '#5b2b26');
  return icon(<><path d="M10 18h24v10a10 10 0 0 1-10 10h-4a10 10 0 0 1-10-10z" /><path d="M34 21h3a4 4 0 0 1 0 8h-3" /><path d="M17 8c0 3 3 3 3 6M24 8c0 3 3 3 3 6" /></>, ROAST);
}

function Meter({ roast, tr }: { roast: NonNullable<Product['roast']>; tr: Tr }) {
  const on = roast === 'dark' ? 4 : 2;
  const color = roast === 'dark' ? ROAST : '#8a5a35';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 12, letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED }}>
      <span style={{ display: 'inline-flex', gap: 4 }}>
        {[0, 1, 2, 3].map((i) => <span key={i} style={{ width: 19, height: 7, borderRadius: 7, background: i < on ? color : '#e8e1d6' }} />)}
      </span>
      {roast === 'dark' ? tr("Tostión oscura") : tr("Tostión media")}
    </div>
  );
}

function ProductCard({ p, showPvp, compact, tr }: { p: Product; showPvp: boolean; compact: boolean; tr: Tr }) {
  return (
    <div style={{ background: '#fff', border: '1px solid rgba(41,37,36,.1)', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
      <div style={{ height: compact ? 150 : 170, flex: 'none' }}>
        {p.art && !p.photo ? <Art kind={p.art} tr={tr} /> : <div style={photo(p.photo ?? '', { height: '100%' })} />}
      </div>
      <div style={{ padding: '18px 20px 18px', display: 'flex', flexDirection: 'column', gap: 9, flex: 1 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: compact ? 22 : 25, fontWeight: 600, lineHeight: 1.15 }}>{p.name}</div>
        {p.roast && <Meter roast={p.roast} tr={tr} />}
        {p.detail && <div style={{ fontSize: compact ? 13 : 14, lineHeight: 1.45, color: MUTED }}>{p.detail}</div>}
        <div style={{ marginTop: 'auto', borderTop: '1px dashed rgba(41,37,36,.18)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: compact ? 28 : 32, color: ROAST }}>{money(p.price)}</span>
            <span style={{ fontSize: 12, color: MUTED, textAlign: 'right', lineHeight: 1.35 }}>
              {p.tax ? `+ ${p.tax}` : tr("Antes de IVA")}
            </span>
          </div>
          {showPvp && p.pvp > 0 && <span style={{ fontSize: 13, color: MUTED }}>{tr("PVP sugerido {v}", { v: money(p.pvp) })}</span>}
          {p.note && <span style={{ fontSize: 12.5, color: MUTED }}>{p.note}</span>}
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
      <div style={{ ...base, background: ROAST, color: '#f8f2e8' }}>
        <div style={photo(slide.photo, { position: 'absolute', inset: 0 })} />
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(90deg, rgba(28,22,18,.93) 0%, rgba(28,22,18,.8) 45%, rgba(28,22,18,.18) 100%)' }} />
        <div style={{ ...inner, justifyContent: 'space-between', padding: '64px 76px 56px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 26 }}>
            <img src="/images/logo-amantti-white.png" alt="Amantti" style={{ height: 40, width: 'auto' }} />
            {slide.allyLogoUrl && (
              <>
                <span style={{ fontFamily: DISPLAY, fontSize: 26, color: GOLD }}>×</span>
                <span style={{ background: '#fff', borderRadius: 6, padding: '8px 14px', display: 'flex' }}>
                  <img src={slide.allyLogoUrl} alt={client} style={{ height: 52, maxWidth: 220, width: 'auto' }} />
                </span>
              </>
            )}
          </div>
          <div>
            <div style={eyebrow()}>{tr("Propuesta comercial")}</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: slide.title.length > 50 ? 56 : 70, lineHeight: 1.06, margin: '18px 0 0', maxWidth: 700 }}>{slide.title}</div>
            {slide.subtitle && <div style={{ fontFamily: DISPLAY, fontStyle: 'italic', fontSize: 26, color: GOLD_SOFT, marginTop: 16 }}>{slide.subtitle}</div>}
            <div style={{ width: 64, height: 3, background: GOLD, marginTop: 26 }} />
          </div>
          <div style={{ fontSize: 16, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(248,242,232,.72)' }}>
            {tr("Para {client} · {date}", { client, date: slide.date })}
          </div>
        </div>
      </div>
    );
  }

  if (slide.kind === 'split') {
    const chars = slide.paragraphs.join(' ').length + slide.items.join(' ').length;
    const size = fitText(chars, [19, 16.5, 14.5], [420, 760]);
    return (
      <div style={base}>
        <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
          <div style={{ width: '54%', padding: '64px 52px 80px 76px', display: 'flex', flexDirection: 'column', boxSizing: 'border-box' }}>
            <div style={heading(slide.title)}>{slide.title}</div>
            <div style={{ width: 64, height: 3, background: GOLD, margin: '24px 0 4px' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: size * 0.75, marginTop: 18, fontSize: size, lineHeight: 1.55, color: MUTED }}>
              {slide.paragraphs.map((p, i) => <p key={i} style={{ margin: 0 }}>{p}</p>)}
              {slide.items.map((it, i) => (
                <div key={`i${i}`} style={{ display: 'flex', gap: 12 }}><Diamond top={size * 0.55} /><span>{it}</span></div>
              ))}
            </div>
          </div>
          <div style={photo(slide.photo, { flex: 1 })} />
        </div>
        <div style={{ position: 'absolute', left: 76, bottom: 28 }}>
          <img src="/images/logo-amantti.png" alt="Amantti" style={{ height: 19, width: 'auto' }} />
        </div>
        <div style={{ position: 'absolute', right: 20, bottom: 18, fontSize: 12, color: '#fff', background: 'rgba(28,22,18,.45)', padding: '4px 10px', borderRadius: 20, letterSpacing: '0.1em' }}>{n} / {total}</div>
      </div>
    );
  }

  if (slide.kind === 'columns') {
    const cols = slide.columns.length;
    const longest = Math.max(...slide.columns.map((c) => c.text.length));
    const size = fitText(longest, [17, 15.5, 14], [150, 220]);
    return (
      <div style={{ ...base, background: ROAST, color: CREAM_TEXT }}>
        <div style={inner}>
          <div style={{ ...heading(slide.title), maxWidth: 800 }}>{slide.title}</div>
          {slide.intro && <p style={{ fontSize: 19, lineHeight: 1.5, color: 'rgba(245,239,230,.72)', margin: '18px 0 0', maxWidth: 820 }}>{slide.intro}</p>}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 30 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 30 }}>
            {slide.columns.map((c, i) => (
              <div key={i} style={{ borderTop: `3px solid ${GOLD}`, paddingTop: 22, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {c.heading && <div style={{ fontFamily: DISPLAY, fontSize: cols > 3 ? 23 : 28, fontWeight: 600, lineHeight: 1.15 }}>{c.heading}</div>}
                <div style={{ fontSize: size, lineHeight: 1.55, color: c.heading ? 'rgba(245,239,230,.72)' : CREAM_TEXT }}>{c.text}</div>
              </div>
            ))}
          </div>
          </div>
        </div>
        <Footer dark clientName={client} n={n} total={total} />
      </div>
    );
  }

  if (slide.kind === 'list') {
    const groups = slide.groups.filter((g) => g.items.length || g.heading);
    const items = groups.flatMap((g) => g.items);
    const chars = slide.paragraphs.join(' ').length + items.join(' ').length;
    const size = fitText(chars, [18, 16, 14], [420, 800]);
    const many = groups.length > 1;
    const cols = many ? Math.min(groups.length, 3) : items.length > 5 ? 2 : 1;
    return (
      <div style={base}>
        <div style={inner}>
          <div style={heading(slide.title)}>{slide.title}</div>
          {slide.paragraphs.length > 0 && (
            <div style={{ marginTop: 16, fontSize: size + 1, lineHeight: 1.5, color: MUTED, maxWidth: 900, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {slide.paragraphs.map((p, i) => <p key={i} style={{ margin: 0 }}>{p}</p>)}
            </div>
          )}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingBottom: 30, minHeight: 0 }}>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: many ? 24 : '14px 40px', alignItems: 'start' }}>
            {many
              ? groups.map((g, gi) => (
                  <div key={gi} style={{ background: '#fff', border: '1px solid rgba(41,37,36,.1)', borderRadius: 10, padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {g.heading && <div style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, color: ROAST }}>{g.heading}</div>}
                    {g.items.map((it, i) => (
                      <div key={i} style={{ display: 'flex', gap: 12, fontSize: size, lineHeight: 1.45, color: '#44403c' }}><Diamond top={size * 0.5} /><span>{it}</span></div>
                    ))}
                  </div>
                ))
              : items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', gap: 14, fontSize: size + 1, lineHeight: 1.5, color: '#44403c', borderBottom: '1px solid rgba(41,37,36,.08)', paddingBottom: 12 }}>
                    <Diamond top={(size + 1) * 0.55} /><span>{it}</span>
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
          <div style={heading(slide.title)}>{slide.title}</div>
          <div style={{ marginTop: 30, flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: `repeat(${Math.max(slide.products.length, 2)}, minmax(0, 1fr))`, gap: compact ? 18 : 24, paddingBottom: 6 }}>
            {slide.products.map((p, i) => <ProductCard key={i} p={p} showPvp={slide.showPvp} compact={compact} tr={tr} />)}
          </div>
        </div>
        <Footer clientName={client} n={n} total={total} />
      </div>
    );
  }

  if (slide.kind === 'table') {
    const rows = slide.products;
    const size = rows.length > 8 ? 13.5 : 15.5;
    return (
      <div style={base}>
        <div style={inner}>
          <div style={heading(slide.title)}>{slide.title}</div>
          <div style={{ marginTop: 28, background: '#fff', borderRadius: 10, border: '1px solid rgba(41,37,36,.1)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: slide.showPvp ? '1fr 170px 170px' : '1fr 190px', background: ROAST, color: CREAM_TEXT, fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', padding: '12px 22px' }}>
              <span>{tr("Producto")}</span>
              <span style={{ textAlign: 'right' }}>{tr("Precio")}</span>
              {slide.showPvp && <span style={{ textAlign: 'right' }}>{tr("PVP sugerido")}</span>}
            </div>
            {rows.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: slide.showPvp ? '1fr 170px 170px' : '1fr 190px', padding: rows.length > 8 ? '8px 22px' : '12px 22px', borderTop: i ? '1px solid #eee7dc' : 'none', alignItems: 'center', fontSize: size }}>
                <span style={{ minWidth: 0 }}>
                  <b style={{ fontWeight: 600, color: ROAST }}>{p.name}</b>
                  {(p.detail || p.note) && <span style={{ color: MUTED }}>{' · '}{[p.detail, p.note].filter(Boolean).join(' · ')}</span>}
                </span>
                <span style={{ textAlign: 'right', fontFamily: DISPLAY, fontWeight: 700, fontSize: size + 3, color: ROAST }}>
                  {money(p.price)}{p.tax && <span style={{ display: 'block', fontFamily: BODY, fontWeight: 400, fontSize: 11.5, color: MUTED }}>+ {p.tax}</span>}
                </span>
                {slide.showPvp && <span style={{ textAlign: 'right', color: MUTED }}>{p.pvp > 0 ? money(p.pvp) : '—'}</span>}
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
      <div style={photo(slide.photo, { position: 'absolute', inset: 0, opacity: 0.55 })} />
      <div style={{ ...inner, justifyContent: 'center', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: slide.title.length > 40 ? 52 : 66, lineHeight: 1.08, color: ROAST, maxWidth: 820 }}>{slide.title}</div>
        {closeText && <p style={{ fontSize: fitText(closeText.length, [21, 18.5, 16], [220, 360]), lineHeight: 1.55, color: '#4a423c', maxWidth: 700, margin: '22px 0 0' }}>{closeText}</p>}
        <div style={{ marginTop: 34, display: 'inline-flex', gap: 12, alignItems: 'center', background: ROAST, color: CREAM_TEXT, font: `600 16px ${BODY}`, letterSpacing: '0.06em', padding: '14px 32px', borderRadius: 999 }}>
          Café Amantti <span style={{ color: GOLD }}>×</span> {client}
        </div>
        <div style={{ marginTop: 26, fontSize: 14, lineHeight: 1.6, color: '#4a423c' }}>
          {slide.sellerName && <div style={{ fontWeight: 600, color: ROAST }}>{slide.sellerName}</div>}
          <div>Alma Trading Group SAS · Nit 901752308-8 · cafeamantti@gmail.com</div>
        </div>
      </div>
      <Footer clientName={client} n={n} total={total} />
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
    <div style={{ width: SLIDE_W * scale, height: SLIDE_H * scale, overflow: 'hidden', borderRadius: 6, boxShadow: shadow ? '0 10px 30px rgba(20,16,12,.16)' : 'none', flex: 'none' }}>
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
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0d0b0a', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
    >
      <ScaledSlide scale={scale} shadow={false}>
        <ProposalSlide slide={slides[i]} n={i + 1} total={slides.length} data={data} />
      </ScaledSlide>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{ position: 'fixed', right: 16, bottom: 16, font: `600 13px ${BODY}`, background: 'rgba(255,255,255,.12)', color: '#fff', border: '1px solid rgba(255,255,255,.2)', borderRadius: 999, padding: '8px 14px', cursor: 'pointer' }}
      >
        {tr("Terminar")} · {i + 1} / {slides.length}
      </button>
    </div>
  );
}

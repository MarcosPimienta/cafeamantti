"use client";

import React, { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Eye, X } from "lucide-react";
import { buildMaquilaHtml, type MaquilaPdfData } from "@/utils/pdf/maquilaPdf";

const PAGE_WIDTH = 794; // A4 at 96 dpi, same width the PDF renders

/**
 * Live preview of the client document: the same HTML the PDF is made from,
 * rendered in an isolated iframe so the app's styles cannot change it.
 */
function DocumentFrame({ html, scale }: { html: string; scale: number }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1123);

  const srcDoc = useMemo(
    () => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#fff">${html}</body></html>`,
    [html]
  );

  useEffect(() => {
    const frame = ref.current;
    if (!frame) return;
    const measure = () => {
      const body = frame.contentDocument?.body;
      if (body) setHeight(Math.max(1123, body.scrollHeight));
    };
    frame.addEventListener("load", measure);
    return () => frame.removeEventListener("load", measure);
  }, [srcDoc]);

  return (
    <div style={{ width: PAGE_WIDTH * scale, height: height * scale }} className="relative overflow-hidden bg-white shadow-sm">
      <iframe
        ref={ref}
        title="Vista previa del documento"
        srcDoc={srcDoc}
        sandbox="allow-same-origin"
        style={{ width: PAGE_WIDTH, height, transform: `scale(${scale})`, transformOrigin: "top left", border: 0 }}
        className="absolute top-0 left-0 pointer-events-none"
      />
    </div>
  );
}

export default function MaquilaPreview({ data }: { data: MaquilaPdfData }) {
  // Typing stays smooth: the preview catches up a moment later.
  const deferred = useDeferredValue(data);
  const html = useMemo(() => buildMaquilaHtml(deferred, "/images/logo-amantti.png"), [deferred]);
  const [open, setOpen] = useState(false);
  const [fullScale, setFullScale] = useState(1);

  useEffect(() => {
    if (!open) return;
    const fit = () => setFullScale(Math.min(1, (window.innerWidth - 32) / PAGE_WIDTH));
    fit();
    window.addEventListener("resize", fit);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("resize", fit);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <section className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-4">
        <div className="flex items-center justify-between mb-3 px-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/40">Vista previa del PDF</p>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold text-[#C59F59] hover:underline"
          >
            <Eye className="w-3.5 h-3.5" /> Ver en grande
          </button>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="block mx-auto rounded-lg overflow-hidden ring-1 ring-foreground/10 hover:ring-[#C59F59]/50" aria-label="Ver vista previa en grande">
          <DocumentFrame html={html} scale={0.41} />
        </button>
        <p className="text-[11px] text-foreground/40 mt-3 text-center">Así lo verá el cliente. Sin costos ni márgenes.</p>
      </section>

      {open && (
        <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm overflow-y-auto" onClick={() => setOpen(false)} role="dialog" aria-label="Vista previa del PDF">
          <div className="sticky top-0 flex justify-end p-4">
            <button type="button" onClick={() => setOpen(false)} className="p-2 rounded-full bg-white shadow" aria-label="Cerrar vista previa">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="flex justify-center pb-10 px-4" onClick={(e) => e.stopPropagation()}>
            <DocumentFrame html={html} scale={fullScale} />
          </div>
        </div>
      )}
    </>
  );
}

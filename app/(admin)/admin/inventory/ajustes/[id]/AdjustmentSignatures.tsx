"use client";

// The three signatures of a voucher (elaboró, revisó, aprobó). Each one is
// made here by an admin, drawn or typed as in cuentas de cobro, and prints
// above its line. An unsigned slot prints as an empty line to sign by hand.

import React, { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PenLine, RotateCcw, Type } from "lucide-react";
import { useTr } from "@/app/(admin)/AdminI18n";
import { SIGNATURE_ROLES, SIGNATURE_ROLE_LABELS, signatureProblem, type SignatureRole, type SignatureType } from "@/utils/inventory/adjustments";
import { signAdjustment, type AdjustmentSignature } from "../actions";

const CURSIVE = "'Brush Script MT', 'Dancing Script', 'Caveat', cursive";

export default function AdjustmentSignatures({
  id,
  label,
  signatures,
  annulled,
}: {
  id: string;
  label: string;
  /** null = the signatures migration is not applied yet. */
  signatures: AdjustmentSignature[] | null;
  annulled: boolean;
}) {
  const tr = useTr();
  const [signing, setSigning] = useState<SignatureRole | null>(null);
  const byRole = new Map((signatures ?? []).map((s) => [s.role, s]));
  const canSign = signatures !== null && !annulled;

  return (
    <section className="space-y-4">
      <div className="grid gap-8 pt-6 sm:grid-cols-3 text-sm">
        {SIGNATURE_ROLES.map((role) => {
          const sig = byRole.get(role);
          return (
            <div key={role} className="flex flex-col items-center">
              <div className="flex h-20 w-full items-end justify-center">
                {sig ? (
                  sig.signature_type === "scribble" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sig.signature_data} alt={tr("Firma de {name}", { name: sig.signer_name })} className="max-h-20 max-w-full object-contain" />
                  ) : (
                    <span className="text-3xl text-stone-800 italic" style={{ fontFamily: CURSIVE }}>{sig.signature_data}</span>
                  )
                ) : canSign ? (
                  <button
                    type="button"
                    onClick={() => setSigning(role)}
                    className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#C59F59]/60 px-3 py-1.5 text-xs font-semibold text-[#7A5B22] hover:bg-[#C59F59]/10 print:hidden"
                  >
                    <PenLine className="w-3.5 h-3.5" /> {tr("Firmar")}
                  </button>
                ) : null}
              </div>
              <div className="w-full border-t border-foreground/40 pt-2 text-center">
                <p className="text-foreground/60">{tr(SIGNATURE_ROLE_LABELS[role])}</p>
                {sig && (
                  <p className="mt-0.5 text-[11px] text-foreground/50">
                    {sig.signer_name} · {tr("firmado digitalmente el {date}", { date: new Date(sig.signed_at).toLocaleString(tr.locale === "en" ? "en-US" : "es-CO", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Bogota" }) })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {signatures === null && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800 print:hidden">
          {tr("Falta aplicar la migración 20261127000000_inventory_adjustment_signatures.sql para firmar comprobantes.")}
        </p>
      )}

      {signing && <SignForm id={id} label={label} role={signing} onClose={() => setSigning(null)} />}
    </section>
  );
}

function SignForm({ id, label, role, onClose }: { id: string; label: string; role: SignatureRole; onClose: () => void }) {
  const tr = useTr();
  const router = useRouter();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [type, setType] = useState<SignatureType>("scribble");
  const [hasDrawn, setHasDrawn] = useState(false);
  const [typed, setTyped] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.strokeStyle = "#1c1917";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [type]);

  // Pointer events cover mouse, pen and touch.
  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) * c.width) / (r.width || 1), y: ((e.clientY - r.top) * c.height) / (r.height || 1) };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    drawing.current = true;
    setHasDrawn(true);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = e.currentTarget.getContext("2d");
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };
  const up = () => {
    drawing.current = false;
  };
  const clear = () => {
    const c = canvasRef.current;
    c?.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasDrawn(false);
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const data = type === "scribble" ? (hasDrawn ? canvasRef.current?.toDataURL("image/png") ?? "" : "") : typed;
    const problem = signatureProblem(type, data);
    if (problem) return setError(problem);
    if (!accepted) return setError(tr("Confirma que revisaste el comprobante antes de firmar."));
    startTransition(async () => {
      const res = await signAdjustment(id, role, type, data);
      if (!res.success) return setError(res.error);
      onClose();
      router.refresh();
    });
  }

  const tab = (t: SignatureType) =>
    `flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors ${type === t ? "bg-white text-foreground shadow-sm" : "text-foreground/50 hover:text-foreground/70"}`;

  return (
    <form onSubmit={submit} className="rounded-2xl border border-[#C59F59]/30 bg-[#fdfbf7] p-5 space-y-4 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{tr("Firmar «{role}» en {label}", { role: tr(SIGNATURE_ROLE_LABELS[role]), label })}</h3>
        <div className="flex gap-1 rounded-xl bg-foreground/5 p-1">
          <button type="button" className={tab("scribble")} onClick={() => setType("scribble")} aria-pressed={type === "scribble"}>
            <PenLine className="w-3.5 h-3.5" /> {tr("Dibujar")}
          </button>
          <button type="button" className={tab("typed")} onClick={() => setType("typed")} aria-pressed={type === "typed"}>
            <Type className="w-3.5 h-3.5" /> {tr("Digitar")}
          </button>
        </div>
      </div>

      {type === "scribble" ? (
        <div className="space-y-2">
          <div className="relative rounded-2xl border border-dashed border-foreground/20 bg-white overflow-hidden">
            <canvas
              ref={canvasRef}
              width={600}
              height={180}
              aria-label={tr("Recuadro para dibujar la firma")}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerLeave={up}
              className="block w-full cursor-crosshair touch-none"
            />
            <button type="button" onClick={clear} className="absolute right-3 bottom-3 inline-flex items-center gap-1 rounded-lg border border-foreground/10 bg-white px-3 py-1.5 text-xs font-bold text-foreground/60 hover:text-red-600">
              <RotateCcw className="w-3 h-3" /> {tr("Limpiar")}
            </button>
          </div>
          <p className="text-[11px] text-foreground/50">{tr("Usa el mouse o el dedo para trazar tu firma dentro del recuadro.")}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="sig-typed" className="block text-xs font-bold text-foreground/70 mb-1.5">{tr("Escribe tu nombre para firmar")}</label>
            <input id="sig-typed" value={typed} onChange={(e) => setTyped(e.target.value)} className="w-full min-h-11 rounded-xl border border-foreground/15 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/30" />
          </div>
          <div className="flex min-h-[80px] items-center justify-center rounded-2xl border border-foreground/10 bg-white">
            {typed.trim() ? <span className="text-3xl italic text-stone-800" style={{ fontFamily: CURSIVE }}>{typed}</span> : <span className="text-xs italic text-foreground/40">{tr("Vista previa de la firma")}</span>}
          </div>
        </div>
      )}

      <label className="flex items-start gap-2 text-xs text-foreground/70">
        <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 accent-[#7A5B22]" />
        <span>{tr("Revisé las cantidades y el motivo de este comprobante. Firmo con mi usuario de administrador; la firma queda registrada con mi nombre, la fecha y la hora, y no se puede cambiar.")}</span>
      </label>

      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{tr.msg(error)}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="min-h-10 rounded-xl px-4 text-sm font-semibold text-foreground/70 hover:bg-foreground/5">{tr("Cancelar")}</button>
        <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-foreground px-5 text-sm font-semibold text-white hover:bg-[#7A5B22] disabled:opacity-60">
          {pending && <Loader2 className="w-4 h-4 animate-spin" />}
          {tr("Guardar firma")}
        </button>
      </div>
    </form>
  );
}

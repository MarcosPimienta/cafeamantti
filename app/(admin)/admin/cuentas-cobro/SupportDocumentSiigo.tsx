'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { AlertTriangle, Landmark, Loader2, RefreshCw, Send, X } from 'lucide-react';
import { markSupportDocumentManual, previewSupportDocument, refreshSupportDocument, sendSupportDocument, stampSupportDocument, type SupportInput } from './siigoActions';
import { useTr } from '@/app/(admin)/AdminI18n';

const cop = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);
const DIAN_LABEL: Record<string, string> = { Accepted: 'Aceptado por la DIAN', Rejected: 'Rechazado por la DIAN', Pending: 'Enviado a la DIAN', Sending: 'Enviando a la DIAN…', Draft: 'Creado (sin enviar a la DIAN)' };

type Preview = Extract<Awaited<ReturnType<typeof previewSupportDocument>>, { success: true }>;
/* eslint-disable @typescript-eslint/no-explicit-any */
type CC = any;

/** Siigo status of a signed expense cuenta de cobro, and the button to send it as a support document. */
export default function SupportDocumentSiigo({ cc, onChanged }: { cc: CC; onChanged: () => void }) {
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const tr = useTr();
  const [open, setOpen] = useState(false);
  const [busy, startTransition] = useTransition();

  if (cc.type !== 'gasto' || cc.status !== 'firmada') return null;

  if (cc.siigo_ds_id) {
    const stampable = !cc.siigo_ds_status || cc.siigo_ds_status === 'Draft' || cc.siigo_ds_status === 'Rejected' || cc.siigo_ds_status === 'error';
    const run = (action: () => Promise<{ success: boolean; error?: string }>, confirmText?: string) => {
      if (confirmText && !window.confirm(confirmText)) return;
      startTransition(async () => {
        const res = await action();
        if (!res.success) alert(tr.msg(res.error ?? ''));
        onChanged();
      });
    };
    return (
      <span className="block mt-1 text-[11px] space-y-1">
        <span className="block text-green-700">
          {tr('Siigo: {name}', { name: cc.siigo_ds_name ?? tr('documento soporte') })}
          {cc.siigo_ds_status && <span className="text-foreground/50"> · {tr.msg(DIAN_LABEL[cc.siigo_ds_status] ?? cc.siigo_ds_status)}</span>}
        </span>
        {cc.siigo_ds_error && <span className="block text-red-600 max-w-[16rem] break-words">{tr.msg(cc.siigo_ds_error)}</span>}
        <span className="flex flex-wrap gap-3">
          {stampable && (
            <button type="button" disabled={busy}
              onClick={() => run(() => stampSupportDocument(cc.id), tr('El documento soporte {name} se transmitirá a la DIAN. Después solo se puede anular con una nota de ajuste en Siigo. ¿Continuar?', { name: cc.siigo_ds_name ?? '' }))}
              className="inline-flex items-center gap-1 font-bold text-[#C59F59] hover:underline disabled:opacity-50">
              {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Landmark className="w-3 h-3" />}{' '}{tr('Enviar a la DIAN')}
            </button>
          )}
          {cc.siigo_ds_status !== 'Accepted' && (
            <button type="button" disabled={busy} onClick={() => run(() => refreshSupportDocument(cc.id))}
              className="inline-flex items-center gap-1 font-bold text-foreground/50 hover:text-foreground disabled:opacity-50">
              <RefreshCw className="w-3 h-3" />{' '}{tr('Actualizar estado')}
            </button>
          )}
        </span>
      </span>
    );
  }

  const unmark = () =>
    startTransition(async () => {
      const res = await markSupportDocumentManual(cc.id, false);
      if (!res.success) alert(tr.msg(res.error));
      else onChanged();
    });

  if (cc.siigo_ds_status === 'manual') {
    return (
      <span className="block mt-1 text-[11px] text-foreground/50">
        {tr('Registrada a mano en Siigo')}{' '}
        <button type="button" onClick={unmark} disabled={busy} className="underline hover:text-foreground disabled:opacity-40">{tr('Deshacer')}</button>
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1 px-3 py-1 bg-stone-50 hover:bg-stone-100 border border-foreground/10 text-foreground/70 text-xs font-bold rounded-lg transition-colors"
      >
        <Send className="w-3.5 h-3.5" />{' '}{tr('Enviar a Siigo')}
      </button>
      {cc.siigo_ds_status === 'error' && cc.siigo_ds_error && (
        <span className="block mt-1 text-[11px] text-red-600 max-w-[16rem] break-words">{tr.msg(cc.siigo_ds_error)}</span>
      )}
      {open && <SendModal cc={cc} onClose={() => setOpen(false)} onSent={() => { setOpen(false); onChanged(); }} />}
    </>
  );
}

function SendModal({ cc, onClose, onSent }: { cc: CC; onClose: () => void; onSent: () => void }) {
  const tr = useTr();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [input, setInput] = useState<SupportInput | null>(null);
  const [error, setError] = useState('');
  const [loading, startLoading] = useTransition();
  const [sending, startSending] = useTransition();

  const load = (next?: SupportInput) =>
    startLoading(async () => {
      setError('');
      const res = await previewSupportDocument(cc.id, next);
      if (!res.success) return setError(res.error);
      setPreview(res);
      if (!next) setInput(res.defaults);
    });

  // First load when the modal opens.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const change = (patch: Partial<SupportInput>) => {
    if (!input) return;
    const next = { ...input, ...patch };
    setInput(next);
    load(next);
  };

  const send = () => {
    if (!input) return;
    if (preview?.electronic && !window.confirm(tr('El documento soporte se transmitirá a la DIAN. Después solo se puede anular con una nota de ajuste en Siigo. ¿Continuar?'))) return;
    startSending(async () => {
      setError('');
      const res = await sendSupportDocument(cc.id, input);
      if (!res.success) return setError(res.error);
      onSent();
    });
  };

  const markManual = () => {
    if (!window.confirm(tr('¿Esta cuenta de cobro ya está registrada en Siigo a mano? No se enviará desde la app.'))) return;
    startSending(async () => {
      const res = await markSupportDocumentManual(cc.id, true);
      if (!res.success) return setError(res.error);
      onSent();
    });
  };

  const field = 'w-full px-3 py-2 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm';
  return (
    <div className="fixed inset-0 bg-stone-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50 text-left">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto border border-foreground/5 shadow-2xl p-6 space-y-4">
        <div className="flex justify-between items-start gap-3">
          <div>
            <h2 className="text-xl font-serif font-bold">{tr('Documento soporte en Siigo')}</h2>
            <p className="text-xs text-foreground/50">
              {tr('CC-{n} · {name} · {doc}', { n: String(cc.number).padStart(5, '0'), name: cc.issuer_name, doc: cc.issuer_document })}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label={tr('Cerrar')} className="p-1 text-foreground/40 hover:text-foreground"><X className="w-5 h-5" /></button>
        </div>

        {!preview || !input ? (
          loading ? <p className="text-sm text-foreground/50 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" />{' '}{tr('Cargando…')}</p> : null
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 [&>*]:min-w-0">
              <label className="text-xs font-bold text-foreground/60 space-y-1">
                <span>{tr('Fecha del documento')}</span>
                <input type="date" value={input.date} onChange={(e) => change({ date: e.target.value })} className={field} />
              </label>
              <label className="text-xs font-bold text-foreground/60 space-y-1">
                <span>{tr('Categoría del gasto')}</span>
                <select value={input.category} onChange={(e) => change({ category: e.target.value, retentionId: null })} className={field}>
                  <option value="">{tr('— Elige —')}</option>
                  {preview.categories.map((c) => <option key={c} value={c}>{tr(c)}</option>)}
                </select>
              </label>
              <label className="text-xs font-bold text-foreground/60 space-y-1">
                <span>{tr('Retención en la fuente')}</span>
                <select value={input.retentionId ?? ''} onChange={(e) => change({ retentionId: e.target.value ? Number(e.target.value) : null })} className={field}>
                  <option value="">{tr('Sin retención')}</option>
                  {preview.retentions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground/70 sm:mt-6">
                <input type="checkbox" checked={input.assumed} disabled={!input.retentionId} onChange={(e) => change({ assumed: e.target.checked })} />
                {tr('Café Amantti asume la retención')}
              </label>
            </div>
            {preview.categories.length === 0 && (
              <p className="text-xs text-amber-700">{tr('Configura las cuentas contables por categoría en Ajustes → Siigo → Compras.')}</p>
            )}

            <div className="rounded-2xl bg-[#fdfbf7] border border-foreground/5 p-4 text-sm space-y-1">
              {preview.lines.map((l, i) => (
                <p key={i} className="flex justify-between gap-3">
                  <span className="truncate">{l.description}{l.quantity !== 1 ? ` × ${l.quantity}` : ''}{i < preview.lines.length - (input.assumed ? 1 : 0) && preview.account ? <span className="text-foreground/40"> · {preview.account}</span> : null}</span>
                  <span className="shrink-0">{cop(l.price * l.quantity)}</span>
                </p>
              ))}
              {preview.totals.withheld > 0 && (
                <p className="flex justify-between text-foreground/60"><span>{tr('Retención')}</span><span>−{cop(preview.totals.withheld)}</span></p>
              )}
              <p className="flex justify-between font-bold border-t border-foreground/10 pt-1">
                <span>{tr('Por pagar al proveedor')}</span><span>{cop(preview.totals.owed)}</span>
              </p>
            </div>

            {preview.problems.length > 0 ? (
              <ul className="text-xs text-red-700 bg-red-50 rounded-xl p-3 space-y-1">
                {preview.problems.map((p) => <li key={p} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{tr.msg(p)}</li>)}
              </ul>
            ) : (
              <p className="text-xs text-foreground/60">
                {preview.electronic
                  ? tr('Se transmitirá a la DIAN como documento soporte electrónico.')
                  : tr('Se creará en Siigo sin transmitirse a la DIAN (modo de prueba en Ajustes → Siigo).')}{' '}
                {tr('El PDF firmado queda en la app: la API de Siigo no recibe adjuntos.')}
              </p>
            )}
          </>
        )}

        {error && <p className="text-xs text-red-600 break-words">{tr.msg(error)}</p>}

        <div className="flex flex-wrap justify-between gap-2 pt-2">
          <button type="button" onClick={markManual} disabled={sending} className="text-xs text-foreground/50 hover:text-foreground underline disabled:opacity-40">
            {tr('Ya la registré a mano en Siigo')}
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl border border-foreground/10 text-xs font-bold hover:bg-stone-50">{tr('Cancelar')}</button>
            <button type="button" onClick={send} disabled={sending || loading || !preview || preview.problems.length > 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59F59] text-white text-xs font-bold hover:bg-[#B38E4D] disabled:opacity-40">
              {sending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{' '}{tr('Enviar a Siigo')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useRef, useState } from 'react';
import { AlertTriangle, FileCheck2, Loader2, Trash2, Upload } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { RUT_ACCEPT, RUT_BUCKET, isNaturalPerson, rutFileProblem, rutStoragePath } from '@/utils/suppliers/rut';
import { deleteSupplierRut, getSupplierRutUrl, saveSupplierRut } from './actions';
import { useTr } from '@/app/(admin)/AdminI18n';

/** Uploads a supplier's RUT straight to the private bucket and records it. */
export async function uploadSupplierRut(supplierId: string, file: File): Promise<{ success: boolean; error?: string }> {
  const problem = rutFileProblem(file);
  if (problem) return { success: false, error: problem };
  const path = rutStoragePath(supplierId, file.type);
  const { error } = await createClient().storage.from(RUT_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    return { success: false, error: /bucket not found/i.test(error.message) ? 'Falta aplicar la migración 20261020000000_supplier_rut.sql' : error.message };
  }
  return saveSupplierRut(supplierId, path, file.name);
}

type Supplier = { id: string; document_type?: string | null; rut_path?: string | null; rut_file_name?: string | null; rut_uploaded_at?: string | null };

/** The RUT cell of the suppliers table: see, replace, remove or upload it. */
export default function SupplierRut({ supplier, onChanged }: { supplier: Supplier; onChanged: () => void }) {
  const tr = useTr();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<{ success: boolean; error?: string }>) => {
    setBusy(true);
    const res = await action();
    setBusy(false);
    if (!res.success) alert(tr.msg(res.error || tr('No se pudo guardar el RUT.')));
    else onChanged();
  };

  const open = async () => {
    // Opened before the await so the browser doesn't block the new tab.
    const win = window.open('', '_blank');
    const res = await getSupplierRutUrl(supplier.id);
    if (res.success && res.url) {
      if (win) win.location.href = res.url;
      else window.location.href = res.url;
    } else {
      win?.close();
      alert(tr.msg(res.error || tr('No se pudo abrir el RUT.')));
    }
  };

  const picker = (
    <input
      ref={input}
      type="file"
      accept={RUT_ACCEPT}
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) run(() => uploadSupplierRut(supplier.id, file));
      }}
    />
  );

  if (supplier.rut_path) {
    return (
      <div className="flex flex-col gap-1 text-xs">
        {picker}
        <button type="button" onClick={open} className="inline-flex items-center gap-1.5 font-bold text-[#C59F59] hover:underline text-left">
          <FileCheck2 className="w-3.5 h-3.5" />{' '}{tr('Ver RUT')}
        </button>
        {supplier.rut_uploaded_at && (
          <span className="text-foreground/40">{tr('Subido {date}', { date: supplier.rut_uploaded_at.slice(0, 10) })}</span>
        )}
        <span className="flex gap-2">
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="text-foreground/50 hover:text-foreground disabled:opacity-40">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : tr('Reemplazar')}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => confirm(tr('¿Quitar el RUT de este proveedor?')) && run(() => deleteSupplierRut(supplier.id))}
            className="text-foreground/40 hover:text-red-500 disabled:opacity-40"
            aria-label={tr('Quitar RUT')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 text-xs">
      {picker}
      {isNaturalPerson(supplier.document_type) ? (
        <span className="inline-flex items-center gap-1 font-bold text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5" />{' '}{tr('Falta RUT')}
        </span>
      ) : (
        <span className="text-foreground/40 italic">{tr('Sin RUT')}</span>
      )}
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="inline-flex items-center gap-1 font-bold text-foreground/60 hover:text-[#C59F59] disabled:opacity-40 text-left"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}{' '}{tr('Subir RUT')}
      </button>
    </div>
  );
}

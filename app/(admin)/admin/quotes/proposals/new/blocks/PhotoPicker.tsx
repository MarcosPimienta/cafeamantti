'use client';

import React, { useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { uploadProposalAsset, getProposalAssetSignedUrl } from '@/utils/supabase/storage';
import { useTr } from "@/app/(admin)/AdminI18n";

/** Shrinks a photo to ≤ 1600 px on its long side (JPEG) so it fits a server action. */
async function shrink(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
  if (!blob) return file;
  const ext = blob.type === 'image/png' ? 'png' : 'jpg';
  return new File([blob], `foto.${ext}`, { type: blob.type });
}

interface PhotoPickerProps {
  /** Storage path of the current photo, if any. */
  path?: string;
  /** URL to show it (signed). */
  preview?: string;
  label: string;
  onChange: (path: string | undefined, signedUrl?: string) => void;
  compact?: boolean;
}

/** Upload, show and remove the photo of a slide or a product card. */
export default function PhotoPicker({ path, preview, label, onChange, compact }: PhotoPickerProps) {
  const tr = useTr();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const upload = async (file: File) => {
    setBusy(true);
    setError('');
    try {
      const small = await shrink(file);
      if (small.size > 1024 * 1024) throw new Error(tr("La foto pesa más de 1 MB aun reducida; prueba con otra."));
      const formData = new FormData();
      formData.append('file', small);
      const res = await uploadProposalAsset(formData);
      if (!res.success || !res.path) throw new Error(res.error || tr("No se pudo subir la foto."));
      const signed = await getProposalAssetSignedUrl(res.path);
      onChange(res.path, signed ?? undefined);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="flex items-center gap-2 min-w-0">
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      {path && preview ? (
        <span className="relative inline-flex">
          <img src={preview} alt="" className={`${compact ? 'w-8 h-8' : 'w-14 h-10'} object-cover rounded-md border border-foreground/10`} />
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="absolute -top-1.5 -right-1.5 bg-white border border-foreground/15 rounded-full p-0.5 text-foreground/50 hover:text-red-500"
            title={tr("Quitar foto")}
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground/50 hover:text-[#C59F59] transition-colors disabled:opacity-50 whitespace-nowrap"
        title={label}
      >
        <ImagePlus className="w-3.5 h-3.5" />
        {!compact && (busy ? tr("Subiendo...") : path ? tr("Cambiar foto") : label)}
      </button>
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </div>
  );
}

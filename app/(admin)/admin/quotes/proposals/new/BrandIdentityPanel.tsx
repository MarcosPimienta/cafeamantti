'use client';

import React, { useState, useRef } from 'react';
import { ChevronDown, ChevronUp, Upload, X, Image as ImageIcon } from 'lucide-react';
import { uploadProposalAsset, getProposalAssetSignedUrl } from '@/utils/supabase/storage';

interface BrandIdentityPanelProps {
  allyLogoUrl: string;
  allyLogoSignedUrl: string;
  backgroundImageUrl: string;
  backgroundSignedUrl: string;
  backgroundOpacity: number;
  onAllyLogoChange: (path: string, signedUrl: string) => void;
  onBackgroundChange: (path: string, signedUrl: string) => void;
  onOpacityChange: (opacity: number) => void;
}

export default function BrandIdentityPanel({
  allyLogoUrl,
  allyLogoSignedUrl,
  backgroundImageUrl,
  backgroundSignedUrl,
  backgroundOpacity,
  onAllyLogoChange,
  onBackgroundChange,
  onOpacityChange,
}: BrandIdentityPanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [uploading, setUploading] = useState<'logo' | 'bg' | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File, type: 'logo' | 'bg') => {
    if (file.size > 2 * 1024 * 1024) {
      alert('El archivo es demasiado grande. Máximo 2MB.');
      return;
    }

    setUploading(type);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const result = await uploadProposalAsset(formData);
      if (!result.success || !result.path) throw new Error(result.error || 'Upload failed');

      const signedUrl = await getProposalAssetSignedUrl(result.path);
      if (!signedUrl) throw new Error('Could not get signed URL');

      if (type === 'logo') {
        onAllyLogoChange(result.path, signedUrl);
      } else {
        onBackgroundChange(result.path, signedUrl);
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      alert('Error al subir: ' + err.message);
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="border border-foreground/10 rounded-2xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-5 py-4 bg-[#FDFBF7] hover:bg-[#F9F7F2] transition-colors"
      >
        <span className="text-sm font-bold text-foreground flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-[#C59F59]" />
          Identidad de la Alianza
        </span>
        {isOpen ? <ChevronUp className="w-4 h-4 text-foreground/40" /> : <ChevronDown className="w-4 h-4 text-foreground/40" />}
      </button>

      {isOpen && (
        <div className="p-5 space-y-5 border-t border-foreground/5">
          {/* Ally Logo */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">Logo del Aliado</label>
            <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0], 'logo'); }} />
            
            {allyLogoSignedUrl ? (
              <div className="flex items-center gap-3 p-3 bg-foreground/[0.02] border border-foreground/5 rounded-xl">
                <img src={allyLogoSignedUrl} alt="Logo aliado" className="w-16 h-16 object-contain rounded-lg bg-white border border-foreground/5 p-1" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground/50 truncate">{allyLogoUrl}</p>
                </div>
                <button type="button" onClick={() => onAllyLogoChange('', '')} className="p-1.5 hover:bg-red-50 rounded-lg text-foreground/30 hover:text-red-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploading === 'logo'}
                className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-foreground/10 rounded-xl text-sm text-foreground/40 hover:border-[#C59F59]/30 hover:text-[#C59F59] transition-all disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {uploading === 'logo' ? 'Subiendo...' : 'Subir logo del aliado'}
              </button>
            )}
          </div>

          {/* Background Image */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">Fondo del Documento</label>
            <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handleUpload(e.target.files[0], 'bg'); }} />
            
            {backgroundSignedUrl ? (
              <div className="flex items-center gap-3 p-3 bg-foreground/[0.02] border border-foreground/5 rounded-xl">
                <img src={backgroundSignedUrl} alt="Background" className="w-16 h-10 object-cover rounded-lg border border-foreground/5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground/50 truncate">{backgroundImageUrl}</p>
                </div>
                <button type="button" onClick={() => onBackgroundChange('', '')} className="p-1.5 hover:bg-red-50 rounded-lg text-foreground/30 hover:text-red-500 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => bgInputRef.current?.click()}
                disabled={uploading === 'bg'}
                className="w-full flex items-center justify-center gap-2 p-4 border-2 border-dashed border-foreground/10 rounded-xl text-sm text-foreground/40 hover:border-[#C59F59]/30 hover:text-[#C59F59] transition-all disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                {uploading === 'bg' ? 'Subiendo...' : 'Subir imagen de fondo'}
              </button>
            )}
          </div>

          {/* Opacity Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-foreground/60 uppercase tracking-wider">Opacidad del Fondo</label>
              <span className="text-xs font-mono font-bold text-[#C59F59]">{Math.round(backgroundOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(backgroundOpacity * 100)}
              onChange={(e) => onOpacityChange(parseInt(e.target.value) / 100)}
              className="w-full h-2 bg-foreground/10 rounded-full appearance-none cursor-pointer accent-[#C59F59]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

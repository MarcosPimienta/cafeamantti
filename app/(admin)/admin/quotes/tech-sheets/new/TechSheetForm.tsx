'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, FileDown, ArrowLeft, Upload, Sparkles, Image as ImageIcon, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { TechSheetHTMLTemplate } from '../TechSheetHTMLTemplate';
import { createTechSheet, updateTechSheet, CoffeeTechSheetData } from '../../actions';
import { uploadTechSheetAsset, getTechSheetAssetSignedUrl } from '@/utils/supabase/storage';
import { generateTechSheetPDF } from '@/utils/pdf/techSheetGenerator';

const COLOR_PRESETS = [
  { name: 'Verde Oliva (Finca)', hex: '#717861' },
  { name: 'Dorado Amantti', hex: '#C59F59' },
  { name: 'Espresso Oscuro', hex: '#292524' },
  { name: 'Terracota Origen', hex: '#9E4F32' },
  { name: 'Café Tostado', hex: '#5C3A21' },
];

const BETULIA_SAMPLE: CoffeeTechSheetData = {
  title: 'CAFÉ DE BETULIA',
  subtitle: 'FICHA TÉCNICA',
  history_title: 'Historia',
  history_text: 'Café de origen cultivado en la finca el Mirador, ubicada en la vereda la Cibeles del municipio de Betulia Antioquía. Un café que refleja el cuidado, la dedicación y las condiciones del territorio, ofreciendo una taza dulce, frutal, equilibrada.',
  origin: 'Betulia Antioquia',
  farm_name: 'El Mirador',
  location: 'Vereda la Cibeles',
  altitude: '1600-1800 msnm.',
  variety: 'Castillo',
  process: 'Lavado con fermentación.',
  roast_level: 'Media',
  sca_score: 85.42,
  sensory_profile: 'Dulce, miel, mango, caramelo, panela, naranja, chocolate',
  acidity: 'Cítrica',
  body: 'Medio',
  sweetness: 'Alto',
  primary_color: '#717861',
  bg_color: '#f2f0eb',
  status: 'Publicado',
  image_url: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=800&auto=format&fit=crop&q=80',
  logo_url: '/images/logo-amantti.png',
};

interface TechSheetFormProps {
  initialData?: any;
}

export default function TechSheetForm({ initialData }: TechSheetFormProps) {
  const router = useRouter();
  const isEditing = Boolean(initialData?.id);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);

  // Form State
  const [formData, setFormData] = useState<CoffeeTechSheetData>({
    title: initialData?.title || 'CAFÉ DE BETULIA',
    subtitle: initialData?.subtitle || 'FICHA TÉCNICA',
    history_title: initialData?.history_title || 'Historia',
    history_text: initialData?.history_text || BETULIA_SAMPLE.history_text,
    origin: initialData?.origin || 'Betulia Antioquia',
    farm_name: initialData?.farm_name || 'El Mirador',
    location: initialData?.location || 'Vereda la Cibeles',
    altitude: initialData?.altitude || '1600-1800 msnm.',
    variety: initialData?.variety || 'Castillo',
    process: initialData?.process || 'Lavado con fermentación.',
    roast_level: initialData?.roast_level || 'Media',
    sca_score: initialData?.sca_score !== undefined ? initialData.sca_score : 85.42,
    sensory_profile: initialData?.sensory_profile || 'Dulce, miel, mango, caramelo, panela, naranja, chocolate',
    acidity: initialData?.acidity || 'Cítrica',
    body: initialData?.body || 'Medio',
    sweetness: initialData?.sweetness || 'Alto',
    primary_color: initialData?.primary_color || '#717861',
    bg_color: initialData?.bg_color || '#f2f0eb',
    status: initialData?.status || 'Publicado',
    image_url: initialData?.image_url || BETULIA_SAMPLE.image_url,
    logo_url: initialData?.logo_url || '/images/logo-amantti.png',
  });

  const handleChange = (field: keyof CoffeeTechSheetData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleLoadSample = () => {
    setFormData(BETULIA_SAMPLE);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'image_url' | 'logo_url') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (field === 'image_url') setIsUploadingImage(true);
    else setIsUploadingLogo(true);

    try {
      const data = new FormData();
      data.append('file', file);
      const res = await uploadTechSheetAsset(data);
      
      if (!res.success || !res.path) {
        throw new Error(res.error || 'Error al subir la imagen');
      }

      const signedUrl = await getTechSheetAssetSignedUrl(res.path);
      handleChange(field, signedUrl || res.path);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error al subir archivo');
    } finally {
      if (field === 'image_url') setIsUploadingImage(false);
      else setIsUploadingLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert('Por favor ingresa un título para la ficha técnica.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isEditing) {
        const res = await updateTechSheet(initialData.id, formData);
        if (!res.success) throw new Error(res.error);
        alert('¡Ficha técnica actualizada con éxito!');
      } else {
        const res = await createTechSheet(formData);
        if (!res.success) throw new Error(res.error);
        alert('¡Ficha técnica creada con éxito!');
      }
      router.push('/admin/quotes');
      router.refresh();
    } catch (err: any) {
      console.error(err);
      alert('Error al guardar la ficha técnica: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const blob = await generateTechSheetPDF(formData);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ficha-tecnica-${(formData.title || 'cafe').toLowerCase().replace(/[^a-z0-9]/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      alert('Error al descargar el archivo PDF');
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-foreground/5 shadow-sm">
        <div className="flex items-center gap-4">
          <Link
            href="/admin/quotes"
            className="p-2.5 rounded-xl border border-foreground/10 text-foreground/60 hover:bg-foreground/5 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-serif text-foreground">
              {isEditing ? 'Editar Ficha Técnica' : 'Nueva Ficha Técnica de Café'}
            </h1>
            <p className="text-sm text-foreground/60">
              Personaliza el perfil sensorial, origen y diseño visual para la ficha del café.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleLoadSample}
            className="px-4 py-2.5 bg-[#f5f2e9] text-[#717861] border border-[#717861]/30 rounded-xl text-xs font-bold hover:bg-[#e8e3d5] transition-colors flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-[#717861]" />
            Cargar Ejemplo Betulia
          </button>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={isGeneratingPdf}
            className="px-4 py-2.5 bg-white border border-[#C59F59] text-[#C59F59] rounded-xl text-xs font-bold hover:bg-[#C59F59]/5 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            Descargar PDF
          </button>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2.5 bg-[#C59F59] text-white rounded-xl text-xs font-bold hover:bg-[#B38E4D] transition-colors flex items-center gap-2 disabled:opacity-50 shadow-sm"
          >
            {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {isEditing ? 'Guardar Cambios' : 'Crear Ficha Técnica'}
          </button>
        </div>
      </div>

      {/* Main Grid: Form Controls (Left) + Live Preview (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* Form Controls Column */}
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-foreground/5 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-foreground border-b border-foreground/10 pb-3 flex items-center gap-2">
            <span>Parámetros y Especificaciones</span>
          </h2>

          {/* Title & Subtitle */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1.5">
                Nombre del Café / Encabezado *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                placeholder="Ej: CAFÉ DE BETULIA"
                className="w-full px-4 py-2.5 bg-[#faf9f6] border border-foreground/10 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1.5">
                  Subtítulo Banner
                </label>
                <input
                  type="text"
                  value={formData.subtitle}
                  onChange={(e) => handleChange('subtitle', e.target.value)}
                  placeholder="FICHA TÉCNICA"
                  className="w-full px-3 py-2 bg-[#faf9f6] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1.5">
                  Título Historia
                </label>
                <input
                  type="text"
                  value={formData.history_title}
                  onChange={(e) => handleChange('history_title', e.target.value)}
                  placeholder="Historia"
                  className="w-full px-3 py-2 bg-[#faf9f6] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-foreground/70 mb-1.5">
                Texto Narrativo / Historia del Café
              </label>
              <textarea
                rows={3}
                value={formData.history_text}
                onChange={(e) => handleChange('history_text', e.target.value)}
                placeholder="Descripción del origen, finca o características únicas..."
                className="w-full px-3.5 py-2.5 bg-[#faf9f6] border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20 resize-y"
              />
            </div>
          </div>

          {/* Color Palette Customizer */}
          <div className="space-y-3 pt-2 border-t border-foreground/5">
            <label className="block text-xs font-bold uppercase tracking-wider text-foreground/70">
              Color Principal de Diseño
            </label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((preset) => (
                <button
                  key={preset.hex}
                  type="button"
                  onClick={() => handleChange('primary_color', preset.hex)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    formData.primary_color === preset.hex
                      ? 'border-foreground ring-2 ring-foreground/20 font-bold'
                      : 'border-foreground/10 opacity-80 hover:opacity-100'
                  }`}
                >
                  <span className="w-3.5 h-3.5 rounded-full shadow-inner" style={{ backgroundColor: preset.hex }} />
                  {preset.name}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-foreground/60">Personalizado:</span>
              <input
                type="color"
                value={formData.primary_color}
                onChange={(e) => handleChange('primary_color', e.target.value)}
                className="w-8 h-8 rounded-lg cursor-pointer border-0 p-0"
              />
              <input
                type="text"
                value={formData.primary_color}
                onChange={(e) => handleChange('primary_color', e.target.value)}
                className="w-24 px-2 py-1 bg-[#faf9f6] border border-foreground/10 rounded-lg text-xs font-mono"
              />
            </div>
          </div>

          {/* Coffee & Origin Fields */}
          <div className="space-y-4 pt-2 border-t border-foreground/5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#C59F59]">Origen y Cultivo</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">Origen</label>
                <input
                  type="text"
                  value={formData.origin}
                  onChange={(e) => handleChange('origin', e.target.value)}
                  placeholder="Betulia Antioquia"
                  className="w-full px-3 py-2 bg-[#faf9f6] border border-foreground/10 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">Finca</label>
                <input
                  type="text"
                  value={formData.farm_name}
                  onChange={(e) => handleChange('farm_name', e.target.value)}
                  placeholder="El Mirador"
                  className="w-full px-3 py-2 bg-[#faf9f6] border border-foreground/10 rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">Ubicación</label>
                <input
                  type="text"
                  value={formData.location}
                  onChange={(e) => handleChange('location', e.target.value)}
                  placeholder="Vereda la Cibeles"
                  className="w-full px-3 py-2 bg-[#faf9f6] border border-foreground/10 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">Altura</label>
                <input
                  type="text"
                  value={formData.altitude}
                  onChange={(e) => handleChange('altitude', e.target.value)}
                  placeholder="1600-1800 msnm."
                  className="w-full px-3 py-2 bg-[#faf9f6] border border-foreground/10 rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">Variedad</label>
                <input
                  type="text"
                  value={formData.variety}
                  onChange={(e) => handleChange('variety', e.target.value)}
                  placeholder="Castillo"
                  className="w-full px-3 py-2 bg-[#faf9f6] border border-foreground/10 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">Proceso</label>
                <input
                  type="text"
                  value={formData.process}
                  onChange={(e) => handleChange('process', e.target.value)}
                  placeholder="Lavado con fermentación."
                  className="w-full px-3 py-2 bg-[#faf9f6] border border-foreground/10 rounded-xl text-sm"
                />
              </div>
            </div>
          </div>

          {/* Roast & Sensory Profile */}
          <div className="space-y-4 pt-2 border-t border-foreground/5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#C59F59]">Perfil en Taza & Catación</h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">Tostión</label>
                <input
                  type="text"
                  value={formData.roast_level}
                  onChange={(e) => handleChange('roast_level', e.target.value)}
                  placeholder="Media"
                  className="w-full px-3 py-2 bg-[#faf9f6] border border-foreground/10 rounded-xl text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">Puntaje SCA</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={formData.sca_score ?? ''}
                  onChange={(e) => handleChange('sca_score', e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="85.42"
                  className="w-full px-3 py-2 bg-[#faf9f6] border border-foreground/10 rounded-xl text-sm font-semibold"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-foreground/70 mb-1">Perfil Sensorial / Notas</label>
              <input
                type="text"
                value={formData.sensory_profile}
                onChange={(e) => handleChange('sensory_profile', e.target.value)}
                placeholder="Dulce, miel, mango, caramelo, panela..."
                className="w-full px-3 py-2 bg-[#faf9f6] border border-foreground/10 rounded-xl text-sm"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">Acidez</label>
                <input
                  type="text"
                  value={formData.acidity}
                  onChange={(e) => handleChange('acidity', e.target.value)}
                  placeholder="Cítrica"
                  className="w-full px-2.5 py-1.5 bg-[#faf9f6] border border-foreground/10 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">Cuerpo</label>
                <input
                  type="text"
                  value={formData.body}
                  onChange={(e) => handleChange('body', e.target.value)}
                  placeholder="Medio"
                  className="w-full px-2.5 py-1.5 bg-[#faf9f6] border border-foreground/10 rounded-xl text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-foreground/70 mb-1">Dulzor</label>
                <input
                  type="text"
                  value={formData.sweetness}
                  onChange={(e) => handleChange('sweetness', e.target.value)}
                  placeholder="Alto"
                  className="w-full px-2.5 py-1.5 bg-[#faf9f6] border border-foreground/10 rounded-xl text-xs"
                />
              </div>
            </div>
          </div>

          {/* Image Uploaders */}
          <div className="space-y-4 pt-2 border-t border-foreground/5">
            <h3 className="text-xs font-bold uppercase tracking-widest text-[#C59F59]">Imágenes y Recursos</h3>

            {/* Coffee Image Upload */}
            <div>
              <label className="block text-xs font-semibold text-foreground/70 mb-1.5">Fotografía del Café</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.image_url}
                  onChange={(e) => handleChange('image_url', e.target.value)}
                  placeholder="https://... o sube una imagen"
                  className="flex-1 px-3 py-2 bg-[#faf9f6] border border-foreground/10 rounded-xl text-xs"
                />
                <label className="px-3 py-2 bg-[#faf9f6] border border-foreground/20 rounded-xl text-xs font-bold hover:bg-foreground/5 cursor-pointer flex items-center gap-1.5">
                  {isUploadingImage ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 text-foreground/60" />}
                  Subir
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'image_url')}
                    className="hidden"
                    disabled={isUploadingImage}
                  />
                </label>
              </div>
            </div>

            {/* Logo Image Upload */}
            <div>
              <label className="block text-xs font-semibold text-foreground/70 mb-1.5">Logo de Marca / Finca</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.logo_url}
                  onChange={(e) => handleChange('logo_url', e.target.value)}
                  placeholder="/images/logo-amantti.png o sube un logo"
                  className="flex-1 px-3 py-2 bg-[#faf9f6] border border-foreground/10 rounded-xl text-xs"
                />
                <label className="px-3 py-2 bg-[#faf9f6] border border-foreground/20 rounded-xl text-xs font-bold hover:bg-foreground/5 cursor-pointer flex items-center gap-1.5">
                  {isUploadingLogo ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5 text-foreground/60" />}
                  Subir
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, 'logo_url')}
                    className="hidden"
                    disabled={isUploadingLogo}
                  />
                </label>
              </div>
            </div>
          </div>

        </div>

        {/* Live Preview Column (Sticky) */}
        <div className="lg:col-span-7 sticky top-6 space-y-4">
          <div className="bg-white p-4 rounded-3xl border border-foreground/5 shadow-sm overflow-x-auto">
            <div className="flex items-center justify-between border-b border-foreground/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#C59F59]" />
                <h3 className="text-sm font-bold text-foreground">Vista Previa en Tiempo Real</h3>
              </div>
              <span className="text-xs text-foreground/40 font-mono">Diseño idéntico al PDF</span>
            </div>

            {/* Render HTML Template inside scaled wrapper for preview */}
            <div className="origin-top-left transform scale-[0.72] sm:scale-[0.8] md:scale-[0.88] lg:scale-[0.75] xl:scale-[0.85] transition-all">
              <TechSheetHTMLTemplate data={formData} />
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

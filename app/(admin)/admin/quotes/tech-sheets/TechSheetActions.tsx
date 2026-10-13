'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Edit2, Trash2, FileDown, Loader2 } from 'lucide-react';
import { deleteTechSheet } from '../actions';
import { generateTechSheetPDF } from '@/utils/pdf/techSheetGenerator';
import { useRouter } from 'next/navigation';
import { useTr } from "@/app/(admin)/AdminI18n";

export default function TechSheetActions({ sheet }: { sheet: any }) {
  const tr = useTr();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!window.confirm(tr("¿Estás seguro de eliminar la ficha técnica \"{title}\"?", { title: sheet.title }))) return;
    
    setIsDeleting(true);
    try {
      const res = await deleteTechSheet(sheet.id);
      if (!res.success) throw new Error(res.error);
      router.refresh();
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert(tr("Error al eliminar la ficha técnica"));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const blob = await generateTechSheetPDF({ ...sheet, lang: tr.locale });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ficha-tecnica-${sheet.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error al generar PDF:', err);
      alert(tr("Hubo un problema al generar el PDF de la ficha técnica"));
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  return (
    <div className="flex items-center justify-center gap-2">
      <button
        onClick={handleDownloadPdf}
        disabled={isGeneratingPdf}
        className="text-[#C59F59] hover:text-[#B38E4D] p-2 hover:bg-[#C59F59]/10 rounded-lg transition-colors disabled:opacity-50"
        title={tr("Descargar PDF")}
      >
        {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
      </button>

      <Link 
        href={`/admin/quotes/tech-sheets/${sheet.id}`}
        className="text-[#C59F59] hover:text-[#B38E4D] p-2 hover:bg-[#C59F59]/10 rounded-lg transition-colors"
        title={tr("Editar")}
      >
        <Edit2 className="w-4 h-4" />
      </Link>

      <button 
        onClick={handleDelete}
        disabled={isDeleting}
        className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
        title={tr("Eliminar")}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

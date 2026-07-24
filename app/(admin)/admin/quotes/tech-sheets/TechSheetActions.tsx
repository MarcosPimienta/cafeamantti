'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Edit2, Trash2, FileDown, Loader2 } from 'lucide-react';
import { deleteTechSheet } from '../actions';
import { generateTechSheetPDF } from '@/utils/pdf/techSheetGenerator';
import { useRouter } from 'next/navigation';

export default function TechSheetActions({ sheet }: { sheet: any }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!window.confirm(`¿Estás seguro de eliminar la ficha técnica "${sheet.title}"?`)) return;
    
    setIsDeleting(true);
    try {
      const res = await deleteTechSheet(sheet.id);
      if (!res.success) throw new Error(res.error);
      router.refresh();
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert('Error al eliminar la ficha técnica');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsGeneratingPdf(true);
    try {
      const blob = await generateTechSheetPDF(sheet);
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
      alert('Hubo un problema al generar el PDF de la ficha técnica');
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
        title="Descargar PDF"
      >
        {isGeneratingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
      </button>

      <Link 
        href={`/admin/quotes/tech-sheets/${sheet.id}`}
        className="text-[#C59F59] hover:text-[#B38E4D] p-2 hover:bg-[#C59F59]/10 rounded-lg transition-colors"
        title="Editar"
      >
        <Edit2 className="w-4 h-4" />
      </Link>

      <button 
        onClick={handleDelete}
        disabled={isDeleting}
        className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
        title="Eliminar"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

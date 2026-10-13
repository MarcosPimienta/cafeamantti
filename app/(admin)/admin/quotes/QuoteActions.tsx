'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Edit2, Trash2 } from 'lucide-react';
import { deleteQuote } from './actions';
import { useRouter } from 'next/navigation';
import { useTr } from "@/app/(admin)/AdminI18n";

export default function QuoteActions({ id }: { id: string }) {
  const tr = useTr();
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!window.confirm(tr("¿Estás seguro de eliminar esta cotización?"))) return;
    
    setIsDeleting(true);
    try {
      const res = await deleteQuote(id);
      if (!res.success) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert(tr("Error al eliminar la cotización"));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex items-center justify-center gap-3">
      <Link 
        href={`/admin/quotes/${id}`}
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

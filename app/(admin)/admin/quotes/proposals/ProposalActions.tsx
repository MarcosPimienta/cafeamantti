'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Copy, Edit2, Loader2, Trash2 } from 'lucide-react';
import { deleteProposal, duplicateProposal } from '../actions';
import { useRouter } from 'next/navigation';
import { useTr } from "@/app/(admin)/AdminI18n";

export default function ProposalActions({ id }: { id: string }) {
  const tr = useTr();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const router = useRouter();

  const handleDelete = async () => {
    if (!window.confirm(tr("¿Estás seguro de eliminar esta propuesta?"))) return;

    setIsDeleting(true);
    try {
      const res = await deleteProposal(id);
      if (!res.success) throw new Error(res.error);
      router.refresh();
      // Since it's a client component using state, we might need to manually refresh if the list is in the same page
      window.location.reload();
    } catch (err) {
      console.error(err);
      alert(tr("Error al eliminar la propuesta"));
    } finally {
      setIsDeleting(false);
    }
  };

  // The copy opens in the editor right away, ready to change client and texts.
  const handleDuplicate = async () => {
    setIsDuplicating(true);
    try {
      const res = await duplicateProposal(id);
      if (!res.success || !res.id) throw new Error(res.error);
      router.push(`/admin/quotes/proposals/${res.id}`);
    } catch (err) {
      console.error(err);
      alert(tr("Error al duplicar la propuesta"));
      setIsDuplicating(false);
    }
  };

  return (
    <div className="flex items-center justify-center gap-3">
      <Link
        href={`/admin/quotes/proposals/${id}`}
        className="text-[#C59F59] hover:text-[#B38E4D] p-2 hover:bg-[#C59F59]/10 rounded-lg transition-colors"
        title={tr("Editar")}
      >
        <Edit2 className="w-4 h-4" />
      </Link>
      <button
        onClick={handleDuplicate}
        disabled={isDuplicating}
        className="text-foreground/50 hover:text-foreground p-2 hover:bg-foreground/5 rounded-lg transition-colors disabled:opacity-50"
        title={tr("Duplicar")}
      >
        {isDuplicating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
      </button>
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

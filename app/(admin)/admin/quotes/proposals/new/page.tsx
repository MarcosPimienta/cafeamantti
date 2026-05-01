import React from "react";
import { checkIsAdmin, getClientsCRM, getCurrentUserProfile } from "../../../../actions";
import { redirect } from "next/navigation";
import ProposalForm from "./ProposalForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function NewProposalPage() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect('/dashboard');

  const [clients, profile] = await Promise.all([
    getClientsCRM(),
    getCurrentUserProfile()
  ]);

  const sellerName = profile ? `${profile.first_name || ''} ${profile.last_name || ''}`.trim() : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link 
          href="/admin/quotes"
          className="p-3 bg-white border border-foreground/5 rounded-xl hover:bg-foreground/5 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground/60" />
        </Link>
        <div>
          <h1 className="text-2xl font-serif text-foreground">Nueva Propuesta Comercial</h1>
          <p className="text-sm text-foreground/50">Editor de bloques con previsualización en tiempo real</p>
        </div>
      </div>

      <ProposalForm 
        clients={clients || []} 
        sellerName={sellerName}
      />
    </div>
  );
}

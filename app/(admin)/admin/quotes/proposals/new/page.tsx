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
    <div className="space-y-8">
      <div className="flex items-center gap-4">
        <Link 
          href="/admin/quotes"
          className="p-3 bg-white border border-foreground/5 rounded-xl hover:bg-foreground/5 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-foreground/60" />
        </Link>
        <div>
          <h1 className="text-3xl font-serif text-foreground mb-2">Nueva Propuesta Comercial</h1>
          <p className="text-foreground/60">Construye una alianza estratégica personalizada con secciones narrativas.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 md:p-8">
        <ProposalForm 
          clients={clients || []} 
          sellerName={sellerName}
        />
      </div>
    </div>
  );
}

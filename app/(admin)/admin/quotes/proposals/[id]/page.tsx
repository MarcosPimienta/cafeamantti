import React from "react";
import { checkIsAdmin, getClientsCRM, getCurrentUserProfile } from "../../../../actions";
import { getProposalById } from "../../actions";
import { redirect } from "next/navigation";
import ProposalForm from "../new/ProposalForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function EditProposalPage(props: { params: Promise<{ id: string }> }) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect('/dashboard');

  const params = await props.params;

  const [clients, initialProposal, profile] = await Promise.all([
    getClientsCRM(),
    getProposalById(params.id),
    getCurrentUserProfile()
  ]);

  if (!initialProposal) {
    redirect('/admin/quotes');
  }

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
          <h1 className="text-3xl font-serif text-foreground mb-2">Editar Propuesta</h1>
          <p className="text-foreground/60">Actualiza los términos de la alianza y vuelve a generar el documento.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 md:p-8">
        <ProposalForm 
          clients={clients || []} 
          initialProposal={initialProposal} 
          sellerName={sellerName}
        />
      </div>
    </div>
  );
}

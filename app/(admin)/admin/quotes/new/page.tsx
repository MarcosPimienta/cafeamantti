import React from "react";
import { checkIsAdmin, getClientsCRM, getInventory } from "../../../actions";
import { redirect } from "next/navigation";
import NewQuoteForm from "./NewQuoteForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function NewQuotePage() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect('/dashboard');

  const clients = await getClientsCRM() || [];
  const inventory = await getInventory() || [];

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
          <h1 className="text-3xl font-serif text-foreground mb-2">Nueva Cotización</h1>
          <p className="text-foreground/60">Crea una cotización y genera el documento PDF al instante.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 md:p-8">
        <NewQuoteForm clients={clients} inventory={inventory} />
      </div>
    </div>
  );
}

import React from "react";
import { checkIsAdmin, getClientsCRM, getInventory } from "../../../actions";
import { getQuoteById } from "../actions";
import { redirect } from "next/navigation";
import QuoteForm from "../new/NewQuoteForm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export default async function EditQuotePage(props: { params: Promise<{ id: string }> }) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect('/dashboard');

  const params = await props.params;

  const [clients, inventory, initialQuote] = await Promise.all([
    getClientsCRM(),
    getInventory(),
    getQuoteById(params.id)
  ]);

  if (!initialQuote) {
    redirect('/admin/quotes');
  }

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
          <h1 className="text-3xl font-serif text-foreground mb-2">Editar Cotización</h1>
          <p className="text-foreground/60">Actualiza los datos de esta cotización y vuelve a generar el PDF si lo necesitas.</p>
        </div>
      </div>

      <div className="bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 md:p-8">
        <QuoteForm 
          clients={clients || []} 
          inventory={inventory || []} 
          initialQuote={initialQuote} 
        />
      </div>
    </div>
  );
}

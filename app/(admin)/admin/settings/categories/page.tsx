import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { checkIsAdmin } from "../../../actions";
import { createClient } from "@/utils/supabase/server";
import { loadSiigoSettings } from "@/utils/siigo/server";
import { loadExpenseCategories } from "@/utils/expenses/server";
import ExpenseCategoriesClient from "./ExpenseCategoriesClient";
import { getTr } from "@/utils/i18n/server";

export const metadata = { title: "Categorías de gasto - Café Amantti" };

export default async function ExpenseCategoriesPage() {
  const tr = await getTr();
  if (!(await checkIsAdmin())) redirect("/dashboard");
  const supabase = await createClient();
  const [categories, settings, probe] = await Promise.all([
    loadExpenseCategories(supabase, { includeInactive: true }),
    loadSiigoSettings(supabase),
    supabase.from("expense_categories").select("id").limit(1),
  ]);
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/settings" className="inline-flex items-center gap-1 text-xs font-bold text-foreground/50 hover:text-[#C59F59]">
          <ArrowLeft className="w-3.5 h-3.5" />{" "}{tr("Ajustes")}
        </Link>
        <h1 className="text-3xl font-serif text-foreground mt-2">{tr("Categorías de gasto")}</h1>
        <p className="text-foreground/60">{tr("Las categorías de Compras, Flujo de Caja y cuentas de cobro. Las del sistema son fijas; aquí agregas las tuyas.")}</p>
      </div>
      <ExpenseCategoriesClient
        categories={categories}
        accounts={settings.siigo_accounts ?? []}
        defaultAccounts={settings.expense_accounts ?? {}}
        migrationApplied={!probe.error}
      />
    </div>
  );
}

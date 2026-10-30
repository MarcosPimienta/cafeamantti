import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { checkIsAdmin } from "../../../actions";
import { getSiigoSetup } from "../../siigo/actions";
import { createClient } from "@/utils/supabase/server";
import { namesOf } from "@/utils/expenses/categories";
import { loadExpenseCategories } from "@/utils/expenses/server";
import SiigoSettingsClient from "./SiigoSettingsClient";
import { getTr } from "@/utils/i18n/server";

export const metadata = { title: "Siigo - Café Amantti" };

export default async function SiigoSettingsPage() {
  const tr = await getTr();
  if (!(await checkIsAdmin())) redirect("/dashboard");
  const setup = await getSiigoSetup();
  const categories = await loadExpenseCategories(await createClient());
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/settings" className="inline-flex items-center gap-1 text-xs font-bold text-foreground/50 hover:text-[#C59F59]">
          <ArrowLeft className="w-3.5 h-3.5" />{" "}{tr("Ajustes")}
        </Link>
        <h1 className="text-3xl font-serif text-foreground mt-2">{tr("Siigo")}</h1>
        <p className="text-foreground/60">{tr("Facturación electrónica, compras, productos y clientes con Siigo Nube.")}</p>
      </div>
      <SiigoSettingsClient
        configured={setup.configured}
        migrationApplied={setup.migrationApplied}
        initialSettings={setup.settings}
        log={setup.log}
        expenseCategories={namesOf(categories, (c) => c.type !== "CAPEX")}
        assetCategories={namesOf(categories, (c) => c.type === "CAPEX")}
      />
    </div>
  );
}

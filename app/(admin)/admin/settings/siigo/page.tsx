import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { checkIsAdmin } from "../../../actions";
import { getSiigoSetup } from "../../siigo/actions";
import { EXPENSE_CATEGORY_TYPE_MAP } from "../../cashflow/types";
import SiigoSettingsClient from "./SiigoSettingsClient";

export const metadata = { title: "Siigo - Café Amantti" };

export default async function SiigoSettingsPage() {
  if (!(await checkIsAdmin())) redirect("/dashboard");
  const setup = await getSiigoSetup();
  const categories = Object.entries(EXPENSE_CATEGORY_TYPE_MAP);
  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/settings" className="inline-flex items-center gap-1 text-xs font-bold text-foreground/50 hover:text-[#C59F59]">
          <ArrowLeft className="w-3.5 h-3.5" /> Ajustes
        </Link>
        <h1 className="text-3xl font-serif text-foreground mt-2">Siigo</h1>
        <p className="text-foreground/60">Facturación electrónica, compras, productos y clientes con Siigo Nube.</p>
      </div>
      <SiigoSettingsClient
        configured={setup.configured}
        migrationApplied={setup.migrationApplied}
        initialSettings={setup.settings}
        log={setup.log}
        expenseCategories={categories.filter(([, t]) => t !== "CAPEX").map(([c]) => c)}
        assetCategories={categories.filter(([, t]) => t === "CAPEX").map(([c]) => c)}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { checkIsAdmin } from "../../actions";
import { getPurchases } from "./actions";
import PurchasesClient from "./PurchasesClient";
import { getTr } from "@/utils/i18n/server";

export const metadata = { title: "Compras - Café Amantti" };
export const dynamic = "force-dynamic";

export default async function PurchasesPage() {
  const tr = await getTr();
  if (!(await checkIsAdmin())) redirect("/dashboard");
  const data = await getPurchases();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif text-foreground">{tr("Compras")}</h1>
        <p className="text-foreground/60">{tr("Facturas de compra de empresas: se registran en Siigo, quedan por pagar y cada pago crea el egreso en Siigo y la salida en Flujo de Caja.")}</p>
      </div>
      <PurchasesClient {...data} />
    </div>
  );
}

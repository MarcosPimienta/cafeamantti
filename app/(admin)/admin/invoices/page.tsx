import { redirect } from "next/navigation";
import { checkIsAdmin } from "../../actions";
import { getInvoices } from "./actions";
import { siigoConfigFromEnv } from "@/utils/siigo/api";
import InvoicesClient from "./InvoicesClient";
import { getTr } from "@/utils/i18n/server";

export const metadata = { title: "Facturas - Café Amantti" };
export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const tr = await getTr();
  if (!(await checkIsAdmin())) redirect("/dashboard");
  const { invoices, migrationApplied, today } = await getInvoices();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif text-foreground">{tr("Facturas")}</h1>
        <p className="text-foreground/60">{tr("Facturas de venta creadas desde los pedidos, su envío a Siigo y lo que te deben los clientes.")}</p>
      </div>
      <InvoicesClient invoices={invoices} migrationApplied={migrationApplied} today={today} configured={!!siigoConfigFromEnv()} />
    </div>
  );
}

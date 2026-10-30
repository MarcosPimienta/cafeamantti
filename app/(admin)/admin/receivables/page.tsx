import { redirect } from "next/navigation";
import { checkIsAdmin } from "../../actions";
import { getReceivables } from "./actions";
import { getReceipts } from "./receiptActions";
import ReceivablesClient from "./ReceivablesClient";
import { getTr } from "@/utils/i18n/server";

export const metadata = { title: "Cuentas por cobrar - Café Amantti" };
export const dynamic = "force-dynamic";

export default async function ReceivablesPage() {
  const tr = await getTr();
  if (!(await checkIsAdmin())) redirect("/dashboard");
  const [data, { receipts }] = await Promise.all([getReceivables(), getReceipts()]);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif text-foreground">{tr("Cuentas por cobrar")}</h1>
        <p className="text-foreground/60">{tr("Lo que cada cliente debe, por sede: vencido, vence hoy y por vencer a la fecha de corte. Los saldos salen de Siigo, también los de facturas y pagos hechos directamente allá.")}</p>
      </div>
      <ReceivablesClient {...data} receipts={receipts} />
    </div>
  );
}

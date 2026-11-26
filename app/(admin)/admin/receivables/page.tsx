import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive } from "lucide-react";
import { checkIsAdmin } from "../../actions";
import { getReceivables } from "./actions";
import { getReceipts } from "./receiptActions";
import ReceivablesClient from "./ReceivablesClient";
import { getTr } from "@/utils/i18n/server";
import { isArchivedInvoice } from "@/utils/invoices/receivables";

export const metadata = { title: "Cuentas por cobrar - Café Amantti" };
export const dynamic = "force-dynamic";

export default async function ReceivablesPage({ searchParams }: { searchParams: Promise<{ datos?: string }> }) {
  const tr = await getTr();
  if (!(await checkIsAdmin())) redirect("/dashboard");
  // «Ver datos anteriores»: only invoices issued before Sep 2026; by default, only the ones from then on.
  const legacy = (await searchParams).datos === "anteriores";
  const [data, { receipts }] = await Promise.all([getReceivables(), getReceipts()]);
  const invoices = data.invoices.filter((i) => isArchivedInvoice(i.issue_date) === legacy);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-serif text-foreground">{tr("Cuentas por cobrar")}</h1>
          <p className="text-foreground/60">{tr("Lo que cada cliente debe, por sede: vencido, vence hoy y por vencer a la fecha de corte. Los saldos salen de Siigo, también los de facturas y pagos hechos directamente allá.")}</p>
        </div>
        <Link
          href={legacy ? "/admin/receivables" : "/admin/receivables?datos=anteriores"}
          className={`flex shrink-0 items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest transition-all border ${
            legacy ? "bg-amber-100 text-amber-800 border-amber-300 shadow-sm" : "bg-white text-foreground/50 border-foreground/10 hover:bg-foreground/5"
          }`}
        >
          <Archive className="w-3.5 h-3.5" />
          {legacy ? tr("Viendo: Archivo (pre-Sept 2026)") : tr("Ver datos anteriores")}
        </Link>
      </div>
      {legacy ? (
        <div className="flex flex-wrap items-center gap-3 px-5 py-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          <Archive className="w-4 h-4 shrink-0" />
          <span className="flex-1 min-w-0">{tr("Estás viendo las facturas emitidas antes de sep 2026, cargadas antes de que los registros fueran confiables. Sirve para depurarlas: cobrarlas, cruzarlas o anularlas en Siigo.")}</span>
          <Link href="/admin/receivables" className="font-bold underline">{tr("Volver a los datos actuales")}</Link>
        </div>
      ) : (
        <p className="text-xs text-foreground/50 -mt-3">{tr("Facturas emitidas desde sep 2026. Las anteriores están en «Ver datos anteriores».")}</p>
      )}
      <ReceivablesClient {...data} invoices={invoices} receipts={receipts} />
    </div>
  );
}

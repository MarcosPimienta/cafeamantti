import { redirect } from "next/navigation";
import { checkIsAdmin } from "../../actions";
import { getBankData } from "./actions";
import BankClient from "./BankClient";
import { getTr } from "@/utils/i18n/server";

export const metadata = { title: "Conciliación bancaria - Café Amantti" };
export const dynamic = "force-dynamic";

export default async function BankPage({ searchParams }: { searchParams: Promise<{ extracto?: string }> }) {
  const tr = await getTr();
  if (!(await checkIsAdmin())) redirect("/dashboard");
  const { extracto } = await searchParams;
  const data = await getBankData(extracto ?? null);
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif text-foreground">{tr("Conciliación bancaria")}</h1>
        <p className="text-foreground/60 max-w-4xl">{tr("Carga el extracto del banco de cada mes y empareja cada movimiento con su registro en Flujo de Caja. Lo que falta en la app se registra desde aquí; lo que está en la app y no en el banco puede ser efectivo o un duplicado.")}</p>
      </div>
      <BankClient {...data} />
    </div>
  );
}

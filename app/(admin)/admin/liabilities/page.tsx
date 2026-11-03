import { redirect } from "next/navigation";
import { checkIsAdmin } from "../../actions";
import { getLiabilities } from "./actions";
import LiabilitiesClient from "./LiabilitiesClient";
import { getTr } from "@/utils/i18n/server";

export const metadata = { title: "Pasivos - Café Amantti" };
export const dynamic = "force-dynamic";

export default async function LiabilitiesPage() {
  const tr = await getTr();
  if (!(await checkIsAdmin())) redirect("/dashboard");
  const data = await getLiabilities();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-serif text-foreground">{tr("Pasivos")}</h1>
        <p className="text-foreground/60 max-w-4xl">{tr("Lo que debe la empresa: préstamos de terceros (con interés), de socios (sin interés) y proveedores por pagar. Los intereses que se capitalizan cuentan como gasto de cada mes aunque no salga plata.")}</p>
      </div>
      <LiabilitiesClient {...data} />
    </div>
  );
}

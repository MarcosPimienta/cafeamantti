import { redirect } from "next/navigation";
import { checkIsAdmin } from "../../../../actions";
import MaquilaForm from "../MaquilaForm";
import { loadMaquilaFormData } from "../loadFormData";
import { MaquilaHeader as Header } from "../MaquilaHeader";

export const metadata = { title: "Nueva propuesta de maquila - Café Amantti" };

export default async function NewMaquilaPage() {
  if (!(await checkIsAdmin())) redirect("/dashboard");
  const { clients, packaging, coffeeCostPerKg, optionPrices, sellerName } = await loadMaquilaFormData();
  return (
    <div className="space-y-6">
      <Header title="Nueva propuesta de maquila" />
      <MaquilaForm clients={clients} packaging={packaging} coffeeCostPerKg={coffeeCostPerKg} optionPrices={optionPrices} sellerName={sellerName} />
    </div>
  );
}

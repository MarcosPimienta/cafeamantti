import React from "react";
import { redirect } from "next/navigation";
import { checkIsAdmin } from "@/app/(admin)/actions";
import { getImportContextAction } from "./actions";
import SiigoImporterClient from "./SiigoImporterClient";

export const metadata = {
  title: "Importar Ventas Siigo | Café Amantti Admin",
  description: "Carga de ventas mediante archivo plano exportado de Siigo Nube.",
};

export default async function SiigoImportPage() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    redirect("/dashboard");
  }

  const { inventory, clients, existingInvoices } = await getImportContextAction();

  return (
    <SiigoImporterClient
      initialInventory={inventory}
      initialClients={clients}
      initialExistingInvoices={existingInvoices}
    />
  );
}

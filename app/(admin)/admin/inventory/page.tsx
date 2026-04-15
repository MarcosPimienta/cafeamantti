import React from "react";
import { checkIsAdmin } from "../../actions";
import { getInventory } from "../../actions";
import { redirect } from "next/navigation";
import InventoryClient from "./InventoryClient";

export const metadata = {
  title: "Inventario — Amantti Admin",
};

export default async function AdminInventoryPage() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect("/dashboard");

  const inventory = await getInventory();

  return <InventoryClient inventory={inventory} />;
}

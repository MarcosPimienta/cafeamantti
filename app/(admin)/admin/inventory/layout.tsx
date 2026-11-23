import React from "react";
import { redirect } from "next/navigation";
import { checkIsAdmin, getInventory } from "../../actions";
import { InventoryProvider } from "./InventoryContext";
import InventoryShell from "./InventoryShell";
import type { InventoryItem } from "./InventoryClient";

export const dynamic = "force-dynamic";

export default async function InventoryLayout({ children }: { children: React.ReactNode }) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect("/dashboard");

  const inventory = (await getInventory()) as InventoryItem[];

  return (
    <InventoryProvider initial={inventory}>
      <InventoryShell>{children}</InventoryShell>
    </InventoryProvider>
  );
}

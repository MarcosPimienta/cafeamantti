import React from "react";
import { redirect } from "next/navigation";
import { checkIsAdmin, getAuditLogs, getInventory } from "../../../actions";
import { createClient } from "@/utils/supabase/server";
import AuditoriaClient, { type AuditLog } from "./AuditoriaClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Auditoría — Ajustes — Amantti Admin",
};

export default async function AuditoriaPage({ searchParams }: { searchParams: Promise<{ producto?: string }> }) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) redirect("/dashboard");

  const [{ producto }, logs, inventory] = await Promise.all([searchParams, getAuditLogs(), getInventory()]);
  const products = Object.fromEntries(
    ((inventory ?? []) as { id: string; product_name: string; product_code: string }[]).map((i) => [
      i.id,
      { name: i.product_name, code: i.product_code },
    ])
  );

  // Bodega names for transfers; empty before the warehouses migration.
  const supabase = await createClient();
  const { data: whRows } = await supabase.from("warehouses").select("id, name");
  const warehouses = Object.fromEntries(((whRows ?? []) as { id: string; name: string }[]).map((w) => [w.id, w.name]));

  return <AuditoriaClient logs={(logs ?? []) as AuditLog[]} products={products} warehouses={warehouses} productFilter={producto ?? null} />;
}

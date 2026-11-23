import BodegasClient, { type BodegasView } from "./BodegasClient";

export const metadata = {
  title: "Bodegas — Inventario — Amantti Admin",
};

const VIEWS: BodegasView[] = ["stock", "transferir", "administrar"];

export default async function BodegasPage({ searchParams }: { searchParams: Promise<{ vista?: string; producto?: string }> }) {
  const { vista, producto } = await searchParams;
  const view = VIEWS.includes(vista as BodegasView) ? (vista as BodegasView) : producto ? "transferir" : "stock";
  return <BodegasClient initialView={view} initialProduct={producto ?? null} />;
}

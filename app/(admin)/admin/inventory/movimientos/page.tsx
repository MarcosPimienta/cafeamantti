import MovimientosClient, { type MovementView } from "./MovimientosClient";

export const metadata = {
  title: "Movimientos — Inventario — Amantti Admin",
};

const VIEWS: MovementView[] = ["entrada", "salida", "ajuste", "transferencia", "historial"];

export default async function MovimientosPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams;
  const initial = VIEWS.includes(tipo as MovementView) ? (tipo as MovementView) : "salida";
  return <MovimientosClient initialView={initial} />;
}

import ProduccionClient, { type ProductionStep } from "./ProduccionClient";

export const metadata = {
  title: "Producción — Inventario — Amantti Admin",
};

const STEPS: ProductionStep[] = ["trilla", "tostion", "empaque", "reempaque", "cold_brew"];

export default async function ProduccionPage({ searchParams }: { searchParams: Promise<{ paso?: string }> }) {
  const { paso } = await searchParams;
  const initial = STEPS.includes(paso as ProductionStep) ? (paso as ProductionStep) : "tostion";
  return <ProduccionClient initialStep={initial} />;
}

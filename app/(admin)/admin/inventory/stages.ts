// Which stage of the coffee pipeline a product code is in, and the kilos at
// each stage. Pergamino (CAPG-) and verde (CAFV-) are kg; roasted bulk
// (CAFT-*-001) is kg; packaged roasted coffee is units whose weight comes
// from the code; cold brew (CAFC-) is bottles.

import { isBulkCoffee, isGrindTracked, unitWeightKg } from "../../coffeeProfiles";

export type CoffeeStage = "empacado" | "granel" | "verde" | "pergamino" | "otro";

export const STAGE_ORDER: CoffeeStage[] = ["empacado", "granel", "verde", "pergamino", "otro"];

export const STAGE_LABELS: Record<CoffeeStage, string> = {
  empacado: "Empacado",
  granel: "Tostado a granel",
  verde: "Verde",
  pergamino: "Pergamino",
  otro: "Otros cafés",
};

export function coffeeStageOf(code: string): CoffeeStage {
  if (code.startsWith("CAPG-")) return "pergamino";
  if (code.startsWith("CAFV-")) return "verde";
  if (isBulkCoffee(code)) return "granel";
  if (isGrindTracked(code) || code.startsWith("CAFC-")) return "empacado";
  return "otro";
}

export type StageTotals = {
  pergaminoKg: number;
  verdeKg: number;
  granelKg: number;
  empacadoKg: number;
  empacadoUds: number;
  coldBrewUds: number;
};

export function stageTotals(items: { product_code: string; category: string; current_stock: number }[]): StageTotals {
  const t: StageTotals = { pergaminoKg: 0, verdeKg: 0, granelKg: 0, empacadoKg: 0, empacadoUds: 0, coldBrewUds: 0 };
  for (const it of items) {
    if (it.category !== "cafe") continue;
    const stock = Math.max(Number(it.current_stock) || 0, 0);
    const code = it.product_code;
    switch (coffeeStageOf(code)) {
      case "pergamino":
        t.pergaminoKg += stock;
        break;
      case "verde":
        t.verdeKg += stock;
        break;
      case "granel":
        t.granelKg += stock;
        break;
      case "empacado":
        if (code.startsWith("CAFC-")) t.coldBrewUds += stock;
        else {
          t.empacadoUds += stock;
          t.empacadoKg += stock * (unitWeightKg(code) ?? 0);
        }
        break;
      default:
        break;
    }
  }
  return t;
}

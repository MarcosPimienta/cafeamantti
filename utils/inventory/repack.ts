// Kilo and grind bookkeeping for a reempaque (opening packed coffee and
// packing it again). Pure: the server action loads the items and applies
// the result; this decides whether the operation is valid and what is left.

import {
  isMolienda,
  profileForCode,
  unitWeightKg,
  type CoffeeProfileId,
} from "@/app/(admin)/coffeeProfiles";

export const KG_EPS = 0.0005;
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export type RepackLine = { inventoryId: string; qty: number; molienda: string | null | undefined };
export type RepackItem = { id: string; product_code: string; product_name: string };

export interface RepackPlan {
  profile: CoffeeProfileId;
  inKg: number;
  outKg: number;
  sobranteKg: number;
  /** Leftover that is still whole bean. */
  sobranteGrano: number;
  /** Leftover that is ground. */
  sobranteMolido: number;
}

/**
 * Validates a repack and splits the leftover by grind. Throws an Error with
 * a message for the admin when the operation is not possible.
 *
 * Rules: one profile for every line; a product cannot be origin and
 * destination; kilos out ≤ kilos in; Grano can be ground into Molido but
 * Molido never becomes Grano. Molido out is served from Molido in first,
 * any excess was ground from Grano.
 */
export function planRepack(
  origins: RepackLine[],
  destinations: RepackLine[],
  byId: Map<string, RepackItem>
): RepackPlan {
  const profiles = new Set<string>();
  const kg = { inGrano: 0, inMolido: 0, outGrano: 0, outMolido: 0 };

  for (const [lines, side] of [[origins, "in"], [destinations, "out"]] as const) {
    for (const l of lines) {
      const it = byId.get(l.inventoryId);
      if (!it) throw new Error("Producto no encontrado.");
      const w = unitWeightKg(it.product_code);
      if (w === null) {
        throw new Error(`${it.product_name} no es café tostado con peso conocido; no se puede reempacar.`);
      }
      if (!isMolienda(l.molienda)) {
        throw new Error(`Selecciona la molienda (Grano o Molido) de ${it.product_name}.`);
      }
      profiles.add(profileForCode(it.product_code) ?? "");
      const key = `${side}${l.molienda === "grano" ? "Grano" : "Molido"}` as keyof typeof kg;
      kg[key] += l.qty * w;
    }
  }
  if (profiles.size > 1) {
    throw new Error("Todos los productos del reempaque deben ser del mismo perfil (Premium, Honey o Chiroso).");
  }
  const originIds = new Set(origins.map((l) => l.inventoryId));
  const overlap = destinations.find((l) => originIds.has(l.inventoryId));
  if (overlap) {
    throw new Error(`${byId.get(overlap.inventoryId)?.product_name} no puede ser origen y destino a la vez.`);
  }

  const inKg = round3(kg.inGrano + kg.inMolido);
  const outKg = round3(kg.outGrano + kg.outMolido);
  if (outKg > inKg + KG_EPS) {
    throw new Error(`El destino (${outKg} kg) supera el café abierto (${inKg} kg).`);
  }
  if (kg.outGrano > kg.inGrano + KG_EPS) {
    throw new Error("El café molido no puede volver a grano: hay más Grano en el destino que en el origen.");
  }

  const sobranteKg = round3(inKg - outKg);
  const groundFromGrano = Math.max(0, kg.outMolido - kg.inMolido);
  const sobranteGrano = round3(Math.max(0, kg.inGrano - kg.outGrano - groundFromGrano));
  const sobranteMolido = round3(sobranteKg - sobranteGrano);

  return {
    profile: [...profiles][0] as CoffeeProfileId,
    inKg,
    outKg,
    sobranteKg,
    sobranteGrano,
    sobranteMolido,
  };
}

import { describe, it, expect } from "vitest";
import { numeroALetras, formatCOP, formatDateSpanish } from "../cuentasCobroHelpers";

// Amounts in words are printed on legal cuentas de cobro: they must read
// exactly as Colombian Spanish writes them.
describe("numeroALetras", () => {
  it.each([
    [0, "CERO PESOS M/CTE"],
    [1, "UN PESO M/CTE"],
    [2, "DOS PESOS M/CTE"],
    [10, "DIEZ PESOS M/CTE"],
    [15, "QUINCE PESOS M/CTE"],
    [16, "DIECISÉIS PESOS M/CTE"],
    [20, "VEINTE PESOS M/CTE"],
    [21, "VEINTIÚN PESOS M/CTE"],
    [22, "VEINTIDÓS PESOS M/CTE"],
    [23, "VEINTITRÉS PESOS M/CTE"],
    [26, "VEINTISÉIS PESOS M/CTE"],
    [27, "VEINTISIETE PESOS M/CTE"],
    [31, "TREINTA Y UN PESOS M/CTE"],
    [100, "CIEN PESOS M/CTE"],
    [101, "CIENTO UN PESOS M/CTE"],
    [500, "QUINIENTOS PESOS M/CTE"],
    [999, "NOVECIENTOS NOVENTA Y NUEVE PESOS M/CTE"],
    [1000, "UN MIL PESOS M/CTE"],
    [2000, "DOS MIL PESOS M/CTE"],
    [21000, "VEINTIÚN MIL PESOS M/CTE"],
    [45500, "CUARENTA Y CINCO MIL QUINIENTOS PESOS M/CTE"],
    [100000, "CIEN MIL PESOS M/CTE"],
    [150000, "CIENTO CINCUENTA MIL PESOS M/CTE"],
    [999999, "NOVECIENTOS NOVENTA Y NUEVE MIL NOVECIENTOS NOVENTA Y NUEVE PESOS M/CTE"],
    [1000000, "UN MILLÓN DE PESOS M/CTE"],
    [2000000, "DOS MILLONES DE PESOS M/CTE"],
    [1500000, "UN MILLÓN QUINIENTOS MIL PESOS M/CTE"],
    [1000001, "UN MILLÓN UN PESOS M/CTE"],
    [21000000, "VEINTIÚN MILLONES DE PESOS M/CTE"],
    [12219100, "DOCE MILLONES DOSCIENTOS DIECINUEVE MIL CIEN PESOS M/CTE"],
    [14419100, "CATORCE MILLONES CUATROCIENTOS DIECINUEVE MIL CIEN PESOS M/CTE"],
  ])("%i → %s", (n, words) => {
    expect(numeroALetras(n)).toBe(words);
  });

  it("drops cents (pesos have no fractional part on these documents)", () => {
    expect(numeroALetras(1500.99)).toBe("UN MIL QUINIENTOS PESOS M/CTE");
  });

  it("never leaves double spaces", () => {
    for (const n of [1000, 1000000, 2001000, 300000]) expect(numeroALetras(n)).not.toMatch(/\s{2,}/);
  });
});

describe("formatCOP", () => {
  it("formats pesos without decimals", () => {
    expect(formatCOP(1234567).replace(/\s/g, " ")).toBe("$ 1.234.567");
    expect(formatCOP(0).replace(/\s/g, " ")).toBe("$ 0");
  });
});

describe("formatDateSpanish", () => {
  it("keeps the calendar day of a YYYY-MM-DD date (no UTC shift)", () => {
    expect(formatDateSpanish("2026-10-01")).toBe("1 de octubre de 2026");
    expect(formatDateSpanish("2026-10-01T23:30:00Z")).toBe("1 de octubre de 2026");
  });

  it("returns an empty string for missing dates", () => {
    expect(formatDateSpanish(null)).toBe("");
    expect(formatDateSpanish("")).toBe("");
  });
});

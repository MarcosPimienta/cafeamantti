import { describe, it, expect } from "vitest";
import { SELECTABLE_EXIT_KINDS, exitCostCategory, exitCostLine, guessExitKind, isExitKind, looksLikeSale } from "../exitKind";
import { expenseGroup } from "@/utils/cashflow/incomeStatement";

describe("guessExitKind", () => {
  it("reads the kind from real reasons", () => {
    expect(guessExitKind("Muestra Alcaldia Medellin Laura")).toBe("muestra");
    expect(guessExitKind("Muestras para feria")).toBe("muestra");
    expect(guessExitKind("Regalo Villagrande Profitness")).toBe("regalo");
    expect(guessExitKind("Cortesía cliente")).toBe("regalo");
    expect(guessExitKind("Bolsa dañada")).toBe("perdida");
    expect(guessExitKind("Bolsa rota en el envío")).toBe("perdida");
    expect(guessExitKind("Venta Sebastian Fernandez Cartagena")).toBe("venta");
    expect(guessExitKind("Venta en Feria")).toBe("venta");
    expect(guessExitKind("Ajuste conteo físico")).toBe("ajuste");
    expect(guessExitKind("Consumo interno oficina")).toBe("consumo_interno");
    expect(guessExitKind("Consumo administración")).toBe("consumo_interno");
  });

  it("leaves what it can't tell unclassified", () => {
    expect(guessExitKind(null)).toBeNull();
    expect(guessExitKind("")).toBeNull();
    expect(guessExitKind("reempaque 11:11")).toBeNull();
    expect(guessExitKind("Juan Isaza")).toBeNull();
  });

  it("an order's salida is always a sale", () => {
    expect(guessExitKind(null, "order-1")).toBe("venta");
    expect(guessExitKind("Muestra", "order-1")).toBe("venta");
  });
});

describe("where each kind's cost goes", () => {
  it("samples and gifts are selling, team coffee is admin, the rest is cost", () => {
    expect(exitCostLine("venta")).toBe("cost");
    expect(exitCostLine("perdida")).toBe("cost");
    expect(exitCostLine("ajuste")).toBe("cost");
    expect(exitCostLine(null)).toBe("cost");
    expect(exitCostLine("muestra")).toBe("selling");
    expect(exitCostLine("regalo")).toBe("selling");
    expect(exitCostLine("consumo_interno")).toBe("admin");
  });

  it("the statement groups their categories the same way", () => {
    expect(expenseGroup(exitCostCategory("muestra"))).toBe("selling");
    expect(expenseGroup(exitCostCategory("regalo"))).toBe("selling");
    expect(expenseGroup(exitCostCategory("consumo_interno"))).toBe("admin");
  });

  it("a sale is never picked in the salida form", () => {
    expect(SELECTABLE_EXIT_KINDS).not.toContain("venta");
    expect(looksLikeSale("Venta Juan Isaza")).toBe(true);
    expect(looksLikeSale("Le vendimos 2 bolsas")).toBe(true);
    expect(looksLikeSale("Muestra Alcaldía")).toBe(false);
  });

  it("knows its kinds", () => {
    expect(isExitKind("muestra")).toBe(true);
    expect(isExitKind("otro")).toBe(false);
  });
});

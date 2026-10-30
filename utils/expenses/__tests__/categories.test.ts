import { describe, it, expect } from "vitest";
import { BUILT_IN_CATEGORIES, categoryMonths, categoryProblems, categoryTypes, mergeCategories, namesOf } from "../categories";

const row = (name: string, expense_type = "OPEX", patch: Partial<{ id: string; depreciation_months: number | null; active: boolean }> = {}) => ({
  id: name, name, expense_type, depreciation_months: null, active: true, ...patch,
});

describe("expense categories", () => {
  it("the team's come after the built-in ones, alphabetically; inactive ones only when asked", () => {
    const list = mergeCategories([row("Publicidad"), row("Eventos", "OPEX", { active: false }), row("Bodega", "CAPEX", { depreciation_months: 240 })]);
    expect(list.slice(0, BUILT_IN_CATEGORIES.length)).toEqual(BUILT_IN_CATEGORIES);
    expect(list.slice(BUILT_IN_CATEGORIES.length).map((c) => c.name)).toEqual(["Bodega", "Publicidad"]);
    expect(mergeCategories([row("Eventos", "OPEX", { active: false })], { includeInactive: true }).at(-1)).toMatchObject({ name: "Eventos", active: false, builtIn: false });
  });

  it("a row can't shadow a built-in category or carry an unknown type", () => {
    const list = mergeCategories([row("diversos (aseo, papelería, caja menor)", "CAPEX"), row("Raro", "ANTICIPO")]);
    expect(list).toHaveLength(BUILT_IN_CATEGORIES.length);
  });

  it("types, suggested useful life and the names a form offers", () => {
    const list = mergeCategories([row("Bodega", "CAPEX", { depreciation_months: 240 }), row("Eventos", "COGS", { active: false })], { includeInactive: true });
    expect(categoryTypes(list)).toMatchObject({ Bodega: "CAPEX", Eventos: "COGS", "Gastos de Viaje y Transporte": "OPEX" });
    expect(categoryMonths(list)).toMatchObject({ Bodega: 240, "Maquinaria y Equipo (PUC 1520)": 120 });
    expect(namesOf(list)).not.toContain("Eventos");
    expect(namesOf(list, (c) => c.type === "CAPEX")).toContain("Bodega");
  });

  it("a balance movement (paying the DIAN) is a type of its own, with a liability account", () => {
    expect(categoryProblems({ name: "Pago de autorretención a la DIAN", type: "BALANCE", account: "23657501" })).toEqual([]);
    const list = mergeCategories([row("Pago de autorretención a la DIAN", "BALANCE")]);
    expect(categoryTypes(list)["Pago de autorretención a la DIAN"]).toBe("BALANCE");
    expect(namesOf(list, (c) => c.type !== "BALANCE")).not.toContain("Pago de autorretención a la DIAN");
  });

  it("checks name, type, useful life and account", () => {
    expect(categoryProblems({ name: "Publicidad y Mercadeo", type: "OPEX", account: "52352501" })).toEqual([]);
    expect(categoryProblems({ name: "ab", type: "" })).toEqual(["Escribe el nombre de la categoría (mínimo 3 letras).", "Elige el tipo de la categoría."]);
    expect(categoryProblems({ name: "Gastos de viaje y transporte", type: "OPEX" })).toEqual(['Ya existe una categoría "Gastos de viaje y transporte".']);
    expect(categoryProblems({ name: "Anticipos a proveedores", type: "OPEX" })).toEqual(['Ya existe una categoría "Anticipos a proveedores".']);
    expect(categoryProblems({ name: "Publicidad", type: "OPEX" }, ["publicidad"])).toEqual(['Ya existe una categoría "Publicidad".']);
    expect(categoryProblems({ name: "Bodega", type: "CAPEX", months: null, account: "15x" })).toEqual([
      "Indica la vida útil sugerida en meses.",
      "La cuenta contable debe ser un código PUC de 4 a 10 dígitos.",
    ]);
  });
});

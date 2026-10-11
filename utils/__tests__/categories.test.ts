import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CATEGORY_IDS, CATEGORY_LABELS, ENTRY_TYPES, entryTypeFor, isInventoryCategory, categoryInfo, tracksStock } from "../inventory/categories";

describe("inventory categories", () => {
  it("includes enseres for furniture and coffee makers", () => {
    expect(CATEGORY_IDS).toEqual(["cafe", "empaque", "accesorio", "equipo", "enseres", "repuesto", "servicio"]);
    expect(CATEGORY_LABELS.enseres).toBe("Enseres");
    expect(categoryInfo("enseres")).toMatchObject({ prefix: "ENS-", sellable: false });
  });

  it("services are sold without stock; parts are stocked and sold", () => {
    expect(categoryInfo("servicio")).toMatchObject({ prefix: "SRV-", sellable: true });
    expect(categoryInfo("repuesto")).toMatchObject({ prefix: "REP-", sellable: true });
    expect(tracksStock("servicio")).toBe(false);
    expect(tracksStock("repuesto")).toBe(true);
    expect(tracksStock("cafe")).toBe(true);
    expect(tracksStock(null)).toBe(true);
  });

  it("maps each category to its Entradas entry type", () => {
    expect(entryTypeFor("cafe")).toBe("MP");
    expect(entryTypeFor("empaque")).toBe("MAT");
    expect(entryTypeFor("accesorio")).toBe("MAT");
    expect(entryTypeFor("equipo")).toBe("EQP");
    expect(entryTypeFor("enseres")).toBe("ENS");
    expect(entryTypeFor("desconocida")).toBe("MAT");
  });

  it("validates ids", () => {
    expect(isInventoryCategory("enseres")).toBe(true);
    expect(isInventoryCategory("muebles")).toBe(false);
    expect(isInventoryCategory(null)).toBe(false);
  });

  it("the latest migration's CHECK lists exactly these categories", () => {
    const dir = path.join(__dirname, "../../supabase/migrations");
    const latest = fs
      .readdirSync(dir)
      .filter((f) => fs.readFileSync(path.join(dir, f), "utf8").includes("inventory_category_check"))
      .sort()
      .at(-1)!;
    const sql = fs.readFileSync(path.join(dir, latest), "utf8");
    const listed = [...sql.matchAll(/'(\w+)'/g)].map((m) => m[1]).filter((v) => v !== "inventory_category_check");
    expect(listed.sort()).toEqual([...CATEGORY_IDS].sort());
  });

  it("the latest migration's entry_type CHECK lists exactly these entry types", () => {
    const dir = path.join(__dirname, "../../supabase/migrations");
    const latest = fs
      .readdirSync(dir)
      .filter((f) => fs.readFileSync(path.join(dir, f), "utf8").includes("ADD CONSTRAINT inventory_movements_entry_type_check"))
      .sort()
      .at(-1)!;
    const sql = fs.readFileSync(path.join(dir, latest), "utf8");
    const check = sql.slice(sql.indexOf("ADD CONSTRAINT inventory_movements_entry_type_check"));
    const listed = [...check.matchAll(/'(\w+)'/g)].map((m) => m[1]);
    expect(listed.sort()).toEqual([...ENTRY_TYPES].sort());
  });
});

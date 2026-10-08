import { describe, it, expect } from "vitest";
import { canApply, assertCanApply, statusAfter, daysSince, summarizeUnits, kgByClient, commitmentProgress } from "../comodato";

describe("comodato state machine", () => {
  it.each([
    ["asignar", "disponible", true],
    ["asignar", "en_comodato", false], // already lent
    ["asignar", "mantenimiento", false],
    ["devolver", "en_comodato", true],
    ["devolver", "disponible", false],
    ["mantenimiento", "disponible", true],
    ["mantenimiento", "en_comodato", false], // must be returned first
    ["disponible", "mantenimiento", true],
    ["baja", "disponible", true],
    ["baja", "mantenimiento", true],
    ["baja", "en_comodato", false], // a client still has it
    ["asignar", "baja", false],
  ] as const)("%s from %s → %s", (action, from, ok) => {
    expect(canApply(action, from)).toBe(ok);
  });

  it("explains why an action is refused", () => {
    expect(() => assertCanApply("baja", "en_comodato")).toThrow(/primero debe estar devuelta/);
    expect(() => assertCanApply("asignar", "en_comodato")).toThrow(/disponible/);
  });

  it("knows where each action leaves the unit", () => {
    expect(statusAfter("asignar")).toBe("en_comodato");
    expect(statusAfter("devolver")).toBe("disponible");
    expect(statusAfter("devolver", "mantenimiento")).toBe("mantenimiento");
    expect(statusAfter("baja")).toBe("baja");
  });
});

describe("helpers", () => {
  it("counts days in comodato", () => {
    expect(daysSince("2026-09-01", "2026-10-01")).toBe(30);
    expect(daysSince("2026-10-05", "2026-10-01")).toBe(0);
  });

  it("summarizes the fleet; retired units are not active", () => {
    expect(summarizeUnits([{ status: "disponible" }, { status: "en_comodato" }, { status: "en_comodato" }, { status: "baja" }])).toEqual({
      disponible: 1,
      en_comodato: 2,
      mantenimiento: 0,
      baja: 1,
      activos: 3,
    });
  });

  it("adds up the kilos each client bought", () => {
    expect(
      kgByClient([
        { client_id: "okus", product_code: "CAFT-2K5", quantity: 2 },
        { client_id: "okus", product_code: "CAFT-250G", quantity: 4 },
        { client_id: "niku", product_code: "CAFC-340ML", quantity: 10 }, // not roasted coffee
        { client_id: null, product_code: "CAFT-2K5", quantity: 1 },
      ])
    ).toEqual({ okus: 6 });
  });

  it("measures the commitment met", () => {
    expect(commitmentProgress(6, 8)).toBe(0.75);
    expect(commitmentProgress(6, 0)).toBeNull();
    expect(commitmentProgress(6, null)).toBeNull();
  });
});

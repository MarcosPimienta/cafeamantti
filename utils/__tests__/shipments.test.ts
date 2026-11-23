import { describe, it, expect } from "vitest";
import { cleanTracking, datesFor, defaultScope, isLate, statusOptions, summarize, trackingUrl } from "../shipments";

describe("carriers", () => {
  it("Servientrega and Coordinadora are national, DHL and FedEx international", () => {
    expect(defaultScope("servientrega")).toBe("nacional");
    expect(defaultScope("coordinadora")).toBe("nacional");
    expect(defaultScope("dhl")).toBe("internacional");
    expect(defaultScope("fedex")).toBe("internacional");
  });

  it("builds the tracking link with the guía, without spaces or dashes", () => {
    expect(trackingUrl("fedex", "7712 3456-7890")).toBe("https://www.fedex.com/fedextrack/?trknbr=771234567890");
    expect(trackingUrl("dhl", "1234567890")).toContain("tracking-id=1234567890");
    expect(trackingUrl("servientrega", "2093")).toContain("Guia=2093");
    expect(trackingUrl("coordinadora", "555")).toContain("guia=555");
  });

  it("has no link without a guía or for 'otro'", () => {
    expect(trackingUrl("dhl", "")).toBeNull();
    expect(trackingUrl("dhl", null)).toBeNull();
    expect(trackingUrl("otro", "123")).toBeNull();
  });

  it("stores guías clean and upper-case", () => {
    expect(cleanTracking(" jd01 4600-0067 ")).toBe("JD0146000067");
    expect(cleanTracking("  ")).toBeNull();
  });

  it("offers aduana only for international shipments", () => {
    expect(statusOptions("nacional")).not.toContain("en_aduana");
    expect(statusOptions("internacional")).toContain("en_aduana");
  });
});

describe("status rules", () => {
  it("is late when still open past the estimated date", () => {
    expect(isLate({ status: "en_transito", estimated_date: "2026-11-20" }, "2026-11-21")).toBe(true);
    expect(isLate({ status: "en_transito", estimated_date: "2026-11-21" }, "2026-11-21")).toBe(false);
    expect(isLate({ status: "entregado", estimated_date: "2026-11-01" }, "2026-11-21")).toBe(false);
    expect(isLate({ status: "en_transito", estimated_date: null }, "2026-11-21")).toBe(false);
  });

  it("shipping sets the ship date once; delivering sets the delivery date; reopening clears it", () => {
    expect(datesFor("en_transito", "2026-11-10", { ship_date: null, delivered_date: null })).toEqual({ ship_date: "2026-11-10" });
    expect(datesFor("en_transito", "2026-11-12", { ship_date: "2026-11-10", delivered_date: null })).toEqual({});
    expect(datesFor("entregado", "2026-11-13", { ship_date: "2026-11-10", delivered_date: null })).toEqual({ delivered_date: "2026-11-13" });
    expect(datesFor("novedad", "2026-11-14", { ship_date: "2026-11-10", delivered_date: "2026-11-13" })).toEqual({ delivered_date: null });
    expect(datesFor("cancelado", "2026-11-10", { ship_date: null, delivered_date: null })).toEqual({});
  });
});

describe("summary", () => {
  const base = { scope: "nacional" as const, estimated_date: null, delivered_date: null, ship_date: "2026-11-05", cost: null, currency: "COP", paid_by: "nosotros" };
  it("counts open, issues, late, delivered this month and our freight by currency", () => {
    const s = summarize(
      [
        { ...base, status: "en_transito", estimated_date: "2026-11-10", cost: 18000 },
        { ...base, status: "novedad", cost: 12000, paid_by: "cliente" },
        { ...base, status: "en_aduana", scope: "internacional", cost: 85, currency: "USD" },
        { ...base, status: "entregado", ship_date: "2026-11-02", delivered_date: "2026-11-05", cost: 20000 },
        { ...base, status: "entregado", ship_date: "2026-10-20", delivered_date: "2026-10-22", cost: 50000 },
        { ...base, status: "cancelado", cost: 99999 },
      ],
      "2026-11-21"
    );
    expect(s).toMatchObject({ abiertos: 3, nacionales: 2, internacionales: 1, novedades: 1, atrasados: 1, entregadosMes: 1, diasPromedio: 3 });
    expect(s.costoMes).toEqual({ COP: 38000, USD: 85 });
  });
});

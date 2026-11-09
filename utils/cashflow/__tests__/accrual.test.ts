import { describe, it, expect } from "vitest";
import { costOfSalidas, dropVoided, lineBase, linesBase, siigoDocBase, unexplainedSale } from "../accrual";

describe("sales before IVA", () => {
  it("takes the IVA out of IVA-inclusive lines and leaves before-IVA ones", () => {
    expect(lineBase({ quantity: 1, unit_price: 157500, tax_rate: 5 })).toBe(150000);
    expect(lineBase({ quantity: 2, unit_price: 150000, tax_rate: 5, tax_included: false })).toBe(300000);
    expect(lineBase({ quantity: 1, unit_price: 27000, tax_rate: 0 })).toBe(27000);
    expect(linesBase([{ quantity: 1, unit_price: 157500, tax_rate: 5 }], 10000)).toBe(160000);
  });

  it("a manual income counts once, without what pays app invoices and without its IVA", () => {
    expect(unexplainedSale({ amount: 444000, tax: 0 }, 0)).toBe(444000);
    expect(unexplainedSale({ amount: 352250, tax: 0 }, 200000)).toBe(152250);
    expect(unexplainedSale({ amount: 200000, tax: 0 }, 200000)).toBe(0);
    expect(unexplainedSale({ amount: 105000, tax: 5000 }, 0)).toBe(100000);
  });
});

describe("cost of the coffee that left", () => {
  it("units × unit cost per product; products without a cost are listed apart", () => {
    const costs = new Map([
      ["bolsa25", { name: "Café Tostado 2.5kg", unit: "unidad", cost: 112700 }],
      ["chiroso", { name: "Café Tostado Chiroso 250g", unit: "unidad", cost: null }],
    ]);
    const { items, missing } = costOfSalidas([
      { date: "2026-10-16", inventory_id: "bolsa25", quantity: -1, reason: "Orden" },
      { date: "2026-10-20", inventory_id: "bolsa25", quantity: -2, reason: "Orden" },
      { date: "2026-10-20", inventory_id: "chiroso", quantity: -2, reason: "Venta" },
    ], costs);
    expect(items).toEqual([expect.objectContaining({ amount: 338100, concept: expect.stringContaining("Café Tostado 2.5kg") })]);
    expect(missing).toEqual([{ name: "Café Tostado Chiroso 250g", quantity: 2 }]);
  });
});

describe("sales as Siigo counts them", () => {
  it("an invoice is worth its items before IVA; an annulled one, nothing", () => {
    expect(siigoDocBase({ items: [{ quantity: 1, price: 150000 }, { quantity: 2, price: 140000 }] })).toBe(430000);
    expect(siigoDocBase({ annulled: true, items: [{ quantity: 1, price: 150000 }] })).toBe(0);
  });

  it("October 2026: invoices less credit notes give Siigo's $15.263.325", () => {
    // The two invoices typed with 5.000 kg ($280M each before IVA) and the notes that voided them cancel out.
    const invoices = 578_343_386;
    const notes = [560_000, 290_000, 802_286, 280_000_000, 280_000_000, 1_427_775].reduce((a, b) => a + b, 0);
    expect(invoices - notes).toBe(15_263_325);
  });
});

describe("an invoice voided by a credit note is not a sale", () => {
  const doc = (name: string, value: number, invoice?: string) => ({ name, date: "2026-10-22", items: [{ quantity: 1, price: value }], ...(invoice ? { invoice: { name: invoice } } : {}) });

  it("FV-2-738 typed with 5.000 kg and voided with NC-2-42: both leave; the real sales stay", () => {
    const { invoices, notes } = dropVoided(
      [doc("FV-2-738", 280_000_000), doc("FV-2-739", 280_000_000), doc("FV-2-743", 150_000)],
      [doc("NC-2-42", 280_000_000, "FV-2-738"), doc("NC-2-43", 280_000_000, "FV-2-739")]
    );
    expect(invoices.map((i) => i.name)).toEqual(["FV-2-743"]);
    expect(notes).toEqual([]);
  });

  it("a note for part of an invoice, or for an invoice of another month, stays as a deduction", () => {
    const { invoices, notes } = dropVoided(
      [doc("FV-2-750", 450_000)],
      [doc("NC-2-50", 150_000, "FV-2-750"), doc("NC-2-51", 620_000, "FV-2-689")]
    );
    expect(invoices.map((i) => i.name)).toEqual(["FV-2-750"]);
    expect(notes.map((n) => n.name)).toEqual(["NC-2-50", "NC-2-51"]);
  });
});


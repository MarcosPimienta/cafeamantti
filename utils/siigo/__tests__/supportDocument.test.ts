import { describe, it, expect } from "vitest";
import { buildSupplierPayload, buildSupportDocumentPayload, type SiigoSettings } from "../mapping";

const SETTINGS = {
  support_document_id: 25846, support_payment_id: 4183, support_assumed_account: "53152002", stamp_dian: true,
  expense_accounts: { "Mantenimiento y Reparaciones": "52451501", "Gastos de Viaje y Transporte": "51355001" }, fixed_asset_codes: {}, support_retentions: {},
} as SiigoSettings;
const RETE6 = { id: 9758, name: "Retefuente 6%", percentage: 6 };
const cc = (total: number, extra: object = {}) => ({
  number: 40, issuer_name: "Juan Técnico", issuer_document: "71709773", concept: "Mantenimiento general de máquina espresso", signed_at: "2026-07-06T15:00:00Z",
  items: [{ description: "Mantenimiento general", quantity: 1, unit_price: total, total_price: total }], ...extra,
});

describe("support document for a signed cuenta de cobro", () => {
  it("withholds Retefuente on the line and owes the rest, like DS-1-40", () => {
    const { payload, problems, totals } = buildSupportDocumentPayload(cc(620000), { date: "2026-07-06", category: "Mantenimiento y Reparaciones", retention: RETE6, assumed: false }, SETTINGS);
    expect(problems).toEqual([]);
    expect(totals).toEqual({ gross: 620000, withheld: 37200, owed: 582800 });
    expect(payload).toMatchObject({
      document: { id: 25846 }, date: "2026-07-06", supplier: { identification: "71709773" },
      supplier_receipt_number: { prefix: "CC", number: "40" }, stamp: { send: true },
      items: [{ type: "Account", code: "52451501", quantity: 1, price: 620000, taxes: [{ id: 9758 }] }],
      payments: [{ id: 4183, value: 582800, due_date: "2026-07-06" }],
    });
    expect(payload.observations).toBe("Cuenta de cobro No. 40 firmada el 2026-07-06 · Mantenimiento general de máquina espresso");
  });

  it("an assumed withholding adds its expense line and the supplier gets everything, like DS-1-35", () => {
    const { payload, totals } = buildSupportDocumentPayload(cc(299000), { date: "2025-06-01", category: "Gastos de Viaje y Transporte", retention: RETE6, assumed: true }, SETTINGS);
    expect(totals).toEqual({ gross: 299000, withheld: 17940, owed: 299000 });
    expect(payload.items[1]).toEqual({ type: "Account", code: "53152002", description: "Retefuente 6% asumida", quantity: 1, price: 17940 });
    expect(payload.payments[0].value).toBe(299000);
  });

  it("without retention the line has no taxes", () => {
    const { payload, totals } = buildSupportDocumentPayload(cc(60000), { date: "2026-07-07", category: "Gastos de Viaje y Transporte", retention: null, assumed: false }, SETTINGS);
    expect(payload.items[0]).not.toHaveProperty("taxes");
    expect(totals.owed).toBe(60000);
  });

  it("explains what is missing before sending", () => {
    const { problems } = buildSupportDocumentPayload(cc(1000, { issuer_document: "" }), { date: "", category: "Honorarios", retention: RETE6, assumed: true }, { expense_accounts: {}, fixed_asset_codes: {} });
    expect(problems).toEqual([
      "Elige el tipo de documento soporte en Ajustes → Siigo.",
      "Elige la forma de pago de los documentos soporte en Ajustes → Siigo.",
      "La cuenta de cobro no tiene la cédula o NIT del proveedor.",
      "Fecha del documento soporte inválida.",
      'Configura la cuenta contable para la categoría "Honorarios" en Ajustes → Siigo.',
      "Configura la cuenta de la retención asumida en Ajustes → Siigo.",
    ]);
  });

  it("creates the supplier as a Siigo Supplier", () => {
    const { payload, problems } = buildSupplierPayload({ name: "Juan Técnico", document_number: "71709773", address: "Cra 1 #2-3", city_code: "05001" });
    expect(problems).toEqual([]);
    expect(payload).toMatchObject({ type: "Supplier", person_type: "Person", id_type: "13", identification: "71709773" });
  });
});

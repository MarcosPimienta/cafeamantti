import { describe, it, expect } from "vitest";
import {
  buildCustomerPayload,
  buildInvoicePayload,
  buildProductPayload,
  buildPurchasePayload,
  cleanIdentification,
  compareProducts,
  normalizeSiigoSettings,
  siigoInvoicesToRows,
  API_ROW_MAPPING,
  type SiigoSettings,
} from "../mapping";
import { processSiigoRows } from "../parser";
import { daneCodeFor } from "../daneCities";

const settings: SiigoSettings = normalizeSiigoSettings({
  invoice_document_id: 24446, seller_id: 629, payment_web_id: 5636, payment_cash_id: 5637, payment_transfer_id: 5638,
  sales_tax_id: 13156, shipping_product_code: "ENVIO", product_account_group_id: 1253,
  purchase_document_id: 25000, purchase_payment_id: 7000,
  expense_accounts: { "Servicios Públicos (Agua, luz, internet)": "51353501" },
  fixed_asset_codes: { "Maquinaria y Equipo (PUC 1520)": "AF-0001" },
});

describe("identifications", () => {
  it("digits only; NIT check digit apart", () => {
    expect(cleanIdentification("901.752.308-8")).toEqual({ identification: "901752308", checkDigit: "8" });
    expect(cleanIdentification(" 1.036.123.456 ")).toEqual({ identification: "1036123456", checkDigit: null });
    expect(cleanIdentification(null).identification).toBe("");
  });
});

describe("customers", () => {
  it("a person with cédula", () => {
    const { payload, problems } = buildCustomerPayload({ id: "c1", name: "Ana María Gómez Ruiz", document_type: "CC", document_number: "1036123456", email: "ana@x.co", phone: "+57 300 123 4567", address: "Cra 43A #1-50", city_code: "05001" });
    expect(problems).toEqual([]);
    expect(payload).toMatchObject({
      person_type: "Person", id_type: "13", identification: "1036123456", name: ["Ana", "María Gómez Ruiz"],
      address: { address: "Cra 43A #1-50", city: { country_code: "Co", state_code: "05", city_code: "05001" } },
      phones: [{ number: "3001234567" }], contacts: [{ first_name: "Ana", last_name: "María Gómez Ruiz", email: "ana@x.co" }],
      fiscal_responsibilities: [{ code: "R-99-PN" }],
    });
  });

  it("a company with NIT and check digit", () => {
    const { payload } = buildCustomerPayload({ id: "c2", name: "Okus S.A.S.", document_type: "NIT", document_number: "900123456-7", address: "Calle 10", city_code: "05266" });
    expect(payload).toMatchObject({ person_type: "Company", id_type: "31", identification: "900123456", check_digit: "7", name: ["Okus S.A.S."] });
  });

  it("explains what is missing", () => {
    const { problems } = buildCustomerPayload({ id: "c3", name: "Sin datos" });
    expect(problems.join(" ")).toMatch(/cédula o NIT.*DANE.*dirección/);
  });
});

describe("sales invoice payload", () => {
  const order = { id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", total_amount: 78000, shipping_cost: 8000, payment_method: "web" as const };
  const items = [{ product_code: "CAFT-250", name: "Premium 250 g", quantity: 2, unit_price: 35000 }];

  it("today's date, the client's identification, IVA-included prices, shipping line and one payment for the total", () => {
    const { payload, problems } = buildInvoicePayload(order, items, "1036123456", settings, "2026-10-10");
    expect(problems).toEqual([]);
    expect(payload).toMatchObject({
      document: { id: 24446 }, date: "2026-10-10", customer: { identification: "1036123456", branch_office: 0 }, seller: 629,
      stamp: { send: false }, mail: { send: false },
      items: [
        { code: "CAFT-250", quantity: 2, taxed_price: 35000, taxes: [{ id: 13156 }] },
        { code: "ENVIO", description: "Envío", quantity: 1, price: 8000, taxes: [] },
      ],
      payments: [{ id: 5636, value: 78000, due_date: "2026-10-10" }],
    });
    expect(payload.observations).toContain("Pedido Café Amantti #3f2504e0");
  });

  it("the payment type follows how it was paid; products without IVA go as plain price", () => {
    const { payload } = buildInvoicePayload({ ...order, shipping_cost: 0, total_amount: 70000, payment_method: "cash" }, items, "1", { ...settings, sales_tax_id: null }, "2026-10-10");
    expect(payload.payments[0].id).toBe(5637);
    expect(payload.items[0]).toMatchObject({ price: 35000, taxes: [] });
  });

  it("lists every problem before anything is sent", () => {
    const { problems } = buildInvoicePayload(
      { ...order, total_amount: 99999 },
      [{ product_code: null, name: "Producto suelto", quantity: 1, unit_price: 70000 }],
      null,
      normalizeSiigoSettings({}),
      "2026-10-10"
    );
    const all = problems.join(" | ");
    expect(all).toMatch(/tipo de factura/);
    expect(all).toMatch(/vendedor/);
    expect(all).toMatch(/forma de pago/);
    expect(all).toMatch(/consumidor final/);
    expect(all).toMatch(/Producto suelto.*inventario/);
    expect(all).toMatch(/servicio de envío/);
    expect(all).toMatch(/no coincide con el total/);
  });

  it("DIAN and email only when turned on", () => {
    const { payload } = buildInvoicePayload(order, items, "1", { ...settings, stamp_dian: true, send_mail: true }, "2026-10-10");
    expect(payload).toMatchObject({ stamp: { send: true }, mail: { send: true } });
  });
});

describe("invoices pulled from Siigo go through the existing importer", () => {
  it("one row per line with client data, grouped back into orders", () => {
    const rows = siigoInvoicesToRows(
      [
        { id: "i1", name: "FV-1-101", date: "2026-10-02", customer: { identification: "900123456" }, observations: "Pedido mensual",
          items: [{ code: "CAFT-250", description: "Premium 250 g", quantity: 10, price: 29411.76, total: 350000 }, { code: "CAFT-500", description: "Premium 500 g", quantity: 2, total: 126000 }] },
      ],
      new Map([["900123456", { identification: "900123456", name: ["Okus S.A.S."], commercial_name: "Okus", address: { address: "Calle 10", city: { city_name: "Envigado" } }, phones: [{ number: "3001112233" }], contacts: [{ email: "compras@okus.co" }] }]])
    );
    expect(rows[0]).toMatchObject({ invoice_number: "FV-1-101", client_name: "Okus", client_email: "compras@okus.co", quantity: 10, unit_price: 35000, total_price: 350000 });
    const orders = processSiigoRows(rows, API_ROW_MAPPING, [{ id: "inv1", product_code: "CAFT-250", product_name: "Premium 250 g", category: "cafe", unit: "unidad", current_stock: 50 }], [], new Set());
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ invoice_number: "FV-1-101", total_amount: 476000, client_doc: "900123456" });
    expect(orders[0].items[0].matched_inventory_id).toBe("inv1");
  });
});

describe("products", () => {
  it("matches by code; sellable products missing in Siigo and Siigo-only products", () => {
    const cmp = compareProducts(
      [
        { id: "a", product_code: "CAFT-250", product_name: "Premium 250 g" },
        { id: "b", product_code: "caft-500", product_name: "Premium 500 g" },
        { id: "c", product_code: "EMP-BOLSA", product_name: "Bolsa", is_sellable: false },
        { id: "d", product_code: "HON-250", product_name: "Honey 250 g", is_sellable: true },
      ],
      [{ id: "s1", code: "CAFT-250", name: "Café 250" }, { id: "s2", code: "CAFT-500", name: "Café 500" }, { id: "s3", code: "MUG", name: "Mug" }, { id: "s4", code: "OLD", name: "Viejo", active: false }]
    );
    expect(cmp.linked.map((l) => l.siigo.id)).toEqual(["s1", "s2"]);
    expect(cmp.missingInSiigo.map((p) => p.id)).toEqual(["d"]);
    expect(cmp.missingInApp.map((p) => p.code)).toEqual(["MUG"]);
  });

  it("product payload with the inventory group and IVA", () => {
    const { payload, problems } = buildProductPayload({ id: "d", product_code: "HON-250", product_name: "Honey 250 g" }, settings, 48000);
    expect(problems).toEqual([]);
    expect(payload).toMatchObject({ code: "HON-250", account_group: 1253, tax_classification: "Taxed", tax_included: true, taxes: [{ id: 13156 }], prices: [{ price_list: [{ position: 1, value: 48000 }] }] });
    expect(buildProductPayload({ id: "x", product_code: "X", product_name: "X" }, normalizeSiigoSettings({})).problems.join()).toMatch(/grupo de inventario/);
  });
});

describe("purchases", () => {
  const supplier = { name: "EPM", document_number: "890904996-1" };
  const base = { id: "e1", concept: "Energía septiembre", category: "Servicios Públicos (Agua, luz, internet)", expense_type: "OPEX", amount: 250000, tax_amount: 0, net_amount: 250000, date: "2026-09-30" };

  it("an expense goes as an Account line with its category's account", () => {
    const { payload, problems } = buildPurchasePayload(base, supplier, settings);
    expect(problems).toEqual([]);
    expect(payload).toMatchObject({
      document: { id: 25000 }, date: "2026-09-30", supplier: { identification: "890904996", branch_office: 0 },
      items: [{ type: "Account", code: "51353501", quantity: 1, price: 250000 }],
      payments: [{ id: 7000, value: 250000, due_date: "2026-09-30" }],
    });
  });

  it("a fixed asset goes as a FixedAsset line with its class code", () => {
    const { payload, problems } = buildPurchasePayload({ ...base, category: "Maquinaria y Equipo (PUC 1520)", expense_type: "CAPEX", amount: 1340000, net_amount: 1340000 }, supplier, settings);
    expect(problems).toEqual([]);
    expect(payload.items[0]).toMatchObject({ type: "FixedAsset", code: "AF-0001", price: 1340000 });
  });

  it("explains missing supplier, account and unsupported IVA", () => {
    const all = buildPurchasePayload({ ...base, category: "Diversos (Aseo, papelería, caja menor)", tax_amount: 19000 }, null, settings).problems.join(" | ");
    expect(all).toMatch(/proveedor/);
    expect(all).toMatch(/cuenta contable.*Diversos/);
    expect(all).toMatch(/IVA/);
  });
});

describe("DANE codes", () => {
  it("known cities, with or without accents and suffixes", () => {
    expect(daneCodeFor("Medellin")).toBe("05001");
    expect(daneCodeFor("Bogotá D.C.")).toBe("11001");
    expect(daneCodeFor("ITAGÜÍ")).toBe("05360");
    expect(daneCodeFor("Pueblo Rico")).toBeNull();
  });
});

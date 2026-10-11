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
  siigoCodeOf,
  suggestSiigoMatch,
  gramsInName,
  itemTaxId,
  suggestItemKind,
  inventoryRowFromSiigo,
  serviceTypeUpdate,
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

  it("warns about products not linked to Siigo before sending", () => {
    const { problems } = buildInvoicePayload({ ...order, shipping_cost: 0, total_amount: 70000 }, [{ ...items[0], linked: false }], "1", settings, "2026-10-10");
    expect(problems).toEqual([expect.stringMatching(/Premium 250 g.*CAFT-250.*no está vinculado a un producto de Siigo/)]);
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

describe("linking app products to Siigo's own codes", () => {
  const siigo = [
    { id: "s004", code: "004", name: "C.T - PREMIUM 250gr" },
    { id: "s0015", code: "0015", name: "C.T - TRADICIONAL  250 gr" },
    { id: "s0040", code: "0040", name: "HONEY 250gr" },
    { id: "s0039", code: "0039", name: "CHIROSO 250gr" },
    { id: "s0010", code: "0010", name: "C.T - PREMIUM 2500gr" },
    { id: "s0041", code: "0041", name: "CT - CAFE PREMIUM 1 KG" },
    { id: "s006", code: "006", name: "CAFE VERDE " },
    { id: "s0037", code: "0037", name: "Honey 50gr" },
  ];

  it("reads sizes in grams from both naming styles", () => {
    expect(gramsInName("Café Tostado 250g (Grano/Molido)")).toBe(250);
    expect(gramsInName("C.T - PREMIUM 2500gr")).toBe(2500);
    expect(gramsInName("Café Tostado 2.5kg")).toBe(2500);
    expect(gramsInName("Café Tostado Honey KG")).toBe(1000);
    expect(gramsInName("CT - CAFE PREMIUM 1 KG")).toBe(1000);
    expect(gramsInName("Cold Brew 340ml")).toBeNull();
  });

  it("suggests the Siigo product with the same profile and size, preferring 'premium'", () => {
    const s = (name: string) => suggestSiigoMatch({ product_name: name }, siigo)?.code ?? null;
    expect(s("Café Tostado 250g (Grano/Molido)")).toBe("004");
    expect(s("Café Tostado Honey 250g")).toBe("0040");
    expect(s("Café Tostado Chiroso 250g")).toBe("0039");
    expect(s("Café Tostado 2.5kg (Grano/Molido)")).toBe("0010");
    expect(s("Café Tostado KG")).toBe("0041");
    expect(s("Café Tostado Honey 500g")).toBeNull();
    expect(s("Cold Brew 340ml")).toBeNull();
  });

  it("the linked code is what invoices and comparisons use", () => {
    expect(siigoCodeOf({ product_code: "CAFT-HON-250G", siigo_code: "0040" })).toBe("0040");
    expect(siigoCodeOf({ product_code: "CAFT-HON-250G", siigo_code: null })).toBe("CAFT-HON-250G");
    const cmp = compareProducts([{ id: "a", product_code: "CAFT-HON-250G", product_name: "Honey 250", siigo_code: "0040" }], siigo);
    expect(cmp.linked.map((l) => l.siigo.code)).toEqual(["0040"]);
  });

  it("invoices pulled from Siigo match the app product by its linked code", () => {
    const rows = siigoInvoicesToRows([{ id: "i", name: "FV-2-9", customer: { identification: "1" }, items: [{ code: "0040", description: "HONEY 250gr", quantity: 1, total: 48000 }] }], new Map());
    const [order] = processSiigoRows(rows, API_ROW_MAPPING, [
      { id: "hon", product_code: "CAFT-HON-250G", siigo_code: "0040", product_name: "Café Tostado Honey 250g", category: "cafe", unit: "unidad", current_stock: 5 },
      { id: "trap", product_code: "X-0040", product_name: "Otra cosa", category: "cafe", unit: "unidad", current_stock: 5 },
    ], [], new Set());
    expect(order.items[0].matched_inventory_id).toBe("hon");
  });
});

describe("services, parts and IVA per product", () => {
  it("each item uses its own IVA, else the general one; 0 means without IVA", () => {
    expect(itemTaxId(undefined, settings)).toBe(13156);
    expect(itemTaxId(null, settings)).toBe(13156);
    expect(itemTaxId(9754, settings)).toBe(9754);
    expect(itemTaxId(0, settings)).toBeNull();
    const { payload } = buildInvoicePayload(
      { id: "o", total_amount: 335000, payment_method: "transfer" },
      [
        { product_code: "0040", name: "Honey 250", quantity: 1, unit_price: 48000 },
        { product_code: "0034", name: "Mantenimiento general", quantity: 1, unit_price: 250000, tax_id: 9754 },
        { product_code: "0027", name: "Empaques y duchetas", quantity: 1, unit_price: 37000, tax_id: 0 },
      ],
      "1",
      settings,
      "2026-10-11"
    );
    expect(payload.items).toEqual([
      expect.objectContaining({ code: "0040", taxed_price: 48000, taxes: [{ id: 13156 }] }),
      expect.objectContaining({ code: "0034", taxed_price: 250000, taxes: [{ id: 9754 }] }),
      expect.objectContaining({ code: "0027", price: 37000, taxes: [] }),
    ]);
  });

  it("a service is created in Siigo as type Service, with its own IVA", () => {
    const { payload } = buildProductPayload({ id: "s", product_code: "SRV-REV", product_name: "Revisión", category: "servicio", sales_tax_id: 9754 }, settings);
    expect(payload).toMatchObject({ type: "Service", stock_control: false, tax_classification: "Taxed", taxes: [{ id: 9754 }] });
    expect(buildProductPayload({ id: "p", product_code: "REP-X", product_name: "Filtro", category: "repuesto", sales_tax_id: 0 }, settings).payload).toMatchObject({ type: "Product", tax_classification: "Excluded" });
  });

  it("tells labor from parts by Siigo type or name", () => {
    expect(suggestItemKind({ name: "Mantenimiento general" })).toBe("servicio");
    expect(suggestItemKind({ name: "Reparación vávulas" })).toBe("servicio");
    expect(suggestItemKind({ name: "Cambio de empaques grupos" })).toBe("servicio");
    expect(suggestItemKind({ name: "Domicilio llanogrande", type: "Service" })).toBe("servicio");
    expect(suggestItemKind({ name: "Alquiler Termo 1.9LT" })).toBe("servicio");
    expect(suggestItemKind({ name: "Empaques y duchetas" })).toBe("repuesto");
    expect(suggestItemKind({ name: "Cepillo para limpieza de grupo" })).toBe("repuesto");
    expect(suggestItemKind({ name: "Manguera" })).toBe("repuesto");
  });

  it("an item brought from Siigo keeps its code as the link", () => {
    expect(inventoryRowFromSiigo({ id: "sid", code: "0034", name: "Mantenimiento  general " }, "servicio", 9754)).toEqual({
      product_code: "SRV-0034", product_name: "Mantenimiento general", category: "servicio", unit: "servicio", current_stock: 0, min_stock: 0,
      is_sellable: true, siigo_code: "0034", siigo_product_id: "sid", sales_tax_id: 9754,
    });
    expect(inventoryRowFromSiigo({ id: "x", code: "022", name: "Manguera" }, "repuesto", null)).toMatchObject({ product_code: "REP-022", category: "repuesto", unit: "unidad", sales_tax_id: null });
  });

  it("changing the type to Service sends back everything Siigo already has", () => {
    const body = serviceTypeUpdate({
      id: "sid", code: "0034", name: "Mantenimiento general", type: "Product", active: true, stock_control: true,
      account_group: { id: 929, name: "Productos" }, tax_classification: "Taxed", tax_included: false, taxes: [{ id: 9754 }],
      prices: [{ currency_code: "COP", price_list: [{ position: 1, value: 250000 }] }], unit: { code: "94" }, reference: "MT-1",
    });
    expect(body).toEqual({
      code: "0034", name: "Mantenimiento general", account_group: 929, type: "Service", stock_control: false, active: true,
      tax_classification: "Taxed", tax_included: false, taxes: [{ id: 9754 }],
      prices: [{ currency_code: "COP", price_list: [{ position: 1, value: 250000 }] }], unit: "94", reference: "MT-1",
    });
  });
});

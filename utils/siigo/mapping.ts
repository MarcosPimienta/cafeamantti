// Turns app records into Siigo payloads and Siigo documents into app rows.
// Pure functions: every rule here is unit-tested without calling Siigo.
// Each builder returns the payload plus the problems that would make Siigo
// reject it, so the app can explain what to fix *before* sending (Siigo
// blocks API users whose requests are mostly errors).

import type { RawSiigoRow, ColumnMapping } from "./types";

// ── Settings chosen in Ajustes → Siigo ──────────────────────

export type SiigoSettings = {
  /** Sales invoice document type (GET /v1/document-types?type=FV). */
  invoice_document_id?: number | null;
  /** Seller user (GET /v1/users). */
  seller_id?: number | null;
  /** Payment types (GET /v1/payment-types?document_type=FV) per way the app gets paid. */
  payment_web_id?: number | null;
  payment_cash_id?: number | null;
  payment_transfer_id?: number | null;
  /**
   * IVA tax applied to products (GET /v1/taxes); null = products without
   * IVA. App prices are final (IVA included), so they go as taxed_price and
   * the Siigo total equals the order total.
   */
  sales_tax_id?: number | null;
  /** Send the invoice to the DIAN (electronic) and email it to the client. */
  stamp_dian?: boolean;
  send_mail?: boolean;
  /** Siigo product/service code charged for shipping. */
  shipping_product_code?: string | null;
  /** Identification used when the order has no client (DIAN: 222222222222). */
  final_consumer_identification?: string | null;
  /** Inventory group for products created from the app (GET /v1/account-groups). */
  product_account_group_id?: number | null;
  /** Purchase invoice document type (GET /v1/document-types?type=FC). */
  purchase_document_id?: number | null;
  /** Payment type for purchases (GET /v1/payment-types?document_type=FC). */
  purchase_payment_id?: number | null;
  /** Ledger account (PUC code) per expense category, for purchases. */
  expense_accounts?: Record<string, string>;
  /** Fixed asset code in Siigo per asset class, for CAPEX purchases. */
  fixed_asset_codes?: Record<string, string>;
};

export const DEFAULT_SIIGO_SETTINGS: SiigoSettings = {
  stamp_dian: false,
  send_mail: false,
  final_consumer_identification: "222222222222",
  expense_accounts: {},
  fixed_asset_codes: {},
};

export function normalizeSiigoSettings(raw: unknown): SiigoSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as SiigoSettings;
  return { ...DEFAULT_SIIGO_SETTINGS, ...s, expense_accounts: { ...(s.expense_accounts ?? {}) }, fixed_asset_codes: { ...(s.fixed_asset_codes ?? {}) } };
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => Number(v ?? 0) || 0;
/** Identification as Siigo wants it: digits only (NIT without check digit). */
export function cleanIdentification(doc: string | null | undefined): { identification: string; checkDigit: string | null } {
  const raw = String(doc ?? "").trim();
  const [main, dv] = raw.split("-");
  return { identification: (main ?? "").replace(/\D/g, ""), checkDigit: dv && /^\d$/.test(dv.trim()) ? dv.trim() : null };
}

// ── Customers ───────────────────────────────────────────────

export type AppClient = {
  id: string;
  name: string;
  document_type?: string | null;
  document_number?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city_code?: string | null;
  siigo_customer_id?: string | null;
};

const isCompany = (c: AppClient) => /nit/i.test(c.document_type ?? "") || /-\d$/.test((c.document_number ?? "").trim());

/** POST /v1/customers body for a CRM client. */
export function buildCustomerPayload(c: AppClient) {
  const problems: string[] = [];
  const { identification, checkDigit } = cleanIdentification(c.document_number);
  if (!identification) problems.push(`${c.name}: falta la cédula o NIT.`);
  if (!c.city_code || !/^\d{5}$/.test(c.city_code)) problems.push(`${c.name}: falta el código DANE de la ciudad (5 dígitos, ej. 05001 Medellín).`);
  if (!c.address?.trim()) problems.push(`${c.name}: falta la dirección.`);

  const company = isCompany(c);
  const cleanName = c.name.replace(/[^\p{L}\p{N} .&-]/gu, "").trim().slice(0, 100);
  const [first, ...rest] = cleanName.split(/\s+/);
  const phone = (c.phone ?? "").replace(/\D/g, "").slice(-10);

  const payload = {
    type: "Customer",
    person_type: company ? "Company" : "Person",
    id_type: company ? "31" : "13",
    identification,
    ...(company && checkDigit ? { check_digit: checkDigit } : {}),
    name: company ? [cleanName] : [first ?? cleanName, rest.join(" ") || first || cleanName],
    branch_office: 0,
    active: true,
    vat_responsible: false,
    fiscal_responsibilities: [{ code: "R-99-PN" }],
    address: {
      address: (c.address ?? "").trim().slice(0, 256),
      city: { country_code: "Co", state_code: (c.city_code ?? "").slice(0, 2), city_code: c.city_code ?? "" },
    },
    phones: phone ? [{ number: phone }] : [],
    contacts: [
      {
        first_name: (company ? cleanName : first ?? cleanName).slice(0, 50),
        last_name: company ? "" : rest.join(" ").slice(0, 50),
        ...(c.email?.trim() ? { email: c.email.trim().slice(0, 100) } : {}),
      },
    ],
  };
  return { payload, problems };
}

// ── Sales invoices (app → Siigo) ────────────────────────────

export type AppOrderItem = { product_code: string | null; name: string; quantity: number; unit_price: number };
export type AppOrder = {
  id: string;
  total_amount: number;
  source?: string | null;
  shipping_cost?: number | null;
  notes?: string | null;
  /** How it was paid: web (ePayco), cash, transfer. */
  payment_method?: "web" | "cash" | "transfer";
};

/**
 * POST /v1/invoices body. `customerIdentification` is the client's
 * (already in Siigo) or the final-consumer one. Electronic invoices
 * cannot be dated before today, so the date is always `today`.
 */
export function buildInvoicePayload(order: AppOrder, items: AppOrderItem[], customerIdentification: string | null, settings: SiigoSettings, today: string) {
  const problems: string[] = [];
  if (!settings.invoice_document_id) problems.push("Elige el tipo de factura de venta en Ajustes → Siigo.");
  if (!settings.seller_id) problems.push("Elige el vendedor en Ajustes → Siigo.");
  const paymentId =
    order.payment_method === "cash" ? settings.payment_cash_id : order.payment_method === "transfer" ? settings.payment_transfer_id : settings.payment_web_id;
  if (!paymentId) problems.push("Elige la forma de pago para este tipo de venta en Ajustes → Siigo.");
  if (!customerIdentification) problems.push("El pedido no tiene cliente con identificación y no hay consumidor final configurado.");
  if (items.length === 0) problems.push("El pedido no tiene productos.");
  for (const it of items) {
    if (!it.product_code) problems.push(`"${it.name}" no está vinculado a un producto del inventario (se necesita su código en Siigo).`);
    if (!(it.quantity > 0)) problems.push(`"${it.name}": cantidad inválida.`);
  }
  const shipping = num(order.shipping_cost);
  if (shipping > 0 && !settings.shipping_product_code) problems.push("El pedido tiene envío: configura el código del servicio de envío en Ajustes → Siigo.");

  const priceField = settings.sales_tax_id ? "taxed_price" : "price";
  const taxes = settings.sales_tax_id ? [{ id: settings.sales_tax_id }] : [];
  const lines = [
    ...items.map((it) => ({ code: it.product_code ?? "", description: it.name.slice(0, 200), quantity: round2(it.quantity), [priceField]: round2(it.unit_price), taxes })),
    ...(shipping > 0 && settings.shipping_product_code
      ? [{ code: settings.shipping_product_code, description: "Envío", quantity: 1, price: round2(shipping), taxes: [] }]
      : []),
  ];
  const total = round2(items.reduce((s, it) => s + it.quantity * it.unit_price, 0) + shipping);
  if (Math.abs(total - num(order.total_amount)) > 1) {
    problems.push(`La suma de los productos (${total}) no coincide con el total del pedido (${num(order.total_amount)}).`);
  }

  const payload = {
    document: { id: settings.invoice_document_id ?? 0 },
    date: today,
    customer: { identification: customerIdentification ?? "", branch_office: 0 },
    seller: settings.seller_id ?? 0,
    stamp: { send: !!settings.stamp_dian },
    mail: { send: !!settings.send_mail },
    observations: [`Pedido Café Amantti #${order.id.split("-")[0]}`, order.notes ?? ""].filter(Boolean).join(" · ").slice(0, 4000),
    items: lines,
    // Prices include IVA (taxed_price), so the invoice total is the order total.
    payments: [{ id: paymentId ?? 0, value: total, due_date: today }],
  };
  return { payload, problems };
}

// ── Sales invoices (Siigo → app) ────────────────────────────

export type SiigoInvoice = {
  id: string;
  name?: string;
  date?: string;
  total?: number;
  observations?: string;
  customer?: { id?: string; identification?: string; branch_office?: number };
  items?: { code?: string; description?: string; quantity?: number; price?: number; total?: number }[];
};
export type SiigoCustomer = {
  id?: string;
  identification?: string;
  name?: string[];
  commercial_name?: string;
  address?: { address?: string; city?: { city_name?: string; city_code?: string } };
  phones?: { number?: string }[];
  contacts?: { email?: string }[];
};

/** Column mapping for rows produced by `siigoInvoicesToRows` (feeds the existing importer). */
export const API_ROW_MAPPING: ColumnMapping = {
  invoice_number: "invoice_number",
  date: "date",
  client_doc: "client_doc",
  client_name: "client_name",
  client_email: "client_email",
  client_phone: "client_phone",
  client_city: "client_city",
  client_address: "client_address",
  product_code: "product_code",
  product_name: "product_name",
  quantity: "quantity",
  unit_price: "unit_price",
  total_price: "total_price",
  notes: "notes",
};

/**
 * One row per invoice line, like a Siigo sales report, so invoices pulled
 * from the API go through the same preview, matching and import as files.
 * Line totals come from Siigo (taxes included).
 */
export function siigoInvoicesToRows(invoices: SiigoInvoice[], customers: Map<string, SiigoCustomer>): RawSiigoRow[] {
  const rows: RawSiigoRow[] = [];
  for (const inv of invoices) {
    const ident = inv.customer?.identification ?? "";
    const c = customers.get(ident);
    const name = c ? (c.commercial_name || (c.name ?? []).join(" ")).trim() : "";
    for (const it of inv.items ?? []) {
      const quantity = num(it.quantity) || 1;
      const total = num(it.total) || round2(num(it.price) * quantity);
      rows.push({
        invoice_number: inv.name ?? inv.id,
        date: inv.date ?? "",
        client_doc: ident,
        client_name: name || `Cliente ${ident}`,
        client_email: c?.contacts?.find((x) => x.email)?.email ?? "",
        client_phone: c?.phones?.find((x) => x.number)?.number ?? "",
        client_city: c?.address?.city?.city_name ?? "",
        client_address: c?.address?.address ?? "",
        product_code: it.code ?? "",
        product_name: it.description ?? it.code ?? "",
        quantity,
        unit_price: round2(total / quantity),
        total_price: total,
        notes: inv.observations ?? "",
      });
    }
  }
  return rows;
}

// ── Products ────────────────────────────────────────────────

export type AppProduct = {
  id: string;
  product_code: string;
  product_name: string;
  is_sellable?: boolean | null;
  siigo_product_id?: string | null;
  /** Code of the linked Siigo product; null = same as product_code. */
  siigo_code?: string | null;
};

/** Code this product has in Siigo. */
export const siigoCodeOf = (p: { product_code: string; siigo_code?: string | null }) => (p.siigo_code?.trim() || p.product_code).trim();
export type SiigoProduct = { id: string; code: string; name: string; active?: boolean; prices?: { price_list?: { position?: number; value?: number }[] }[] };

export type ProductComparison = {
  linked: { app: AppProduct; siigo: SiigoProduct }[];
  /** Sellable in the app, missing in Siigo: invoices for them would fail. */
  missingInSiigo: AppProduct[];
  /** In Siigo, missing in the app (pulled invoices would not match them). */
  missingInApp: SiigoProduct[];
};

const codeKey = (c: string) => c.trim().toUpperCase();

/** Matches products by their Siigo code (the linked one, else the app code). */
export function compareProducts(app: AppProduct[], siigo: SiigoProduct[]): ProductComparison {
  const byCode = new Map(siigo.map((p) => [codeKey(p.code), p]));
  const used = new Set<string>();
  const linked: ProductComparison["linked"] = [];
  const missingInSiigo: AppProduct[] = [];
  for (const a of app) {
    const s = byCode.get(codeKey(siigoCodeOf(a)));
    if (s) {
      linked.push({ app: a, siigo: s });
      used.add(s.id);
    } else if (a.is_sellable !== false) {
      missingInSiigo.push(a);
    }
  }
  return { linked, missingInSiigo, missingInApp: siigo.filter((s) => !used.has(s.id) && s.active !== false) };
}

/** POST /v1/products body for an app product. */
export function buildProductPayload(p: AppProduct, settings: SiigoSettings, price?: number | null) {
  const problems: string[] = [];
  if (!settings.product_account_group_id) problems.push("Elige el grupo de inventario para productos nuevos en Ajustes → Siigo.");
  const code = p.product_code.replace(/\s+/g, "");
  if (!code || code.length > 30) problems.push(`${p.product_name}: el código debe tener entre 1 y 30 caracteres sin espacios.`);
  const payload = {
    code,
    name: p.product_name.slice(0, 100),
    account_group: settings.product_account_group_id ?? 0,
    type: "Product",
    stock_control: false,
    active: true,
    tax_classification: settings.sales_tax_id ? "Taxed" : "Excluded",
    tax_included: !!settings.sales_tax_id,
    ...(settings.sales_tax_id ? { taxes: [{ id: settings.sales_tax_id }] } : {}),
    ...(price ? { prices: [{ currency_code: "COP", price_list: [{ position: 1, value: round2(price) }] }] } : {}),
  };
  return { payload, problems };
}

// ── Purchases (Flujo de Caja expense → Siigo) ───────────────

export type AppExpense = {
  id: string;
  concept: string;
  category: string;
  expense_type: string;
  amount: number;
  tax_amount: number;
  net_amount: number;
  date: string;
};
export type AppSupplier = { name: string; document_number: string | null };

/**
 * POST /v1/purchases body. A CAPEX expense goes as a FixedAsset item
 * (code by asset class), everything else as an Account item with the
 * ledger account set for its category. The IVA is sent as a value-based
 * line so the purchase total equals what was paid.
 */
export function buildPurchasePayload(e: AppExpense, supplier: AppSupplier | null, settings: SiigoSettings) {
  const problems: string[] = [];
  if (!settings.purchase_document_id) problems.push("Elige el tipo de factura de compra en Ajustes → Siigo.");
  if (!settings.purchase_payment_id) problems.push("Elige la forma de pago de compras en Ajustes → Siigo.");
  const { identification } = cleanIdentification(supplier?.document_number);
  if (!supplier) problems.push("Asigna el proveedor al gasto.");
  else if (!identification) problems.push(`El proveedor ${supplier.name} no tiene NIT o cédula.`);

  const capex = e.expense_type === "CAPEX";
  const code = capex ? settings.fixed_asset_codes?.[e.category] : settings.expense_accounts?.[e.category];
  if (!code) {
    problems.push(
      capex
        ? `Configura el código de activo fijo de Siigo para "${e.category}" en Ajustes → Siigo.`
        : `Configura la cuenta contable para la categoría "${e.category}" en Ajustes → Siigo.`
    );
  }
  if (num(e.tax_amount) > 0) problems.push("Gastos con IVA discriminado aún no se envían: Siigo calcula el IVA con su impuesto; regístralo en Siigo a mano.");

  const payload = {
    document: { id: settings.purchase_document_id ?? 0 },
    date: e.date,
    supplier: { identification, branch_office: 0 },
    observations: `${e.concept} · Flujo de Caja Café Amantti`.slice(0, 4000),
    items: [{ type: capex ? "FixedAsset" : "Account", code: code ?? "", description: e.concept.slice(0, 200), quantity: 1, price: round2(num(e.net_amount)) }],
    payments: [{ id: settings.purchase_payment_id ?? 0, value: round2(num(e.amount)), due_date: e.date }],
  };
  return { payload, problems };
}

// ── Suggested links (app product → Siigo product) ───────────

/** Grams in a product name: "250g", "250 gr", "2.5kg", "2500gr", "KG", "1 Kg". */
export function gramsInName(name: string): number | null {
  const n = name.toLowerCase().replace(",", ".");
  const kg = /(\d+(?:\.\d+)?)\s*kg\b/.exec(n);
  if (kg) return Math.round(Number(kg[1]) * 1000);
  const g = /(\d+(?:\.\d+)?)\s*(?:g|gr|grs|gramos)\b/.exec(n);
  if (g) return Math.round(Number(g[1]));
  if (/\bkg\b/.test(n)) return 1000;
  return null;
}

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Coffee profile in a name; the store's premium line is also sold as "tradicional". */
function profileInName(name: string): "honey" | "chiroso" | "gesha" | "premium" | null {
  const n = plain(name);
  if (/honey|miel/.test(n)) return "honey";
  if (/chiroso|microlote/.test(n)) return "chiroso";
  if (/gesha|geisha/.test(n)) return "gesha";
  if (/premium|tradicional|tostado|\bc\.?\s?t\b/.test(n)) return "premium";
  return null;
}

/**
 * The Siigo product an app coffee most likely is: same size and profile.
 * Among equals, a name that says "premium" wins, then the active one.
 * Only a suggestion: the admin confirms it in Ajustes → Siigo.
 */
export function suggestSiigoMatch(app: { product_name: string }, siigo: SiigoProduct[]): SiigoProduct | null {
  const grams = gramsInName(app.product_name);
  const profile = profileInName(app.product_name);
  if (!grams || !profile) return null;
  const candidates = siigo.filter(
    (s) => s.active !== false && gramsInName(s.name) === grams && profileInName(s.name) === profile && !/verde|soluble|instant|infusion/.test(plain(s.name))
  );
  candidates.sort((a, b) => Number(/premium/i.test(b.name)) - Number(/premium/i.test(a.name)));
  return candidates[0] ?? null;
}

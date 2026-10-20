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
  /** Payment type for credit sales: one with due date (GET /v1/payment-types?document_type=FV). */
  payment_credit_id?: number | null;
  /** Days a credit invoice is due in, by default. */
  credit_term_days?: number | null;
  /** Cash receipt document type for customer payments (GET /v1/document-types?type=RC). */
  voucher_document_id?: number | null;
  /** Payment types of cash receipts per way the customer pays (GET /v1/payment-types?document_type=RC). */
  voucher_cash_id?: number | null;
  voucher_transfer_id?: number | null;
  voucher_web_id?: number | null;
  /** IVA tax applied to products (GET /v1/taxes); null = products without IVA. */
  sales_tax_id?: number | null;
  /**
   * Prices of manual orders already include IVA (taxed_price). false = they
   * are before IVA and the invoice adds it on top. Web store orders always
   * include it: the customer paid that final price.
   */
  manual_prices_include_tax?: boolean;
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
  /** Payment receipt (recibo de pago/egreso) type for paying suppliers (GET /v1/document-types?type=RP). */
  payment_receipt_document_id?: number | null;
  /** Payment types money leaves by, for payment receipts (GET /v1/payment-types?document_type=FC). */
  payout_bank_id?: number | null;
  payout_cash_id?: number | null;
  /** Transactional ledger accounts in Siigo (from its trial balance), to choose from. */
  siigo_accounts?: { code: string; name: string }[];
  /** Credit note document type (GET /v1/document-types?type=NC). */
  credit_note_document_id?: number | null;
  /** Support document type for signed cuentas de cobro (GET /v1/document-types?type=DS). */
  support_document_id?: number | null;
  /** Payment type of support documents: owed to the supplier, with due date (GET /v1/payment-types?document_type=FC). */
  support_payment_id?: number | null;
  /** Retefuente tax id (GET /v1/taxes) per expense category, for support documents. */
  support_retentions?: Record<string, number>;
  /** Ledger account of a withholding the business assumes (e.g. 53152002 Otros impuestos asumidos). */
  support_assumed_account?: string | null;
};

export const DEFAULT_SIIGO_SETTINGS: SiigoSettings = {
  stamp_dian: false,
  send_mail: false,
  final_consumer_identification: "222222222222",
  expense_accounts: {},
  fixed_asset_codes: {},
  support_retentions: {},
};

export function normalizeSiigoSettings(raw: unknown): SiigoSettings {
  const s = (raw && typeof raw === "object" ? raw : {}) as SiigoSettings;
  return {
    ...DEFAULT_SIIGO_SETTINGS,
    ...s,
    expense_accounts: { ...(s.expense_accounts ?? {}) },
    fixed_asset_codes: { ...(s.fixed_asset_codes ?? {}) },
    support_retentions: { ...(s.support_retentions ?? {}) },
  };
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

export type AppOrderItem = {
  product_code: string | null;
  name: string;
  quantity: number;
  unit_price: number;
  /** Linked to a Siigo product (Ajustes → Siigo → Productos); false = Siigo would not know the code. */
  linked?: boolean;
  /** The product's own IVA (inventory.sales_tax_id): undefined/null = general one, 0 = none. */
  tax_id?: number | null;
  /** false = unit_price is before IVA and the IVA goes on top (needs tax_rate). Default: IVA included. */
  tax_included?: boolean;
  /** IVA percentage of the item's tax, for prices without IVA. */
  tax_rate?: number | null;
};

/**
 * What an invoice line charges with IVA: the price as is when it already
 * includes IVA, or plus its rate when the IVA goes on top.
 */
export function lineGross(it: { quantity: number; unit_price: number; tax_included?: boolean; tax_rate?: number | null }, taxed: boolean): number {
  const base = round2(num(it.quantity) * num(it.unit_price));
  if (!taxed || it.tax_included !== false) return base;
  return round2(base + (base * num(it.tax_rate)) / 100);
}

/** IVA tax id for an item: its own, else the general one; 0 means none. */
export const itemTaxId = (own: number | null | undefined, settings: SiigoSettings): number | null =>
  own === 0 ? null : own ?? settings.sales_tax_id ?? null;
export type AppOrder = {
  id: string;
  total_amount: number;
  source?: string | null;
  shipping_cost?: number | null;
  notes?: string | null;
  /** How it was paid: web (ePayco), cash, transfer; or credit (paid later). */
  payment_method?: "web" | "cash" | "transfer" | "credit";
  /** Credit sales: days until the invoice is due. */
  term_days?: number | null;
};

/** 'YYYY-MM-DD' plus `days`, without time zones. */
export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * POST /v1/invoices body. `customerIdentification` is the client's
 * (already in Siigo) or the final-consumer one. Electronic invoices
 * cannot be dated before today, so the date is always `today`.
 */
export function buildInvoicePayload(order: AppOrder, items: AppOrderItem[], customerIdentification: string | null, settings: SiigoSettings, today: string) {
  const problems: string[] = [];
  if (!settings.invoice_document_id) problems.push("Elige el tipo de factura de venta en Ajustes → Siigo.");
  if (!settings.seller_id) problems.push("Elige el vendedor en Ajustes → Siigo.");
  const credit = order.payment_method === "credit";
  const paymentId = credit
    ? settings.payment_credit_id
    : order.payment_method === "cash" ? settings.payment_cash_id : order.payment_method === "transfer" ? settings.payment_transfer_id : settings.payment_web_id;
  if (!paymentId) problems.push(credit ? "Elige la forma de pago a crédito en Ajustes → Siigo." : "Elige la forma de pago para este tipo de venta en Ajustes → Siigo.");
  const dueDate = credit ? addDays(today, Math.max(0, Math.round(num(order.term_days ?? settings.credit_term_days ?? 30)))) : today;
  if (!customerIdentification) problems.push("El pedido no tiene cliente con identificación y no hay consumidor final configurado.");
  if (items.length === 0) problems.push("El pedido no tiene productos.");
  for (const it of items) {
    if (it.tax_included === false && itemTaxId(it.tax_id, settings) && it.tax_rate == null) problems.push(`"${it.name}": no se conoce la tarifa de IVA para sumarla al precio.`);
    if (!it.product_code) problems.push(`"${it.name}" no está vinculado a un producto del inventario (se necesita su código en Siigo).`);
    else if (it.linked === false) problems.push(`"${it.name}" (${it.product_code}) no está vinculado a un producto de Siigo: vincúlalo o créalo en Ajustes → Siigo → Productos.`);
    if (!(it.quantity > 0)) problems.push(`"${it.name}": cantidad inválida.`);
  }
  const shipping = num(order.shipping_cost);
  if (shipping > 0 && !settings.shipping_product_code) problems.push("El pedido tiene envío: configura el código del servicio de envío en Ajustes → Siigo.");

  const lines = [
    // IVA included → taxed_price; IVA on top → price (Siigo adds the tax).
    ...items.map((it) => {
      const tax = itemTaxId(it.tax_id, settings);
      const field = tax && it.tax_included !== false ? "taxed_price" : "price";
      return { code: it.product_code ?? "", description: it.name.slice(0, 200), quantity: round2(it.quantity), [field]: round2(it.unit_price), taxes: tax ? [{ id: tax }] : [] };
    }),
    ...(shipping > 0 && settings.shipping_product_code
      ? [{ code: settings.shipping_product_code, description: "Envío", quantity: 1, price: round2(shipping), taxes: [] }]
      : []),
  ];
  const base = round2(items.reduce((s, it) => s + it.quantity * it.unit_price, 0) + shipping);
  if (Math.abs(base - num(order.total_amount)) > 1) {
    problems.push(`La suma de los productos (${base}) no coincide con el total del pedido (${num(order.total_amount)}).`);
  }
  // What the customer pays: with IVA on top where prices are before IVA.
  const total = round2(items.reduce((s, it) => s + lineGross(it, !!itemTaxId(it.tax_id, settings)), 0) + shipping);

  const payload = {
    document: { id: settings.invoice_document_id ?? 0 },
    date: today,
    customer: { identification: customerIdentification ?? "", branch_office: 0 },
    seller: settings.seller_id ?? 0,
    stamp: { send: !!settings.stamp_dian },
    mail: { send: !!settings.send_mail },
    observations: [`Pedido Café Amantti #${order.id.split("-")[0]}`, order.notes ?? ""].filter(Boolean).join(" · ").slice(0, 4000),
    items: lines,
    payments: [{ id: paymentId ?? 0, value: total, due_date: dueDate }],
  };
  return { payload, problems, total };
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
  category?: string | null;
  sales_tax_id?: number | null;
  is_sellable?: boolean | null;
  siigo_product_id?: string | null;
  /** Code of the linked Siigo product; null = same as product_code. */
  siigo_code?: string | null;
};

/** Code this product has in Siigo. */
export const siigoCodeOf = (p: { product_code: string; siigo_code?: string | null }) => (p.siigo_code?.trim() || p.product_code).trim();
export type SiigoProduct = {
  id: string;
  code: string;
  name: string;
  type?: string;
  active?: boolean;
  stock_control?: boolean;
  tax_classification?: string;
  tax_included?: boolean;
  account_group?: { id?: number; name?: string } | number;
  taxes?: { id?: number }[];
  prices?: { currency_code?: string; price_list?: { position?: number; value?: number }[] }[];
  unit?: { code?: string } | string;
  unit_label?: string;
  reference?: string;
  description?: string;
};

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
  const tax = itemTaxId(p.sales_tax_id, settings);
  const payload = {
    code,
    name: p.product_name.slice(0, 100),
    account_group: settings.product_account_group_id ?? 0,
    // Labor is a Service in Siigo; stock is kept in the app, not in Siigo.
    type: p.category === "servicio" ? "Service" : "Product",
    stock_control: false,
    active: true,
    tax_classification: tax ? "Taxed" : "Excluded",
    tax_included: !!tax,
    ...(tax ? { taxes: [{ id: tax }] } : {}),
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

// ── Services and parts from Siigo ───────────────────────────

const SERVICE_WORDS = /mantenimiento|reparaci|cambio de|instalaci|domicilio|alquiler|servicio|revisi|limpieza general|diagn/;

/** Whether a Siigo item is labor (servicio) or a part/supply (repuesto). */
export function suggestItemKind(p: { name: string; type?: string }): "servicio" | "repuesto" {
  if (p.type === "Service") return "servicio";
  return SERVICE_WORDS.test(plain(p.name)) ? "servicio" : "repuesto";
}

/** Inventory row for a Siigo service or part brought into the app. */
export function inventoryRowFromSiigo(p: SiigoProduct, kind: "servicio" | "repuesto", taxId: number | null | undefined) {
  return {
    product_code: `${kind === "servicio" ? "SRV-" : "REP-"}${p.code}`.slice(0, 40),
    product_name: p.name.replace(/\s+/g, " ").trim(),
    category: kind,
    unit: kind === "servicio" ? "servicio" : "unidad",
    current_stock: 0,
    min_stock: 0,
    is_sellable: true,
    siigo_code: p.code,
    siigo_product_id: p.id,
    sales_tax_id: taxId ?? null,
  };
}

/**
 * PUT /v1/products/{id} body that changes only the type to Service: Siigo's
 * PUT replaces the product, so everything it already has is sent back.
 */
export function serviceTypeUpdate(p: SiigoProduct) {
  const group = typeof p.account_group === "object" ? p.account_group?.id : p.account_group;
  const unit = typeof p.unit === "object" ? p.unit?.code : p.unit;
  return {
    code: p.code,
    name: p.name,
    account_group: group ?? 0,
    type: "Service",
    stock_control: false,
    active: p.active !== false,
    ...(p.tax_classification ? { tax_classification: p.tax_classification } : {}),
    ...(p.tax_included !== undefined ? { tax_included: p.tax_included } : {}),
    ...(p.taxes?.length ? { taxes: p.taxes.filter((t) => t.id).map((t) => ({ id: t.id })) } : {}),
    ...(p.prices?.length ? { prices: p.prices } : {}),
    ...(unit ? { unit } : {}),
    ...(p.unit_label ? { unit_label: p.unit_label } : {}),
    ...(p.reference ? { reference: p.reference } : {}),
    ...(p.description ? { description: p.description } : {}),
  };
}

// ── Cash receipts (customer payments → Siigo) ───────────────

/** "FV-1-55" → { prefix: "FV-1", consecutive: 55 }; null if it does not look like that. */
export function splitDocumentName(name: string | null | undefined): { prefix: string; consecutive: number } | null {
  const m = /^(.+)-(\d+)$/.exec((name ?? "").trim());
  return m ? { prefix: m[1], consecutive: Number(m[2]) } : null;
}

export type AppPayment = { id: string; payment_date: string; amount: number; method: "web" | "transfer" | "cash"; notes?: string | null };
export type EmittedInvoice = { siigo_name: string | null; due_date: string | null; customer_identification: string | null };

/**
 * POST /v1/vouchers body: a "DebtPayment" receipt that pays (part of) an
 * invoice already issued in Siigo.
 */
export function buildVoucherPayload(payment: AppPayment, invoice: EmittedInvoice, settings: SiigoSettings) {
  const problems: string[] = [];
  if (!settings.voucher_document_id) problems.push("Elige el tipo de recibo de caja en Ajustes → Siigo.");
  const paymentId = payment.method === "cash" ? settings.voucher_cash_id : payment.method === "transfer" ? settings.voucher_transfer_id : settings.voucher_web_id;
  if (!paymentId) problems.push("Elige la forma de pago de los recibos de caja para este medio en Ajustes → Siigo.");
  const due = splitDocumentName(invoice.siigo_name);
  if (!due) problems.push("La factura aún no tiene número de Siigo: envíala primero.");
  if (!invoice.customer_identification) problems.push("La factura no tiene la identificación del cliente.");
  const value = round2(num(payment.amount));
  const payload = {
    document: { id: settings.voucher_document_id ?? 0 },
    date: payment.payment_date,
    type: "DebtPayment",
    customer: { identification: invoice.customer_identification ?? "", branch_office: 0 },
    items: [{ due: { prefix: due?.prefix ?? "", consecutive: due?.consecutive ?? 0, quote: 1, date: invoice.due_date ?? payment.payment_date }, value }],
    payment: { id: paymentId ?? 0, value },
    observations: [`Pago de ${invoice.siigo_name ?? "factura"} · Café Amantti`, payment.notes ?? ""].filter(Boolean).join(" · ").slice(0, 4000),
  };
  return { payload, problems };
}

// ── Support documents (signed cuentas de cobro → Siigo) ─────

export type AppCuentaCobro = {
  number: number;
  issuer_name: string;
  issuer_document: string;
  concept?: string | null;
  signed_at?: string | null;
  items: { description: string; quantity: number | string; unit_price: number | string; total_price?: number | string }[];
};
export type Retention = { id: number; name: string; percentage: number };
export type SupportOptions = {
  /** Date of the document (YYYY-MM-DD): when the service was bought. */
  date: string;
  /** Expense category: its ledger account comes from Ajustes → Siigo. */
  category: string;
  /** Retefuente applied, or null for none. */
  retention: Retention | null;
  /** The business pays the withholding itself: the supplier gets the full amount. */
  assumed: boolean;
};

/**
 * POST /v1/purchase-support-documents body for a signed cuenta de cobro, the
 * way Café Amantti already makes them in Siigo: one ledger-account line per
 * item, Retefuente on each line, owed to the supplier (due the same day).
 * With an assumed withholding, an extra line books it as an expense and the
 * supplier is owed the full amount.
 */
export function buildSupportDocumentPayload(cc: AppCuentaCobro, opts: SupportOptions, settings: SiigoSettings) {
  const problems: string[] = [];
  if (!settings.support_document_id) problems.push("Elige el tipo de documento soporte en Ajustes → Siigo.");
  if (!settings.support_payment_id) problems.push("Elige la forma de pago de los documentos soporte en Ajustes → Siigo.");
  const { identification } = cleanIdentification(cc.issuer_document);
  if (!identification) problems.push("La cuenta de cobro no tiene la cédula o NIT del proveedor.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.date)) problems.push("Fecha del documento soporte inválida.");
  const account = opts.category ? settings.expense_accounts?.[opts.category] : undefined;
  if (!opts.category) problems.push("Elige la categoría del gasto.");
  else if (!account) problems.push(`Configura la cuenta contable para la categoría "${opts.category}" en Ajustes → Siigo.`);
  const assumedAccount = settings.support_assumed_account?.trim() || null;
  if (opts.retention && opts.assumed && !assumedAccount) problems.push("Configura la cuenta de la retención asumida en Ajustes → Siigo.");

  const lines = cc.items
    .map((it) => ({ description: (it.description || cc.concept || "Servicios").slice(0, 200), quantity: round2(num(it.quantity)) || 1, price: round2(num(it.unit_price)) }))
    .filter((l) => l.price > 0);
  if (!lines.length) problems.push("La cuenta de cobro no tiene valores.");

  const gross = round2(lines.reduce((s, l) => s + l.quantity * l.price, 0));
  const withheld = opts.retention ? round2(lines.reduce((s, l) => s + round2((l.quantity * l.price * opts.retention!.percentage) / 100), 0)) : 0;
  const items: Record<string, unknown>[] = lines.map((l) => ({
    type: "Account",
    code: account ?? "",
    description: l.description,
    quantity: l.quantity,
    price: l.price,
    ...(opts.retention ? { taxes: [{ id: opts.retention.id }] } : {}),
  }));
  if (opts.retention && opts.assumed && withheld > 0) {
    items.push({ type: "Account", code: assumedAccount ?? "", description: `${opts.retention.name} asumida`, quantity: 1, price: withheld });
  }
  // What is owed to the supplier: the gross value minus what is withheld,
  // unless the business assumes it (then the extra line adds it back).
  const owed = opts.assumed ? gross : round2(gross - withheld);
  const signed = cc.signed_at ? cc.signed_at.slice(0, 10) : null;

  const payload = {
    document: { id: settings.support_document_id ?? 0 },
    date: opts.date,
    supplier: { identification, branch_office: 0 },
    supplier_receipt_number: { prefix: "CC", number: String(cc.number) },
    observations: [`Cuenta de cobro No. ${cc.number}${signed ? ` firmada el ${signed}` : ""}`, cc.concept ?? ""].filter(Boolean).join(" · ").slice(0, 4000),
    items,
    payments: [{ id: settings.support_payment_id ?? 0, value: owed, due_date: opts.date }],
    stamp: { send: !!settings.stamp_dian },
  };
  return { payload, problems, totals: { gross, withheld, owed } };
}

/** POST /v1/customers body to create the supplier of a cuenta de cobro in Siigo. */
export function buildSupplierPayload(s: { name: string; document_number: string; email?: string | null; phone?: string | null; address?: string | null; city_code?: string | null }) {
  const { payload, problems } = buildCustomerPayload({ id: "", name: s.name, document_type: /-\d$/.test(s.document_number.trim()) ? "NIT" : "CC", document_number: s.document_number, email: s.email, phone: s.phone, address: s.address, city_code: s.city_code });
  return { payload: { ...payload, type: "Supplier" }, problems };
}

// ── Credit notes (notas crédito) ────────────────────────────

/** DIAN reasons the app offers: 1 partial return, 2 annulment, 3 discount, 4 price adjustment. */
export type CreditNoteReason = 1 | 2 | 3 | 4;
export type CreditLine = { code: string | null; name: string; quantity: number; unit_price: number; tax_id: number | null; tax_included?: boolean; tax_rate?: number | null };

/**
 * POST /v1/credit-notes body against an invoice already in Siigo. Lines go
 * like the invoice's (IVA included as taxed_price), so the note's total is
 * the sum the app shows; the payment mirrors the invoice's.
 */
export function buildCreditNotePayload(
  invoice: { siigo_invoice_id: string | null; payment_terms: string; payment_method: string | null; due_date: string | null },
  note: { reason: CreditNoteReason; lines: CreditLine[]; shipping?: number; notes?: string | null; invoiceName?: string | null },
  settings: SiigoSettings,
  today: string
) {
  const problems: string[] = [];
  if (!settings.credit_note_document_id) problems.push("Elige el tipo de nota crédito en Ajustes → Siigo.");
  if (!invoice.siigo_invoice_id) problems.push("La factura aún no está en Siigo.");
  const credit = invoice.payment_terms === "credito";
  const paymentId = credit
    ? settings.payment_credit_id
    : invoice.payment_method === "cash" ? settings.payment_cash_id : invoice.payment_method === "transfer" ? settings.payment_transfer_id : settings.payment_web_id;
  if (!paymentId) problems.push("Falta la forma de pago de la factura en Ajustes → Siigo.");
  const lines = note.lines.filter((l) => l.quantity > 0 && l.unit_price > 0);
  if (!lines.length) problems.push("La nota crédito no tiene valores.");
  for (const l of lines) if (!l.code) problems.push(`"${l.name}" no tiene código de Siigo.`);
  const shipping = round2(num(note.shipping));
  if (shipping > 0 && !settings.shipping_product_code) problems.push("Configura el código del servicio de envío en Ajustes → Siigo.");

  const items = [
    ...lines.map((l) => {
      const tax = itemTaxId(l.tax_id, settings);
      const field = tax && l.tax_included !== false ? "taxed_price" : "price";
      return { code: l.code ?? "", description: l.name.slice(0, 200), quantity: round2(l.quantity), [field]: round2(l.unit_price), taxes: tax ? [{ id: tax }] : [] };
    }),
    ...(shipping > 0 && settings.shipping_product_code ? [{ code: settings.shipping_product_code, description: "Envío", quantity: 1, price: shipping, taxes: [] }] : []),
  ];
  const total = round2(lines.reduce((s, l) => s + lineGross(l, !!itemTaxId(l.tax_id, settings)), 0) + shipping);
  const payload = {
    document: { id: settings.credit_note_document_id ?? 0 },
    date: today,
    invoice: invoice.siigo_invoice_id ?? "",
    reason: note.reason,
    stamp: { send: !!settings.stamp_dian },
    mail: { send: !!settings.send_mail },
    observations: [note.invoiceName ? `Nota crédito a ${note.invoiceName}` : "", note.notes ?? ""].filter(Boolean).join(" · ").slice(0, 4000),
    items,
    payments: [{ id: paymentId ?? 0, value: total, due_date: credit ? invoice.due_date ?? today : today }],
  };
  return { payload, problems, total };
}

// ── Purchases (facturas de compra) and payments to suppliers ─

export type AppBill = {
  supplier_identification: string;
  provider_prefix: string;
  provider_number: string;
  issue_date: string;
  due_date: string;
  notes?: string | null;
  lines: { account: string; description: string; base: number; tax_id: number | null; retention_id: number | null }[];
  total: number;
};

/**
 * POST /v1/purchases body for a supplier's invoice, the way the accountant
 * registers them: one ledger-account line per concept with its IVA and
 * Retefuente, owed to the supplier until it is paid (payment receipt).
 */
export function buildPurchaseBillPayload(bill: AppBill, settings: SiigoSettings) {
  const problems: string[] = [];
  if (!settings.purchase_document_id) problems.push("Elige el tipo de factura de compra en Ajustes → Siigo.");
  if (!settings.purchase_payment_id) problems.push("Elige la forma de pago de compras (por pagar al proveedor) en Ajustes → Siigo.");
  const { identification } = cleanIdentification(bill.supplier_identification);
  if (!identification) problems.push("El proveedor no tiene NIT.");
  if (!bill.provider_number.trim()) problems.push("Falta el número de la factura del proveedor.");
  const payload = {
    document: { id: settings.purchase_document_id ?? 0 },
    date: bill.issue_date,
    supplier: { identification, branch_office: 0 },
    provider_invoice: { prefix: bill.provider_prefix.trim().slice(0, 6), number: bill.provider_number.trim() },
    observations: (bill.notes ?? "").slice(0, 4000),
    items: bill.lines.map((l) => ({
      type: "Account",
      code: l.account,
      description: l.description.slice(0, 200),
      quantity: 1,
      price: round2(num(l.base)),
      taxes: [l.tax_id, l.retention_id].filter(Boolean).map((id) => ({ id })),
    })),
    payments: [{ id: settings.purchase_payment_id ?? 0, value: round2(num(bill.total)), due_date: bill.due_date }],
  };
  return { payload, problems };
}

/**
 * POST /v1/payment-receipts body: a "DebtPayment" egreso that pays (part of)
 * a document owed to the supplier, found by its due prefix and consecutive
 * (the supplier's invoice number, or CC + number for a cuenta de cobro).
 */
export function buildPaymentReceiptPayload(
  p: { date: string; amount: number; method: "bank" | "cash"; notes?: string | null },
  due: { supplier_identification: string; prefix: string; consecutive: string | number; date: string; label: string },
  settings: SiigoSettings
) {
  const problems: string[] = [];
  if (!settings.payment_receipt_document_id) problems.push("Elige el tipo de recibo de pago/egreso en Ajustes → Siigo.");
  const paymentId = p.method === "cash" ? settings.payout_cash_id : settings.payout_bank_id;
  if (!paymentId) problems.push("Elige la forma de pago de los egresos para este medio en Ajustes → Siigo.");
  const { identification } = cleanIdentification(due.supplier_identification);
  if (!identification) problems.push("El proveedor no tiene identificación.");
  const consecutive = Number(String(due.consecutive).replace(/\D/g, ""));
  if (!consecutive) problems.push("El documento no tiene número para cruzar el pago.");
  const value = round2(num(p.amount));
  const payload = {
    document: { id: settings.payment_receipt_document_id ?? 0 },
    date: p.date,
    type: "DebtPayment",
    supplier: { identification, branch_office: 0 },
    items: [{ due: { prefix: due.prefix, consecutive, quote: 1, date: due.date }, value }],
    payment: { id: paymentId ?? 0, value },
    observations: [`Pago de ${due.label} · Café Amantti`, p.notes ?? ""].filter(Boolean).join(" · ").slice(0, 4000),
  };
  return { payload, problems };
}

/** A support document as Siigo returns it (GET /v1/purchase-support-documents/{id}). */
export type SiigoSupportDocument = {
  id: string;
  name?: string;
  document?: { id: number };
  date?: string;
  supplier?: { identification?: string; branch_office?: number };
  supplier_receipt_number?: { prefix?: string; number?: string };
  observations?: string;
  items?: { type?: string; code?: string; description?: string; quantity?: number; price?: number; discount?: number; taxes?: { id: number }[] }[];
  payments?: { id: number; value: number; due_date?: string }[];
  stamp?: { status?: string; cuds?: string; errors?: string };
};

/**
 * PUT body that sends to the DIAN a support document that is in Siigo as a
 * draft (or was rejected): the same document, unchanged, with stamp.send.
 */
export function buildSupportDocumentStampPayload(ds: SiigoSupportDocument) {
  return {
    document: { id: ds.document?.id ?? 0 },
    date: ds.date,
    supplier: { identification: ds.supplier?.identification ?? "", branch_office: ds.supplier?.branch_office ?? 0 },
    supplier_receipt_number: ds.supplier_receipt_number,
    observations: ds.observations ?? "",
    items: (ds.items ?? []).map((i) => ({
      type: i.type,
      code: i.code,
      description: i.description,
      quantity: i.quantity,
      price: i.price,
      ...(i.discount ? { discount: i.discount } : {}),
      ...(i.taxes?.length ? { taxes: i.taxes.map((t) => ({ id: t.id })) } : {}),
    })),
    payments: (ds.payments ?? []).map((p) => ({ id: p.id, value: p.value, ...(p.due_date ? { due_date: p.due_date } : {}) })),
    stamp: { send: true },
  };
}

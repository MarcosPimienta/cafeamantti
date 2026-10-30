import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

type Inv = { id: string; name: string; date: string; balance: number; customer: { identification: string; branch_office: number }; payments: { due_date: string }[] };
const h = vi.hoisted(() => ({
  client: null as unknown,
  calls: [] as { method: string; path: string; opts?: { body?: unknown; idempotencyKey?: string } }[],
  invoices: {} as Record<string, Inv>,
  vouchers: [] as unknown[],
  failVoucher: null as Error | null,
  seq: 300,
}));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/utils/siigo/api", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/utils/siigo/api")>();
  const siigo = {
    request: async (method: string, path: string, opts?: { body?: { items: { due: { prefix: string; consecutive: number }; value: number }[] } }) => {
      h.calls.push({ method, path, opts });
      if (method === "GET" && path.startsWith("/v1/invoices/")) {
        const inv = h.invoices[path.split("/").pop()!];
        if (!inv) throw new real.SiigoError("not found", 404);
        return inv;
      }
      if (method === "POST" && path === "/v1/vouchers") {
        if (h.failVoucher) throw h.failVoucher;
        // Siigo lowers the balance of each invoice the receipt pays.
        for (const item of opts!.body!.items) {
          const inv = Object.values(h.invoices).find((i) => i.name === `${item.due.prefix}-${item.due.consecutive}`);
          if (inv) inv.balance = Math.round((inv.balance - item.value) * 100) / 100;
        }
        h.seq += 1;
        return { id: `rc-${h.seq}`, name: `RC-1-${h.seq}` };
      }
      throw new Error(`unexpected Siigo call ${method} ${path}`);
    },
    listAll: async () => h.vouchers,
  };
  return { ...real, getSiigoClient: () => siigo, siigoConfigFromEnv: () => ({ username: "u", accessKey: "k", partnerId: "p" }) };
});

import { deleteReceipt, getReceipts, importSiigoReceipts, registerCollection, retryReceipt } from "../receiptActions";

const SETTINGS = { voucher_document_id: 18131, voucher_transfer_id: 8399, voucher_cash_id: 8400 };
const fv = (id: string, name: string, balance: number, branch = 0): Inv => ({ id, name, date: "2026-10-06", balance, customer: { identification: "901656887", branch_office: branch }, payments: [{ due_date: "2026-11-05" }] });

let db: FakeDB;
beforeEach(() => {
  h.calls = [];
  h.failVoucher = null;
  h.vouchers = [];
  h.seq = 300;
  h.invoices = {
    "sg-524": fv("sg-524", "FV-2-524", 479587.5),
    "sg-687": fv("sg-687", "FV-2-687", 152250),
    "sg-734": fv("sg-734", "FV-2-734", 200000), // made in the app
    "sg-760": fv("sg-760", "FV-2-760", 300000, 2), // Smart Fit Mayorca's branch
  };
  db = seedDB({
    siigo_settings: [{ id: 1, config: SETTINGS }],
    clients: [{ id: "pf", name: "GRUPO PROFITNESS S.A.S", document_number: "901656887-1" }],
    client_sites: [{ id: "may", client_id: "pf", name: "SMART FIT MAYORCA", siigo_branch_office: 2 }],
    orders: [{ id: "ord-1", status: "delivered", payment_status: "pending", paid_at: null, total_amount: 200000 }],
    sales_invoices: [{ id: "si-1", order_id: "ord-1", siigo_invoice_id: "sg-734", siigo_name: "FV-2-734", status: "emitida" }],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

const receipts = () => db.rows("customer_receipts");
const incomes = () => db.rows("cashflow_incomes");

describe("cobros from the bank statement", () => {
  it("like RC-1-248: one recibo de caja in Siigo for the invoices assigned, and the money in Flujo de Caja", async () => {
    const res = await registerCollection({ date: "2026-10-26", amount: 631837.5, method: "transfer", notes: "Abono ACH", assigned: [{ invoiceId: "sg-524", value: 479587.5 }, { invoiceId: "sg-687", value: 152250 }] });
    expect(res).toMatchObject({ success: true, receipts: [{ sent: true, name: "RC-1-301" }] });
    const rc = h.calls.find((c) => c.path === "/v1/vouchers")!;
    expect(rc.opts?.body).toMatchObject({ type: "DebtPayment", customer: { identification: "901656887", branch_office: 0 }, payment: { id: 8399, value: 631837.5 }, items: [{ value: 479587.5 }, { value: 152250 }] });
    expect(rc.opts?.idempotencyKey).toMatch(/^CB/);
    expect(receipts()[0]).toMatchObject({ status: "enviado", siigo_name: "RC-1-301", client_id: "pf", customer_name: "GRUPO PROFITNESS S.A.S", amount: 631837.5 });
    expect(incomes()).toEqual([expect.objectContaining({ category: "Ventas Físicas", amount: 631837.5, concept: "RC-1-301 · GRUPO PROFITNESS S.A.S · FV-2-524, FV-2-687" })]);
    expect(receipts()[0].income_id).toBe(incomes()[0].id);
  });

  it("an app invoice gets the payment (already in Siigo) and its order is paid; it does not enter Flujo de Caja twice", async () => {
    await registerCollection({ date: "2026-10-26", amount: 352250, method: "transfer", assigned: [{ invoiceId: "sg-734", value: 200000 }, { invoiceId: "sg-687", value: 152250 }] });
    expect(db.rows("invoice_payments")).toEqual([expect.objectContaining({ invoice_id: "si-1", amount: 200000, siigo_status: "enviado", siigo_voucher_name: "RC-1-301", payment_date: "2026-10-26" })]);
    expect(db.byId("orders", "ord-1")).toMatchObject({ payment_status: "paid" });
    expect(incomes()).toEqual([expect.objectContaining({ amount: 152250 })]); // only the invoice made in Siigo
  });

  it("a partial payment of an app invoice leaves its order unpaid", async () => {
    await registerCollection({ date: "2026-10-26", amount: 50000, method: "cash", assigned: [{ invoiceId: "sg-734", value: 50000 }] });
    expect(db.byId("orders", "ord-1")).toMatchObject({ payment_status: "pending" });
    expect(h.calls.find((c) => c.path === "/v1/vouchers")!.opts?.body).toMatchObject({ payment: { id: 8400 } });
    expect(incomes()).toHaveLength(0);
  });

  it("a deposit for several sedes makes one recibo per Siigo branch", async () => {
    const res = await registerCollection({ date: "2026-10-26", amount: 452250, method: "transfer", assigned: [{ invoiceId: "sg-687", value: 152250 }, { invoiceId: "sg-760", value: 300000 }] });
    expect(res).toMatchObject({ success: true, receipts: [{ name: "RC-1-301" }, { name: "RC-1-302" }] });
    expect(h.calls.filter((c) => c.path === "/v1/vouchers").map((c) => (c.opts?.body as { customer: { branch_office: number } }).customer.branch_office)).toEqual([0, 2]);
    expect(receipts().map((r) => [r.branch_office, r.site_id, r.amount])).toEqual([[0, null, 152250], [2, "may", 300000]]);
  });

  it("refuses what doesn't add up or passes a balance, and saves nothing", async () => {
    expect(await registerCollection({ date: "2026-10-26", amount: 700000, method: "transfer", assigned: [{ invoiceId: "sg-687", value: 200000 }] })).toMatchObject({ success: false });
    expect(receipts()).toHaveLength(0);
    expect(h.calls.some((c) => c.path === "/v1/vouchers")).toBe(false);
  });

  it("one Siigo rejects stays with its error and its income; it can be retried or deleted with its income", async () => {
    h.failVoucher = new Error("El documento FV-2-687 no existe");
    const res = await registerCollection({ date: "2026-10-26", amount: 152250, method: "transfer", assigned: [{ invoiceId: "sg-687", value: 152250 }] });
    expect(res).toMatchObject({ success: true, receipts: [{ sent: false, error: "El documento FV-2-687 no existe" }] });
    expect(receipts()[0]).toMatchObject({ status: "error", siigo_error: "El documento FV-2-687 no existe" });
    expect(incomes()).toHaveLength(1);
    h.failVoucher = null;
    expect(await retryReceipt(receipts()[0].id)).toMatchObject({ success: true, sent: true, name: "RC-1-301" });
    expect(incomes()[0].concept).toMatch(/^RC-1-301/);
    expect(await deleteReceipt(receipts()[0].id)).toMatchObject({ success: false });

    h.failVoucher = new Error("caído");
    h.invoices["sg-524"].balance = 479587.5;
    await registerCollection({ date: "2026-10-26", amount: 1000, method: "transfer", assigned: [{ invoiceId: "sg-524", value: 1000 }] });
    const failed = receipts().find((r) => r.status === "error")!;
    expect(await deleteReceipt(failed.id)).toMatchObject({ success: true });
    expect(incomes()).toHaveLength(1);
  });

  it("brings the RCs made in Siigo since September once, without touching Flujo de Caja", async () => {
    h.vouchers = [
      { id: "v249", name: "RC-1-249", date: "2026-10-26", type: "DebtPayment", customer: { identification: "901656887", branch_office: 0 }, payment: { name: "Banco", value: 200000 }, items: [{ due: { prefix: "FV-2", consecutive: 734, date: "2026-11-05" }, value: 200000 }] },
      { id: "v247", name: "RC-1-247", date: "2026-05-20", type: "DebtPayment", customer: { identification: "1039464861" }, payment: { value: 159862.5 }, items: [] },
    ];
    h.invoices["sg-734"].balance = 0; // Siigo already applied it
    expect(await importSiigoReceipts()).toMatchObject({ success: true, imported: ["RC-1-249"] });
    expect(receipts()).toEqual([expect.objectContaining({ status: "importado", siigo_id: "v249", siigo_name: "RC-1-249", client_id: "pf", amount: 200000, method: "transfer" })]);
    expect(db.rows("invoice_payments")).toEqual([expect.objectContaining({ invoice_id: "si-1", siigo_voucher_id: "v249", siigo_status: "enviado" })]);
    expect(db.byId("orders", "ord-1")).toMatchObject({ payment_status: "paid" });
    expect(incomes()).toHaveLength(0);
    expect(await importSiigoReceipts()).toMatchObject({ success: true, imported: [] });
    const res = await getReceipts();
    expect(res.receipts).toHaveLength(1);
  });
});

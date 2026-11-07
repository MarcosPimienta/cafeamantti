import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { getIncomeCandidates, getInvoices, setOrderCountedIn } from "../actions";
import { getAllIncomes } from "../../cashflow/actions";

let db: FakeDB;
beforeEach(() => {
  db = seedDB({});
  h.client = createFakeClient(db, { id: ADMIN_ID });
  db.rows("daily_cashflows").push({ id: "d10", date: "2026-10-10" }, { id: "d01", date: "2026-07-01" });
  db.rows("cashflow_incomes").push(
    { id: "inc220", cashflow_id: "d10", era: "v2", concept: "Pago cafe sin factura", category: "Ventas Físicas", amount: 220000, gross_amount: 220000, created_at: "2026-10-10T15:00:00Z" },
    { id: "old", cashflow_id: "d01", era: "v2", concept: "Venta de julio", category: "Ventas Físicas", amount: 50000, gross_amount: 50000, created_at: "2026-07-01T15:00:00Z" },
  );
  db.rows("orders").push(
    { id: "o144", status: "delivered", payment_status: "paid", paid_at: "2026-10-10T17:00:00Z", total_amount: 144000, created_at: "2026-10-08T15:00:00Z", cashflow_income_id: null },
    { id: "o87", status: "delivered", payment_status: "pending", paid_at: null, total_amount: 87000, created_at: "2026-10-08T15:00:00Z", cashflow_income_id: null },
  );
  db.rows("sales_invoices").push(
    { id: "fv770", order_id: "o144", customer_name: "Marcos Pimienta", total: 144000, status: "emitida", issue_date: "2026-11-07", created_at: "2026-11-07T15:00:00Z", payment_terms: "credito", lines: [] },
    { id: "fv87", order_id: "o87", customer_name: "Marcos Pimienta", total: 87000, status: "borrador", issue_date: null, created_at: "2026-11-07T16:00:00Z", payment_terms: "credito", lines: [] },
  );
});
const autoAmounts = async () => (await getAllIncomes("v2")).filter((i: { type: string }) => i.type === "auto").map((i: { amount: number }) => i.amount);

describe("an invoice whose money is already a manual income in Flujo de Caja", () => {
  it("offers the incomes near the invoice, not months away", async () => {
    const res = await getIncomeCandidates("fv770");
    expect(res.success && res.incomes.map((i) => [i.id, i.amount, i.date])).toEqual([["inc220", 220000, "2026-10-10"]]);
  });

  it("linking stops Flujo de Caja from counting the order; unlinking brings it back", async () => {
    expect(await autoAmounts()).toEqual([144000]);
    expect(await setOrderCountedIn("fv770", "inc220")).toMatchObject({ success: true });
    expect(await autoAmounts()).toEqual([]);

    const { invoices, incomeLinkReady } = await getInvoices();
    expect(incomeLinkReady).toBe(true);
    expect((invoices as { id: string; counted_in: unknown }[]).find((i) => i.id === "fv770")!.counted_in).toEqual({ id: "inc220", date: "2026-10-10", concept: "Pago cafe sin factura", amount: 220000 });

    await setOrderCountedIn("fv770", null);
    expect(await autoAmounts()).toEqual([144000]);
  });

  it("one transfer can cover two invoices, and the list says so", async () => {
    await setOrderCountedIn("fv770", "inc220");
    const res = await getIncomeCandidates("fv87");
    expect(res.success && res.incomes[0]).toMatchObject({ id: "inc220", orders: 1 });
    await setOrderCountedIn("fv87", "inc220");
    db.byId("orders", "o87")!.payment_status = "paid";
    db.byId("orders", "o87")!.paid_at = "2026-11-20T17:00:00Z";
    expect(await autoAmounts()).toEqual([]);
  });

  it("refuses an income that no longer exists", async () => {
    expect(await setOrderCountedIn("fv770", "gone")).toMatchObject({ success: false, error: expect.stringMatching(/ya no existe/) });
    expect(db.byId("orders", "o144")!.cashflow_income_id).toBeNull();
  });
});

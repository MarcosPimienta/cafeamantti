import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { deleteLoanMovement, getLiabilities, registerLoanMovement, saveLoan } from "../actions";
import { getMonthlyPLReport } from "../../cashflow/actions";

let db: FakeDB;
beforeEach(() => {
  db = seedDB({
    purchase_bills: [
      { id: "b1", total: 4274776, status: "registrada", payments: undefined },
      { id: "b2", total: 1000000, status: "anulada" },
    ],
    payable_payments: [{ id: "p1", bill_id: "b1", amount: 3025224 }],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

const gloria = { creditor_name: "Gloria Inés Betancur", creditor_kind: "tercero" as const, scheme: "interes_mensual" as const, principal: 50000000, start_date: "2026-05-08", monthly_rate: 0.03, payment_day: 8, tracked_from: "2026-09-01", maturity_date: null, capitalize_every_months: null, notes: null };
const diana = { creditor_name: "Diana Patricia Rueda", creditor_kind: "tercero" as const, scheme: "capitaliza" as const, principal: 12000000, start_date: "2025-02-02", monthly_rate: 0.02, capitalize_every_months: 6, maturity_date: "2027-02-02", payment_day: null, tracked_from: null, notes: null };
const expenses = () => db.rows("cashflow_expenses");

describe("liabilities", () => {
  it("a loan is checked and saved", async () => {
    expect(await saveLoan(null, { ...gloria, principal: 0 })).toMatchObject({ success: false, error: "El valor prestado debe ser mayor a cero." });
    expect(await saveLoan(null, gloria)).toMatchObject({ success: true });
    expect(db.rows("loans")[0]).toMatchObject({ creditor_name: "Gloria Inés Betancur", monthly_rate: 0.03, payment_day: 8, capitalize_every_months: null });
  });

  it("interest paid is an expense of the month; a capital payment leaves the bank but is not an expense", async () => {
    const res = await saveLoan(null, gloria);
    const id = res.success ? res.id : "";
    await registerLoanMovement(id, { date: "2026-10-08", kind: "pago_interes", amount: 1500000 });
    await registerLoanMovement(id, { date: "2026-10-20", kind: "abono_capital", amount: 5000000 });
    expect(expenses().map((e) => [e.concept, e.category, e.expense_type, e.amount])).toEqual([
      ["Intereses · Gloria Inés Betancur", "Intereses Financieros (Préstamos de terceros)", "OPEX", 1500000],
      ["Abono a capital · Gloria Inés Betancur", "Abono a capital de préstamos", "BALANCE", 5000000],
    ]);
    expect(db.rows("loan_movements").map((m) => [m.kind, m.expense_owned])).toEqual([["pago_interes", true], ["abono_capital", true]]);
  });

  it("a payment already in Flujo de Caja doesn't create another; deleting a movement only deletes what it created", async () => {
    const res = await saveLoan(null, gloria);
    const id = res.success ? res.id : "";
    await registerLoanMovement(id, { date: "2026-09-08", kind: "pago_interes", amount: 1500000, alreadyInCashflow: true });
    await registerLoanMovement(id, { date: "2026-10-08", kind: "pago_interes", amount: 1500000 });
    expect(expenses()).toHaveLength(1);
    for (const m of [...db.rows("loan_movements")]) await deleteLoanMovement(m.id);
    expect(expenses()).toHaveLength(0);
    expect(db.rows("loan_movements")).toHaveLength(0);
  });

  it("a capitalizing loan pays no monthly interest; its final payment is not an expense", async () => {
    const res = await saveLoan(null, diana);
    const id = res.success ? res.id : "";
    expect(await registerLoanMovement(id, { date: "2026-10-06", kind: "pago_interes", amount: 337183 })).toMatchObject({ success: false, error: "Este préstamo no paga intereses cada mes." });
    expect(await registerLoanMovement(id, { date: "2099-01-01", kind: "pago_final", amount: 1 })).toMatchObject({ success: false, error: "La fecha no puede ser futura." });
  });

  it("Diana's interest is in the month's P&L although no money leaves", async () => {
    const before = await getMonthlyPLReport(11, 2026);
    await saveLoan(null, diana);
    const after = await getMonthlyPLReport(11, 2026);
    // November: day 2 to day 2 counts 29 of 30 days in the calendar month.
    expect(after.opex - before.opex).toBeCloseTo(337182.72 * 29 / 30, 0);
    expect(after.burn_rate ?? 0).toBe(before.burn_rate ?? 0); // no money left
  });

  it("the dashboard also counts what is owed to suppliers", async () => {
    const res = await getLiabilities();
    expect(res).toMatchObject({ migrationApplied: true, payables: 1249552 });
  });
});

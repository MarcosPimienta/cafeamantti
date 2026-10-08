import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";

const h = vi.hoisted(() => ({ client: null as unknown }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { signCuentaCobro, registerCuentaCobroExpense, registerCuentaCobroIncome } from "../actions";

let db: FakeDB;
const cc = (over: Record<string, unknown>) => ({
  id: "cc1",
  number: 12,
  status: "firmada",
  type: "gasto",
  total_amount: "350000",
  issuer_name: "Juan Barista",
  debtor_name: "Café Amantti",
  concept: "Capacitación",
  expense_id: null,
  income_id: null,
  ...over,
});

beforeEach(() => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  db = seedDB({ cuentas_cobro: [cc({})] });
  h.client = createFakeClient(db, { id: ADMIN_ID });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const bank = { bank_name: "Bancolombia", bank_account_type: "Ahorros", bank_account_number: "123" };
const issuer = { issuer_name: "Juan", issuer_document: "1037", issuer_email: "j@x.co", issuer_phone: "300" };

describe("signCuentaCobro", () => {
  it("signs a pending document once and refuses a second signature", async () => {
    db.byId("cuentas_cobro", "cc1")!.status = "pendiente";
    expect(await signCuentaCobro("cc1", "data:sig", "typed", bank, issuer)).toEqual({ success: true });
    expect(db.byId("cuentas_cobro", "cc1")).toMatchObject({ status: "firmada", signature_type: "typed", bank_account_number: "123", issuer_document: "1037" });

    const again = await signCuentaCobro("cc1", "data:other", "typed", { ...bank, bank_account_number: "999" }, issuer);
    expect(again).toEqual({ success: false, error: "Este documento ya ha sido firmado previamente." });
    expect(db.byId("cuentas_cobro", "cc1")!.bank_account_number).toBe("123");
  });

  it("an unknown document is reported", async () => {
    expect(await signCuentaCobro("nope", "x", "typed", bank, issuer)).toEqual({ success: false, error: "Documento no encontrado." });
  });
});

describe("registering a signed cuenta de cobro in Flujo de Caja", () => {
  it("a gasto becomes one expense with the full amount and no IVA, linked back", async () => {
    const res = await registerCuentaCobroExpense("cc1", { date: "2026-10-05", category: "Servicios Profesionales", expenseType: "OPEX" });
    expect(res).toEqual({ success: true });
    const [exp] = db.rows("cashflow_expenses");
    expect(exp).toMatchObject({ amount: 350000, tax_amount: 0, net_amount: 350000, expense_type: "OPEX", concept: "Cuenta de Cobro No. 12 - Juan Barista - Capacitación" });
    expect(db.byId("cuentas_cobro", "cc1")!.expense_id).toBe(exp.id);
  });

  it("cannot be registered twice", async () => {
    await registerCuentaCobroExpense("cc1", { date: "2026-10-05", category: "x", expenseType: "OPEX" });
    const again = await registerCuentaCobroExpense("cc1", { date: "2026-10-05", category: "x", expenseType: "OPEX" });
    expect(again).toMatchObject({ success: false, error: expect.stringMatching(/ya se encuentra asociada/) });
    expect(db.rows("cashflow_expenses")).toHaveLength(1);
  });

  it("must be signed and of the right type", async () => {
    db.byId("cuentas_cobro", "cc1")!.status = "pendiente";
    expect(await registerCuentaCobroExpense("cc1", { date: "2026-10-05", category: "x", expenseType: "OPEX" })).toMatchObject({ error: expect.stringMatching(/firmada/) });
    db.byId("cuentas_cobro", "cc1")!.status = "firmada";
    expect(await registerCuentaCobroIncome("cc1", { date: "2026-10-05", category: "Servicios" })).toMatchObject({ error: expect.stringMatching(/no es de tipo ingreso/) });
    expect(db.rows("cashflow_expenses")).toHaveLength(0);
    expect(db.rows("cashflow_incomes")).toHaveLength(0);
  });

  it("an ingreso becomes one income, linked back", async () => {
    db.byId("cuentas_cobro", "cc1")!.type = "ingreso";
    expect(await registerCuentaCobroIncome("cc1", { date: "2026-10-05", category: "Servicios" })).toEqual({ success: true });
    const [inc] = db.rows("cashflow_incomes");
    expect(inc).toMatchObject({ gross_amount: 350000, net_revenue: 350000, concept: "Cuenta de Cobro No. 12 - Café Amantti - Capacitación" });
    expect(db.byId("cuentas_cobro", "cc1")!.income_id).toBe(inc.id);
  });

  it("is admin-only", async () => {
    db.rows("profiles").push({ id: "staff", role: "customer" });
    h.client = createFakeClient(db, { id: "staff" });
    expect(await registerCuentaCobroExpense("cc1", { date: "2026-10-05", category: "x", expenseType: "OPEX" })).toMatchObject({
      success: false,
      error: expect.stringMatching(/No autorizado/),
    });
  });
});

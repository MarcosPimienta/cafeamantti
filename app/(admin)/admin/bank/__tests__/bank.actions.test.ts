import { describe, it, expect, vi, beforeEach } from "vitest";
import { createFakeClient, seedDB, ADMIN_ID, type FakeDB } from "@/test/fakeSupabase";
import type { TextItem } from "@/utils/bank/davivienda";

const h = vi.hoisted(() => ({ client: null as unknown, items: [] as unknown[] }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => h.client }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/utils/bank/pdfText", () => ({ pdfTextItems: async () => h.items }));

import { acceptSuggestions, deleteStatement, getBankData, ignoreLines, importStatement, markReversal, reconcile, undoMatch, undoMatches } from "../actions";
import { suggestMatches } from "@/utils/bank/matching";

// An invented October statement, laid out like Davivienda's PDF.
const row = (y: number, dd: string, value: string, sign: "+" | "-", doc: string, desc: string): TextItem[] => [
  { page: 1, x: 52, y, str: dd }, { page: 1, x: 71, y, str: "10" }, { page: 1, x: 140, y, str: `$ ${value}` },
  { page: 1, x: 179, y, str: sign }, { page: 1, x: 197, y, str: doc }, { page: 1, x: 224, y, str: desc }, { page: 1, x: 451, y, str: "PORTAL PYMES" },
];
const october = (): TextItem[] => [
  { page: 1, x: 280, y: 712, str: "1234 5678 9012" },
  { page: 1, x: 471, y: 701, str: "OCTUBRE /2026" },
  { page: 1, x: 232, y: 565, str: "Saldo Anterior" }, { page: 1, x: 345, y: 563, str: "$1,000,000.00" },
  { page: 1, x: 232, y: 519, str: "Nuevo Saldo" }, { page: 1, x: 345, y: 517, str: "$3,290,000.00" },
  { page: 1, x: 302, y: 471, str: "Clase de Movimiento" }, { page: 1, x: 502, y: 471, str: "Oficina" },
  ...row(457, "08", "1,500,000.00", "-", "3842", "Descuento Transferencia Intereses"),
  ...row(448, "08", "100,000.00", "-", "5281", "Descuento Transferencia Pago intereses"),
  ...row(439, "08", "100,000.00", "+", "5281", "Devolucion Rechazo Transf A Otro Banco"),
  ...row(430, "17", "4,197,187.00", "+", "9974", "Abono ACH BOGOTA 8909012715"),
  ...row(421, "20", "400,000.00", "-", "8568", "Dcto por Transferencia de Fondos"),
  ...row(412, "21", "7,187.00", "-", "0001", "Cobro Servicio Manejo Portal"),
];
const pdf = () => {
  const form = new FormData();
  form.append("file", new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], "extracto.pdf", { type: "application/pdf" }));
  return form;
};

let db: FakeDB;
beforeEach(() => {
  h.items = october();
  db = seedDB({
    daily_cashflows: [{ id: "d8", date: "2026-10-08" }, { id: "d17", date: "2026-10-17" }, { id: "d23", date: "2026-10-23" }],
    cashflow_incomes: [
      { id: "contegral", cashflow_id: "d17", concept: "Contegral", category: "Ventas Físicas", amount: 4197187, gross_amount: 4197187, era: "v2" },
      { id: "rc256", cashflow_id: "d23", concept: "RC-1-256 Contegral", category: "Ventas Físicas", amount: 4197187, gross_amount: 4197187, era: "v2" },
    ],
    cashflow_expenses: [{ id: "gloria", cashflow_id: "d8", concept: "Intereses Gloria", category: "Intereses Financieros (Préstamos de terceros)", amount: 1500000, era: "v2" }],
  });
  h.client = createFakeClient(db, { id: ADMIN_ID });
});

const load = async () => {
  const res = await importStatement(pdf());
  if (!res.success) throw new Error(res.error);
  return getBankData(res.id);
};
const lineId = (data: Awaited<ReturnType<typeof getBankData>>, doc: string, sign = 1) => data.lines.find((l) => l.doc === doc && Math.sign(l.amount) === sign)!.id;

describe("bank reconciliation", () => {
  it("imports a statement once, with its lines signed", async () => {
    const data = await load();
    expect(data.statement).toMatchObject({ account_number: "1234 5678 9012", period_month: "2026-10-01", opening_balance: 1000000, closing_balance: 3290000, lines: 6, pending: 6 });
    expect(data.lines.map((l) => l.amount)).toEqual([-1500000, -100000, 100000, 4197187, -400000, -7187]);
    expect(await importStatement(pdf())).toMatchObject({ success: false, error: "Ese extracto ya está cargado. Para cargarlo de nuevo, borra el que está." });
  });

  it("refuses a file that is not a readable statement", async () => {
    h.items = [{ page: 1, x: 1, y: 1, str: "Factura" }];
    const res = await importStatement(pdf());
    expect(res.success).toBe(false);
    const notPdf = new FormData();
    notPdf.append("file", new File(["hola"], "x.pdf"));
    expect(await importStatement(notPdf)).toMatchObject({ success: false, error: "El archivo no es un PDF." });
  });

  it("accepting the suggestions reconciles; the second copy of a deposit is left out", async () => {
    let data = await load();
    const free = data.rows.filter((r) => !r.matchId);
    const sug = suggestMatches(data.lines.map((l) => ({ id: l.id, date: l.line_date, amount: l.amount, doc: l.doc ?? "", description: l.description })), free);
    const res = await acceptSuggestions(sug.filter((s) => s.difference === 0));
    expect(res).toMatchObject({ done: 3, failed: [] });
    data = await getBankData(data.statement!.id);
    expect(data.statement!.pending).toBe(2); // the transfer of 400.000 and the portal fee
    expect(data.rows.find((r) => r.id === "contegral")!.matchId).not.toBeNull();
    expect(data.rows.find((r) => r.id === "rc256")!.matchId).toBeNull();
  });

  it("a match must add up; the difference can be registered in Flujo de Caja and undoing deletes it", async () => {
    const data = await load();
    const transfer = lineId(data, "8568", -1);
    expect(await reconcile({ lineIds: [transfer], expenseIds: ["gloria"] })).toMatchObject({ success: false });
    expect(await reconcile({ lineIds: [transfer], create: { concept: "Pago proveedor", category: "Ventas Físicas" } })).toMatchObject({ success: false, error: "Elige una categoría de gasto." });

    const res = await reconcile({ lineIds: [transfer], create: { concept: "Pago proveedor café", category: "Costo de Ventas (Materia prima, insumos, empaques)" } });
    expect(res).toMatchObject({ success: true });
    const created = db.rows("cashflow_expenses").find((e) => e.concept === "Pago proveedor café")!;
    expect(created).toMatchObject({ amount: 400000, expense_type: "COGS" });
    expect(db.byId("daily_cashflows", created.cashflow_id)!.date).toBe("2026-10-20");
    expect(await reconcile({ lineIds: [transfer], expenseIds: ["gloria"] })).toMatchObject({ success: false, error: "Un movimiento del banco ya está conciliado. Recarga la página." });

    const matchId = db.byId("bank_lines", transfer)!.match_id;
    expect(await undoMatch(matchId)).toMatchObject({ success: true });
    expect(db.rows("cashflow_expenses").some((e) => e.concept === "Pago proveedor café")).toBe(false);
    expect(db.byId("bank_lines", transfer)!.match_id).toBeNull();
    expect(db.byId("cashflow_expenses", "gloria")).toBeTruthy();
  });

  it("a Flujo de Caja row explains one bank line at most", async () => {
    const data = await load();
    expect(await reconcile({ lineIds: [lineId(data, "9974")], incomeIds: ["contegral"] })).toMatchObject({ success: true });
    // Pretend the same deposit came in twice: the row is taken.
    const fee = lineId(data, "0001", -1);
    expect(await reconcile({ lineIds: [fee], incomeIds: ["contegral"] })).toMatchObject({ success: false, error: "Un registro de Flujo de Caja ya está conciliado con otro movimiento. Recarga la página." });
  });

  it("a returned transfer cancels its debit; a line can be left out only with a reason", async () => {
    const data = await load();
    const sent = lineId(data, "5281", -1);
    const back = lineId(data, "5281", 1);
    expect(await markReversal([sent])).toMatchObject({ success: false });
    expect(await markReversal([sent, back])).toMatchObject({ success: true });
    const fee = lineId(data, "0001", -1);
    expect(await ignoreLines([fee], "  ")).toMatchObject({ success: false, error: "Escribe por qué no va en Flujo de Caja." });
    expect(await ignoreLines([fee], "Se concilia con el gasto bancario de noviembre")).toMatchObject({ success: true });
    expect(db.rows("bank_matches").map((m) => m.kind)).toEqual(["reverso", "ignorado"]);
  });

  it("deleting a statement removes its matches but keeps Flujo de Caja", async () => {
    const data = await load();
    await reconcile({ lineIds: [lineId(data, "8568", -1)], create: { concept: "Pago", category: "Costo de Ventas (Materia prima, insumos, empaques)" } });
    expect(await deleteStatement(data.statement!.id)).toMatchObject({ success: true });
    expect(db.rows("bank_lines")).toHaveLength(0);
    expect(db.rows("bank_matches")).toHaveLength(0);
    expect(db.rows("bank_match_rows")).toHaveLength(0);
    expect(db.rows("cashflow_expenses").some((e) => e.concept === "Pago")).toBe(true);
  });
});

describe("a statement printed to PDF", () => {
  it("is refused with what to do: it has no text, only pictures", async () => {
    h.items = [];
    expect(await importStatement(pdf())).toMatchObject({ success: false, error: expect.stringContaining("Descarga el extracto original desde Davivienda") });
  });
});

describe("undoing several matches at once", () => {
  it("puts their lines back to pending and deletes only the rows created from the statement", async () => {
    const res = await importStatement(pdf());
    if (!res.success) throw new Error(res.error);
    const data = await getBankData(res.id);
    const id = (doc: string, sign = 1) => data.lines.find((l) => l.doc === doc && Math.sign(l.amount) === sign)!.id;
    await reconcile({ lineIds: [id("9974")], incomeIds: ["contegral"] });
    await reconcile({ lineIds: [id("8568", -1)], create: { concept: "Pago", category: "Costo de Ventas (Materia prima, insumos, empaques)" } });
    await markReversal([id("5281", -1), id("5281")]);
    const ids = db.rows("bank_matches").map((m) => m.id);
    expect(await undoMatches([...ids, ids[0]])).toMatchObject({ success: true, done: 3, failed: [] });
    expect(db.rows("bank_lines").every((l) => !l.match_id)).toBe(true);
    expect(db.rows("bank_matches")).toHaveLength(0);
    expect(db.byId("cashflow_incomes", "contegral")).toBeTruthy();
    expect(db.rows("cashflow_expenses").some((e) => e.concept === "Pago")).toBe(false);
  });
});

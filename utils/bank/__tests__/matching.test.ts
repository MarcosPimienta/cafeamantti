import { describe, it, expect } from "vitest";
import { difference, isBankFee, possibleDuplicates, suggestMatches, type BankLineLite, type CashRow } from "../matching";

let n = 0;
const line = (date: string, amount: number, description = "Abono ACH", doc = String(++n)): BankLineLite => ({ id: `l${++n}`, date, amount, doc, description });
const income = (id: string, date: string, amount: number, concept = "Venta"): CashRow => ({ id, kind: "income", date, amount, concept, category: "Ventas Físicas" });
const expense = (id: string, date: string, amount: number, category = "Costo de Ventas"): CashRow => ({ id, kind: "expense", date, amount, concept: "Pago", category });

describe("difference", () => {
  it("is zero when incomes explain money in and expenses money out", () => {
    expect(difference([{ amount: 1749077.09 }, { amount: -500000 }], [{ kind: "income", amount: 1749077.09 }, { kind: "expense", amount: 500000 }])).toBe(0);
    expect(difference([{ amount: -2100000 }], [{ kind: "expense", amount: 1340000 }])).toBe(-760000);
  });
});

describe("suggestMatches", () => {
  it("pairs a line with the row of the same value, the closest date first", () => {
    const a = line("2026-09-17", 4197187);
    const s = suggestMatches([a], [income("far", "2026-09-10", 4197187), income("near", "2026-09-17", 4197187)]);
    expect(s).toEqual([expect.objectContaining({ kind: "flujo", lineIds: [a.id], incomeIds: ["near"], expenseIds: [], difference: 0, reason: "Mismo valor y misma fecha" })]);
  });

  it("accepts cents of difference and a few days apart, but not money in against an expense", () => {
    const a = line("2026-09-10", -500000);
    const b = line("2026-09-16", 1749077.09);
    const s = suggestMatches([a, b], [expense("hon", "2026-09-15", 500000), income("erco", "2026-09-16", 1749077), expense("x", "2026-09-16", 1749077)]);
    expect(s.map((x) => [x.lineIds[0], [...x.incomeIds, ...x.expenseIds]])).toEqual([[b.id, ["erco"]], [a.id, ["hon"]]]);
    expect(s[1]).toMatchObject({ reason: "Mismo valor, {d} día(s) de diferencia", vars: { d: "5" } });
  });

  it("pairs a returned transfer with the debit of the same document, and not with Flujo de Caja", () => {
    const sent = line("2026-09-08", -1678700, "Descuento Transferencia", "0819");
    const back = line("2026-09-08", 1678700, "Devolucion Rechazo Transf A Otro Banco", "0819");
    const again = line("2026-09-09", -1678700, "Descuento Transferencia", "9495");
    const s = suggestMatches([sent, back, again], [expense("tostion", "2026-09-09", 1678700)]);
    expect(s).toEqual([
      expect.objectContaining({ kind: "reverso", lineIds: [sent.id, back.id] }),
      expect.objectContaining({ kind: "flujo", lineIds: [again.id], expenseIds: ["tostion"] }),
    ]);
  });

  it("finds a transfer that paid two things", () => {
    const a = line("2026-09-30", -2100000);
    const s = suggestMatches([a], [expense("maquina", "2026-09-30", 1340000), expense("cafe", "2026-09-30", 760000), expense("otro", "2026-09-29", 90000)]);
    expect(s).toEqual([expect.objectContaining({ lineIds: [a.id], expenseIds: ["maquina", "cafe"] })]);
  });

  it("lets a person choose when two pairs add up the same", () => {
    const a = line("2026-09-30", -200);
    expect(suggestMatches([a], [expense("a", "2026-09-30", 100), expense("b", "2026-09-30", 100), expense("c", "2026-09-30", 100)])).toEqual([]);
  });

  it("groups the bank's own charges against the month's bank fees expense, with the difference", () => {
    const fees = [line("2026-09-02", -7140, "Cobro Transf. Enviada Otra Entidad"), line("2026-09-30", -71924.42, "Gravamen a los Movimientos Financieros"), line("2026-09-30", 7883.52, "Abono X Gravamen Movimiento Financiero"), line("2026-09-30", 427.96, "Rendimientos Financieros.")];
    const s = suggestMatches(fees, [expense("banco", "2026-09-30", 62000, "Comisiones Bancarias (Cuota de manejo, transacciones, pasarelas)")]);
    expect(s).toEqual([expect.objectContaining({ lineIds: fees.map((f) => f.id), expenseIds: ["banco"], difference: -8752.94 })]);
  });

  it("never pairs a bank fee one by one, even with a row of its value", () => {
    expect(suggestMatches([line("2026-09-02", -7140, "Cobro Transf. Enviada Otra Entidad")], [expense("e", "2026-09-02", 7140)])).toEqual([]);
  });
});

describe("isBankFee", () => {
  it.each(["Cobro Transf. Enviada Otra Entidad", "Cobro Servicio Manejo Portal", "IVA por Servicios", "Cobro cuota de manejo tarjeta debito OCT_2026"])("%s", (d) => expect(isBankFee(d)).toBe(true));
  it("is not a customer's payment", () => expect(isBankFee("Pago A Llave De Comercio")).toBe(false));
});

describe("possibleDuplicates", () => {
  it("flags a row with no bank line that equals one that has it", () => {
    const sept = income("sep", "2026-09-17", 4197187);
    const oct = income("oct", "2026-10-23", 4197187);
    const other = income("x", "2026-10-23", 50000);
    const d = possibleDuplicates([oct, other], [sept]);
    expect([...d.keys()]).toEqual(["oct"]);
    expect(d.get("oct")?.id).toBe("sep");
  });
});

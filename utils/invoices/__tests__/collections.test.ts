import { describe, it, expect } from "vitest";
import { collectionProblems, computeRetention, invoiceAmounts, itemsOfVoucher, normalizeRetentions, receiptConcept, receiptsByBranch, vouchersToImport, type OpenInvoice, type RetentionOption } from "../collections";
import { buildCollectionVoucherPayload, type SiigoSettings } from "@/utils/siigo/mapping";

const inv = (o: Partial<OpenInvoice>): OpenInvoice => ({ id: "a", name: "FV-2-524", due_date: "2026-03-13", balance: 479587.5, branch_office: 0, customer_identification: "901656887", ...o });
const OPEN = [inv({}), inv({ id: "b", name: "FV-2-687", due_date: "2026-10-06", balance: 152250 }), inv({ id: "c", name: "FV-2-760", balance: 300000, branch_office: 2 })];
const ok = { date: "2026-10-26", amount: 631837.5, method: "transfer", assigned: [{ invoiceId: "a", value: 479587.5 }, { invoiceId: "b", value: 152250 }] };

describe("cobros (customer deposits)", () => {
  it("a deposit assigned by hand, like RC-1-248, has no problems", () => {
    expect(collectionProblems(ok, OPEN, "2026-10-29")).toEqual([]);
  });

  it("what is assigned must add up to the deposit, without passing any balance", () => {
    expect(collectionProblems({ ...ok, amount: 700000 }, OPEN, "2026-10-29")).toEqual(["Lo asignado (631837.5) no cuadra con el valor del abono (700000)."]);
    expect(collectionProblems({ ...ok, amount: 500000, assigned: [{ invoiceId: "b", value: 500000 }] }, OPEN, "2026-10-29")).toEqual(["FV-2-687: el valor supera su saldo (152250)."]);
    // A partial payment leaves balance: fine.
    expect(collectionProblems({ ...ok, amount: 100000, assigned: [{ invoiceId: "a", value: 100000 }] }, OPEN, "2026-10-29")).toEqual([]);
  });

  it("checks date, method, amount, assignment and one customer", () => {
    expect(collectionProblems({ date: "2026-11-30", amount: 0, method: "web", assigned: [] }, OPEN, "2026-10-29")).toEqual([
      "La fecha del abono no puede ser futura.",
      "Elige si entró al banco o a caja.",
      "Escribe el valor del abono.",
      "Asigna el abono a al menos una factura.",
    ]);
    const other = [...OPEN, inv({ id: "x", name: "FV-2-702", customer_identification: "902038087" })];
    expect(collectionProblems({ ...ok, amount: 579587.5, assigned: [{ invoiceId: "a", value: 479587.5 }, { invoiceId: "x", value: 100000 }] }, other, "2026-10-29")).toContain("Un abono solo puede pagar facturas de un mismo cliente.");
    expect(collectionProblems({ ...ok, assigned: [{ invoiceId: "gone", value: 631837.5 }] }, OPEN, "2026-10-29")).toContain("Una de las facturas ya no tiene saldo en Siigo: actualiza la página.");
  });

  it("one recibo de caja per Siigo branch", () => {
    const parts = receiptsByBranch([...ok.assigned, { invoiceId: "c", value: 300000 }, { invoiceId: "zero", value: 0 }], OPEN);
    expect([...parts.keys()]).toEqual([0, 2]);
    expect(parts.get(0)!.map((i) => [i.name, i.value])).toEqual([["FV-2-524", 479587.5], ["FV-2-687", 152250]]);
    expect(parts.get(2)).toEqual([{ siigo_invoice_id: "c", name: "FV-2-760", due_date: "2026-03-13", value: 300000 }]);
  });

  it("the Siigo recibo de caja pays each invoice with its value", () => {
    const settings = { voucher_document_id: 18131, voucher_transfer_id: 8399, voucher_cash_id: 8400 } as SiigoSettings;
    const items = [...receiptsByBranch(ok.assigned, OPEN).get(0)!];
    const { payload, problems } = buildCollectionVoucherPayload({ receipt_date: "2026-10-26", amount: 631837.5, method: "transfer", customer_identification: "901656887-1", branch_office: 0, items }, settings);
    expect(problems).toEqual([]);
    expect(payload).toMatchObject({
      document: { id: 18131 }, date: "2026-10-26", type: "DebtPayment", customer: { identification: "901656887", branch_office: 0 },
      items: [
        { due: { prefix: "FV-2", consecutive: 524, quote: 1, date: "2026-03-13" }, value: 479587.5 },
        { due: { prefix: "FV-2", consecutive: 687, quote: 1, date: "2026-10-06" }, value: 152250 },
      ],
      payment: { id: 8399, value: 631837.5 },
    });
    expect(buildCollectionVoucherPayload({ receipt_date: "2026-10-26", amount: 1, method: "cash", customer_identification: "", branch_office: 0, items: [{ name: "X", due_date: null, value: 2 }] }, {} as SiigoSettings).problems).toEqual([
      "Elige el tipo de recibo de caja en Ajustes → Siigo.",
      "Elige la forma de pago de los recibos de caja para este medio en Ajustes → Siigo.",
      "El cliente no tiene identificación.",
      "No se reconoce el número de la factura X.",
      "Lo asignado a las facturas no cuadra con el valor del recibo.",
    ]);
  });

  it("imports only debt payments dated since September that the app doesn't have", () => {
    const v = (o: Record<string, unknown>) => ({ id: "v1", name: "RC-1-249", date: "2026-10-26", type: "DebtPayment", ...o });
    const list = [v({}), v({ id: "old", date: "2026-05-20" }), v({ id: "known" }), v({ id: "adv", type: "AdvancePayment" })];
    expect(vouchersToImport(list, new Set(["known"])).map((x) => x.id)).toEqual(["v1"]);
    expect(itemsOfVoucher(v({ items: [{ due: { prefix: "FV-2", consecutive: 702, date: "2026-10-21" }, value: 310162.5 }, { value: 5 }] }))).toEqual([
      { siigo_invoice_id: null, name: "FV-2-702", due_date: "2026-10-21", value: 310162.5 },
    ]);
    expect(receiptConcept({ siigo_name: "RC-1-249", customer_name: "ELEVATE", items: [{ siigo_invoice_id: null, name: "FV-2-702", due_date: null, value: 1 }] })).toBe("RC-1-249 · ELEVATE · FV-2-702");
  });

  describe("withholdings (retenciones)", () => {
    // FV-2-724 (Grupo NONNA): 6 × 140.400 + IVA 5 % = 884.520.
    const RETE: RetentionOption = { id: 9760, type: "Retefuente", name: "Retefuente 2.5%", percentage: 2.5 };
    const ICA: RetentionOption = { id: 9763, type: "ReteICA", name: "ReteICA 9.66", percentage: 9.66 };
    const RIVA: RetentionOption = { id: 9768, type: "ReteIVA", name: "ReteIVA 15%", percentage: 15 };
    const amounts = invoiceAmounts([{ quantity: 6, price: 140400, taxes: [{ type: "IVA", value: 42120 }] }], 884520);
    const nonna = inv({ id: "n", name: "FV-2-724", balance: 884520, customer_identification: "901774397", ...amounts });

    it("takes the base from the invoice and computes each kind (ReteICA per thousand)", () => {
      expect(amounts).toEqual({ subtotal: 842400, iva: 42120 });
      expect(computeRetention(RETE, nonna)).toMatchObject({ base: 842400, value: 21060 });
      expect(computeRetention(ICA, nonna)).toMatchObject({ base: 842400, value: 8138 });
      expect(computeRetention(RIVA, nonna)).toMatchObject({ base: 42120, value: 6318 });
      expect(invoiceAmounts([{ quantity: 1, price: 100 }], 105)).toEqual({ subtotal: 100, iva: 5 });
    });

    it("money plus withholding settles the invoice; the deposit is only the money", () => {
      const rete = computeRetention(RETE, nonna);
      const c = { date: "2026-11-05", amount: 863460, method: "transfer", assigned: [{ invoiceId: "n", value: 863460, retentions: [rete] }] };
      expect(collectionProblems(c, [nonna], "2026-11-12")).toEqual([]);
      expect(collectionProblems({ ...c, amount: 884520, assigned: [{ invoiceId: "n", value: 884520, retentions: [rete] }] }, [nonna], "2026-11-12")).toEqual([
        "FV-2-724: el abono más la retención supera su saldo (884520).",
      ]);
      expect(collectionProblems({ ...c, assigned: [{ invoiceId: "n", value: 863460, retentions: [rete, { ...rete }] }] }, [nonna], "2026-11-12")).toContain("FV-2-724: hay dos retenciones del mismo tipo.");
      // The money came before and only the withholding is left: a $0 receipt settles it.
      const left = inv({ ...nonna, balance: 21060 });
      expect(collectionProblems({ ...c, amount: 0, assigned: [{ invoiceId: "n", value: 0, retentions: [rete] }] }, [left], "2026-11-12")).toEqual([]);
      expect(collectionProblems({ ...c, amount: 0, assigned: [{ invoiceId: "n", value: 0 }] }, [left], "2026-11-12")).toContain("Escribe el valor del abono.");
    });

    it("the RC sends the withholding as a tax of the invoice and the payment as the money", () => {
      const rete = computeRetention(RETE, nonna);
      const items = receiptsByBranch([{ invoiceId: "n", value: 863460, retentions: [rete] }], [nonna]).get(0)!;
      expect(items[0]).toMatchObject({ value: 863460, retentions: [{ id: 9760, base: 842400, value: 21060 }] });
      const settings = { voucher_document_id: 18127, voucher_transfer_id: 8399 } as SiigoSettings;
      const { payload, problems } = buildCollectionVoucherPayload({ receipt_date: "2026-11-05", amount: 863460, method: "transfer", customer_identification: "901774397", branch_office: 0, items }, settings);
      expect(problems).toEqual([]);
      expect(payload.items).toEqual([{ due: { prefix: "FV-2", consecutive: 724, quote: 1, date: "2026-03-13" }, taxes: [{ id: 9760, base: 842400, value: 21060 }], value: 884520 }]);
      expect(payload.payment).toEqual({ id: 8399, value: 863460 });
      expect(payload.observations).toContain("Retenciones: Retefuente 2.5% 21060 a FV-2-724");
    });

    it("the server keeps only Siigo's withholdings, on the invoice's own base", () => {
      const sent = [{ ...computeRetention(RETE, nonna), base: 1, percentage: 99 }];
      expect(normalizeRetentions(sent, [RETE], nonna)).toEqual([{ ...RETE, base: 842400, value: 21060 }]);
      expect(() => normalizeRetentions([{ ...computeRetention(RETE, nonna), id: 1 }], [RETE], nonna)).toThrow("no existe en Siigo");
    });
  });
});

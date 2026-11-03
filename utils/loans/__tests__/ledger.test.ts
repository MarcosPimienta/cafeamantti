import { describe, it, expect } from "vitest";
import { accruedInterestInMonth, addMonths, loanProblems, loanState, monthsBetween, summarize, type Loan } from "../ledger";

const diana: Loan = { id: "d", creditor_name: "Diana Patricia Rueda", creditor_kind: "tercero", scheme: "capitaliza", principal: 12000000, start_date: "2025-02-02", monthly_rate: 0.02, capitalize_every_months: 6, maturity_date: "2027-02-02" };
const gloria: Loan = { id: "g", creditor_name: "Gloria Inés Betancur", creditor_kind: "tercero", scheme: "interes_mensual", principal: 50000000, start_date: "2026-05-08", monthly_rate: 0.03, payment_day: 8, tracked_from: "2026-09-01" };
const vanessa: Loan = { id: "v", creditor_name: "Vanessa García", creditor_kind: "tercero", scheme: "interes_mensual", principal: 5000000, start_date: "2026-01-08", monthly_rate: 0.02, payment_day: 8, tracked_from: "2026-09-01" };
const marcos: Loan = { id: "m", creditor_name: "Marcos Pimienta", creditor_kind: "socio", scheme: "sin_interes", principal: 10000000, start_date: "2026-01-01", monthly_rate: 0 };

describe("loans", () => {
  it("dates: months later and months between, counting days over 30", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-02", 4)).toBe("2027-02-02");
    expect(monthsBetween("2026-08-02", "2026-10-06")).toBeCloseTo(2 + 4 / 30);
  });

  it("Diana: 2% monthly capitalized every 6 months, exactly like her statement", () => {
    const oct6 = loanState(diana, [], "2026-10-06");
    expect(oct6).toMatchObject({ capital: 16859136, monthlyInterest: 337182.72, nextDate: "2027-02-02", maturityValue: 18882232.32 });
    // Her statement, in whole pesos: $719.323 accrued, $17.578.459 in total.
    expect(oct6.accrued).toBeCloseTo(719323, -1);
    expect(oct6.balance).toBeCloseTo(17578459, -1);
    expect(oct6.annualRate).toBeCloseTo(0.2544, 4); // 12% per semester
    expect(loanState(diana, [], "2025-08-02").capital).toBe(13440000);
    expect(loanState(diana, [], "2026-02-02").capital).toBe(15052800);
  });

  it("Diana's interest is a cost of each month even though no money leaves", () => {
    // October has 31 days and lenders count days over 30.
    expect(accruedInterestInMonth(diana, [], "2026-10")).toBeCloseTo(337182.72 * 31 / 30, 0);
    // Months are counted from day 2 to day 2, so a calendar month is not exactly one; the semester adds up exactly.
    const semester = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01", "2027-02"].reduce((s, m) => s + accruedInterestInMonth(diana, [], m), 0);
    expect(semester).toBeCloseTo(18882232.32 - 16859136, 0);
    expect(accruedInterestInMonth(diana, [], "2026-08")).toBeGreaterThan(300000); // straddles a capitalization
    expect(accruedInterestInMonth(diana, [], "2027-03")).toBe(0); // after maturity
    expect(accruedInterestInMonth(gloria, [], "2026-10")).toBe(0); // paid interest is already an expense
  });

  it("paid at maturity, a loan is settled", () => {
    expect(loanState(diana, [{ loan_id: "d", move_date: "2027-02-02", kind: "pago_final", amount: 18882232.32 }], "2027-02-10")).toMatchObject({ settled: true, balance: 0 });
  });

  it("Gloria: 3% monthly paid on the 8th; months not paid since the cutoff are overdue", () => {
    const paidOct = [{ loan_id: "g", move_date: "2026-09-08", kind: "pago_interes" as const, amount: 1500000 }, { loan_id: "g", move_date: "2026-10-08", kind: "pago_interes" as const, amount: 1500000 }];
    expect(loanState(gloria, paidOct, "2026-11-03")).toMatchObject({ capital: 50000000, monthlyInterest: 1500000, overdueMonths: 0, balance: 50000000, nextDate: "2026-11-08" });
    expect(loanState(gloria, paidOct, "2026-11-10")).toMatchObject({ overdueMonths: 1, overdueAmount: 1500000, balance: 51500000 });
    expect(loanState(gloria, [], "2026-11-03").annualRate).toBeCloseTo(0.4258, 4);
    const abono = [...paidOct, { loan_id: "g", move_date: "2026-10-20", kind: "abono_capital" as const, amount: 10000000 }];
    expect(loanState(gloria, abono, "2026-11-03")).toMatchObject({ capital: 40000000, monthlyInterest: 1200000 });
  });

  it("partners' loans have no interest; the summary puts the most expensive debt first", () => {
    expect(loanState(marcos, [], "2026-11-03")).toMatchObject({ balance: 10000000, monthlyInterest: 0, annualRate: 0 });
    const moves = [
      { loan_id: "g", move_date: "2026-09-08", kind: "pago_interes" as const, amount: 1500000 },
      { loan_id: "g", move_date: "2026-10-08", kind: "pago_interes" as const, amount: 1500000 },
      { loan_id: "v", move_date: "2026-09-08", kind: "pago_interes" as const, amount: 100000 },
      { loan_id: "v", move_date: "2026-10-08", kind: "pago_interes" as const, amount: 100000 },
    ];
    const s = summarize([diana, gloria, vanessa, marcos], moves, "2026-11-03");
    expect(s.socios).toBe(10000000);
    expect(s.terceros).toBeCloseTo(50000000 + 5000000 + 16859136 + 16859136 * 0.02 * (3 + 1 / 30), 0);
    expect(s.monthlyInterest).toBeCloseTo(1500000 + 100000 + 337182.72, 0);
    expect(s.priority.map((p) => p.loan.id)).toEqual(["g", "v", "d"]);
    expect(s.upcoming.map((u) => [u.loan.id, u.kind, u.date])).toEqual([["g", "interes", "2026-11-08"], ["v", "interes", "2026-11-08"], ["d", "vencimiento", "2027-02-02"]]);
  });

  it("checks a loan before saving", () => {
    expect(loanProblems(gloria)).toEqual([]);
    expect(loanProblems({ ...diana, capitalize_every_months: null })).toEqual(["Indica cada cuántos meses se capitalizan los intereses."]);
    expect(loanProblems({ creditor_name: "", scheme: "interes_mensual", principal: 0, start_date: "x" })).toEqual([
      "Escribe el nombre del acreedor.", "Elige si el acreedor es un tercero o un socio.", "El valor prestado debe ser mayor a cero.", "Fecha del préstamo inválida.", "Indica la tasa mensual.",
    ]);
  });
});

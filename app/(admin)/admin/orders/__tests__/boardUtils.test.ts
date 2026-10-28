import { describe, it, expect } from "vitest";
import {
  dueState,
  waLink,
  relDays,
  fmtDay,
  siigoOf,
  groupOrdersByStatus,
  isPaid,
  isClosed,
  needsInvoice,
  NEXT_STATUS,
  UNDELIVERED,
  type BoardOrder,
} from "../boardUtils";

const NOW = Date.parse("2026-10-08T15:00:00Z");
const order = (over: Partial<BoardOrder>): BoardOrder => ({
  id: Math.random().toString(36).slice(2),
  status: "pending",
  payment_status: "pending",
  total_amount: 0,
  created_at: "2026-10-01T15:00:00Z",
  ...over,
});

describe("dueState", () => {
  const today = "2026-10-08";
  it.each([
    ["2026-10-07", "overdue"],
    ["2026-10-08", "today"],
    ["2026-10-09", "soon"],
    ["2026-10-10", "soon"],
    ["2026-10-11", "later"],
  ])("due %s → %s", (due, state) => {
    expect(dueState(order({ delivery_due_date: due }), today)).toBe(state);
  });

  it("delivered, cancelled or undated orders are never late", () => {
    expect(dueState(order({ status: "delivered", delivery_due_date: "2026-01-01" }), today)).toBeNull();
    expect(dueState(order({ status: "cancelled", delivery_due_date: "2026-01-01" }), today)).toBeNull();
    expect(dueState(order({ delivery_due_date: null }), today)).toBeNull();
  });
});

describe("waLink", () => {
  it("adds +57 to 10-digit Colombian mobiles and strips formatting", () => {
    expect(waLink("300 123 4567")).toBe("https://wa.me/573001234567");
    expect(waLink("+57 (300) 123-4567")).toBe("https://wa.me/573001234567");
  });
  it("keeps other international numbers as they are", () => {
    expect(waLink("+1 415 555 0100")).toBe("https://wa.me/14155550100");
  });
  it("returns null for placeholders and junk", () => {
    expect(waLink("123")).toBeNull();
    expect(waLink("")).toBeNull();
    expect(waLink(null)).toBeNull();
  });
});

describe("relDays / fmtDay / siigoOf", () => {
  it("speaks in days", () => {
    expect(relDays("2026-10-08T09:00:00Z", NOW)).toBe("hoy");
    expect(relDays("2026-10-07T09:00:00Z", NOW)).toBe("ayer");
    expect(relDays("2026-10-01T09:00:00Z", NOW)).toBe("hace 7 d");
    expect(relDays("2026-10-09T09:00:00Z", NOW)).toBe("hoy"); // future clamps to 0
  });
  it("formats a calendar day without shifting it", () => {
    expect(fmtDay("2026-10-04")).toBe("4 de oct");
  });
  it("finds the Siigo invoice on the column or in shipping_info", () => {
    expect(siigoOf(order({ siigo_invoice: "FV-1" }))).toBe("FV-1");
    expect(siigoOf(order({ shipping_info: { siigo_invoice: "FV-2" } }))).toBe("FV-2");
    expect(siigoOf(order({}))).toBeNull();
  });
});

describe("pipeline", () => {
  it("advancing walks Preparando → Enviado → Entregado and stops", () => {
    const path = ["processing"];
    while (NEXT_STATUS[path[path.length - 1]]) path.push(NEXT_STATUS[path[path.length - 1]]);
    expect(path).toEqual(["processing", "shipped", "delivered"]);
    expect(NEXT_STATUS.cancelled).toBeUndefined();
  });
  it("undelivered means still owed to the customer", () => {
    expect([...UNDELIVERED].sort()).toEqual(["paid", "pending", "processing", "shipped"]);
  });
});

describe("groupOrdersByStatus", () => {
  const COLS = ["processing", "shipped", "delivered", "cancelled"];

  it("puts each order in its column, and unknown statuses in the first one", () => {
    const g = groupOrdersByStatus(
      [order({ id: "a", status: "shipped" }), order({ id: "b", status: "weird" }), order({ id: "c", status: "cancelled" })],
      COLS
    );
    expect(g.get("shipped")!.map((o) => o.id)).toEqual(["a"]);
    expect(g.get("processing")!.map((o) => o.id)).toEqual(["b"]);
    expect(g.get("cancelled")!.map((o) => o.id)).toEqual(["c"]);
  });

  it("payment is not a column: new and old-'paid' orders are in Preparando, delivered unpaid ones in Entregado", () => {
    const g = groupOrdersByStatus(
      [
        order({ id: "owed", status: "delivered", payment_status: "pending", delivered_at: "2026-10-07T00:00:00Z", created_at: "2026-10-02T00:00:00Z" }),
        order({ id: "done", status: "delivered", payment_status: "paid", delivered_at: "2026-10-07T00:00:00Z", created_at: "2026-10-03T00:00:00Z" }),
        order({ id: "new", status: "pending", created_at: "2026-10-02T00:00:00Z" }),
        order({ id: "legacy-paid", status: "paid", payment_status: undefined, created_at: "2026-10-03T00:00:00Z" }),
      ],
      COLS
    );
    expect(g.get("delivered")!.map((o) => o.id)).toEqual(["owed"]);
    expect(g.get("processing")!.map((o) => o.id)).toEqual(["new", "legacy-paid"]);
    expect(isPaid({ status: "delivered", payment_status: "pending" })).toBe(false);
    expect(isPaid({ status: "delivered" })).toBe(true); // before the payment migration
  });

  it("a delivery needs a factura when the client has a document, it has a value and no Siigo invoice", () => {
    const withNit = { name: "GRUPO PROFITNESS", document_number: "901656887" };
    expect(needsInvoice(order({ total_amount: 100, client: withNit }))).toBe(true);
    expect(needsInvoice(order({ total_amount: 100, client: [withNit] }))).toBe(true);
    expect(needsInvoice(order({ total_amount: 100, client: withNit, siigo_invoice: "FV-2-726" }))).toBe(false);
    expect(needsInvoice(order({ total_amount: 100, client: withNit, shipping_info: { siigo_invoice: "FV-1" } }))).toBe(false);
    expect(needsInvoice(order({ total_amount: 0, client: withNit }))).toBe(false); // courtesy
    expect(needsInvoice(order({ total_amount: 100, client: { name: "Elisa Uribe", document_number: null } }))).toBe(false); // consumidor final
    expect(needsInvoice(order({ total_amount: 100 }))).toBe(false);
  });

  it("closed orders (delivered, paid, invoiced) leave the board unless asked; owed ones stay however old", () => {
    const nit = { name: "ELEVATE", document_number: "902038087" };
    const orders = [
      order({ id: "unpaid-old", status: "delivered", payment_status: "pending", delivered_at: "2026-06-01T00:00:00Z" }),
      order({ id: "no-invoice", status: "delivered", payment_status: "paid", total_amount: 100, client: nit, delivered_at: "2026-10-01T00:00:00Z" }),
      order({ id: "closed-old", status: "delivered", payment_status: "paid", total_amount: 100, client: nit, siigo_invoice: "FV-2-1", delivered_at: "2026-09-01T00:00:00Z" }),
      order({ id: "closed-new", status: "delivered", payment_status: "paid", delivered_at: "2026-10-05T00:00:00Z" }),
      order({ id: "unpaid-new", status: "delivered", payment_status: "pending", delivered_at: "2026-10-06T00:00:00Z" }),
    ];
    expect(isClosed(orders[2])).toBe(true);
    expect(isClosed(orders[1])).toBe(false);
    expect(isClosed(order({ status: "shipped", payment_status: "paid" }))).toBe(false);
    expect(groupOrdersByStatus(orders, COLS).get("delivered")!.map((o) => o.id)).toEqual(["unpaid-old", "unpaid-new", "no-invoice"]);
    // The history: oldest pending on top, then the latest closed first.
    expect(groupOrdersByStatus(orders, COLS, { showClosed: true }).get("delivered")!.map((o) => o.id)).toEqual([
      "unpaid-old",
      "unpaid-new",
      "no-invoice",
      "closed-new",
      "closed-old",
    ]);
  });

  it("sorts by promised date first (soonest on top), then by age", () => {
    const g = groupOrdersByStatus(
      [
        order({ id: "no-date-new", created_at: "2026-10-05T00:00:00Z" }),
        order({ id: "due-later", delivery_due_date: "2026-10-20" }),
        order({ id: "no-date-old", created_at: "2026-09-01T00:00:00Z" }),
        order({ id: "overdue", delivery_due_date: "2026-10-01" }),
      ],
      COLS
    );
    expect(g.get("processing")!.map((o) => o.id)).toEqual(["overdue", "due-later", "no-date-old", "no-date-new"]);
  });
});

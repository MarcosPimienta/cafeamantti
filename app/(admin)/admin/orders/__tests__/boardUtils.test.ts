import { describe, it, expect } from "vitest";
import {
  dueState,
  waLink,
  relDays,
  fmtDay,
  siigoOf,
  groupOrdersByStatus,
  NEXT_STATUS,
  UNDELIVERED,
  type BoardOrder,
} from "../boardUtils";

const NOW = Date.parse("2026-10-08T15:00:00Z");
const order = (over: Partial<BoardOrder>): BoardOrder => ({
  id: Math.random().toString(36).slice(2),
  status: "paid",
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
  it("advancing walks pending → paid → processing → shipped → delivered and stops", () => {
    const path = ["pending"];
    while (NEXT_STATUS[path[path.length - 1]]) path.push(NEXT_STATUS[path[path.length - 1]]);
    expect(path).toEqual(["pending", "paid", "processing", "shipped", "delivered"]);
    expect(NEXT_STATUS.cancelled).toBeUndefined();
  });
  it("undelivered means still owed to the customer", () => {
    expect([...UNDELIVERED].sort()).toEqual(["paid", "pending", "processing", "shipped"]);
  });
});

describe("groupOrdersByStatus", () => {
  const COLS = ["pending", "paid", "processing", "shipped", "delivered", "cancelled"];

  it("puts each order in its column, and unknown statuses in the first one", () => {
    const g = groupOrdersByStatus(
      [order({ id: "a", status: "paid" }), order({ id: "b", status: "weird" }), order({ id: "c", status: "cancelled" })],
      COLS,
      { now: NOW }
    );
    expect(g.get("paid")!.map((o) => o.id)).toEqual(["a"]);
    expect(g.get("pending")!.map((o) => o.id)).toEqual(["b"]);
    expect(g.get("cancelled")!.map((o) => o.id)).toEqual(["c"]);
  });

  it("hides deliveries older than 30 days unless asked for all", () => {
    const orders = [
      order({ id: "recent", status: "delivered", delivered_at: "2026-09-20T00:00:00Z" }),
      order({ id: "old", status: "delivered", delivered_at: "2026-08-01T00:00:00Z" }),
      order({ id: "legacy", status: "delivered", created_at: "2026-01-01T00:00:00Z" }), // no delivered_at
    ];
    expect(groupOrdersByStatus(orders, COLS, { now: NOW }).get("delivered")!.map((o) => o.id)).toEqual(["recent"]);
    expect(groupOrdersByStatus(orders, COLS, { now: NOW, allDelivered: true }).get("delivered")).toHaveLength(3);
  });

  it("sorts by promised date first (soonest on top), then by age", () => {
    const g = groupOrdersByStatus(
      [
        order({ id: "no-date-new", created_at: "2026-10-05T00:00:00Z" }),
        order({ id: "due-later", delivery_due_date: "2026-10-20" }),
        order({ id: "no-date-old", created_at: "2026-09-01T00:00:00Z" }),
        order({ id: "overdue", delivery_due_date: "2026-10-01" }),
      ],
      COLS,
      { now: NOW }
    );
    expect(g.get("paid")!.map((o) => o.id)).toEqual(["overdue", "due-later", "no-date-old", "no-date-new"]);
  });
});

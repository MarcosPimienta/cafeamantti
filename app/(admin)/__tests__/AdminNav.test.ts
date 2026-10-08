import { describe, it, expect } from "vitest";
import { activeHref } from "../AdminNav";

describe("activeHref", () => {
  it.each([
    ["/admin", "/admin"],
    ["/admin/orders", "/admin/orders"],
    ["/admin/orders/import", "/admin/orders/import"], // not also "Órdenes"
    ["/admin/inventory", "/admin/inventory"],
    ["/admin/quotes/proposals/new", "/admin/quotes"],
    ["/admin/cashflow", "/admin/cashflow"],
  ])("%s highlights %s", (path, href) => {
    expect(activeHref(path)).toBe(href);
  });

  it("does not light up on a path that only shares a prefix", () => {
    expect(activeHref("/admin/ordersXYZ")).toBeNull();
    expect(activeHref("/admin/settings")).toBeNull(); // Ajustes lives outside the main nav
  });
});

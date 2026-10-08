import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const h = vi.hoisted(() => ({ user: null as null | { id: string }, fail: false, calls: 0 }));
vi.mock("@/utils/supabase/middleware", () => ({
  updateSession: async () => {
    h.calls += 1;
    if (h.fail) throw new Error("auth timeout");
    return { supabaseResponse: NextResponse.next(), user: h.user };
  },
}));

import { middleware, config } from "@/middleware";

const go = (path: string) => middleware(new NextRequest(new URL(path, "https://cafeamantti.com")));
const location = (res: Response) => res.headers.get("location");

beforeEach(() => {
  h.user = null;
  h.fail = false;
  h.calls = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("middleware", () => {
  it.each(["/admin", "/admin/orders", "/dashboard", "/portal/x"])("%s requires a session", async (path) => {
    expect(location(await go(path))).toBe("https://cafeamantti.com/login");
  });

  it("lets a signed-in user through to protected pages", async () => {
    h.user = { id: "u1" };
    const res = await go("/admin/inventory");
    expect(location(res)).toBeNull();
  });

  it("sends signed-in users away from login/register", async () => {
    h.user = { id: "u1" };
    expect(location(await go("/login"))).toBe("https://cafeamantti.com/dashboard");
    expect(location(await go("/register"))).toBe("https://cafeamantti.com/dashboard");
  });

  it("public pages skip the auth round-trip entirely", async () => {
    await go("/");
    await go("/builder");
    expect(h.calls).toBe(0);
  });

  it("a stray Supabase auth code is routed to the callback", async () => {
    const res = await go("/?code=abc123");
    const to = new URL(location(res)!);
    expect(to.pathname).toBe("/auth/callback");
    expect(to.searchParams.get("code")).toBe("abc123");
    expect(to.searchParams.get("next")).toBe("/recovery/reset-password");
  });

  it("if the auth service is down, protected pages fail closed to /login", async () => {
    h.fail = true;
    expect(location(await go("/admin"))).toBe("https://cafeamantti.com/login");
  });

  it("does not run on static assets", () => {
    const re = new RegExp(`^${config.matcher[0]}$`);
    expect(re.test("/_next/static/chunk.js")).toBe(false);
    expect(re.test("/logo.png")).toBe(false);
    expect(re.test("/admin")).toBe(true);
  });
});

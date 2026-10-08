import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({ exchange: vi.fn() }));
vi.mock("@/utils/supabase/server", () => ({ createClient: async () => ({ auth: { exchangeCodeForSession: h.exchange } }) }));

import { GET } from "../../auth/callback/route";

beforeEach(() => h.exchange.mockReset().mockResolvedValue({ error: null }));

const call = (qs: string) => GET(new Request(`https://cafeamantti.com/auth/callback${qs}`));

describe("GET /auth/callback", () => {
  it("exchanges the code and continues to `next`", async () => {
    const res = await call("?code=abc&next=/recovery/reset-password");
    expect(h.exchange).toHaveBeenCalledWith("abc");
    expect(res.headers.get("location")).toBe("https://cafeamantti.com/recovery/reset-password");
  });

  it.each(["@evil.example", "//evil.example", "https://evil.example"])("never leaves the site for next=%s", async (next) => {
    const res = await call(`?code=abc&next=${encodeURIComponent(next)}`);
    expect(new URL(res.headers.get("location")!).host).toBe("cafeamantti.com");
  });

  it("an invalid or expired code goes to /login with a message", async () => {
    h.exchange.mockResolvedValue({ error: { message: "expired" } });
    const res = await call("?code=old");
    expect(res.headers.get("location")).toMatch(/^https:\/\/cafeamantti\.com\/login\?error=/);
    expect((await call("")).headers.get("location")).toMatch(/\/login\?error=/);
  });
});

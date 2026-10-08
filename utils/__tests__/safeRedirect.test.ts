import { describe, it, expect } from "vitest";
import { safeRedirectPath } from "../safeRedirect";

describe("safeRedirectPath", () => {
  it.each(["/dashboard", "/builder?plan=premium", "/recovery/reset-password", "/a/b#c"])("keeps internal path %s", (p) => {
    expect(safeRedirectPath(p)).toBe(p);
  });

  it.each([
    "https://evil.example/phish",
    "//evil.example",
    "/\\evil.example",
    "@evil.example",
    "javascript:alert(1)",
    "dashboard",
    "/ok\r\nSet-Cookie: x=1",
    "",
    null,
    undefined,
    42,
  ])("rejects %j", (p) => {
    expect(safeRedirectPath(p)).toBe("/dashboard");
  });

  it("uses the given fallback", () => {
    expect(safeRedirectPath("https://x", "/")).toBe("/");
  });
});

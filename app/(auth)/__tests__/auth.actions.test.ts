import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  auth: {} as Record<string, ReturnType<typeof vi.fn>>,
}));

vi.mock("@/utils/supabase/server", () => ({ createClient: async () => ({ auth: h.auth }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "cafeamantti.com", "x-forwarded-proto": "https" }),
}));
// Next's redirect() throws to stop rendering; surface the target instead.
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import { login, signup } from "../login/actions";
import { requestPasswordReset, updatePassword } from "../recovery/actions";

const form = (fields: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
};

beforeEach(() => {
  h.auth = {
    signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ error: null }),
    resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    updateUser: vi.fn().mockResolvedValue({ error: null }),
  };
});

describe("login", () => {
  it("goes to the requested internal page", async () => {
    await expect(login(form({ email: "a@b.co", password: "x", redirectTo: "/builder" }))).rejects.toThrow("REDIRECT:/builder");
  });

  it("never redirects off-site after signing in", async () => {
    await expect(login(form({ email: "a@b.co", password: "x", redirectTo: "https://evil.example" }))).rejects.toThrow("REDIRECT:/dashboard");
    await expect(login(form({ email: "a@b.co", password: "x", redirectTo: "//evil.example" }))).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("returns to /login with the error message on bad credentials", async () => {
    h.auth.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    await expect(login(form({ email: "a@b.co", password: "bad" }))).rejects.toThrow("REDIRECT:/login?error=Invalid%20login%20credentials");
  });
});

describe("signup", () => {
  const valid = {
    email: "ana@cafe.co",
    password: "secreta1",
    firstName: "Ana",
    lastName: "Gómez",
    phone: "+57 3001234567",
    address: "Calle 10 # 43-21",
  };

  it("creates the account with sanitized profile data", async () => {
    await expect(signup(form({ ...valid, firstName: "<b>Ana</b>", redirectTo: "/builder" }))).rejects.toThrow("REDIRECT:/builder");
    expect(h.auth.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "ana@cafe.co",
        options: { data: expect.objectContaining({ first_name: "Ana", last_name: "Gómez", phone: "+57 3001234567" }) },
      })
    );
  });

  it.each([
    ["email", "no-es-correo"],
    ["password", "123"],
    ["phone", "12345"],
    ["firstName", "A"],
    ["address", "x"],
  ])("rejects an invalid %s without calling Supabase", async (field, value) => {
    await expect(signup(form({ ...valid, [field]: value }))).rejects.toThrow(/REDIRECT:\/login\?error=/);
    expect(h.auth.signUp).not.toHaveBeenCalled();
  });

  it("silently drops bots that fill the honeypot", async () => {
    await expect(signup(form({ ...valid, website: "http://spam" }))).rejects.toThrow("REDIRECT:/dashboard");
    expect(h.auth.signUp).not.toHaveBeenCalled();
  });
});

describe("password recovery", () => {
  it("validates the email and sends the reset link back through the callback", async () => {
    expect(await requestPasswordReset(null, form({ email: "mal" }))).toEqual({ error: "Ingresa un correo electrónico válido" });
    expect(await requestPasswordReset(null, form({ email: "ana@cafe.co" }))).toEqual({ success: true });
    expect(h.auth.resetPasswordForEmail).toHaveBeenCalledWith("ana@cafe.co", {
      redirectTo: "https://cafeamantti.com/auth/callback?next=/recovery/reset-password",
    });
  });

  it("pretends success for bots (honeypot) without sending email", async () => {
    expect(await requestPasswordReset(null, form({ email: "ana@cafe.co", website: "x" }))).toEqual({ success: true });
    expect(h.auth.resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("new password must be 6+ characters and confirmed", async () => {
    expect(await updatePassword(null, form({ password: "123", confirmPassword: "123" }))).toEqual({ error: expect.stringMatching(/6 caracteres/) });
    expect(await updatePassword(null, form({ password: "secreta1", confirmPassword: "secreta2" }))).toEqual({ error: "Las contraseñas no coinciden" });
    await expect(updatePassword(null, form({ password: "secreta1", confirmPassword: "secreta1" }))).rejects.toThrow("REDIRECT:/dashboard");
    expect(h.auth.updateUser).toHaveBeenCalledWith({ password: "secreta1" });
  });
});

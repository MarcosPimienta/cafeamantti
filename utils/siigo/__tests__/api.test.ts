import { describe, it, expect, vi } from "vitest";
import { SiigoClient, SiigoError, describeSiigoErrors, idempotencyKey, siigoConfigFromEnv } from "../api";

const config = { username: "api@amantti.co", accessKey: "secret-key", partnerId: "CafeAmantti" };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function setup(responses: ((url: string, init: RequestInit) => Response)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error(`unexpected call ${url}`);
    return next(url, init);
  }) as unknown as typeof fetch;
  let now = 1_000_000;
  const sleep = vi.fn(async () => {});
  const client = new SiigoClient(config, fetchImpl, sleep, () => now);
  return { client, calls, sleep, advance: (ms: number) => (now += ms) };
}

const token = (t = "tok-1") => () => json(201, { access_token: t, expires_in: 86400, token_type: "Bearer" });
const headers = (init: RequestInit) => init.headers as Record<string, string>;

describe("SiigoClient", () => {
  it("authenticates once, sends Partner-Id and the bearer token, and reuses the token", async () => {
    const { client, calls } = setup([token(), () => json(200, [{ id: 1 }]), () => json(200, [{ id: 2 }])]);
    await client.request("GET", "/v1/taxes");
    await client.request("GET", "/v1/document-types", { query: { type: "FV" } });
    expect(calls.map((c) => c.url)).toEqual(["https://api.siigo.com/auth", "https://api.siigo.com/v1/taxes", "https://api.siigo.com/v1/document-types?type=FV"]);
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ username: "api@amantti.co", access_key: "secret-key" });
    expect(headers(calls[0].init)["Partner-Id"]).toBe("CafeAmantti");
    expect(headers(calls[1].init)).toMatchObject({ Authorization: "Bearer tok-1", "Partner-Id": "CafeAmantti" });
  });

  it("renews the token before its 24 h expiry", async () => {
    const { client, calls, advance } = setup([token("a"), () => json(200, {}), token("b"), () => json(200, {})]);
    await client.request("GET", "/v1/users");
    advance(23.9 * 3600 * 1000);
    await client.request("GET", "/v1/users");
    expect(headers(calls[3].init).Authorization).toBe("Bearer b");
  });

  it("re-authenticates once when a request gets 401", async () => {
    const { client, calls } = setup([token("old"), () => json(401, {}), token("new"), () => json(200, { ok: true })]);
    expect(await client.request("GET", "/v1/users")).toEqual({ ok: true });
    expect(headers(calls[3].init).Authorization).toBe("Bearer new");
  });

  it("backs off and retries when Siigo rate-limits (100 requests/minute)", async () => {
    const { client, sleep } = setup([token(), () => json(429, {}), () => json(429, {}), () => json(200, { ok: 1 })]);
    expect(await client.request("GET", "/v1/products")).toEqual({ ok: 1 });
    expect(sleep).toHaveBeenNthCalledWith(1, 2000);
    expect(sleep).toHaveBeenNthCalledWith(2, 4000);
  });

  it("sends Idempotency-Key only on POST", async () => {
    const { client, calls } = setup([token(), () => json(201, { id: "inv" }), () => json(200, {})]);
    await client.request("POST", "/v1/invoices", { body: { a: 1 }, idempotencyKey: "FVabc" });
    await client.request("GET", "/v1/invoices/inv", { idempotencyKey: "FVabc" });
    expect(headers(calls[1].init)["Idempotency-Key"]).toBe("FVabc");
    expect(headers(calls[2].init)["Idempotency-Key"]).toBeUndefined();
  });

  it("turns Siigo's error body into a readable SiigoError", async () => {
    const body = { Status: 400, Errors: [{ Code: "parameter_required", Message: "The field code is required", Params: ["code"] }] };
    const { client } = setup([token(), () => json(400, body)]);
    const err = (await client.request("POST", "/v1/products", { body: {} }).catch((e) => e)) as SiigoError;
    expect(err).toBeInstanceOf(SiigoError);
    expect(err.message).toBe("The field code is required (code)");
    expect(err.codes).toEqual(["parameter_required"]);
    expect(err.status).toBe(400);
  });

  it("explains bad credentials", async () => {
    const { client } = setup([() => json(401, {})]);
    await expect(client.request("GET", "/v1/users")).rejects.toThrow(/Autenticación con Siigo: Siigo rechazó las credenciales/);
  });

  it("reads every page of a list", async () => {
    const page = (n: number, total: number, count: number) => () =>
      json(200, { pagination: { page: n, page_size: 100, total_results: total }, results: Array.from({ length: count }, (_, i) => ({ id: `${n}-${i}` })) });
    const { client, calls } = setup([token(), page(1, 150, 100), page(2, 150, 50)]);
    const all = await client.listAll("/v1/products", { code: "X" });
    expect(all).toHaveLength(150);
    expect(calls[2].url).toBe("https://api.siigo.com/v1/products?code=X&page=2&page_size=100");
  });
});

describe("helpers", () => {
  it("credentials come from the environment; Partner-Id is cleaned", () => {
    expect(siigoConfigFromEnv({})).toBeNull();
    expect(siigoConfigFromEnv({ SIIGO_USERNAME: "u", SIIGO_ACCESS_KEY: "k" })).toEqual({ username: "u", accessKey: "k", partnerId: "CafeAmantti" });
    expect(siigoConfigFromEnv({ SIIGO_USERNAME: "u", SIIGO_ACCESS_KEY: "k", SIIGO_PARTNER_ID: "Café Amantti App" })?.partnerId).toBe("CafAmanttiApp");
  });

  it("Idempotency-Key is ≤ 30 alphanumerics and stable per record", () => {
    const k = idempotencyKey("FV", "3f2504e0-4f89-11d3-9a0c-0305e82c3301");
    expect(k).toMatch(/^[A-Za-z0-9]{1,30}$/);
    expect(k).toBe(idempotencyKey("FV", "3f2504e0-4f89-11d3-9a0c-0305e82c3301"));
  });

  it("generic messages for statuses without body", () => {
    expect(describeSiigoErrors(429, null).message).toMatch(/100 solicitudes por minuto/);
  });
});

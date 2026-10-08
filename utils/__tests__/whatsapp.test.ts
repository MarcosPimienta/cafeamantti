import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendWhatsApp, isWhatsAppConfigured } from "../whatsapp";

const ENV_KEYS = [
  "WHATSAPP_PROVIDER",
  "WHATSAPP_TO",
  "WHATSAPP_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_TEMPLATE_NAME",
  "WHATSAPP_TEMPLATE_LANG",
  "WHATSAPP_API_VERSION",
];

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of ENV_KEYS) delete process.env[k];
});

const ok = (body = "Message queued") => ({ ok: true, status: 200, text: async () => body });

describe("configuration", () => {
  it("is off without a known provider", () => {
    expect(isWhatsAppConfigured()).toBe(false);
    process.env.WHATSAPP_PROVIDER = "twilio";
    process.env.WHATSAPP_TO = "573001112233";
    expect(isWhatsAppConfigured()).toBe(false);
  });

  it("meta needs token and phone number id", () => {
    process.env.WHATSAPP_PROVIDER = "meta";
    process.env.WHATSAPP_TO = "573001112233";
    expect(isWhatsAppConfigured()).toBe(false);
    process.env.WHATSAPP_TOKEN = "t";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "123";
    expect(isWhatsAppConfigured()).toBe(true);
  });

  it("callmebot needs an apikey for every recipient", () => {
    process.env.WHATSAPP_PROVIDER = "CallMeBot"; // case-insensitive
    process.env.WHATSAPP_TO = "+573001112233:111, +573004445566";
    expect(isWhatsAppConfigured()).toBe(false);
    process.env.WHATSAPP_TO = "+573001112233:111, +573004445566:222";
    expect(isWhatsAppConfigured()).toBe(true);
  });
});

describe("sendWhatsApp", () => {
  it("never throws and explains what is missing", async () => {
    expect(await sendWhatsApp("hola")).toMatchObject({ success: false, error: expect.stringMatching(/no está configurado/) });
    process.env.WHATSAPP_PROVIDER = "meta";
    expect(await sendWhatsApp("hola")).toMatchObject({ success: false, error: expect.stringMatching(/destinatarios/) });
    process.env.WHATSAPP_TO = "573001112233";
    expect(await sendWhatsApp("hola")).toMatchObject({ success: false, error: expect.stringMatching(/credenciales/) });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("callmebot: one GET per recipient, text url-encoded, apikey never reported back", async () => {
    process.env.WHATSAPP_PROVIDER = "callmebot";
    process.env.WHATSAPP_TO = "+573001112233:111,+573004445566:222";
    fetchMock.mockResolvedValue(ok());
    const res = await sendWhatsApp("Línea 1\nLínea & 2");
    expect(res).toEqual({ success: true, recipients: ["+573001112233", "+573004445566"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const url = new URL(fetchMock.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe("https://api.callmebot.com/whatsapp.php");
    expect(url.searchParams.get("phone")).toBe("+573001112233");
    expect(url.searchParams.get("text")).toBe("Línea 1\nLínea & 2");
    expect(url.searchParams.get("apikey")).toBe("111");
  });

  it("callmebot answers 200 with an error page: that still counts as a failure", async () => {
    process.env.WHATSAPP_PROVIDER = "callmebot";
    process.env.WHATSAPP_TO = "+573001112233:999";
    fetchMock.mockResolvedValue(ok("<p>APIKey is invalid. Phone not activated</p>"));
    const res = await sendWhatsApp("x");
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/^\+573001112233: CallMeBot 200: APIKey is invalid/);
    expect(res.error).not.toContain("999");
  });

  it("meta without template sends plain text with the bearer token", async () => {
    Object.assign(process.env, { WHATSAPP_PROVIDER: "meta", WHATSAPP_TO: "573001112233", WHATSAPP_TOKEN: "tok", WHATSAPP_PHONE_NUMBER_ID: "42" });
    fetchMock.mockResolvedValue(ok("{}"));
    await sendWhatsApp("hola\nmundo");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/42/messages");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ messaging_product: "whatsapp", to: "573001112233", type: "text", text: { body: "hola\nmundo" } });
  });

  it("meta with template puts the summary in {{1}}, flattened to what Meta accepts", async () => {
    Object.assign(process.env, {
      WHATSAPP_PROVIDER: "meta",
      WHATSAPP_TO: "573001112233",
      WHATSAPP_TOKEN: "tok",
      WHATSAPP_PHONE_NUMBER_ID: "42",
      WHATSAPP_TEMPLATE_NAME: "pendientes",
    });
    fetchMock.mockResolvedValue(ok("{}"));
    await sendWhatsApp("Título\n\n• uno\t•     dos");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.template).toMatchObject({ name: "pendientes", language: { code: "es" } });
    const param: string = body.template.components[0].parameters[0].text;
    expect(param).toBe("Título • • uno •   dos");
    expect(param).not.toMatch(/[\n\t]| {4,}/);
  });

  it("reports which recipients failed and keeps sending to the rest", async () => {
    Object.assign(process.env, { WHATSAPP_PROVIDER: "meta", WHATSAPP_TO: "571,572", WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "1" });
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => "expired token" })
      .mockResolvedValueOnce(ok("{}"));
    const res = await sendWhatsApp("x");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(res.success).toBe(false);
    expect(res.error).toBe("571: Meta 401: expired token");
  });

  it("a network failure is reported, not thrown", async () => {
    Object.assign(process.env, { WHATSAPP_PROVIDER: "callmebot", WHATSAPP_TO: "+57300:1" });
    fetchMock.mockRejectedValue(new Error("ECONNRESET"));
    await expect(sendWhatsApp("x")).resolves.toMatchObject({ success: false, error: "+57300: ECONNRESET" });
  });
});

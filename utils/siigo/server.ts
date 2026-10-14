// Server-side helpers shared by the Siigo actions (settings, sync log,
// customers). Not a server-actions module: nothing here is callable from
// the browser.
import type { createClient } from "@/utils/supabase/server";
import { SiigoError, getSiigoClient } from "./api";
import { buildCustomerPayload, cleanIdentification, normalizeSiigoSettings, type AppClient, type SiigoSettings } from "./mapping";

export type Supabase = Awaited<ReturnType<typeof createClient>>;

export const todayBogota = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

export function errorText(err: unknown): string {
  if (err instanceof SiigoError) return err.message;
  return err instanceof Error ? err.message : String(err);
}

export async function siigoLog(
  supabase: Supabase,
  userId: string | null,
  entry: { entity: string; local_id?: string | null; siigo_id?: string | null; siigo_name?: string | null; status: "ok" | "error"; message?: string | null }
) {
  const { error } = await supabase.from("siigo_sync_log").insert({ ...entry, created_by: userId });
  if (error) console.error("siigo_sync_log:", error.message);
}

export async function loadSiigoSettings(supabase: Supabase): Promise<SiigoSettings> {
  const { data } = await supabase.from("siigo_settings").select("config").eq("id", 1).maybeSingle();
  return normalizeSiigoSettings(data?.config);
}

/** The client's Siigo customer: linked, found by identification, or created. Returns its identification. */
export async function ensureSiigoCustomer(supabase: Supabase, userId: string | null, client: AppClient): Promise<string> {
  const siigo = getSiigoClient();
  const { identification } = cleanIdentification(client.document_number);
  if (client.siigo_customer_id && identification) return identification;
  if (identification) {
    const found = await siigo.request<{ results?: { id: string }[] }>("GET", "/v1/customers", { query: { identification } });
    const existing = found?.results?.[0];
    if (existing) {
      await supabase.from("clients").update({ siigo_customer_id: existing.id }).eq("id", client.id);
      return identification;
    }
  }
  const { payload, problems } = buildCustomerPayload(client);
  if (problems.length) throw new Error(`Para crear el cliente en Siigo: ${problems.join(" ")}`);
  try {
    const res = await siigo.request<{ id: string }>("POST", "/v1/customers", { body: payload });
    await supabase.from("clients").update({ siigo_customer_id: res.id }).eq("id", client.id);
    await siigoLog(supabase, userId, { entity: "customer", local_id: client.id, siigo_id: res.id, siigo_name: client.name, status: "ok" });
    return payload.identification;
  } catch (err) {
    await siigoLog(supabase, userId, { entity: "customer", local_id: client.id, status: "error", message: errorText(err) });
    throw err;
  }
}

// Server-side helpers shared by the Siigo actions (settings, sync log,
// customers). Not a server-actions module: nothing here is callable from
// the browser.
import type { createClient } from "@/utils/supabase/server";
import { SiigoError, getSiigoClient } from "./api";
import { buildBranchPayload, buildCustomerPayload, buildSupplierPayload, cleanIdentification, normalizeSiigoSettings, type AppClient, type SiigoSettings } from "./mapping";
import { nextBranchOffice, type ClientSite } from "@/utils/clients/sites";

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

const norm = (v: string | null | undefined) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();

type SiigoBranch = { id: string; branch_office?: number; name?: string[]; address?: { address?: string } };

/**
 * The Siigo branch office of a client's sede: the one it is linked to, a
 * branch of the NIT already named like the sede, or a new one (the next
 * free number). The NIT's main record (branch 0) is made first if missing.
 */
export async function ensureSiigoBranch(supabase: Supabase, userId: string | null, client: AppClient, site: ClientSite): Promise<number> {
  if (site.siigo_branch_office !== null && site.siigo_branch_office !== undefined) return site.siigo_branch_office;
  const identification = await ensureSiigoCustomer(supabase, userId, client);
  const siigo = getSiigoClient();
  const found = await siigo.request<{ results?: SiigoBranch[] }>("GET", "/v1/customers", { query: { identification } });
  const branches = (found?.results ?? []).filter((b) => Number(b.branch_office ?? 0) > 0);
  const save = async (branch: number, siigoId: string) => {
    const { error } = await supabase.from("client_sites").update({ siigo_branch_office: branch, siigo_customer_id: siigoId, updated_at: new Date().toISOString() }).eq("id", site.id);
    if (error) throw error;
    return branch;
  };
  const siteName = norm(site.name);
  const match = branches.find((b) => norm((b.name ?? []).join(" ")).endsWith(siteName) || (!!site.address && norm(b.address?.address) === norm(site.address)));
  if (match) return save(Number(match.branch_office), match.id);

  const { data: others } = await supabase.from("client_sites").select("siigo_branch_office").eq("client_id", client.id);
  const taken = [...branches.map((b) => b.branch_office), ...(others ?? []).map((o: { siigo_branch_office: number | null }) => o.siigo_branch_office)];
  const branch = nextBranchOffice(taken);
  const { payload, problems } = buildBranchPayload(client, site, branch);
  if (problems.length) throw new Error(`Para crear la sede ${site.name} en Siigo: ${problems.join(" ")}`);
  try {
    const res = await siigo.request<{ id: string }>("POST", "/v1/customers", { body: payload });
    await siigoLog(supabase, userId, { entity: "customer", local_id: site.id, siigo_id: res.id, siigo_name: `${client.name} - ${site.name} (sucursal ${branch})`, status: "ok", message: "Sede creada como sucursal" });
    return save(branch, res.id);
  } catch (err) {
    await siigoLog(supabase, userId, { entity: "customer", local_id: site.id, status: "error", message: `Sede ${site.name}: ${errorText(err)}` });
    throw err;
  }
}

/**
 * The supplier of a cuenta de cobro in Siigo: found by identification, or
 * created as a Supplier (needs address and DANE city). Returns its identification.
 */
export async function ensureSiigoSupplier(
  supabase: Supabase,
  userId: string | null,
  s: { name: string; document_number: string; email?: string | null; phone?: string | null; address?: string | null; city_code?: string | null }
): Promise<string> {
  const siigo = getSiigoClient();
  const { identification } = cleanIdentification(s.document_number);
  if (!identification) throw new Error("La cuenta de cobro no tiene la cédula o NIT del proveedor.");
  const found = await siigo.request<{ results?: { id: string }[] }>("GET", "/v1/customers", { query: { identification } });
  if (found?.results?.length) return identification;
  const { payload, problems } = buildSupplierPayload(s);
  if (problems.length) throw new Error(`El proveedor no existe en Siigo. Para crearlo: ${problems.join(" ")} Complétalo en Proveedores o créalo en Siigo.`);
  try {
    const res = await siigo.request<{ id: string }>("POST", "/v1/customers", { body: payload });
    await siigoLog(supabase, userId, { entity: "customer", siigo_id: res.id, siigo_name: s.name, status: "ok", message: "Proveedor creado" });
    return identification;
  } catch (err) {
    await siigoLog(supabase, userId, { entity: "customer", status: "error", message: errorText(err) });
    throw err;
  }
}

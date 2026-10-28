// Sedes of a client (one NIT, several places it buys for). Pure functions.

export type ClientSite = {
  id: string;
  client_id: string;
  name: string;
  address?: string | null;
  city?: string | null;
  city_code?: string | null;
  contact_name?: string | null;
  phone?: string | null;
  notes?: string | null;
  active?: boolean;
  siigo_branch_office?: number | null;
  siigo_customer_id?: string | null;
};

/** "SMART FIT FABRICATO — Carrera 50 # 38 A-185, Bello": how a sede shows on invoices. */
export function siteLabel(site: Pick<ClientSite, "name" | "address" | "city">): string {
  const where = [site.address?.trim(), site.city?.trim()].filter(Boolean).join(", ");
  return where ? `${site.name.trim()} — ${where}` : site.name.trim();
}

/** The Siigo branch a new sede gets: the next free number (0 is the NIT's main one). */
export function nextBranchOffice(taken: (number | null | undefined)[]): number {
  return Math.max(0, ...taken.map((n) => Number(n ?? 0)).filter(Number.isFinite)) + 1;
}

/** What blocks saving a sede. */
export function siteProblems(s: { name?: string | null; city_code?: string | null }): string[] {
  const p: string[] = [];
  if (!s.name?.trim()) p.push("Escribe el nombre de la sede.");
  if (s.city_code && !/^\d{5}$/.test(s.city_code)) p.push("El código DANE de la ciudad tiene 5 dígitos (ej. 05001 Medellín).");
  return p;
}

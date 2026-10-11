// DANE municipality codes Siigo needs to create a customer (city_code; the
// state is its first two digits). The cities Amantti sells in most; any
// other code can be typed by hand.

export const DANE_CITIES: { name: string; code: string }[] = [
  { name: "Medellín", code: "05001" },
  { name: "Bello", code: "05088" },
  { name: "Caldas", code: "05129" },
  { name: "Copacabana", code: "05212" },
  { name: "Envigado", code: "05266" },
  { name: "Girardota", code: "05308" },
  { name: "Itagüí", code: "05360" },
  { name: "La Estrella", code: "05380" },
  { name: "Rionegro", code: "05615" },
  { name: "Sabaneta", code: "05631" },
  { name: "Barranquilla", code: "08001" },
  { name: "Bogotá", code: "11001" },
  { name: "Cartagena", code: "13001" },
  { name: "Manizales", code: "17001" },
  { name: "Pereira", code: "66001" },
  { name: "Bucaramanga", code: "68001" },
  { name: "Cali", code: "76001" },
];

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z ]/g, "").trim();

/** DANE code of a known city name ("Bogota D.C." → 11001), or null. */
export function daneCodeFor(city: string | null | undefined): string | null {
  const n = norm(city ?? "");
  if (!n) return null;
  const hit = DANE_CITIES.find((c) => n === norm(c.name) || n.startsWith(`${norm(c.name)} `));
  return hit?.code ?? null;
}

// The supplier's RUT file: where it lives in storage and what is accepted.

export const RUT_BUCKET = "supplier-documents";
export const RUT_MAX_BYTES = 10 * 1024 * 1024;
const TYPES: Record<string, string> = { "application/pdf": "pdf", "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };
export const RUT_ACCEPT = Object.keys(TYPES).join(",");

/** Why this file can't be the RUT (null when it can). */
export function rutFileProblem(file: { type: string; size: number }): string | null {
  if (!TYPES[file.type]) return "El RUT debe ser un PDF o una imagen (JPG, PNG o WEBP).";
  if (file.size > RUT_MAX_BYTES) return "El archivo del RUT supera 10 MB.";
  return null;
}

/** A new storage path for a supplier's RUT (one folder per supplier). */
export function rutStoragePath(supplierId: string, type: string, now = Date.now()): string {
  return `rut/${supplierId}/${now}.${TYPES[type] ?? "pdf"}`;
}

/** The path really belongs to that supplier's RUT folder. */
export function isRutPathOf(supplierId: string, path: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(supplierId) && new RegExp(`^rut/${supplierId}/\\d+\\.(pdf|png|jpg|webp)$`).test(path);
}

/** A natural person (CC/CE/passport): the DIAN asks for the RUT to accept the expense. */
export function isNaturalPerson(documentType: string | null | undefined): boolean {
  return ["CC", "CE", "PASAPORTE"].includes((documentType ?? "").toUpperCase());
}

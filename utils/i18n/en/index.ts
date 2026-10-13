// English for the admin, keyed by the Spanish text. One file per area.
import * as areas from "./areas";

export const EN: Record<string, string> = Object.assign({}, ...Object.values(areas));

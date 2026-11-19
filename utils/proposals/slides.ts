// Turns a proposal's content blocks into presentation slides (16:9).
// The editor keeps the same blocks as always; this decides how each one is
// shown: a cover from the proposal's title, then one slide per block, and the
// last short text as the closing slide. A block can force its layout.
// Pure: the slide component draws what this returns.

export type SlideLayout = "auto" | "split" | "columns" | "list" | "close";

export interface PriceTableItem {
  item: string;
  cost: number;
  pvp: number;
  /** Photo for the product card: a storage path, or a URL once signed. */
  imageUrl?: string;
}

export interface ProposalBlock {
  id: string;
  type: "rich-text" | "price-table" | "checklist";
  title: string;
  text?: string;
  items?: PriceTableItem[];
  checklistItems?: string[];
  showPvp?: boolean;
  showMargin?: boolean;
  /** How the slide is laid out; "auto" (or missing) lets the content decide. */
  layout?: SlideLayout;
  /** Photo for a text slide: a storage path, or a URL once signed. */
  imageUrl?: string;
}

export interface ProposalData {
  clientName: string;
  date: string;
  title: string;
  subtitle?: string;
  content: ProposalBlock[];
  sellerName?: string;
  allyLogoUrl?: string;
  backgroundImageUrl?: string;
  backgroundOpacity?: number;
  lang?: "es" | "en";
}

/** Drawn instead of a photo when a product has none. */
export type ProductArt = "roast-dark" | "leaf" | "gift" | "cup";

export interface Product {
  name: string;
  detail: string;
  /** Volume price and the like ("Desde 120 kits: $40.000 c/u"). */
  note: string;
  /** "IVA 5 %" when the text says it. */
  tax: string;
  price: number;
  pvp: number;
  photo?: string;
  /** Horizontal focus of the photo in the card ("40%"), so the bag stays in frame. */
  focus?: string;
  art?: ProductArt;
  roast?: "dark" | "medium";
}

export interface ListGroup {
  heading?: string;
  items: string[];
}

export type Slide =
  | { kind: "cover"; title: string; subtitle?: string; clientName: string; date: string; allyLogoUrl?: string; photo: string }
  | { kind: "split"; title: string; paragraphs: string[]; items: string[]; photo: string }
  | { kind: "columns"; title: string; intro: string; columns: { heading?: string; text: string }[] }
  | { kind: "list"; title: string; paragraphs: string[]; groups: ListGroup[] }
  | { kind: "products"; title: string; products: Product[]; showPvp: boolean }
  | { kind: "table"; title: string; products: Product[]; showPvp: boolean }
  | { kind: "close"; title: string; paragraphs: string[]; photo: string; sellerName?: string };

export const DEFAULT_BACKGROUND = "/images/Main_Background.jpg";
const COVER_PHOTO = "/images/Chemex_Especial_Bag.jpg";
const SPLIT_PHOTOS = ["/images/BG02.jpeg", "/images/GranosCafe.jpeg", "/images/Three_Bags.jpeg", "/images/BG01.jpg"];

const BULLET = /^\s*(?:[•\-*·▪◦]|\d{1,2}[.)])\s+/;

/** Paragraphs, and bullet lists with the short line just above them as heading. */
export function parseText(text: string): { paragraphs: string[]; groups: ListGroup[] } {
  const paragraphs: string[] = [];
  const groups: ListGroup[] = [];
  const lines = (text ?? "").split("\n").map((l) => l.trim());
  let pending: string | null = null; // a short line that may head the next list
  let current: ListGroup | null = null;

  const flushPending = () => {
    if (pending !== null) paragraphs.push(pending);
    pending = null;
  };

  for (const line of lines) {
    if (!line) continue; // blank lines between bullets keep the list together
    if (BULLET.test(line)) {
      const item = line.replace(BULLET, "").trim();
      if (!current) {
        current = { items: [] };
        if (pending !== null) current.heading = pending;
        pending = null;
        groups.push(current);
      }
      if (item) current.items.push(item);
      continue;
    }
    current = null;
    flushPending();
    if (line.length <= 60 && !/[.:;!?]$/.test(line)) pending = line;
    else paragraphs.push(line);
  }
  flushPending();
  return { paragraphs, groups: groups.filter((g) => g.items.length) };
}

/** "Título: texto" → heading and text; otherwise just the text. */
function headed(item: string): { heading?: string; text: string } {
  const m = item.match(/^([^:]{2,48}):\s+(.+)$/);
  return m ? { heading: m[1].trim(), text: m[2].trim() } : { text: item };
}

const KIT_PHOTOS: [RegExp, string, string][] = [
  [/kit detalle/, "/images/Kit_Detalle.jpg", "55%"],
  [/kit cl[áa]sico/, "/images/Kit_Clasico.jpg", "60%"],
  [/kit premium/, "/images/Kit_Premium.jpg", "53%"],
];

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Reads a price-table row ("Kit Clásico: café 250 g … Desde 120 kits: $56.000 c/u · IVA 19 %"). */
export function parseProduct(row: PriceTableItem): Product {
  let text = (row.item ?? "").trim();
  let tax = "";
  const taxMatch = text.match(/\s*·?\s*\+?\s*IVA\s*(?:del\s*)?(\d+(?:[.,]\d+)?)\s*%/i);
  if (taxMatch) {
    tax = `IVA ${taxMatch[1]} %`;
    text = text.replace(taxMatch[0], "").trim();
  }
  let note = "";
  const noteMatch = text.match(/[.\s·]*\b((?:desde|a partir de)\s[^·]*)$/i);
  if (noteMatch) {
    note = cap(noteMatch[1].trim().replace(/\.$/, ""));
    text = text.slice(0, noteMatch.index).trim();
  }
  text = text.replace(/[.·,\s]+$/, "");

  let name = text;
  let detail = "";
  const colon = text.match(/^([^:]{2,48}):\s*(.*)$/);
  if (colon) {
    name = colon[1];
    detail = colon[2];
  } else if (text.includes("(")) {
    const i = text.indexOf("(");
    name = text.slice(0, i);
    const rest = text.slice(i);
    const m = rest.match(/^\(([^)]*)\)\s*,?\s*(.*)$/);
    detail = m ? [m[1], m[2]].filter(Boolean).join(", ") : rest;
  } else if (text.includes(",")) {
    const i = text.indexOf(",");
    name = text.slice(0, i);
    detail = text.slice(i + 1);
  }
  name = name.trim();
  const short = name.replace(/^caf[ée] amantti\s+/i, "");
  if (short && /^[a-záéíóúñ]/i.test(short) && short !== name) name = cap(short);
  detail = cap(detail.trim().replace(/[.,\s]+$/, ""));

  const all = (row.item ?? "").toLowerCase();
  let photo: string | undefined;
  let focus: string | undefined;
  let art: ProductArt | undefined;
  let roast: Product["roast"];
  if (/\bkit\b|ancheta|regalo/.test(all)) {
    // The kits of the Christmas proposal have their own photo; any other kit gets the drawing.
    const kit = KIT_PHOTOS.find(([re]) => re.test(all));
    if (kit) [, photo, focus] = kit;
    else art = "gift";
  } else if (/arom[áa]tica|infusi|t[ée]\b/.test(all)) {
    photo = "/images/Aromaticas_Oficina.jpg";
    focus = "42%";
  } else if (/liofil/.test(all)) {
    photo = "/images/Liofilizado_Oficina.jpg";
    focus = "50%";
  } else if (/instant|soluble/.test(all)) {
    photo = "/images/Instantaneo_Oficina.jpg";
    focus = "50%";
  } else if (/institucional/.test(all)) {
    photo = "/images/Institucional_Greca.jpg";
    focus = "60%";
    roast = "dark";
  } else if (/honey/.test(all)) {
    photo = "/images/Honey_FrenchPress.jpg";
    focus = "65%";
  } else if (/especial/.test(all)) {
    photo = "/images/Chemex_Especial_Bag.jpg";
    focus = "60%";
  } else if (/premium/.test(all)) {
    photo = "/images/Premium_Krups.jpg";
    focus = "40%";
    roast = "medium";
  } else photo = "/images/Three_Bags.jpeg";
  if (row.imageUrl) {
    photo = row.imageUrl;
    focus = undefined;
    art = undefined;
  }

  return { name, detail, note, tax, price: Number(row.cost) || 0, pvp: Number(row.pvp) || 0, photo, focus, art, roast };
}

const textLength = (b: ProposalBlock) => (b.text ?? "").length;

/** The layout a block gets when it doesn't force one. */
export function autoLayout(block: ProposalBlock, isLast: boolean): Exclude<SlideLayout, "auto"> {
  if (block.type === "checklist") return "list";
  const { paragraphs, groups } = parseText(block.text ?? "");
  const items = groups.flatMap((g) => g.items);
  if (isLast && !items.length && textLength(block) <= 450) return "close";
  if (!items.length) return "split";
  if (
    groups.length === 1 &&
    !groups[0].heading &&
    items.length >= 2 &&
    items.length <= 4 &&
    paragraphs.length <= 1 &&
    items.every((i) => i.length <= 260)
  )
    return "columns";
  return "list";
}

/** The slides for a proposal: cover, one per block, and the closing one. */
export function buildSlides(data: ProposalData): Slide[] {
  const custom = data.backgroundImageUrl && data.backgroundImageUrl !== DEFAULT_BACKGROUND ? data.backgroundImageUrl : undefined;
  const slides: Slide[] = [
    {
      kind: "cover",
      title: data.title,
      subtitle: data.subtitle,
      clientName: data.clientName,
      date: data.date,
      allyLogoUrl: data.allyLogoUrl,
      photo: custom ?? COVER_PHOTO,
    },
  ];
  const blocks = data.content.filter((b) => b.title?.trim() || b.text?.trim() || b.items?.some((i) => i.item?.trim()) || b.checklistItems?.some(Boolean));
  let splitCount = 0;

  blocks.forEach((block, idx) => {
    const isLast = idx === blocks.length - 1;
    const title = block.title?.trim() ?? "";

    if (block.type === "price-table") {
      const products = (block.items ?? []).filter((i) => i.item?.trim()).map(parseProduct);
      const showPvp = block.showPvp !== false && products.some((p) => p.pvp > 0);
      slides.push({ kind: products.length <= 4 ? "products" : "table", title, products, showPvp });
      return;
    }

    const layout = block.layout && block.layout !== "auto" ? block.layout : autoLayout(block, isLast);
    const parsed =
      block.type === "checklist"
        ? { paragraphs: [] as string[], groups: [{ items: (block.checklistItems ?? []).map((s) => s.trim()).filter(Boolean) }] }
        : parseText(block.text ?? "");
    const items = parsed.groups.flatMap((g) => g.items);

    if (layout === "close") {
      slides.push({ kind: "close", title, paragraphs: [...parsed.paragraphs, ...items], photo: block.imageUrl ?? DEFAULT_BACKGROUND, sellerName: data.sellerName });
    } else if (layout === "split") {
      const photo = block.imageUrl ?? SPLIT_PHOTOS[splitCount++ % SPLIT_PHOTOS.length];
      slides.push({ kind: "split", title, paragraphs: parsed.paragraphs, items, photo });
    } else if (layout === "columns" && items.length) {
      slides.push({ kind: "columns", title, intro: parsed.paragraphs.join(" "), columns: items.slice(0, 4).map(headed) });
    } else {
      slides.push({ kind: "list", title, paragraphs: parsed.paragraphs, groups: parsed.groups.length ? parsed.groups : [{ items: [] }] });
    }
  });

  return slides;
}

/** Font size for running text that has to fit a slide. */
export function fitText(chars: number, sizes: [number, number, number], limits: [number, number] = [380, 700]): number {
  if (chars <= limits[0]) return sizes[0];
  if (chars <= limits[1]) return sizes[1];
  return sizes[2];
}

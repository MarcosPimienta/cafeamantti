import * as XLSX from 'xlsx';
import {
  RawSiigoRow,
  ColumnMapping,
  SiigoFieldKey,
  SiigoParsedOrder,
  SiigoParsedItem,
  InventoryLookupItem,
  ClientLookupItem,
} from './types';

// Dictionaries of recognized column names in Siigo reports (lower-case, trimmed, unaccented)
const HEADER_SYNONYMS: Record<SiigoFieldKey, string[]> = {
  invoice_number: [
    'comprobante',
    'no comprobante',
    'nro comprobante',
    'numero comprobante',
    'consecutivo',
    'factura',
    'factura de venta',
    'no factura',
    'nro factura',
    'numero factura',
    'numero de factura',
    'fv',
    'documento',
    'prefijo consecutivo',
    'numero',
    'num comprobante',
  ],
  date: [
    'fecha',
    'fecha elaboracion',
    'fecha de elaboracion',
    'fecha de emision',
    'fecha emision',
    'fecha factura',
    'fecha doc',
    'fecha creacion',
    'fecha documento',
  ],
  client_doc: [
    'identificacion',
    'nit',
    'cedula',
    'id tercero',
    'identificacion tercero',
    'nit tercero',
    'cedula tercero',
    'documento tercero',
    'doc cliente',
    'numero identificacion',
    'no identificacion',
    'tercero nit',
  ],
  client_name: [
    'cliente',
    'nombre cliente',
    'razon social',
    'nombre tercero',
    'tercero',
    'nombre del cliente',
    'cliente razon social',
    'nombre comercial',
  ],
  client_email: [
    'correo',
    'email',
    'correo electronico',
    'email cliente',
    'correo tercero',
    'e-mail',
  ],
  client_phone: [
    'telefono',
    'celular',
    'telefono cliente',
    'movil',
    'contacto',
    'telefono tercero',
  ],
  client_city: [
    'ciudad',
    'municipio',
    'ciudad cliente',
    'ciudad tercero',
  ],
  client_address: [
    'direccion',
    'direccion cliente',
    'direccion entrega',
    'direccion tercero',
    'dir',
  ],
  product_code: [
    'codigo',
    'codigo producto',
    'codigo item',
    'referencia',
    'ref',
    'sku',
    'codigo articulo',
    'item',
  ],
  product_name: [
    'producto',
    'nombre producto',
    'descripcion',
    'descripcion producto',
    'detalle',
    'nombre articulo',
    'articulo',
    'concepto',
  ],
  quantity: [
    'cantidad',
    'cant',
    'unidades',
    'qty',
    'unidades vendidas',
  ],
  unit_price: [
    'valor unitario',
    'precio unitario',
    'vr unitario',
    'precio',
    'valor unit',
    'vr. unitario',
    'precio venta',
  ],
  total_price: [
    'total',
    'valor total',
    'vr total',
    'subtotal',
    'total neto',
    'valor bruto',
    'neto',
    'total factura',
    'valor',
    'importe',
  ],
  notes: [
    'observaciones',
    'observacion',
    'notas',
    'forma de pago',
    'medio de pago',
    'comentarios',
    'estado',
    'vendedor',
  ],
};

/**
 * Remove accents, punctuation, and lowercase for robust fuzzy matching of headers.
 */
export function normalizeKey(text: string): string {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean Colombian NIT or Document: removes dots, hyphens, and verification digit suffix if needed.
 */
export function cleanDocumentNumber(doc: string | number | undefined | null): string {
  if (!doc) return '';
  return String(doc)
    .trim()
    .replace(/\./g, '')
    .split('-')[0] // keep main NIT / CC number
    .trim();
}

/**
 * Parse monetary or numeric strings commonly exported from Siigo (e.g. "$ 15.000,00" or "15000").
 */
export function parseNumber(val: any): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;

  let str = String(val).trim().replace(/[$€\s]/g, '');
  if (!str) return 0;

  // Handle standard Colombian formats:
  // e.g. "12.500" (no decimals) or "12.500,50" or "12500.50"
  if (str.includes(',') && str.includes('.')) {
    // Both comma and dot present: if dot is before comma, dot is thousands separator
    if (str.indexOf('.') < str.indexOf(',')) {
      str = str.replace(/\./g, '').replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes(',')) {
    // Only comma: check if it's decimal or thousands
    const parts = str.split(',');
    if (parts.length === 2 && parts[1].length <= 2) {
      str = str.replace(',', '.');
    } else {
      str = str.replace(/,/g, '');
    }
  } else if (str.includes('.')) {
    // Only dots: Colombian exports use the dot as thousands separator
    // ("12.500", "1.234.567"). Keep it as a decimal point only when it
    // cannot be a thousands group ("12.5", "0.125").
    const parts = str.split('.');
    const groupsOfThree = parts.slice(1).every((p) => p.length === 3);
    const leadsWithZero = /^-?0$/.test(parts[0]);
    if (parts.length > 2 || (groupsOfThree && !leadsWithZero)) {
      str = parts.join('');
    }
  }

  const num = parseFloat(str);
  return isNaN(num) ? 0 : num;
}

/**
 * Parse dates in multiple formats including Excel epoch integers and Colombian DD/MM/YYYY.
 */
export function parseDate(val: any): string {
  if (!val) return new Date().toISOString().split('T')[0];

  // Excel serial number date
  if (typeof val === 'number' && val > 30000 && val < 60000) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(excelEpoch.getTime() + val * 86400000);
    return d.toISOString().split('T')[0];
  }

  const str = String(val).trim();

  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    return str.substring(0, 10);
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dm = str.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
  if (dm) {
    const day = dm[1].padStart(2, '0');
    const month = dm[2].padStart(2, '0');
    const year = dm[3];
    return `${year}-${month}-${day}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().split('T')[0];
  }

  return new Date().toISOString().split('T')[0];
}

/**
 * Automatically detects column mapping from uploaded file headers.
 */
export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    invoice_number: '',
    date: '',
    client_doc: '',
    client_name: '',
    client_email: '',
    client_phone: '',
    client_city: '',
    client_address: '',
    product_code: '',
    product_name: '',
    quantity: '',
    unit_price: '',
    total_price: '',
    notes: '',
  };

  // Blank or symbol-only headers ("#", "  ") carry no meaning; never map them.
  const normalizedHeaders = headers
    .map(h => ({ original: h, normalized: normalizeKey(h) }))
    .filter(nh => nh.normalized.length > 0);

  const assignedOriginals = new Set<string>();

  for (const [key, synonyms] of Object.entries(HEADER_SYNONYMS) as [SiigoFieldKey, string[]][]) {
    // 1. Exact normalized match
    let match = normalizedHeaders.find(
      nh => !assignedOriginals.has(nh.original) && synonyms.includes(nh.normalized)
    );

    // 2. Partial match if no exact match
    if (!match) {
      match = normalizedHeaders.find(
        nh =>
          !assignedOriginals.has(nh.original) &&
          synonyms.some(s => nh.normalized.includes(s) || s.includes(nh.normalized))
      );
    }

    if (match) {
      mapping[key] = match.original;
      assignedOriginals.add(match.original);
    }
  }

  return mapping;
}

/**
 * Robust CSV/Delimited text parser respecting quoted values, commas, semicolons, tabs.
 */
export function parseDelimitedText(text: string): { headers: string[]; rows: RawSiigoRow[] } {
  // Strip BOM
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1);
  }

  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detect delimiter from first non-empty line
  const firstLine = lines[0];
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;
  const pipeCount = (firstLine.match(/\|/g) || []).length;

  let delimiter = ',';
  if (semicolonCount > commaCount && semicolonCount > tabCount) delimiter = ';';
  else if (tabCount > commaCount && tabCount > semicolonCount) delimiter = '\t';
  else if (pipeCount > commaCount && pipeCount > semicolonCount) delimiter = '|';

  // Parse lines into tokens
  function tokenizeLine(line: string, delim: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++; // skip escaped quote
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === delim && !inQuotes) {
        tokens.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    tokens.push(current.trim());
    return tokens;
  }

  const rawHeaders = tokenizeLine(lines[0], delimiter);
  // Ensure header names are non-empty and unique
  const headers = rawHeaders.map((h, i) => h.trim() || `Columna_${i + 1}`);

  const rows: RawSiigoRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const tokens = tokenizeLine(lines[i], delimiter);
    if (tokens.every(t => t === '')) continue; // Skip blank line

    const row: RawSiigoRow = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = tokens[j] !== undefined ? tokens[j] : '';
    }
    rows.push(row);
  }

  return { headers, rows };
}

/**
 * Parse an uploaded file buffer (XLSX, XLS, CSV, TXT).
 */
export function parseUploadedFileBuffer(
  buffer: ArrayBuffer,
  fileName: string
): { headers: string[]; rows: RawSiigoRow[] } {
  const isExcel = /\.(xlsx|xls|xlsm|xlsb)$/i.test(fileName);

  if (isExcel) {
    const workbook = XLSX.read(buffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) return { headers: [], rows: [] };

    // Parse to JSON array of objects
    const jsonRows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    if (jsonRows.length === 0) return { headers: [], rows: [] };

    const headers = Object.keys(jsonRows[0] || {});
    return { headers, rows: jsonRows };
  } else {
    // Delimited file (CSV, TXT)
    const decoder = new TextDecoder('utf-8');
    const text = decoder.decode(buffer);
    return parseDelimitedText(text);
  }
}

/**
 * Intelligent inventory item matcher.
 * Matches by exact or partial product_code, then by fuzzy normalized product_name.
 */
export function matchInventoryItem(
  rawCode: string,
  rawName: string,
  inventory: InventoryLookupItem[]
): InventoryLookupItem | null {
  const cleanCode = normalizeKey(rawCode);
  const cleanName = normalizeKey(rawName);

  // 1. Try matching by exact product_code
  if (cleanCode) {
    const byCode = inventory.find(i => normalizeKey(i.product_code) === cleanCode);
    if (byCode) return byCode;

    // Partial code match (e.g. "CAFT-250G" inside "PROD-CAFT-250G"). Only for
    // codes with letters: a bare Siigo number like "001" would otherwise be
    // "found" inside "CAFT-001" and silently pick the wrong product.
    if (/[a-z]/.test(cleanCode) && cleanCode.length >= 4) {
      const byCodePart = inventory.find(i => {
        const invCode = normalizeKey(i.product_code);
        return invCode.length >= 4 && (invCode.includes(cleanCode) || cleanCode.includes(invCode));
      });
      if (byCodePart) return byCodePart;
    }
  }

  // 2. Try matching by product_name
  if (cleanName) {
    // Exact name match
    const byName = inventory.find(i => normalizeKey(i.product_name) === cleanName);
    if (byName) return byName;

    // Word subset matching (e.g. "Cold Brew" matching "Cold Brew 340ml")
    const words = cleanName.split(' ').filter(w => w.length > 2);
    if (words.length > 0) {
      const candidates = inventory.map(item => {
        const itemNorm = normalizeKey(item.product_name);
        const matchCount = words.filter(w => itemNorm.includes(w)).length;
        return { item, matchCount };
      });

      candidates.sort((a, b) => b.matchCount - a.matchCount);
      if (candidates[0] && candidates[0].matchCount >= Math.min(2, words.length)) {
        return candidates[0].item;
      }
    }
  }

  return null;
}

/**
 * Group raw rows into consolidated Orders with multiple line items,
 * linking CRM clients and inventory products.
 */
export function processSiigoRows(
  rows: RawSiigoRow[],
  mapping: ColumnMapping,
  inventory: InventoryLookupItem[],
  crmClients: ClientLookupItem[],
  existingInvoices: Set<string>
): SiigoParsedOrder[] {
  const ordersMap = new Map<string, SiigoParsedOrder>();
  let fallbackCounter = 1;

  for (const row of rows) {
    let invoice = mapping.invoice_number ? String(row[mapping.invoice_number] || '').trim() : '';
    const dateStr = mapping.date ? parseDate(row[mapping.date]) : new Date().toISOString().split('T')[0];
    const clientDoc = mapping.client_doc ? String(row[mapping.client_doc] || '').trim() : '';
    const clientName = mapping.client_name ? String(row[mapping.client_name] || '').trim() : 'Cliente Siigo';
    const clientEmail = mapping.client_email ? String(row[mapping.client_email] || '').trim() : '';
    const clientPhone = mapping.client_phone ? String(row[mapping.client_phone] || '').trim() : '';
    const clientCity = mapping.client_city ? String(row[mapping.client_city] || '').trim() : 'Bogotá';
    const clientAddress = mapping.client_address ? String(row[mapping.client_address] || '').trim() : 'Mostrador / Tienda';
    const notes = mapping.notes ? String(row[mapping.notes] || '').trim() : '';

    const rawCode = mapping.product_code ? String(row[mapping.product_code] || '').trim() : '';
    const rawName = mapping.product_name ? String(row[mapping.product_name] || '').trim() : 'Producto Siigo';
    const quantity = mapping.quantity ? Math.max(0.01, parseNumber(row[mapping.quantity])) : 1;
    const unitPrice = mapping.unit_price ? parseNumber(row[mapping.unit_price]) : 0;
    let totalPrice = mapping.total_price ? parseNumber(row[mapping.total_price]) : 0;

    if (totalPrice === 0 && unitPrice > 0) {
      totalPrice = unitPrice * quantity;
    }

    // Skip totally empty or header repeat rows
    if (!rawName && !rawCode && totalPrice === 0) continue;

    // If no invoice number is provided, synthesize a unique key based on client and date
    if (!invoice) {
      invoice = `SIIGO-DOC-${fallbackCounter++}`;
    }

    // Match inventory
    const matchedInv = matchInventoryItem(rawCode, rawName, inventory);

    const item: SiigoParsedItem = {
      raw_code: rawCode,
      raw_name: rawName,
      quantity,
      unit_price: unitPrice || (totalPrice / quantity),
      total_price: totalPrice,
      matched_inventory_id: matchedInv ? matchedInv.id : null,
      matched_product_code: matchedInv ? matchedInv.product_code : null,
      matched_product_name: matchedInv ? matchedInv.product_name : null,
      stock_available: matchedInv ? matchedInv.current_stock : undefined,
    };

    if (!ordersMap.has(invoice)) {
      // Find CRM client match
      const cleanDoc = cleanDocumentNumber(clientDoc);
      let matchedClient: ClientLookupItem | undefined;

      if (cleanDoc) {
        matchedClient = crmClients.find(c => cleanDocumentNumber(c.document_number) === cleanDoc);
      }
      if (!matchedClient && clientName) {
        const normName = normalizeKey(clientName);
        matchedClient = crmClients.find(c => normalizeKey(c.name) === normName);
      }

      const alreadyExists = existingInvoices.has(invoice);

      ordersMap.set(invoice, {
        invoice_number: invoice,
        date: dateStr,
        client_doc: clientDoc,
        client_name: matchedClient ? matchedClient.name : clientName,
        client_email: clientEmail || (matchedClient?.email || ''),
        client_phone: clientPhone || (matchedClient?.phone || ''),
        client_city: clientCity || (matchedClient?.city || 'Bogotá'),
        client_address: clientAddress || (matchedClient?.address || 'Mostrador / Tienda'),
        notes,
        total_amount: totalPrice,
        items: [item],
        matched_client_id: matchedClient ? matchedClient.id : null,
        is_new_client: !matchedClient,
        already_exists: alreadyExists,
      });
    } else {
      const order = ordersMap.get(invoice)!;
      order.total_amount += totalPrice;
      order.items.push(item);
      if (notes && !order.notes.includes(notes)) {
        order.notes += (order.notes ? ' | ' : '') + notes;
      }
    }
  }

  return Array.from(ordersMap.values());
}

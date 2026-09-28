export interface RawSiigoRow {
  [key: string]: any;
}

export type SiigoFieldKey =
  | 'invoice_number'
  | 'date'
  | 'client_doc'
  | 'client_name'
  | 'client_email'
  | 'client_phone'
  | 'client_city'
  | 'client_address'
  | 'product_code'
  | 'product_name'
  | 'quantity'
  | 'unit_price'
  | 'total_price'
  | 'notes';

export interface ColumnMapping {
  invoice_number: string;
  date: string;
  client_doc: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  client_city: string;
  client_address: string;
  product_code: string;
  product_name: string;
  quantity: string;
  unit_price: string;
  total_price: string;
  notes: string;
}

export interface SiigoParsedItem {
  raw_code: string;
  raw_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  matched_inventory_id: string | null;
  matched_product_code: string | null;
  matched_product_name: string | null;
  stock_available?: number;
}

export interface SiigoParsedOrder {
  invoice_number: string;
  date: string; // ISO YYYY-MM-DD
  client_doc: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  client_city: string;
  client_address: string;
  notes: string;
  total_amount: number;
  items: SiigoParsedItem[];
  matched_client_id: string | null;
  is_new_client: boolean;
  already_exists: boolean;
  existing_order_id?: string;
}

export interface SiigoImportOptions {
  defaultStatus: 'paid' | 'delivered' | 'processing' | 'pending';
  syncInventory: boolean;
  syncClients: boolean;
  useSaleDate: boolean;
  skipExisting: boolean;
}

export interface InventoryLookupItem {
  id: string;
  product_code: string;
  product_name: string;
  category: string;
  unit: string;
  current_stock: number;
}

export interface ClientLookupItem {
  id: string;
  name: string;
  document_number: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  department: string | null;
}

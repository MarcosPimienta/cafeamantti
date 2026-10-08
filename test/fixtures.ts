// Shared seed data for action tests: a small inventory that covers roasted
// coffee (packed and bulk), packaging and a non-sold accessory.

export const INVENTORY = () => [
  { id: "inv-250", product_code: "CAFT-250G", product_name: "Café Tostado 250g", category: "cafe", unit: "unidad", current_stock: 20, min_stock: 5, is_sellable: true },
  { id: "inv-2k5", product_code: "CAFT-2K5", product_name: "Café Tostado 2.5kg", category: "cafe", unit: "unidad", current_stock: 5, min_stock: 1, is_sellable: true },
  { id: "inv-bulk", product_code: "CAFT-001", product_name: "Café Tostado KG", category: "cafe", unit: "kg", current_stock: 10, min_stock: 1, is_sellable: true },
  { id: "inv-hon", product_code: "CAFT-HON-250G", product_name: "Café Honey 250g", category: "cafe", unit: "unidad", current_stock: 8, min_stock: 1, is_sellable: true },
  { id: "inv-cold", product_code: "CAFC-340ML", product_name: "Cold Brew 340ml", category: "cafe", unit: "unidad", current_stock: 12, min_stock: 1, is_sellable: true },
  { id: "inv-bag", product_code: "EMP-BOLSA-FIR-250G", product_name: "Bolsa 250g", category: "empaque", unit: "unidad", current_stock: 100, min_stock: 10, is_sellable: false },
  { id: "inv-stk", product_code: "STK-AMT-FIR", product_name: "Sticker Premium", category: "empaque", unit: "unidad", current_stock: 100, min_stock: 10, is_sellable: false },
  { id: "inv-cup", product_code: "POC-001", product_name: "Pocillo", category: "accesorio", unit: "unidad", current_stock: 10, min_stock: 1, is_sellable: false },
];

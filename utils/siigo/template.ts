import * as XLSX from 'xlsx';
import { InventoryLookupItem } from './types';

export const TEMPLATE_COLUMNS = [
  'Comprobante',
  'Fecha',
  'Identificación',
  'Cliente',
  'Teléfono',
  'Email',
  'Ciudad',
  'Dirección',
  'Código Producto',
  'Descripción Producto',
  'Cantidad',
  'Valor Unitario',
  'Valor Total',
  'Observaciones',
];

/**
 * Generate sample rows using real inventory items where possible.
 */
export function generateTemplateSampleRows(inventory: InventoryLookupItem[]) {
  const sampleItems = inventory.slice(0, 4);

  const today = new Date().toISOString().split('T')[0];

  return [
    {
      'Comprobante': 'FV-1-1001',
      'Fecha': today,
      'Identificación': '901774397-8',
      'Cliente': 'Grupo NONNA SAS',
      'Teléfono': '3001234567',
      'Email': 'contacto@dellanonna.com.co',
      'Ciudad': 'Bogotá',
      'Dirección': 'Carrera 7 # 72-10',
      'Código Producto': sampleItems[0]?.product_code || 'CAFT-250G',
      'Descripción Producto': sampleItems[0]?.product_name || 'Café Tostado 250g',
      'Cantidad': 10,
      'Valor Unitario': 28000,
      'Valor Total': 280000,
      'Observaciones': 'Transferencia Bancolombia - Siigo Nube',
    },
    {
      'Comprobante': 'FV-1-1001',
      'Fecha': today,
      'Identificación': '901774397-8',
      'Cliente': 'Grupo NONNA SAS',
      'Teléfono': '3001234567',
      'Email': 'contacto@dellanonna.com.co',
      'Ciudad': 'Bogotá',
      'Dirección': 'Carrera 7 # 72-10',
      'Código Producto': sampleItems[1]?.product_code || 'CAFC-340ML',
      'Descripción Producto': sampleItems[1]?.product_name || 'Cold Brew 340ml',
      'Cantidad': 24,
      'Valor Unitario': 8500,
      'Valor Total': 204000,
      'Observaciones': 'Transferencia Bancolombia - Siigo Nube',
    },
    {
      'Comprobante': 'FV-1-1002',
      'Fecha': today,
      'Identificación': '1018456789',
      'Cliente': 'María Camila Rojas',
      'Teléfono': '3109876543',
      'Email': 'camila.rojas@gmail.com',
      'Ciudad': 'Medellín',
      'Dirección': 'Calle 10 # 43E-20',
      'Código Producto': sampleItems[2]?.product_code || 'CAFT-500G',
      'Descripción Producto': sampleItems[2]?.product_name || 'Café Tostado 500g',
      'Cantidad': 2,
      'Valor Unitario': 48000,
      'Valor Total': 96000,
      'Observaciones': 'Venta directa mostrador',
    },
  ];
}

/**
 * Creates and triggers download of an Excel (.xlsx) template.
 */
export function downloadExcelTemplate(inventory: InventoryLookupItem[]) {
  const sampleData = generateTemplateSampleRows(inventory);
  const worksheet = XLSX.utils.json_to_sheet(sampleData, { header: TEMPLATE_COLUMNS });

  // Column widths
  worksheet['!cols'] = [
    { wch: 16 }, // Comprobante
    { wch: 12 }, // Fecha
    { wch: 18 }, // Identificación
    { wch: 28 }, // Cliente
    { wch: 14 }, // Teléfono
    { wch: 25 }, // Email
    { wch: 15 }, // Ciudad
    { wch: 28 }, // Dirección
    { wch: 20 }, // Código Producto
    { wch: 28 }, // Descripción Producto
    { wch: 10 }, // Cantidad
    { wch: 14 }, // Valor Unitario
    { wch: 14 }, // Valor Total
    { wch: 30 }, // Observaciones
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Plantilla Ventas Siigo');

  // Second sheet: Current inventory reference list
  if (inventory && inventory.length > 0) {
    const invData = inventory.map(i => ({
      'Código SKU': i.product_code,
      'Nombre de Producto': i.product_name,
      'Categoría': i.category,
      'Unidad': i.unit,
      'Stock Actual': i.current_stock,
    }));
    const invSheet = XLSX.utils.json_to_sheet(invData);
    invSheet['!cols'] = [{ wch: 20 }, { wch: 32 }, { wch: 15 }, { wch: 10 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(workbook, invSheet, 'Catálogo Café Amantti');
  }

  XLSX.writeFile(workbook, 'Plantilla_Ventas_Siigo_Amantti.xlsx');
}

/**
 * Creates and triggers download of a CSV template with UTF-8 BOM.
 */
export function downloadCsvTemplate(inventory: InventoryLookupItem[]) {
  const sampleData = generateTemplateSampleRows(inventory);

  const csvRows = [
    TEMPLATE_COLUMNS.join(';'),
    ...sampleData.map(row =>
      TEMPLATE_COLUMNS.map(col => {
        const val = (row as any)[col] ?? '';
        return `"${String(val).replace(/"/g, '""')}"`;
      }).join(';')
    ),
  ];

  const csvString = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'Plantilla_Ventas_Siigo_Amantti.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

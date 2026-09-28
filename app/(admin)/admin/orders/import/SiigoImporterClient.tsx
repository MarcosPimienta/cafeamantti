"use client";

import React, { useState, useRef } from "react";
import Link from "next/link";
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  FileText,
  Download,
  Users,
  Package,
  Layers,
  ChevronDown,
  ChevronUp,
  X,
  Info,
  DollarSign,
  Calendar,
} from "lucide-react";
import {
  InventoryLookupItem,
  ClientLookupItem,
  RawSiigoRow,
  ColumnMapping,
  SiigoParsedOrder,
  SiigoImportOptions,
} from "@/utils/siigo/types";
import {
  parseUploadedFileBuffer,
  detectColumnMapping,
  processSiigoRows,
} from "@/utils/siigo/parser";
import {
  downloadExcelTemplate,
  downloadCsvTemplate,
} from "@/utils/siigo/template";
import { executeSiigoImportAction } from "./actions";

interface Props {
  initialInventory: InventoryLookupItem[];
  initialClients: ClientLookupItem[];
  initialExistingInvoices: string[];
}

export default function SiigoImporterClient({
  initialInventory,
  initialClients,
  initialExistingInvoices,
}: Props) {
  // Stepper state: 1 = File Upload, 2 = Column Mapping, 3 = Preview & Options, 4 = Success
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<RawSiigoRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Mapping state
  const [mapping, setMapping] = useState<ColumnMapping>({
    invoice_number: "",
    date: "",
    client_doc: "",
    client_name: "",
    client_email: "",
    client_phone: "",
    client_city: "",
    client_address: "",
    product_code: "",
    product_name: "",
    quantity: "",
    unit_price: "",
    total_price: "",
    notes: "",
  });

  // Parsed orders state
  const [parsedOrders, setParsedOrders] = useState<SiigoParsedOrder[]>([]);
  const [expandedInvoices, setExpandedInvoices] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "ready" | "duplicates">("all");

  // Options state
  const [options, setOptions] = useState<SiigoImportOptions>({
    defaultStatus: "paid",
    syncInventory: true,
    syncClients: true,
    useSaleDate: true,
    skipExisting: true,
  });

  // Execution state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [resultSummary, setResultSummary] = useState<{
    importedCount: number;
    skippedCount: number;
    clientsCreatedCount: number;
    totalRevenue: number;
    errors: string[];
  } | null>(null);

  const existingInvoicesSet = new Set(initialExistingInvoices);

  // Format COP currency
  const formatCOP = (num: number) => {
    return new Intl.NumberFormat("es-CO", {
      style: "currency",
      currency: "COP",
      maximumFractionDigits: 0,
    }).format(num);
  };

  // Handle file reading
  const handleFile = async (selectedFile: File) => {
    setErrorMsg("");
    setFile(selectedFile);
    try {
      const buffer = await selectedFile.arrayBuffer();
      const { headers, rows } = parseUploadedFileBuffer(buffer, selectedFile.name);

      if (headers.length === 0 || rows.length === 0) {
        setErrorMsg("El archivo no contiene filas o no se pudo leer correctamente.");
        return;
      }

      setFileHeaders(headers);
      setRawRows(rows);

      // Auto-detect mapping
      const autoMap = detectColumnMapping(headers);
      setMapping(autoMap);
      setStep(2);
    } catch (err: any) {
      console.error("Error reading file:", err);
      setErrorMsg("Ocurrió un error al procesar el archivo: " + err.message);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  // Move from Mapping to Preview
  const handleProceedToPreview = () => {
    if (!mapping.product_name && !mapping.product_code) {
      setErrorMsg("Debes mapear al menos la columna de 'Producto' o 'Código de Producto'.");
      return;
    }
    setErrorMsg("");

    const processed = processSiigoRows(
      rawRows,
      mapping,
      initialInventory,
      initialClients,
      existingInvoicesSet
    );

    setParsedOrders(processed);
    setStep(3);
  };

  // Update line item inventory association
  const handleItemInventoryChange = (
    invoiceNumber: string,
    itemIndex: number,
    inventoryId: string
  ) => {
    const updated = [...parsedOrders];
    const order = updated.find((o) => o.invoice_number === invoiceNumber);
    if (!order) return;

    const matchedItem = initialInventory.find((i) => i.id === inventoryId);
    order.items[itemIndex].matched_inventory_id = matchedItem ? matchedItem.id : null;
    order.items[itemIndex].matched_product_code = matchedItem ? matchedItem.product_code : null;
    order.items[itemIndex].matched_product_name = matchedItem ? matchedItem.product_name : null;
    order.items[itemIndex].stock_available = matchedItem ? matchedItem.current_stock : undefined;

    setParsedOrders(updated);
  };

  const toggleInvoiceExpand = (invoice: string) => {
    setExpandedInvoices((prev) => ({ ...prev, [invoice]: !prev[invoice] }));
  };

  // Execute Import
  const handleExecuteImport = async () => {
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await executeSiigoImportAction(parsedOrders, options);
      if (res.success || res.skippedCount > 0) {
        setResultSummary(res);
        setStep(4);
      } else {
        setErrorMsg(
          res.errors.length > 0
            ? res.errors.join("\n")
            : "No se pudo importar ninguna factura. Verifica los datos."
        );
      }
    } catch (err: any) {
      console.error("Import error:", err);
      setErrorMsg(err.message || "Error al ejecutar la importación.");
    } finally {
      setLoading(false);
    }
  };

  // Reset to start
  const handleReset = () => {
    setStep(1);
    setFile(null);
    setFileHeaders([]);
    setRawRows([]);
    setParsedOrders([]);
    setResultSummary(null);
    setErrorMsg("");
  };

  // Calculations for preview KPIs
  const totalOrdersCount = parsedOrders.length;
  const duplicateOrdersCount = parsedOrders.filter((o) => o.already_exists).length;
  const newClientsCount = parsedOrders.filter((o) => o.is_new_client).length;
  const totalGrossRevenue = parsedOrders.reduce((sum, o) => sum + o.total_amount, 0);

  const totalLineItems = parsedOrders.reduce((sum, o) => sum + o.items.length, 0);
  const matchedLineItems = parsedOrders.reduce(
    (sum, o) => sum + o.items.filter((i) => i.matched_inventory_id).length,
    0
  );
  const matchPercentage =
    totalLineItems > 0 ? Math.round((matchedLineItems / totalLineItems) * 100) : 0;

  // Filtered orders list
  const filteredOrders = parsedOrders.filter((order) => {
    if (filterType === "duplicates" && !order.already_exists) return false;
    if (filterType === "ready" && order.already_exists) return false;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const inInvoice = order.invoice_number.toLowerCase().includes(term);
      const inClient = order.client_name.toLowerCase().includes(term);
      const inDoc = order.client_doc.toLowerCase().includes(term);
      const inItems = order.items.some((i) =>
        (i.raw_name || "").toLowerCase().includes(term) ||
        (i.raw_code || "").toLowerCase().includes(term)
      );
      return inInvoice || inClient || inDoc || inItems;
    }
    return true;
  });

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#C59F59] mb-1">
            <Link href="/admin/orders" className="hover:underline">
              Órdenes
            </Link>
            <span>/</span>
            <span>Importador Siigo</span>
          </div>
          <h1 className="text-3xl font-serif text-foreground">Importar Ventas desde Siigo</h1>
          <p className="text-sm text-foreground/60">
            Carga de ventas por archivo plano (Excel o CSV) con sincronización de inventario, CRM y Flujo de Caja.
          </p>
        </div>

        {/* Template Downloads */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadExcelTemplate(initialInventory)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-[#C59F59]/30 text-[#C59F59] hover:bg-[#C59F59]/5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm"
            title="Descargar plantilla lista en formato Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Plantilla Excel (.xlsx)
          </button>
          <button
            onClick={() => downloadCsvTemplate(initialInventory)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-foreground/15 text-foreground/70 hover:bg-foreground/5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm"
            title="Descargar plantilla lista en formato CSV delimitado por punto y coma"
          >
            <Download className="w-4 h-4" />
            Plantilla CSV
          </button>
        </div>
      </div>

      {/* Stepper Progress Bar */}
      <div className="bg-white rounded-2xl border border-foreground/10 p-4 shadow-sm">
        <div className="grid grid-cols-3 gap-2">
          {/* Step 1 */}
          <div
            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
              step === 1
                ? "bg-[#C59F59]/10 border border-[#C59F59]/40 text-[#C59F59]"
                : step > 1
                ? "bg-green-50 text-green-700 border border-green-200"
                : "text-foreground/40"
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                step === 1
                  ? "bg-[#C59F59] text-white"
                  : step > 1
                  ? "bg-green-600 text-white"
                  : "bg-foreground/10 text-foreground/50"
              }`}
            >
              {step > 1 ? "✓" : "1"}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider truncate">1. Carga de Archivo</p>
              <p className="text-[11px] text-foreground/50 truncate">
                {file ? file.name : "Subir Excel o CSV"}
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div
            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
              step === 2
                ? "bg-[#C59F59]/10 border border-[#C59F59]/40 text-[#C59F59]"
                : step > 2
                ? "bg-green-50 text-green-700 border border-green-200"
                : "text-foreground/40"
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                step === 2
                  ? "bg-[#C59F59] text-white"
                  : step > 2
                  ? "bg-green-600 text-white"
                  : "bg-foreground/10 text-foreground/50"
              }`}
            >
              {step > 2 ? "✓" : "2"}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider truncate">2. Mapeo de Columnas</p>
              <p className="text-[11px] text-foreground/50 truncate">
                {step >= 2 ? "Detectado automáticamente" : "Correspondencia de campos"}
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div
            className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
              step === 3
                ? "bg-[#C59F59]/10 border border-[#C59F59]/40 text-[#C59F59]"
                : step === 4
                ? "bg-green-50 text-green-700 border border-green-200"
                : "text-foreground/40"
            }`}
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                step === 3
                  ? "bg-[#C59F59] text-white"
                  : step === 4
                  ? "bg-green-600 text-white"
                  : "bg-foreground/10 text-foreground/50"
              }`}
            >
              {step === 4 ? "✓" : "3"}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wider truncate">3. Vista Previa & Carga</p>
              <p className="text-[11px] text-foreground/50 truncate">
                {parsedOrders.length > 0 ? `${parsedOrders.length} facturas listas` : "Validar e importar"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-red-700 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-red-500" />
          <div className="flex-1 whitespace-pre-line">{errorMsg}</div>
          <button onClick={() => setErrorMsg("")} className="text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 1: FILE UPLOAD                                      */}
      {/* ======================================================== */}
      {step === 1 && (
        <div className="bg-white rounded-3xl border border-foreground/10 p-8 shadow-sm space-y-8">
          <div className="text-center max-w-xl mx-auto space-y-2">
            <div className="w-16 h-16 bg-[#C59F59]/10 rounded-2xl flex items-center justify-center mx-auto text-[#C59F59] mb-4">
              <UploadCloud className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-serif text-foreground">Sube el archivo de ventas de Siigo</h2>
            <p className="text-sm text-foreground/60">
              Arrastra aquí tu archivo exportado de Siigo Nube o haz clic para seleccionarlo de tu equipo.
              Acepta formatos <strong>Excel (.xlsx, .xls)</strong> y <strong>archivos planos CSV (.csv, .txt)</strong>.
            </p>
          </div>

          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-3xl p-12 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-[#C59F59] bg-[#C59F59]/5 scale-[1.01]"
                : "border-foreground/20 hover:border-[#C59F59]/60 hover:bg-foreground/[0.01]"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
            />
            <div className="flex flex-col items-center gap-3">
              <FileSpreadsheet className="w-12 h-12 text-foreground/40" />
              <div>
                <p className="text-base font-semibold text-foreground">
                  Selecciona o arrastra tu archivo exportado
                </p>
                <p className="text-xs text-foreground/50 mt-1">
                  Formatos soportados: .xlsx, .xls, .csv delimitado por coma o punto y coma
                </p>
              </div>
              <button
                type="button"
                className="mt-2 px-6 py-2.5 bg-[#C59F59] text-white text-xs font-bold uppercase tracking-wider rounded-xl shadow-sm hover:bg-[#b08d4b] transition-all"
              >
                Examinar Archivo
              </button>
            </div>
          </div>

          {/* Helper Tips */}
          <div className="bg-[#fcfaf5] border border-[#C59F59]/20 rounded-2xl p-6">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-[#C59F59]" />
              ¿Cómo exportar desde Siigo Nube para mejores resultados?
            </h3>
            <ul className="text-xs text-foreground/70 space-y-2 list-disc list-inside">
              <li>
                En Siigo Nube, ve a <strong>Ventas &gt; Facturas de venta</strong> o <strong>Reportes de Ventas por Producto</strong>.
              </li>
              <li>
                Asegúrate de incluir las columnas de <strong>Comprobante/Factura</strong>, <strong>Fecha</strong>, <strong>Cliente / NIT</strong>, <strong>Producto / Código</strong>, <strong>Cantidad</strong> y <strong>Valor Total</strong>.
              </li>
              <li>
                Si una factura contiene múltiples productos, Siigo los exporta en filas continuas con el mismo número de comprobante. El importador agrupará automáticamente esos renglones en una sola orden.
              </li>
              <li>
                ¿No estás seguro del formato? Descarga la <strong>Plantilla Modelo</strong> arriba y compárala con tu archivo.
              </li>
            </ul>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 2: COLUMN MAPPING ASSISTANT                         */}
      {/* ======================================================== */}
      {step === 2 && (
        <div className="bg-white rounded-3xl border border-foreground/10 p-8 shadow-sm space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-foreground/5 pb-6">
            <div>
              <h2 className="text-2xl font-serif text-foreground">Asistente de Mapeo de Columnas</h2>
              <p className="text-sm text-foreground/60">
                Se detectaron <strong>{fileHeaders.length}</strong> columnas y <strong>{rawRows.length}</strong> filas en{" "}
                <span className="font-semibold text-foreground">{file?.name}</span>. Verifica la correspondencia de campos.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-2 px-4 py-2.5 border border-foreground/15 text-foreground/70 hover:bg-foreground/5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
              >
                <ArrowLeft className="w-4 h-4" />
                Cambiar Archivo
              </button>
              <button
                onClick={handleProceedToPreview}
                className="flex items-center gap-2 px-6 py-2.5 bg-[#C59F59] text-white hover:bg-[#b08d4b] rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm"
              >
                Continuar a Vista Previa
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Mapping Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                key: "invoice_number",
                label: "Número de Factura / Comprobante",
                required: true,
                desc: "Ej: FV-1-1024, Consecutivo",
              },
              {
                key: "date",
                label: "Fecha de Elaboración / Venta",
                required: true,
                desc: "Impacta la fecha en Flujo de Caja",
              },
              {
                key: "client_doc",
                label: "NIT / Cédula del Cliente",
                required: false,
                desc: "Para vincular o crear en CRM",
              },
              {
                key: "client_name",
                label: "Nombre / Razón Social",
                required: true,
                desc: "Nombre del cliente o empresa",
              },
              {
                key: "product_code",
                label: "Código Producto / SKU",
                required: false,
                desc: "Para match automático con Inventario",
              },
              {
                key: "product_name",
                label: "Descripción / Nombre Producto",
                required: true,
                desc: "Nombre del ítem vendido",
              },
              {
                key: "quantity",
                label: "Cantidad Vendida",
                required: true,
                desc: "Unidades vendidas de este ítem",
              },
              {
                key: "unit_price",
                label: "Valor Unitario",
                required: false,
                desc: "Precio por unidad en COP",
              },
              {
                key: "total_price",
                label: "Valor Total / Neto",
                required: true,
                desc: "Total del renglón o factura",
              },
              {
                key: "client_email",
                label: "Correo Electrónico",
                required: false,
                desc: "Email de contacto del cliente",
              },
              {
                key: "client_phone",
                label: "Teléfono / Celular",
                required: false,
                desc: "Teléfono de contacto",
              },
              {
                key: "client_city",
                label: "Ciudad / Municipio",
                required: false,
                desc: "Ciudad de facturación/entrega",
              },
              {
                key: "client_address",
                label: "Dirección",
                required: false,
                desc: "Dirección del cliente",
              },
              {
                key: "notes",
                label: "Observaciones / Medio de Pago",
                required: false,
                desc: "Notas o comentarios adicionales",
              },
            ].map(({ key, label, required, desc }) => {
              const currentVal = (mapping as any)[key] || "";
              const isMapped = !!currentVal;

              return (
                <div
                  key={key}
                  className={`p-4 rounded-2xl border transition-all ${
                    isMapped
                      ? "border-[#C59F59]/40 bg-[#fdfbf7]"
                      : required
                      ? "border-amber-300 bg-amber-50/40"
                      : "border-foreground/10 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="text-xs font-bold text-foreground flex items-center gap-1">
                      {label}
                      {required && <span className="text-red-500">*</span>}
                    </label>
                    {isMapped && (
                      <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" /> Mapeado
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-foreground/50 mb-3">{desc}</p>

                  <select
                    value={currentVal}
                    onChange={(e) =>
                      setMapping({ ...mapping, [key]: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-white border border-foreground/15 rounded-xl text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-[#C59F59]/30"
                  >
                    <option value="">-- No mapear / Omitir --</option>
                    {fileHeaders.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-foreground/5">
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-2 px-6 py-2.5 border border-foreground/15 text-foreground/70 hover:bg-foreground/5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Atrás
            </button>
            <button
              onClick={handleProceedToPreview}
              className="flex items-center gap-2 px-8 py-3 bg-[#C59F59] text-white hover:bg-[#b08d4b] rounded-xl text-xs font-bold uppercase tracking-wider transition-all shadow-sm"
            >
              Procesar y Ver Vista Previa
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 3: PREVIEW, INVENTORY MATCHING & EXECUTION           */}
      {/* ======================================================== */}
      {step === 3 && (
        <div className="space-y-8">
          {/* KPI Dashboard Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-foreground/10 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/50">Facturas Detectadas</p>
                  <p className="text-2xl font-serif text-foreground">{totalOrdersCount}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-foreground/10 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                  <DollarSign className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/50">Ventas Totales</p>
                  <p className="text-xl font-serif text-foreground truncate">{formatCOP(totalGrossRevenue)}</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-foreground/10 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
                  <Package className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/50">Match con Inventario</p>
                  <p className="text-2xl font-serif text-foreground">
                    {matchPercentage}%{" "}
                    <span className="text-xs font-sans text-foreground/50">
                      ({matchedLineItems}/{totalLineItems})
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-foreground/10 p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/50">Clientes CRM</p>
                  <p className="text-2xl font-serif text-foreground">
                    {newClientsCount}{" "}
                    <span className="text-xs font-sans text-foreground/50">nuevos a registrar</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Import Configuration Panel */}
          <div className="bg-[#fcfaf5] rounded-3xl border border-[#C59F59]/30 p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#C59F59]" />
              Opciones de Carga e Integración
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
              {/* Default Order Status */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground">Estado inicial de las órdenes:</label>
                <select
                  value={options.defaultStatus}
                  onChange={(e) =>
                    setOptions({ ...options, defaultStatus: e.target.value as any })
                  }
                  className="w-full px-3 py-2 bg-white border border-foreground/15 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#C59F59]/30"
                >
                  <option value="paid">Pagado (Recomendado - Aplica a Flujo de Caja)</option>
                  <option value="delivered">Entregado</option>
                  <option value="processing">En preparación</option>
                  <option value="pending">Pendiente de pago</option>
                </select>
                <p className="text-[11px] text-foreground/50">
                  Al marcarse como 'Pagado', se suma automáticamente a los ingresos de Flujo de Caja.
                </p>
              </div>

              {/* Sync Inventory Toggle */}
              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-foreground/10">
                <input
                  type="checkbox"
                  id="syncInventory"
                  checked={options.syncInventory}
                  onChange={(e) =>
                    setOptions({ ...options, syncInventory: e.target.checked })
                  }
                  className="mt-1 w-4 h-4 text-[#C59F59] rounded border-foreground/30 focus:ring-[#C59F59]"
                />
                <label htmlFor="syncInventory" className="cursor-pointer select-none">
                  <p className="text-xs font-bold text-foreground">Descontar Inventario automáticamente</p>
                  <p className="text-[11px] text-foreground/50">
                    Crea salidas en el Kardex asociadas a la factura de Siigo para los ítems vinculados.
                  </p>
                </label>
              </div>

              {/* Sync CRM Clients */}
              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-foreground/10">
                <input
                  type="checkbox"
                  id="syncClients"
                  checked={options.syncClients}
                  onChange={(e) =>
                    setOptions({ ...options, syncClients: e.target.checked })
                  }
                  className="mt-1 w-4 h-4 text-[#C59F59] rounded border-foreground/30 focus:ring-[#C59F59]"
                />
                <label htmlFor="syncClients" className="cursor-pointer select-none">
                  <p className="text-xs font-bold text-foreground">Registrar Clientes Nuevos en CRM</p>
                  <p className="text-[11px] text-foreground/50">
                    Crea automáticamente en el CRM los clientes no registrados previamente en la base de datos.
                  </p>
                </label>
              </div>

              {/* Use Invoice Date */}
              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-foreground/10">
                <input
                  type="checkbox"
                  id="useSaleDate"
                  checked={options.useSaleDate}
                  onChange={(e) =>
                    setOptions({ ...options, useSaleDate: e.target.checked })
                  }
                  className="mt-1 w-4 h-4 text-[#C59F59] rounded border-foreground/30 focus:ring-[#C59F59]"
                />
                <label htmlFor="useSaleDate" className="cursor-pointer select-none">
                  <p className="text-xs font-bold text-foreground">Usar Fecha Original de la Factura</p>
                  <p className="text-[11px] text-foreground/50">
                    Asegura que los reportes de ventas y Flujo de Caja queden registrados en su fecha contable.
                  </p>
                </label>
              </div>

              {/* Skip Existing Invoices */}
              <div className="flex items-start gap-3 p-3 bg-white rounded-xl border border-foreground/10">
                <input
                  type="checkbox"
                  id="skipExisting"
                  checked={options.skipExisting}
                  onChange={(e) =>
                    setOptions({ ...options, skipExisting: e.target.checked })
                  }
                  className="mt-1 w-4 h-4 text-[#C59F59] rounded border-foreground/30 focus:ring-[#C59F59]"
                />
                <label htmlFor="skipExisting" className="cursor-pointer select-none">
                  <p className="text-xs font-bold text-foreground">Omitir Facturas ya Importadas</p>
                  <p className="text-[11px] text-foreground/50">
                    Detecta facturas previamente cargadas ({duplicateOrdersCount} detectadas) para evitar duplicación.
                  </p>
                </label>
              </div>
            </div>
          </div>

          {/* Orders Table Container */}
          <div className="bg-white rounded-3xl border border-foreground/10 shadow-sm overflow-hidden space-y-4">
            {/* Table Controls */}
            <div className="p-6 border-b border-foreground/5 flex flex-col md:flex-row gap-4 justify-between items-center bg-[#fdfbf7]">
              <div className="relative w-full md:w-80">
                <input
                  type="text"
                  placeholder="Buscar por factura, cliente, NIT o producto..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2.5 bg-white border border-foreground/15 rounded-xl text-xs focus:ring-2 focus:ring-[#C59F59]/30"
                />
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto">
                <div className="flex border border-foreground/15 rounded-xl p-1 bg-white">
                  <button
                    onClick={() => setFilterType("all")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                      filterType === "all"
                        ? "bg-[#C59F59] text-white"
                        : "text-foreground/60 hover:text-foreground"
                    }`}
                  >
                    Todas ({totalOrdersCount})
                  </button>
                  <button
                    onClick={() => setFilterType("ready")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                      filterType === "ready"
                        ? "bg-[#C59F59] text-white"
                        : "text-foreground/60 hover:text-foreground"
                    }`}
                  >
                    Nuevas ({totalOrdersCount - duplicateOrdersCount})
                  </button>
                  {duplicateOrdersCount > 0 && (
                    <button
                      onClick={() => setFilterType("duplicates")}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${
                        filterType === "duplicates"
                          ? "bg-amber-500 text-white"
                          : "text-amber-700 hover:text-amber-900"
                      }`}
                    >
                      Duplicadas ({duplicateOrdersCount})
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Invoices List */}
            <div className="divide-y divide-foreground/5">
              {filteredOrders.length === 0 ? (
                <div className="text-center py-12 text-foreground/50 text-sm">
                  No se encontraron facturas con el filtro seleccionado.
                </div>
              ) : (
                filteredOrders.map((order) => {
                  const isExpanded = !!expandedInvoices[order.invoice_number];
                  const hasDuplicates = order.already_exists;

                  return (
                    <div
                      key={order.invoice_number}
                      className={`p-6 transition-colors ${
                        hasDuplicates ? "bg-amber-50/30" : "hover:bg-foreground/[0.01]"
                      }`}
                    >
                      {/* Invoice Summary Row */}
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-sm text-foreground bg-[#C59F59]/10 text-[#C59F59] px-2.5 py-1 rounded-lg">
                              #{order.invoice_number}
                            </span>
                            <span className="text-xs text-foreground/50 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {order.date}
                            </span>
                            {hasDuplicates && (
                              <span className="text-[11px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" /> Ya registrada previamente
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2 pt-1">
                            <span className="font-semibold text-sm text-foreground">
                              {order.client_name}
                            </span>
                            {order.client_doc && (
                              <span className="text-xs text-foreground/50">
                                (NIT/CC: {order.client_doc})
                              </span>
                            )}
                            {order.is_new_client ? (
                              <span className="text-[10px] bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">
                                Nuevo en CRM
                              </span>
                            ) : (
                              <span className="text-[10px] bg-green-100 text-green-700 font-bold px-2 py-0.5 rounded-full">
                                Cliente CRM existente
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Amount & Actions */}
                        <div className="flex items-center justify-between lg:justify-end gap-6">
                          <div className="text-right">
                            <p className="text-[11px] uppercase tracking-wider text-foreground/40 font-bold">Total Factura</p>
                            <p className="text-base font-serif font-bold text-foreground">
                              {formatCOP(order.total_amount)}
                            </p>
                          </div>

                          <button
                            onClick={() => toggleInvoiceExpand(order.invoice_number)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-foreground/5 hover:bg-foreground/10 text-foreground/70 rounded-xl text-xs font-semibold transition-all"
                          >
                            <span>{order.items.length} {order.items.length === 1 ? "ítem" : "ítems"}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Line Items Details (Collapsible) */}
                      {isExpanded && (
                        <div className="mt-4 pt-4 border-t border-foreground/10 space-y-3">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/50">
                            Productos en esta factura:
                          </p>

                          <div className="space-y-2">
                            {order.items.map((item, idx) => (
                              <div
                                key={idx}
                                className="p-3 bg-white rounded-xl border border-foreground/10 flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs"
                              >
                                <div className="space-y-0.5 min-w-[200px]">
                                  <p className="font-semibold text-foreground">
                                    {item.raw_name}
                                  </p>
                                  {item.raw_code && (
                                    <p className="text-[11px] text-foreground/50">
                                      SKU Original: {item.raw_code}
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center gap-6">
                                  <div className="text-center">
                                    <span className="text-[10px] uppercase text-foreground/40 block">Cant</span>
                                    <span className="font-bold text-foreground">{item.quantity}</span>
                                  </div>
                                  <div className="text-right min-w-[90px]">
                                    <span className="text-[10px] uppercase text-foreground/40 block">Subtotal</span>
                                    <span className="font-semibold text-foreground">
                                      {formatCOP(item.total_price)}
                                    </span>
                                  </div>
                                </div>

                                {/* Inventory Matching Selector */}
                                <div className="min-w-[260px]">
                                  <span className="text-[10px] uppercase text-foreground/40 block mb-1">
                                    Vincular con Inventario Amantti:
                                  </span>
                                  <select
                                    value={item.matched_inventory_id || ""}
                                    onChange={(e) =>
                                      handleItemInventoryChange(
                                        order.invoice_number,
                                        idx,
                                        e.target.value
                                      )
                                    }
                                    className={`w-full px-2.5 py-1.5 rounded-lg border text-xs font-medium focus:outline-none focus:ring-1 ${
                                      item.matched_inventory_id
                                        ? "border-green-300 bg-green-50/50 text-green-900"
                                        : "border-amber-300 bg-amber-50/40 text-amber-900"
                                    }`}
                                  >
                                    <option value="">-- No descontar de inventario --</option>
                                    {initialInventory.map((inv) => (
                                      <option key={inv.id} value={inv.id}>
                                        {inv.product_code} — {inv.product_name} ({inv.current_stock} {inv.unit} stock)
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Bottom Action Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-foreground/10">
            <button
              onClick={() => setStep(2)}
              className="flex items-center gap-2 px-6 py-3 border border-foreground/15 text-foreground/70 hover:bg-foreground/5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a Mapeo
            </button>

            <button
              onClick={handleExecuteImport}
              disabled={loading || parsedOrders.length === 0}
              className="flex items-center justify-center gap-3 px-10 py-4 bg-[#C59F59] hover:bg-[#b08d4b] text-white rounded-2xl text-sm font-bold uppercase tracking-widest shadow-md transition-all disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Importando Ventas a la Plataforma...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Importar {totalOrdersCount} Facturas a Café Amantti
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* STEP 4: SUCCESS REPORT                                   */}
      {/* ======================================================== */}
      {step === 4 && resultSummary && (
        <div className="bg-white rounded-3xl border border-green-200 p-8 shadow-sm text-center max-w-2xl mx-auto space-y-6">
          <div className="w-20 h-20 bg-green-100 text-green-700 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-3xl font-serif text-foreground">
              ¡Importación Completada con Éxito!
            </h2>
            <p className="text-sm text-foreground/60">
              Las ventas de Siigo han sido registradas y procesadas en la plataforma de Café Amantti.
            </p>
          </div>

          {/* Summary Stats Grid */}
          <div className="grid grid-cols-2 gap-4 text-left p-6 bg-[#fcfaf5] rounded-2xl border border-foreground/5">
            <div>
              <p className="text-xs uppercase tracking-wider text-foreground/50 font-bold">Facturas Creadas</p>
              <p className="text-2xl font-serif text-foreground">{resultSummary.importedCount}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-foreground/50 font-bold">Total Facturado</p>
              <p className="text-xl font-serif text-green-700 font-bold truncate">
                {formatCOP(resultSummary.totalRevenue)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-foreground/50 font-bold">Clientes CRM Creados</p>
              <p className="text-lg font-serif text-foreground">{resultSummary.clientsCreatedCount}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-foreground/50 font-bold">Facturas Omitidas (Duplicadas)</p>
              <p className="text-lg font-serif text-foreground">{resultSummary.skippedCount}</p>
            </div>
          </div>

          {/* Warnings or partial errors if any */}
          {resultSummary.errors.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-left text-xs text-amber-800 space-y-1">
              <p className="font-bold">Advertencias durante la importación:</p>
              <ul className="list-disc list-inside">
                {resultSummary.errors.map((err, i) => (
                  <li key={i}>{err}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Action Navigation Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/admin/orders"
              className="w-full sm:w-auto px-6 py-3 bg-[#C59F59] hover:bg-[#b08d4b] text-white text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm"
            >
              Ver Todas las Órdenes
            </Link>
            <Link
              href="/admin/cashflow"
              className="w-full sm:w-auto px-6 py-3 bg-white border border-foreground/15 hover:bg-foreground/5 text-foreground/80 text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm"
            >
              Ver Flujo de Caja
            </Link>
            <button
              onClick={handleReset}
              className="w-full sm:w-auto px-6 py-3 border border-foreground/15 hover:bg-foreground/5 text-foreground/60 text-xs font-bold uppercase tracking-wider rounded-xl transition-all"
            >
              Importar Otro Archivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

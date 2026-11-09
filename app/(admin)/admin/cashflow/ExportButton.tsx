'use client';

import React from "react";
import { FileSpreadsheet } from "lucide-react";
import { useTr } from "@/app/(admin)/AdminI18n";

/** Now in Bogotá, for the "Generado" line of an export. */
export const nowLabel = () => new Date().toLocaleString("es-CO", { timeZone: "America/Bogota" });

/** Builds the .xlsx in the browser; xlsx is only downloaded on the first export. */
export async function exportExcel(filename: string, sheets: import("@/utils/excel/workbook").TableSheet[]) {
  const { downloadWorkbook } = await import("@/utils/excel/workbook");
  downloadWorkbook(filename, sheets);
}

export function ExportButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  const tr = useTr();
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="flex items-center gap-2 px-4 py-2 border border-foreground/15 bg-white text-foreground/70 rounded-lg font-bold text-sm hover:bg-foreground/5 transition-colors disabled:opacity-40">
      <FileSpreadsheet className="w-4 h-4 text-emerald-700" />{" "}{tr("Exportar a Excel")}
    </button>
  );
}

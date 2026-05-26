import React from "react";
import CashflowClient from "./CashflowClient";

export const metadata = {
  title: "Flujo de Caja - Café Amantti",
  description: "Gestión de caja, ingresos, gastos y reportes",
};

export default function CashflowPage() {
  return <CashflowClient />;
}

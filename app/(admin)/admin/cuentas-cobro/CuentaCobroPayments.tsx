"use client";

import React, { useState } from "react";
import { Wallet } from "lucide-react";
import PayablePaymentForm from "../purchases/PayablePaymentForm";
import { PaymentList, type PayablePayment } from "../purchases/PurchasesClient";
import { useExpenseCategories } from "../settings/categories/useExpenseCategories";
import { namesOf } from "@/utils/expenses/categories";
import { payableBalance } from "@/utils/payables/ledger";
import { useTr } from "@/app/(admin)/AdminI18n";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
const todayBogota = () => new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Payments of a signed expense cuenta de cobro: what is owed, what was paid, and "Registrar pago". */
export default function CuentaCobroPayments({ cc, onChanged }: { cc: any; onChanged: () => void }) {
  /* eslint-enable @typescript-eslint/no-explicit-any */
  const tr = useTr();
  const categories = namesOf(useExpenseCategories(), (c) => c.type !== "CAPEX");
  const [paying, setPaying] = useState(false);
  const [notice, setNotice] = useState("");
  const payments = (cc.payments ?? []) as PayablePayment[];
  // With a support document in Siigo, what it left owed (net of withholding).
  const total = Number(cc.siigo_ds_owed ?? cc.total_amount);
  const balance = payableBalance(total, payments);

  return (
    <div className="space-y-1 min-w-[14rem]">
      {balance > 0.5 ? (
        <button type="button" onClick={() => setPaying(true)}
          className="inline-flex items-center gap-1 px-3 py-1 bg-stone-50 hover:bg-stone-100 border border-foreground/10 text-[#C59F59] text-xs font-bold rounded-lg transition-colors shadow-sm">
          <Wallet className="w-3.5 h-3.5" />{" "}{tr("Registrar pago")}
        </button>
      ) : (
        <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold bg-green-50 text-green-700 rounded-md border border-green-100">{tr("Pagada")}</span>
      )}
      {payments.length > 0 && balance > 0.5 && <span className="block text-[11px] text-foreground/50">{tr("Saldo {balance}", { balance: cop(balance) })}</span>}
      <PaymentList payments={payments} onDone={(msg) => { setNotice(msg); onChanged(); }} />
      {notice && <span className="block text-[11px] text-green-700 max-w-[16rem]">{notice}</span>}
      {paying && (
        <PayablePaymentForm
          target={{ cuentaCobroId: cc.id }}
          title={tr("Cuenta de cobro No. {n} · {name}", { n: String(cc.number), name: cc.issuer_name })}
          balance={balance}
          today={todayBogota()}
          categories={categories}
          defaultCategory={cc.siigo_ds_category}
          onClose={() => setPaying(false)}
          onDone={(msg) => { setPaying(false); setNotice(msg); onChanged(); }}
        />
      )}
    </div>
  );
}

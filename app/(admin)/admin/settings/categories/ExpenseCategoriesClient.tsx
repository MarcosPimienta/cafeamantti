"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Lock, Pencil, Plus } from "lucide-react";
import { createExpenseCategory, setExpenseCategoryActive, updateExpenseCategory } from "./actions";
import { CATEGORY_TYPES, categoryProblems, type CategoryType, type ExpenseCategory } from "@/utils/expenses/categories";
import { useTr } from "@/app/(admin)/AdminI18n";

const TYPE_LABEL: Record<CategoryType, string> = {
  COGS: "Costo de ventas",
  OPEX: "Gasto operativo",
  CAPEX: "Activo fijo",
  BALANCE: "Movimiento de balance",
};
const TYPE_HINT: Record<CategoryType, string> = {
  COGS: "Lo que cuesta producir o comprar lo que se vende (café, empaques, maquila).",
  OPEX: "Gastos del día a día: administración, ventas, servicios.",
  CAPEX: "Equipos, muebles o adecuaciones que duran años: se deprecian.",
  BALANCE: "Plata que sale pero no es gasto: pago de retenciones a la DIAN, abono a un préstamo. Solo en Flujo de Caja, fuera del P&L.",
};

type Draft = { id?: string; name: string; type: CategoryType | ""; months: string; account: string };
const EMPTY: Draft = { name: "", type: "", months: "", account: "" };

/** The built-in expense categories (read-only) and the team's (add, edit, deactivate). */
export default function ExpenseCategoriesClient({ categories, accounts, defaultAccounts, migrationApplied }: {
  categories: ExpenseCategory[];
  accounts: { code: string; name: string }[];
  defaultAccounts: Record<string, string>;
  migrationApplied: boolean;
}) {
  const tr = useTr();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isPending, startTransition] = useTransition();
  const own = categories.filter((c) => !c.builtIn);
  const builtIn = categories.filter((c) => c.builtIn);

  const run = (action: () => Promise<{ success: boolean; error?: string }>, ok: string, after?: () => void) =>
    startTransition(async () => {
      setError("");
      setNotice("");
      const res = await action();
      if (!res.success) return setError(res.error ?? "");
      setNotice(ok);
      after?.();
      router.refresh();
    });

  const problems = draft
    ? categoryProblems({ name: draft.name, type: draft.type, months: draft.months ? Number(draft.months) : null, account: draft.account }, draft.id ? [] : categories.map((c) => c.name))
    : [];
  const save = () => {
    if (!draft || !draft.type) return;
    const input = { type: draft.type, months: draft.months ? Number(draft.months) : null, account: draft.account };
    run(
      () => (draft.id ? updateExpenseCategory(draft.id, input) : createExpenseCategory({ ...input, name: draft.name })),
      draft.id ? tr("Categoría actualizada.") : tr("Categoría creada: ya aparece en Compras, Flujo de Caja y cuentas de cobro."),
      () => setDraft(null)
    );
  };

  const accountName = (code: string | undefined) => (code ? `${code}${accounts.find((a) => a.code === code) ? ` · ${accounts.find((a) => a.code === code)!.name}` : ""}` : tr("Sin cuenta"));
  const accountOptions = (type: CategoryType | "") => accounts.filter((a) => (type === "CAPEX" ? /^1[5-7]/ : type === "BALANCE" ? /^[12]/ : /^(14|5|6|7)/).test(a.code) || a.code === draft?.account);

  const card = "bg-white rounded-3xl border border-foreground/5 shadow-sm p-6 space-y-4";
  const field = "w-full px-3 py-2 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm";
  const row = (c: ExpenseCategory) => (
    <li key={c.name} className={`flex flex-wrap items-center justify-between gap-3 py-2.5 ${c.active ? "" : "opacity-50"}`}>
      <div className="min-w-0 text-sm">
        <p className="font-bold">
          {tr(c.name)}
          {!c.active && <span className="ml-2 text-[10px] font-bold text-foreground/40">{tr("inactiva")}</span>}
        </p>
        <p className="text-xs text-foreground/50">
          {tr(TYPE_LABEL[c.type])}
          {c.type === "CAPEX" && c.months ? ` · ${tr("{n} meses", { n: String(c.months) })}` : ""}
          {" · "}{accountName(defaultAccounts[c.name])}
        </p>
      </div>
      {c.builtIn ? (
        <Lock className="w-3.5 h-3.5 text-foreground/25" aria-label={tr("Del sistema")} />
      ) : (
        <div className="flex items-center gap-3">
          <button type="button" disabled={isPending} onClick={() => setDraft({ id: c.id, name: c.name, type: c.type, months: c.months ? String(c.months) : "", account: defaultAccounts[c.name] ?? "" })}
            aria-label={tr("Editar categoría")} className="text-foreground/40 hover:text-[#C59F59]"><Pencil className="w-3.5 h-3.5" /></button>
          <button type="button" disabled={isPending} onClick={() => run(() => setExpenseCategoryActive(c.id!, !c.active), c.active ? tr("Categoría desactivada.") : tr("Categoría activada."))}
            className="text-xs font-bold text-foreground/50 hover:text-foreground">{c.active ? tr("Desactivar") : tr("Activar")}</button>
        </div>
      )}
    </li>
  );

  return (
    <div className="space-y-6 max-w-3xl">
      {!migrationApplied && (
        <p className="flex gap-2 rounded-2xl bg-amber-50 p-4 text-sm text-amber-800"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{tr("Falta aplicar la migración 20261103000000_expense_categories.sql para crear categorías.")}</p>
      )}
      {notice && <p className="flex gap-2 rounded-xl bg-green-50 p-3 text-sm text-green-800"><CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />{notice}</p>}
      {error && <p className="text-sm text-red-600 break-words">{tr.msg(error)}</p>}

      <section className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-serif font-bold">{tr("Tus categorías")}</h2>
          {!draft && (
            <button type="button" disabled={!migrationApplied} onClick={() => setDraft({ ...EMPTY })} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59F59] text-white text-xs font-bold hover:bg-[#B38E4D] disabled:opacity-40">
              <Plus className="w-4 h-4" />{" "}{tr("Nueva categoría")}
            </button>
          )}
        </div>

        {draft && (
          <div className="rounded-2xl border border-foreground/10 p-4 space-y-3">
            <p className="text-sm font-bold">{draft.id ? tr("Editar {name}", { name: draft.name }) : tr("Nueva categoría")}</p>
            {!draft.id && (
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder={tr("Nombre, ej. Publicidad y Mercadeo (pauta, diseño)")} className={field} aria-label={tr("Nombre")} />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CATEGORY_TYPES.map((t) => (
                <button key={t} type="button" onClick={() => setDraft({ ...draft, type: t, months: t === "CAPEX" ? draft.months : "" })}
                  className={`text-left rounded-xl border p-3 text-xs ${draft.type === t ? "border-[#C59F59] bg-[#C59F59]/10" : "border-foreground/10 hover:bg-foreground/5"}`}>
                  <span className="block font-bold text-sm">{tr(TYPE_LABEL[t])}</span>
                  <span className="text-foreground/50">{tr(TYPE_HINT[t])}</span>
                </button>
              ))}
            </div>
            {draft.type === "CAPEX" && (
              <label className="flex items-center gap-2 text-xs text-foreground/60">
                <span>{tr("Vida útil sugerida:")}</span>
                <input type="number" min={1} step={1} value={draft.months} onChange={(e) => setDraft({ ...draft, months: e.target.value })} className="w-24 px-2 py-1.5 bg-white border border-foreground/10 rounded-lg text-xs" />
                <span>{tr("meses")}</span>
              </label>
            )}
            <label className="block text-xs text-foreground/60 space-y-1">
              <span>{tr("Cuenta contable por defecto (opcional)")}</span>
              {accounts.length ? (
                <select value={draft.account} onChange={(e) => setDraft({ ...draft, account: e.target.value })} className={field}>
                  <option value="">{tr("— Sin cuenta —")}</option>
                  {accountOptions(draft.type).map((a) => <option key={a.code} value={a.code}>{a.code} · {a.name}</option>)}
                </select>
              ) : (
                <input value={draft.account} onChange={(e) => setDraft({ ...draft, account: e.target.value.replace(/\D/g, "") })} placeholder={tr("Ej. 52352501")} className={field} />
              )}
              <span className="block text-[11px] text-foreground/40">{tr("Se llena sola al elegir la categoría en una compra; se puede cambiar en cada línea.")}</span>
            </label>
            {problems.length > 0 && (draft.name || draft.type) && (
              <ul className="text-xs text-amber-800 bg-amber-50 rounded-xl p-3 space-y-1">
                {problems.map((p) => <li key={p} className="flex gap-1.5"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{tr.msg(p)}</li>)}
              </ul>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setDraft(null)} className="px-4 py-2 rounded-xl border border-foreground/10 text-xs font-bold hover:bg-stone-50">{tr("Cancelar")}</button>
              <button type="button" onClick={save} disabled={isPending || problems.length > 0} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C59F59] text-white text-xs font-bold hover:bg-[#B38E4D] disabled:opacity-40">
                {isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}{" "}{tr("Guardar categoría")}
              </button>
            </div>
            <p className="text-[11px] text-foreground/40">{tr("El nombre no se puede cambiar después: los gastos guardan la categoría por su nombre. Si ya no la usas, desactívala.")}</p>
          </div>
        )}

        {own.length === 0 ? (
          <p className="text-sm text-foreground/50">{tr("Aún no has creado categorías.")}</p>
        ) : (
          <ul className="divide-y divide-foreground/5">{own.map(row)}</ul>
        )}
      </section>

      <section className={card}>
        <details>
          <summary className="cursor-pointer text-sm font-bold">{tr("Categorías del sistema ({n})", { n: String(builtIn.length) })}</summary>
          <ul className="divide-y divide-foreground/5 mt-3">{builtIn.map(row)}</ul>
          <p className="text-[11px] text-foreground/40 mt-3">{tr("Su cuenta por defecto se cambia en Ajustes → Siigo.")}</p>
        </details>
      </section>
    </div>
  );
}

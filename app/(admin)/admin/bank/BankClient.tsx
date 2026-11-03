"use client";

import React, { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, Loader2, Sparkles, Trash2, Undo2, UploadCloud } from "lucide-react";
import { acceptSuggestions, deleteStatement, ignoreLines, importStatement, markReversal, reconcile, undoMatch, type BankLine, type BankMatch, type BankStatement, type ReconRow } from "./actions";
import { balanced, difference, possibleDuplicates, signed, suggestMatches, type Suggestion } from "@/utils/bank/matching";
import { INCOME_CATEGORIES } from "../cashflow/types";
import { useExpenseCategories } from "../settings/categories/useExpenseCategories";
import { useTr } from "@/app/(admin)/AdminI18n";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2 }).format(n);
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
const monthName = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-CO", { month: "long", year: "numeric" });
const money = (n: number) => <span className={`tabular-nums font-bold ${n < 0 ? "text-red-700" : "text-green-700"}`}>{n < 0 ? "−" : "+"}{cop(Math.abs(n))}</span>;

type Props = {
  migrationApplied: boolean;
  statements: BankStatement[];
  statement: BankStatement | null;
  lines: BankLine[];
  matches: BankMatch[];
  rows: ReconRow[];
};

const KIND_LABEL: Record<BankMatch["kind"], string> = { flujo: "Conciliado", reverso: "Reverso", ignorado: "No va en Flujo de Caja" };

/**
 * One bank statement against Flujo de Caja: suggestions to accept, the bank
 * lines and the free Flujo de Caja rows to pair by hand (their money must add
 * up the same, or the difference is registered from here), and the rows of
 * the month with no bank line (cash, or a duplicate).
 */
export default function BankClient({ migrationApplied, statements, statement, lines, matches, rows }: Props) {
  const tr = useTr();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [onlyPending, setOnlyPending] = useState(true);
  const [pickedLines, setPickedLines] = useState<Set<string>>(new Set());
  const [pickedRows, setPickedRows] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<"" | "create" | "ignore">("");
  const [concept, setConcept] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const categories = useExpenseCategories();

  const matchById = useMemo(() => new Map(matches.map((m) => [m.id, m])), [matches]);
  const rowById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);
  const pendingLines = lines.filter((l) => !l.match_id);
  const freeRows = rows.filter((r) => !r.matchId);
  const suggestions = useMemo(
    () => suggestMatches(pendingLines.map((l) => ({ id: l.id, date: l.line_date, amount: l.amount, doc: l.doc ?? "", description: l.description })), freeRows),
    [pendingLines, freeRows]
  );

  const inMonth = (d: string) => !!statement && d.slice(0, 7) === statement.period_month.slice(0, 7);
  const notInBank = freeRows.filter((r) => inMonth(r.date));
  const duplicates = useMemo(() => possibleDuplicates(notInBank, rows.filter((r) => r.matchId)), [notInBank, rows]);

  const selLines = lines.filter((l) => pickedLines.has(l.id));
  const selRows = rows.filter((r) => pickedRows.has(r.id));
  const diff = difference(selLines, selRows);
  const lineSum = selLines.reduce((s, l) => s + l.amount, 0);

  const clear = () => {
    setPickedLines(new Set());
    setPickedRows(new Set());
    setMode("");
    setConcept("");
    setNote("");
  };
  const run = (action: () => Promise<{ success: boolean; error?: string }>, ok: string, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => {
      setError("");
      setNotice("");
      const res = await action();
      if (!res.success) return setError(res.error ?? "");
      setNotice(ok);
      clear();
      router.refresh();
    });
  };
  const toggle = (set: Set<string>, id: string, update: (s: Set<string>) => void) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    update(next);
  };

  const upload = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError(tr("Elige el extracto en PDF."));
    const form = new FormData();
    form.append("file", file);
    startTransition(async () => {
      setError("");
      setNotice("");
      const res = await importStatement(form);
      // Lets the same file be chosen again (after an error, or once deleted).
      if (fileRef.current) fileRef.current.value = "";
      if (!res.success) return setError(res.error);
      setNotice(tr("Extracto cargado: {n} movimientos.", { n: String(res.lines) }));
      router.push(`/admin/bank?extracto=${res.id}`);
      router.refresh();
    });
  };

  const exact = suggestions.filter((s) => balanced(s.difference));
  const acceptAll = (list: Suggestion[]) =>
    startTransition(async () => {
      setError("");
      setNotice("");
      const res = await acceptSuggestions(list);
      setNotice(tr("{n} conciliaciones guardadas.", { n: String(res.done) }));
      if (res.failed.length) setError(res.failed.join(" · "));
      clear();
      router.refresh();
    });
  const acceptFee = (s: Suggestion) => {
    const fee = rowById.get(s.expenseIds[0]);
    run(
      () => reconcile({ lineIds: s.lineIds, expenseIds: s.expenseIds, create: { concept: `Ajuste gastos bancarios ${statement ? monthName(statement.period_month) : ""}`.trim(), category: fee?.category ?? "" } }),
      tr("Conciliado, con el ajuste registrado en Flujo de Caja."),
      tr("La diferencia de {v} se registrará en Flujo de Caja como ajuste. ¿Continuar?", { v: cop(Math.abs(s.difference)) })
    );
  };

  if (!migrationApplied) return <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">{tr("Falta aplicar la migración 20261108000000_bank_reconciliation.sql para cargar extractos.")}</p>;

  const card = "bg-white rounded-3xl border border-foreground/5 shadow-sm p-6";
  const credits = lines.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const debits = -lines.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0);
  const done = lines.length - pendingLines.length;
  const q = search.trim().toLowerCase();
  const nearest = (r: ReconRow) => (selLines.length ? Math.min(...selLines.map((l) => Math.abs(Date.parse(l.line_date) - Date.parse(r.date)))) : 0);
  const candidates = freeRows
    .filter((r) => !q || r.concept.toLowerCase().includes(q) || r.category.toLowerCase().includes(q) || String(r.amount).includes(q.replace(/\D/g, "") || "\u0000"))
    .filter((r) => pickedRows.has(r.id) || !selLines.length || Math.sign(signed(r)) === Math.sign(lineSum) || lineSum === 0)
    .sort((a, b) => nearest(a) - nearest(b) || a.date.localeCompare(b.date));
  const shownLines = onlyPending ? pendingLines : lines;
  const rowLabel = (r: ReconRow) => `${day(r.date)} · ${r.concept}`;

  return (
    <div className="space-y-6">
      {notice && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {error && <p className="text-sm text-red-600 break-words">{tr.msg(error)}</p>}

      <section className={`${card} flex flex-wrap items-end justify-between gap-4`}>
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{tr("Extractos cargados")}</p>
          {statements.length === 0 ? (
            <p className="text-sm text-foreground/50">{tr("Aún no hay extractos. Carga el PDF del mes que descargas de Davivienda.")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {statements.map((s) => (
                <Link key={s.id} href={`/admin/bank?extracto=${s.id}`} onClick={clear}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-bold capitalize ${s.id === statement?.id ? "border-[#C59F59] bg-[#C59F59] text-white" : "border-foreground/10 text-foreground/70 hover:border-[#C59F59]"}`}>
                  {monthName(s.period_month)}
                  <span className={`ml-2 font-normal normal-case ${s.id === statement?.id ? "text-white/80" : "text-foreground/50"}`}>{s.pending ? tr("{n} pendientes", { n: String(s.pending) }) : "✓"}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={upload} />
          <button type="button" disabled={isPending} onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-2 rounded-xl bg-[#C59F59] px-4 py-2 text-xs font-bold text-white hover:bg-[#B38E4D] disabled:opacity-50">
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}{tr("Cargar extracto (PDF Davivienda)")}
          </button>
        </div>
      </section>

      {statement && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              ["Saldo anterior", cop(statement.opening_balance), ""],
              ["Créditos (entró)", cop(credits), "text-green-700"],
              ["Débitos (salió)", cop(debits), "text-red-700"],
              ["Nuevo saldo", cop(statement.closing_balance), ""],
            ].map(([label, value, color]) => (
              <div key={label} className="rounded-2xl border border-foreground/10 bg-white p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{tr(label)}</p>
                <p className={`mt-1 font-serif text-2xl ${color}`}>{value}</p>
              </div>
            ))}
            <div className="rounded-2xl border border-foreground/10 bg-white p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{tr("Conciliados")}</p>
              <p className="mt-1 font-serif text-2xl">{done} / {lines.length}</p>
              <div className="mt-2 h-1.5 rounded-full bg-foreground/10"><div className="h-1.5 rounded-full bg-[#C59F59]" style={{ width: `${lines.length ? (done / lines.length) * 100 : 0}%` }} /></div>
            </div>
          </div>

          {suggestions.length > 0 && (
            <section className={card}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-serif text-xl"><Sparkles className="h-5 w-5 text-[#C59F59]" />{tr("Sugerencias")} <span className="text-sm text-foreground/50">({suggestions.length})</span></h2>
                {exact.length > 0 && (
                  <button type="button" disabled={isPending} onClick={() => acceptAll(exact)} className="inline-flex items-center gap-2 rounded-xl bg-[#C59F59] px-4 py-2 text-xs font-bold text-white hover:bg-[#B38E4D] disabled:opacity-50">
                    <Check className="h-4 w-4" />{tr("Aceptar las {n} que cuadran exacto", { n: String(exact.length) })}
                  </button>
                )}
              </div>
              <p className="mb-3 text-xs text-foreground/50">{tr("Revisa que cada sugerencia sea el mismo movimiento antes de aceptarla: dos pagos del mismo valor cerca en fecha pueden confundirse.")}</p>
              <ul className="max-h-[420px] divide-y divide-foreground/5 overflow-y-auto text-sm">
                {suggestions.map((s, i) => {
                  const sl = lines.filter((l) => s.lineIds.includes(l.id));
                  const sr = [...s.incomeIds, ...s.expenseIds].map((id) => rowById.get(id)).filter((r): r is ReconRow => !!r);
                  return (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#9a7a3c]">{tr(s.reason, s.vars)}</p>
                        <p className="truncate">
                          <span className="text-foreground/50">{tr("Banco")}:</span> {sl.length > 2 ? tr("{n} movimientos", { n: String(sl.length) }) : sl.map((l) => `${day(l.line_date)} ${l.description}`).join(" + ")} · {money(difference(sl, []))}
                        </p>
                        {sr.length > 0 && <p className="truncate text-foreground/70"><span className="text-foreground/50">{tr("Flujo de Caja")}:</span> {sr.map(rowLabel).join(" + ")}</p>}
                        {!balanced(s.difference) && <p className="text-xs text-amber-700">{tr("Diferencia de {v}: se registra como ajuste.", { v: cop(Math.abs(s.difference)) })}</p>}
                      </div>
                      <button type="button" disabled={isPending}
                        onClick={() => (balanced(s.difference) ? acceptAll([s]) : acceptFee(s))}
                        className="shrink-0 rounded-xl border border-[#C59F59] px-3 py-1.5 text-xs font-bold text-[#9a7a3c] hover:bg-[#C59F59] hover:text-white disabled:opacity-50">
                        {tr("Aceptar")}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <section className={card}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-serif text-xl">{tr("Movimientos del banco")}</h2>
                <label className="flex items-center gap-1.5 text-xs text-foreground/60"><input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />{tr("Solo pendientes")}</label>
              </div>
              {shownLines.length === 0 ? (
                <p className="text-sm text-foreground/50">{tr("Todo el extracto está conciliado.")}</p>
              ) : (
                <ul className="max-h-[640px] divide-y divide-foreground/5 overflow-y-auto text-sm">
                  {shownLines.map((l) => {
                    const m = l.match_id ? matchById.get(l.match_id) : null;
                    const linked = m?.rows.map((r) => rowById.get(r.id)).filter((r): r is ReconRow => !!r) ?? [];
                    const broken = m?.kind === "flujo" && m.rows.length > 0 && linked.length === m.rows.length && !balanced(difference(lines.filter((x) => x.match_id === m.id), linked));
                    return (
                      <li key={l.id} className={`flex items-start gap-3 py-2 ${pickedLines.has(l.id) ? "bg-[#C59F59]/10" : ""}`}>
                        {!m ? (
                          <input type="checkbox" className="mt-1" checked={pickedLines.has(l.id)} onChange={() => toggle(pickedLines, l.id, setPickedLines)} aria-label={l.description} />
                        ) : (
                          <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="break-words"><span className="mr-2 text-xs text-foreground/50">{day(l.line_date)}</span>{l.description}</p>
                          <p className="text-[11px] text-foreground/40">{[l.office, l.doc && `Doc. ${l.doc}`].filter(Boolean).join(" · ")}</p>
                          {m && (
                            <p className={`text-[11px] ${broken ? "text-red-700" : "text-foreground/60"}`}>
                              <span className="font-bold">{tr(KIND_LABEL[m.kind])}</span>
                              {m.kind === "flujo" && linked.length > 0 && <> · {linked.map(rowLabel).join(" + ")}</>}
                              {m.kind === "flujo" && linked.length === 0 && <> · {tr("con registros fuera de este mes")}</>}
                              {m.note && <> · {m.note}</>}
                              {broken && <> · {tr("ya no cuadra: revisa si cambió el registro")}</>}
                              <button type="button" disabled={isPending} onClick={() => run(() => undoMatch(m.id), tr("Conciliación deshecha."), m.rows.some((r) => r.owned) ? tr("Se borrará también el registro que se creó desde el extracto. ¿Continuar?") : undefined)}
                                className="ml-2 inline-flex items-center gap-1 text-foreground/40 hover:text-red-600"><Undo2 className="h-3 w-3" />{tr("Deshacer")}</button>
                            </p>
                          )}
                        </div>
                        <div className="shrink-0 text-right">{money(l.amount)}</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className={card}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-serif text-xl">{tr("Flujo de Caja sin conciliar")}</h2>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={tr("Buscar concepto o valor")} className="w-48 rounded-xl border border-foreground/10 px-3 py-1.5 text-xs" />
              </div>
              <p className="mb-2 text-xs text-foreground/50">{tr("Del mes y 10 días antes y después. Al elegir movimientos del banco, primero salen los de fecha más cercana.")}</p>
              {candidates.length === 0 ? (
                <p className="text-sm text-foreground/50">{tr("No hay registros libres.")}</p>
              ) : (
                <ul className="max-h-[640px] divide-y divide-foreground/5 overflow-y-auto text-sm">
                  {candidates.map((r) => (
                    <li key={r.id} className={`flex items-start gap-3 py-2 ${pickedRows.has(r.id) ? "bg-[#C59F59]/10" : ""}`}>
                      <input type="checkbox" className="mt-1" checked={pickedRows.has(r.id)} onChange={() => toggle(pickedRows, r.id, setPickedRows)} aria-label={r.concept} />
                      <div className="min-w-0 flex-1">
                        <p className="break-words"><span className="mr-2 text-xs text-foreground/50">{day(r.date)}</span>{r.concept}</p>
                        <p className="text-[11px] text-foreground/40">{r.category}{duplicates.has(r.id) && <span className="ml-2 font-bold text-amber-700">{tr("¿Duplicado? Igual a uno del {d} que sí está en el banco", { d: day(duplicates.get(r.id)!.date) })}</span>}</p>
                      </div>
                      <div className="shrink-0 text-right">{money(signed(r))}</div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {notInBank.length > 0 && (
            <section className={card}>
              <h2 className="mb-1 flex items-center gap-2 font-serif text-xl"><AlertTriangle className="h-5 w-5 text-amber-600" />{tr("En Flujo de Caja pero no en el banco")} <span className="text-sm text-foreground/50">({notInBank.length})</span></h2>
              <p className="mb-3 text-xs text-foreground/50">{tr("Registros del mes que ningún movimiento del extracto explica: pagos en efectivo, plata que entró a otra cuenta, o duplicados. Los duplicados se corrigen en Flujo de Caja.")}</p>
              <ul className="divide-y divide-foreground/5 text-sm">
                {notInBank.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">{rowLabel(r)} <span className="text-[11px] text-foreground/40">{r.category}</span>
                      {duplicates.has(r.id) && <span className="block text-[11px] font-bold text-amber-700">{tr("¿Duplicado? Igual a uno del {d} que sí está en el banco", { d: day(duplicates.get(r.id)!.date) })}</span>}
                    </span>
                    <span className="shrink-0">{money(signed(r))}</span>
                  </li>
                ))}
              </ul>
              <Link href="/admin/cashflow" className="mt-3 inline-block text-xs font-bold text-[#9a7a3c] hover:underline">{tr("Ir a Flujo de Caja")} →</Link>
            </section>
          )}

          <div className="flex justify-end">
            <button type="button" disabled={isPending} onClick={() => run(() => deleteStatement(statement.id), tr("Extracto borrado."), tr("Se borra el extracto y sus conciliaciones. Los registros de Flujo de Caja se quedan. ¿Continuar?"))}
              className="inline-flex items-center gap-1.5 text-xs text-foreground/40 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" />{tr("Borrar este extracto")}</button>
          </div>

          {(selLines.length > 0 || selRows.length > 0) && (
            <div className="sticky bottom-4 z-10 rounded-2xl border border-[#C59F59]/40 bg-white p-4 shadow-lg">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <p>
                  <span className="text-foreground/50">{tr("Banco")}</span> {money(lineSum)} <span className="mx-2 text-foreground/30">·</span>
                  <span className="text-foreground/50">{tr("Flujo de Caja")}</span> {money(selRows.reduce((s, r) => s + signed(r), 0))} <span className="mx-2 text-foreground/30">·</span>
                  <span className="text-foreground/50">{tr("Diferencia")}</span> <span className={`font-bold tabular-nums ${balanced(diff) ? "text-green-700" : "text-amber-700"}`}>{cop(diff)}</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={isPending || !selLines.length || !selRows.length || !balanced(diff)}
                    onClick={() => run(() => reconcile({ lineIds: [...pickedLines], incomeIds: selRows.filter((r) => r.kind === "income").map((r) => r.id), expenseIds: selRows.filter((r) => r.kind === "expense").map((r) => r.id) }), tr("Conciliado."))}
                    className="rounded-xl bg-[#C59F59] px-4 py-2 text-xs font-bold text-white hover:bg-[#B38E4D] disabled:opacity-40">{tr("Conciliar")}</button>
                  <button type="button" disabled={isPending || !selLines.length || balanced(diff)}
                    onClick={() => { setMode("create"); setConcept(selLines[0]?.description ?? ""); setCategory(diff > 0 ? "Ventas Físicas" : ""); }}
                    className="rounded-xl border border-foreground/15 px-4 py-2 text-xs font-bold disabled:opacity-40">{diff > 0 ? tr("Registrar ingreso por {v}", { v: cop(diff) }) : tr("Registrar gasto por {v}", { v: cop(Math.abs(diff)) })}</button>
                  <button type="button" disabled={isPending || selRows.length > 0 || selLines.length < 2 || !balanced(lineSum)}
                    onClick={() => run(() => markReversal([...pickedLines]), tr("Marcado como reverso."))}
                    className="rounded-xl border border-foreground/15 px-4 py-2 text-xs font-bold disabled:opacity-40">{tr("Es un reverso")}</button>
                  <button type="button" disabled={isPending || !selLines.length || selRows.length > 0} onClick={() => setMode("ignore")}
                    className="rounded-xl border border-foreground/15 px-4 py-2 text-xs font-bold disabled:opacity-40">{tr("No va en Flujo de Caja")}</button>
                  <button type="button" onClick={clear} className="px-2 text-xs text-foreground/50 hover:text-foreground">{tr("Limpiar")}</button>
                </div>
              </div>

              {mode === "create" && !balanced(diff) && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-foreground/5 pt-3 text-sm">
                  <label className="min-w-[260px] flex-1 text-xs text-foreground/60">{tr("Concepto")}
                    <input value={concept} onChange={(e) => setConcept(e.target.value)} className="mt-1 w-full rounded-xl border border-foreground/10 px-3 py-2 text-sm" />
                  </label>
                  <label className="text-xs text-foreground/60">{tr("Categoría")}
                    <select value={category} onChange={(e) => setCategory(e.target.value)} className="mt-1 block w-72 rounded-xl border border-foreground/10 px-3 py-2 text-sm">
                      <option value="">{tr("— Elige —")}</option>
                      {diff > 0
                        ? INCOME_CATEGORIES.map((c) => <option key={c} value={c}>{tr(c)}</option>)
                        : categories.filter((c) => c.active && c.type !== "CAPEX").map((c) => <option key={c.name} value={c.name}>{tr(c.name)}</option>)}
                    </select>
                  </label>
                  <button type="button" disabled={isPending || !concept.trim() || !category}
                    onClick={() => run(() => reconcile({ lineIds: [...pickedLines], incomeIds: selRows.filter((r) => r.kind === "income").map((r) => r.id), expenseIds: selRows.filter((r) => r.kind === "expense").map((r) => r.id), create: { concept, category } }), tr("Registrado en Flujo de Caja y conciliado."))}
                    className="rounded-xl bg-[#C59F59] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{tr("Registrar y conciliar")}</button>
                  <p className="w-full text-[11px] text-foreground/50">{tr("Queda en Flujo de Caja con la fecha del movimiento del banco. Los activos fijos se registran en Compras y después se concilian.")}</p>
                </div>
              )}
              {mode === "ignore" && (
                <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-foreground/5 pt-3 text-sm">
                  <label className="min-w-[260px] flex-1 text-xs text-foreground/60">{tr("¿Por qué no va en Flujo de Caja?")}
                    <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={tr("Ej. Traslado entre cuentas de la empresa")} className="mt-1 w-full rounded-xl border border-foreground/10 px-3 py-2 text-sm" />
                  </label>
                  <button type="button" disabled={isPending || !note.trim()} onClick={() => run(() => ignoreLines([...pickedLines], note), tr("Guardado."))}
                    className="rounded-xl bg-[#C59F59] px-4 py-2 text-xs font-bold text-white disabled:opacity-40">{tr("Guardar")}</button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

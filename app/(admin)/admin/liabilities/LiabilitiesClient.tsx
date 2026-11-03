"use client";

import React, { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, ChevronRight, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { deleteLoanMovement, registerLoanMovement, saveLoan, setLoanActive, type LoanInput, type LoanMovement, type MovementInput } from "./actions";
import { addMonths, loanProblems, loanState, summarize, type Loan, type LoanMoveKind, type LoanScheme } from "@/utils/loans/ledger";
import { useTr } from "@/app/(admin)/AdminI18n";

const cop = (n: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);
const pct = (n: number, digits = 1) => `${(n * 100).toLocaleString("es-CO", { maximumFractionDigits: digits })}%`;
const day = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });

const SCHEME_LABEL: Record<LoanScheme, string> = {
  interes_mensual: "Interés mensual pagado",
  capitaliza: "Interés que se capitaliza",
  sin_interes: "Sin interés",
};
const MOVE_LABEL: Record<LoanMoveKind, string> = {
  desembolso: "Desembolso (entró plata prestada)",
  pago_interes: "Pago de intereses",
  abono_capital: "Abono a capital",
  pago_final: "Pago total del préstamo",
};

type Props = { migrationApplied: boolean; loans: Loan[]; movements: LoanMovement[]; payables: number; today: string };

/**
 * What the business owes: loans from third parties (with interest) and from
 * partners (without), and what is owed to suppliers. For each loan: what it
 * owes today, what it costs, what is due, and its movements.
 */
export default function LiabilitiesClient({ migrationApplied, loans, movements, payables, today }: Props) {
  const tr = useTr();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<Loan | "new" | null>(null);
  const [moving, setMoving] = useState<Loan | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const summary = useMemo(() => summarize(loans, movements, today), [loans, movements, today]);
  const shown = loans.filter((l) => showInactive || l.active !== false);
  const total = summary.terceros + summary.socios + payables;

  const run = (action: () => Promise<{ success: boolean; error?: string }>, ok: string, after?: () => void, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    startTransition(async () => {
      setError("");
      setNotice("");
      const res = await action();
      if (!res.success) return setError(res.error ?? "");
      setNotice(ok);
      after?.();
      router.refresh();
    });
  };

  if (!migrationApplied) return <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800">{tr("Falta aplicar la migración 20261106000000_loans.sql para registrar los préstamos.")}</p>;

  const card = "bg-white rounded-3xl border border-foreground/5 shadow-sm p-6";
  const kpi = (label: string, value: string, sub: string, color = "") => (
    <div className="rounded-2xl border border-foreground/10 bg-white p-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-foreground/50">{tr(label)}</p>
      <p className={`mt-1 font-serif text-2xl ${color}`}>{value}</p>
      <p className="text-[11px] text-foreground/50">{sub}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      {notice && <p className="rounded-xl bg-green-50 p-3 text-sm text-green-800">{notice}</p>}
      {error && <p className="text-sm text-red-600 break-words">{tr.msg(error)}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {kpi("Total que debe la empresa", cop(total), tr("Préstamos y proveedores"))}
        {kpi("Préstamos de terceros", cop(summary.terceros), tr("Con interés"))}
        {kpi("Préstamos de socios", cop(summary.socios), tr("Sin interés"))}
        {kpi("Proveedores por pagar", cop(payables), tr("Facturas de compra con saldo"))}
        {kpi("Intereses al mes", cop(summary.monthlyInterest), tr("≈ {v} al año", { v: cop(summary.monthlyInterest * 12) }), "text-red-600")}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className={card}>
          <h2 className="mb-3 flex items-center gap-2 font-serif text-xl"><CalendarClock className="h-5 w-5 text-[#C59F59]" />{tr("Próximos pagos y vencimientos")}</h2>
          {summary.upcoming.length === 0 ? (
            <p className="text-sm text-foreground/50">{tr("Nada por pagar en las próximas semanas.")}</p>
          ) : (
            <ul className="divide-y divide-foreground/5 text-sm">
              {summary.upcoming.map((u, i) => (
                <li key={i} className={`flex items-center justify-between gap-3 py-2 ${u.kind === "vencido" ? "text-red-700" : ""}`}>
                  <span className="min-w-0">
                    <span className="font-bold">{u.loan.creditor_name}</span>
                    <span className="block text-[11px] text-foreground/50">
                      {u.kind === "vencido" ? tr("Intereses vencidos sin pagar") : u.kind === "vencimiento" ? tr("Vence el préstamo: se devuelve todo") : tr("Intereses del mes")} · {day(u.date)}
                    </span>
                  </span>
                  <span className={`shrink-0 font-bold tabular-nums ${u.kind === "vencimiento" ? "text-[#9a7a3c]" : ""}`}>{cop(u.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={card}>
          <h2 className="mb-1 font-serif text-xl">{tr("Dónde conviene abonar primero")}</h2>
          <p className="mb-3 text-xs text-foreground/50">{tr("La deuda más cara primero: cada peso abonado ahí ahorra más intereses.")}</p>
          {summary.priority.length === 0 ? (
            <p className="text-sm text-foreground/50">{tr("No hay préstamos con interés.")}</p>
          ) : (
            <ol className="space-y-2 text-sm">
              {summary.priority.map(({ loan, state }, i) => (
                <li key={loan.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0"><span className="mr-2 font-bold text-foreground/40">{i + 1}.</span><span className="font-bold">{loan.creditor_name}</span>
                    <span className="block pl-5 text-[11px] text-foreground/50">{tr("{m} mensual · {ea} efectivo anual", { m: pct(Number(loan.monthly_rate), 2), ea: pct(state.annualRate) })}</span>
                  </span>
                  <span className="shrink-0 text-right text-xs tabular-nums text-foreground/60">{tr("Abonar {a} ahorra {s}/mes", { a: cop(1000000), s: cop(1000000 * Number(loan.monthly_rate)) })}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <section className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-serif text-xl">{tr("Préstamos")}</h2>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-foreground/60"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />{tr("Ver pagados o inactivos")}</label>
            <button type="button" onClick={() => setEditing("new")} className="inline-flex items-center gap-2 rounded-xl bg-[#C59F59] px-4 py-2 text-xs font-bold text-white hover:bg-[#B38E4D]"><Plus className="h-4 w-4" />{tr("Nuevo préstamo")}</button>
          </div>
        </div>
        {shown.length === 0 ? (
          <p className="text-sm text-foreground/50">{tr("Aún no hay préstamos registrados.")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm [&_td]:px-3 [&_th]:px-3 [&_td:first-child]:pl-0 [&_th:first-child]:pl-0">
              <thead className="text-left text-[10px] uppercase tracking-wider text-foreground/50">
                <tr><th className="py-2">{tr("Acreedor")}</th><th>{tr("Cómo se paga")}</th><th className="text-right">{tr("Tasa")}</th><th className="text-right">{tr("Debe hoy")}</th><th className="text-right">{tr("Interés del mes")}</th><th>{tr("Estado")}</th><th /></tr>
              </thead>
              <tbody>
                {shown.map((loan) => {
                  const s = loanState(loan, movements, today);
                  const moves = movements.filter((m) => m.loan_id === loan.id);
                  const isOpen = open === loan.id;
                  return (
                    <React.Fragment key={loan.id}>
                      <tr className={`border-t border-foreground/5 align-top ${loan.active === false ? "opacity-50" : ""}`}>
                        <td className="py-2.5">
                          <button type="button" onClick={() => setOpen(isOpen ? null : loan.id)} className="flex items-start gap-1 text-left">
                            <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 text-foreground/40 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                            <span><span className="font-bold">{loan.creditor_name}</span>
                              <span className={`ml-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${loan.creditor_kind === "socio" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-800"}`}>{loan.creditor_kind === "socio" ? tr("Socio") : tr("Tercero")}</span>
                              <span className="block text-[11px] text-foreground/50">{tr("Prestó {v} el {d}", { v: cop(Number(loan.principal)), d: day(loan.start_date) })}</span>
                            </span>
                          </button>
                        </td>
                        <td className="text-xs text-foreground/70">{tr(SCHEME_LABEL[loan.scheme])}{loan.scheme === "capitaliza" ? ` · ${tr("cada {n} meses", { n: String(loan.capitalize_every_months) })}` : loan.payment_day ? ` · ${tr("día {d}", { d: String(loan.payment_day) })}` : ""}</td>
                        <td className="text-right text-xs tabular-nums">{Number(loan.monthly_rate) ? <>{pct(Number(loan.monthly_rate), 2)} {tr("mes")}<span className="block text-foreground/45">{pct(s.annualRate)} EA</span></> : "—"}</td>
                        <td className="text-right font-bold tabular-nums">{cop(s.balance)}{s.accrued > 0 && <span className="block text-[11px] font-normal text-foreground/45">{tr("incluye {v} causados", { v: cop(s.accrued) })}</span>}</td>
                        <td className="text-right tabular-nums">{s.monthlyInterest ? cop(s.monthlyInterest) : "—"}{loan.scheme === "capitaliza" && s.monthlyInterest > 0 && <span className="block text-[11px] text-foreground/45">{tr("se acumula, no sale plata")}</span>}</td>
                        <td className="text-xs">
                          {s.settled ? <span className="font-bold text-green-700">{tr("Pagado")}</span>
                            : s.overdueMonths > 0 ? <span className="flex items-center gap-1 font-bold text-red-700"><AlertTriangle className="h-3.5 w-3.5" />{tr("{n} mes(es) sin pagar", { n: String(s.overdueMonths) })}</span>
                            : loan.maturity_date ? <span>{tr("Vence {d}", { d: day(loan.maturity_date) })}{s.maturityValue ? <span className="block text-foreground/50">{tr("se devuelven {v}", { v: cop(s.maturityValue) })}</span> : null}</span>
                            : loan.scheme === "interes_mensual" && s.nextDate ? <span className="text-green-700">{tr("Al día · próximo {d}", { d: day(s.nextDate) })}</span>
                            : <span className="text-foreground/50">{tr("Sin fecha de devolución")}</span>}
                        </td>
                        <td className="whitespace-nowrap text-right">
                          {!s.settled && loan.active !== false && <button type="button" onClick={() => setMoving(loan)} className="text-xs font-bold text-[#C59F59] hover:underline">{tr("Registrar pago")}</button>}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr><td colSpan={7} className="bg-foreground/[0.02] px-6 py-4">
                          <LoanDetail loan={loan} moves={moves} today={today} busy={isPending}
                            onEdit={() => setEditing(loan)}
                            onToggle={() => run(() => setLoanActive(loan.id, loan.active === false), loan.active === false ? tr("Préstamo activado.") : tr("Préstamo desactivado."))}
                            onDelete={(id) => run(() => deleteLoanMovement(id), tr("Movimiento eliminado."), undefined, tr("¿Eliminar este movimiento? Si creó un registro en el Flujo de Caja, también se borra."))} />
                        </td></tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {editing && (
        <LoanForm loan={editing === "new" ? null : editing} busy={isPending} onClose={() => setEditing(null)}
          onSave={(input) => run(() => saveLoan(editing === "new" ? null : editing.id, input), editing === "new" ? tr("Préstamo registrado.") : tr("Préstamo actualizado."), () => setEditing(null))} />
      )}
      {moving && (
        <MovementForm loan={moving} state={loanState(moving, movements, today)} today={today} busy={isPending} onClose={() => setMoving(null)}
          onSave={(input) => run(() => registerLoanMovement(moving.id, input), tr("Movimiento registrado."), () => setMoving(null))} />
      )}
    </div>
  );
}

function LoanDetail({ loan, moves, today, busy, onEdit, onToggle, onDelete }: { loan: Loan; moves: LoanMovement[]; today: string; busy: boolean; onEdit: () => void; onToggle: () => void; onDelete: (id: string) => void }) {
  const tr = useTr();
  // A capitalizing loan: capital at each capitalization until maturity.
  const periods = useMemo(() => {
    if (loan.scheme !== "capitaliza" || !loan.capitalize_every_months) return [];
    const out: { date: string; capital: number; past: boolean }[] = [];
    const end = loan.maturity_date ?? addMonths(today, 12);
    for (let d = loan.start_date; d <= end; d = addMonths(d, loan.capitalize_every_months)) {
      out.push({ date: d, capital: loanState(loan, moves, d).capital || Number(loan.principal), past: d <= today });
      if (out.length > 40) break;
    }
    return out;
  }, [loan, moves, today]);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div>
        <p className="mb-2 text-xs font-bold text-foreground/60">{tr("Movimientos")}</p>
        {moves.length === 0 ? <p className="text-xs text-foreground/50">{tr("Sin movimientos registrados.")}</p> : (
          <ul className="divide-y divide-foreground/5 text-xs">
            {moves.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-3 py-1.5">
                <span className="min-w-0"><span className="text-foreground/50">{day(m.move_date)}</span> · {tr(MOVE_LABEL[m.kind])}{m.notes ? ` · ${m.notes}` : ""}
                  {!m.expense_id && m.kind !== "desembolso" && <span className="ml-1 text-foreground/40">({tr("ya estaba en Flujo de Caja")})</span>}
                </span>
                <span className="flex shrink-0 items-center gap-2"><b className="tabular-nums">{cop(Number(m.amount))}</b>
                  <button type="button" disabled={busy} onClick={() => onDelete(m.id)} aria-label={tr("Eliminar movimiento")} className="text-foreground/30 hover:text-red-600"><Trash2 className="h-3.5 w-3.5" /></button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex gap-3 text-xs">
          <button type="button" onClick={onEdit} className="inline-flex items-center gap-1 font-bold text-foreground/60 hover:text-[#C59F59]"><Pencil className="h-3.5 w-3.5" />{tr("Editar préstamo")}</button>
          <button type="button" disabled={busy} onClick={onToggle} className="font-bold text-foreground/50 hover:text-foreground">{loan.active === false ? tr("Activar") : tr("Desactivar")}</button>
        </div>
        {loan.notes && <p className="mt-2 text-[11px] text-foreground/50">{loan.notes}</p>}
      </div>
      {periods.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-bold text-foreground/60">{tr("Capital en cada capitalización")}</p>
          <ul className="text-xs">
            {periods.map((p) => (
              <li key={p.date} className={`flex justify-between py-0.5 ${p.past ? "" : "text-foreground/45"}`}>
                <span>{day(p.date)}{p.date === loan.maturity_date ? ` · ${tr("vencimiento")}` : ""}</span><span className="tabular-nums">{cop(p.capital)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

const field = "w-full px-3 py-2 bg-[#fafaf9] border border-foreground/10 rounded-xl text-sm";

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const tr = useTr();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-xl space-y-4 overflow-y-auto rounded-3xl border border-foreground/5 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-serif text-xl font-bold">{title}</h2>
          <button type="button" onClick={onClose} aria-label={tr("Cerrar")} className="p-1 text-foreground/40 hover:text-foreground"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function LoanForm({ loan, busy, onClose, onSave }: { loan: Loan | null; busy: boolean; onClose: () => void; onSave: (input: LoanInput) => void }) {
  const tr = useTr();
  const [d, setD] = useState({
    creditor_name: loan?.creditor_name ?? "",
    creditor_kind: loan?.creditor_kind ?? ("tercero" as Loan["creditor_kind"]),
    scheme: loan?.scheme ?? ("interes_mensual" as LoanScheme),
    principal: loan ? String(loan.principal) : "",
    start_date: loan?.start_date ?? "",
    rate: loan ? String(Number(loan.monthly_rate) * 100) : "",
    capitalize_every_months: loan?.capitalize_every_months ? String(loan.capitalize_every_months) : "6",
    payment_day: loan?.payment_day ? String(loan.payment_day) : "",
    maturity_date: loan?.maturity_date ?? "",
    tracked_from: loan?.tracked_from ?? "2026-09-01",
    notes: loan?.notes ?? "",
  });
  const input: LoanInput = {
    creditor_name: d.creditor_name, creditor_kind: d.creditor_kind, scheme: d.scheme, principal: Number(d.principal), start_date: d.start_date,
    monthly_rate: d.scheme === "sin_interes" ? 0 : Number(d.rate) / 100, capitalize_every_months: Number(d.capitalize_every_months) || null,
    payment_day: Number(d.payment_day) || null, maturity_date: d.maturity_date || null, tracked_from: d.tracked_from || null, notes: d.notes,
  };
  const problems = loanProblems(input);
  const set = (patch: Partial<typeof d>) => setD({ ...d, ...patch });
  const label = "text-xs font-bold text-foreground/60 space-y-1";
  return (
    <Modal title={loan ? tr("Editar préstamo") : tr("Nuevo préstamo")} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`${label} sm:col-span-2`}><span>{tr("Acreedor")}</span><input value={d.creditor_name} onChange={(e) => set({ creditor_name: e.target.value })} className={field} /></label>
        <label className={label}><span>{tr("Tipo de acreedor")}</span>
          <select value={d.creditor_kind} onChange={(e) => set({ creditor_kind: e.target.value as Loan["creditor_kind"], ...(e.target.value === "socio" ? { scheme: "sin_interes" as LoanScheme } : {}) })} className={field}>
            <option value="tercero">{tr("Tercero (cobra interés)")}</option><option value="socio">{tr("Socio")}</option>
          </select></label>
        <label className={label}><span>{tr("Cómo se pagan los intereses")}</span>
          <select value={d.scheme} onChange={(e) => set({ scheme: e.target.value as LoanScheme })} className={field}>
            {(Object.keys(SCHEME_LABEL) as LoanScheme[]).map((k) => <option key={k} value={k}>{tr(SCHEME_LABEL[k])}</option>)}
          </select></label>
        <label className={label}><span>{tr("Valor prestado")}</span><input type="number" min={0} value={d.principal} onChange={(e) => set({ principal: e.target.value })} className={field} /></label>
        <label className={label}><span>{tr("Fecha del préstamo")}</span><input type="date" value={d.start_date} onChange={(e) => set({ start_date: e.target.value })} className={field} /></label>
        {d.scheme !== "sin_interes" && <label className={label}><span>{tr("Tasa mensual (%)")}</span><input type="number" min={0} step="0.01" value={d.rate} onChange={(e) => set({ rate: e.target.value })} placeholder="3" className={field} /></label>}
        {d.scheme === "capitaliza" && <label className={label}><span>{tr("Se capitaliza cada (meses)")}</span><input type="number" min={1} value={d.capitalize_every_months} onChange={(e) => set({ capitalize_every_months: e.target.value })} className={field} /></label>}
        {d.scheme === "interes_mensual" && <label className={label}><span>{tr("Día de pago del mes")}</span><input type="number" min={1} max={31} value={d.payment_day} onChange={(e) => set({ payment_day: e.target.value })} placeholder="8" className={field} /></label>}
        <label className={label}><span>{tr("Vence (opcional)")}</span><input type="date" value={d.maturity_date} onChange={(e) => set({ maturity_date: e.target.value })} className={field} /></label>
        {d.scheme === "interes_mensual" && <label className={label}><span>{tr("Revisar pagos desde")}</span><input type="date" value={d.tracked_from} onChange={(e) => set({ tracked_from: e.target.value })} className={field} />
          <span className="block font-normal text-[11px] text-foreground/40">{tr("Los meses anteriores no se marcan como vencidos.")}</span></label>}
        <label className={`${label} sm:col-span-2`}><span>{tr("Nota (opcional)")}</span><input value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder={tr("Ej. compra de las KRUPS · se devuelve cuando la utilidad lo permita")} className={field} /></label>
      </div>
      {d.scheme !== "sin_interes" && Number(d.rate) > 0 && Number(d.principal) > 0 && (
        <p className="rounded-xl bg-foreground/[0.03] p-3 text-xs text-foreground/60">
          {tr("Interés de un mes: {v}", { v: cop(Number(d.principal) * Number(d.rate) / 100) })}
        </p>
      )}
      {problems.length > 0 && (d.creditor_name || d.principal) && <ul className="space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">{problems.map((p) => <li key={p}>{tr.msg(p)}</li>)}</ul>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl border border-foreground/10 px-4 py-2 text-xs font-bold hover:bg-stone-50">{tr("Cancelar")}</button>
        <button type="button" disabled={busy || problems.length > 0} onClick={() => onSave(input)} className="flex items-center gap-2 rounded-xl bg-[#C59F59] px-4 py-2 text-xs font-bold text-white hover:bg-[#B38E4D] disabled:opacity-40">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{tr("Guardar préstamo")}</button>
      </div>
    </Modal>
  );
}

function MovementForm({ loan, state, today, busy, onClose, onSave }: { loan: Loan; state: ReturnType<typeof loanState>; today: string; busy: boolean; onClose: () => void; onSave: (input: MovementInput) => void }) {
  const tr = useTr();
  const kinds: LoanMoveKind[] = loan.scheme === "interes_mensual" ? ["pago_interes", "abono_capital", "pago_final", "desembolso"] : loan.scheme === "capitaliza" ? ["pago_final", "abono_capital"] : ["abono_capital", "pago_final", "desembolso"];
  const suggested = (k: LoanMoveKind) => (k === "pago_interes" ? state.monthlyInterest : k === "pago_final" ? state.balance : 0);
  const [kind, setKind] = useState<LoanMoveKind>(kinds[0]);
  const [date, setDate] = useState(today);
  const [amount, setAmount] = useState(String(suggested(kinds[0]) || ""));
  const [notes, setNotes] = useState("");
  const [already, setAlready] = useState(false);
  const label = "text-xs font-bold text-foreground/60 space-y-1";
  const effect = kind === "pago_interes" ? tr("Sale plata y es gasto del mes (Intereses Financieros).")
    : kind === "desembolso" ? tr("Sube la deuda. No crea registro en el Flujo de Caja.")
    : loan.scheme === "capitaliza" ? tr("Sale plata pero no es gasto: los intereses ya se contaron mes a mes.")
    : tr("Sale plata pero no es gasto: baja la deuda (movimiento de balance).");
  return (
    <Modal title={tr("Registrar movimiento · {name}", { name: loan.creditor_name })} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={`${label} sm:col-span-2`}><span>{tr("Qué pasó")}</span>
          <select value={kind} onChange={(e) => { const k = e.target.value as LoanMoveKind; setKind(k); setAmount(String(suggested(k) || "")); }} className={field}>
            {kinds.map((k) => <option key={k} value={k}>{tr(MOVE_LABEL[k])}</option>)}
          </select></label>
        <label className={label}><span>{tr("Fecha")}</span><input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={field} /></label>
        <label className={label}><span>{tr("Valor")}</span><input type="number" min={0} value={amount} onChange={(e) => setAmount(e.target.value)} className={field} /></label>
        <label className={`${label} sm:col-span-2`}><span>{tr("Nota (opcional)")}</span><input value={notes} onChange={(e) => setNotes(e.target.value)} className={field} /></label>
      </div>
      <p className="rounded-xl bg-foreground/[0.03] p-3 text-xs text-foreground/60">{effect}</p>
      {kind !== "desembolso" && (
        <label className="flex items-start gap-2 text-xs text-foreground/70">
          <input type="checkbox" checked={already} onChange={(e) => setAlready(e.target.checked)} className="mt-0.5" />
          <span>{tr("Ya está registrado en el Flujo de Caja (no crear otro registro)")}</span>
        </label>
      )}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-xl border border-foreground/10 px-4 py-2 text-xs font-bold hover:bg-stone-50">{tr("Cancelar")}</button>
        <button type="button" disabled={busy || !(Number(amount) > 0) || !date} onClick={() => onSave({ kind, date, amount: Number(amount), notes, alreadyInCashflow: already })}
          className="flex items-center gap-2 rounded-xl bg-[#C59F59] px-4 py-2 text-xs font-bold text-white hover:bg-[#B38E4D] disabled:opacity-40">{busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{tr("Registrar")}</button>
      </div>
    </Modal>
  );
}

-- ============================================================
-- Pasivos: los préstamos conocidos a noviembre de 2026
-- Date: 2026-11-06 · requires 20261106000000_loans.sql
--
-- Loads the five loans the owner described and links the interest payments
-- of October that are already in Flujo de Caja (so they are not asked for
-- again nor duplicated). Diana's interest is not paid monthly: it
-- capitalizes, and the loans module counts it as a cost of each month
-- without money leaving, so her October row in Flujo de Caja (money that
-- never left) is removed.
-- Values marked "por confirmar" can be edited from Admin → Pasivos.
-- Safe to run more than once (each insert checks it is not there yet).
-- ============================================================

-- ── Loans ───────────────────────────────────────────────────
INSERT INTO public.loans (creditor_name, creditor_kind, scheme, principal, start_date, monthly_rate, payment_day, tracked_from, notes)
SELECT 'Gloria Inés Betancur', 'tercero', 'interes_mensual', 50000000, '2026-05-08', 0.03, 8, '2026-10-01',
       '3% mensual pagado alrededor del 8. En noviembre de 2026 va para su 6.º pago.'
WHERE NOT EXISTS (SELECT 1 FROM public.loans WHERE creditor_name = 'Gloria Inés Betancur');

INSERT INTO public.loans (creditor_name, creditor_kind, scheme, principal, start_date, monthly_rate, payment_day, tracked_from, notes)
SELECT 'Vanessa García', 'tercero', 'interes_mensual', 5000000, '2026-09-08', 0.02, 8, '2026-10-01',
       '$100.000 mensuales alrededor del 8. Fecha de inicio por confirmar.'
WHERE NOT EXISTS (SELECT 1 FROM public.loans WHERE creditor_name = 'Vanessa García');

INSERT INTO public.loans (creditor_name, creditor_kind, scheme, principal, start_date, monthly_rate, capitalize_every_months, maturity_date, notes)
SELECT 'Diana Patricia Rueda', 'tercero', 'capitaliza', 12000000, '2025-02-02', 0.02, 6, '2027-02-02',
       '2% mensual reinvertido cada 6 meses (12% por semestre) hasta el 2 de febrero de 2027: ese día se le devuelve todo.'
WHERE NOT EXISTS (SELECT 1 FROM public.loans WHERE creditor_name = 'Diana Patricia Rueda');

INSERT INTO public.loans (creditor_name, creditor_kind, scheme, principal, start_date, monthly_rate, notes)
SELECT 'Marcos Pimienta', 'socio', 'sin_interes', 10000000, '2026-09-01', 0,
       'Socio, sin intereses. Se devuelve cuando la utilidad lo permita. Fecha del préstamo por confirmar.'
WHERE NOT EXISTS (SELECT 1 FROM public.loans WHERE creditor_name = 'Marcos Pimienta');

INSERT INTO public.loans (creditor_name, creditor_kind, scheme, principal, start_date, monthly_rate, notes)
SELECT 'Daniel Ospina', 'socio', 'sin_interes', 10900000, '2026-10-03', 0,
       'Socio, sin intereses: compra de las cafeteras KRUPS (comodato). Valor aproximado ("casi 11 millones") y fecha por confirmar. Se devuelve cuando la utilidad lo permita.'
WHERE NOT EXISTS (SELECT 1 FROM public.loans WHERE creditor_name = 'Daniel Ospina');

-- ── October interest already in Flujo de Caja (linked, not created again) ──
INSERT INTO public.loan_movements (loan_id, move_date, kind, amount, notes, expense_id, expense_owned)
SELECT l.id, '2026-10-08', 'pago_interes', 1500000, 'Ya estaba en Flujo de Caja', e.id, false
FROM public.loans l
LEFT JOIN LATERAL (
  SELECT ce.id FROM public.cashflow_expenses ce JOIN public.daily_cashflows d ON d.id = ce.cashflow_id
  WHERE d.date = '2026-10-08' AND ce.concept ILIKE '%gloria%' AND ce.amount = 1500000 LIMIT 1
) e ON true
WHERE l.creditor_name = 'Gloria Inés Betancur'
  AND NOT EXISTS (SELECT 1 FROM public.loan_movements m WHERE m.loan_id = l.id AND m.move_date = '2026-10-08' AND m.kind = 'pago_interes');

INSERT INTO public.loan_movements (loan_id, move_date, kind, amount, notes, expense_id, expense_owned)
SELECT l.id, '2026-10-08', 'pago_interes', 100000, 'Ya estaba en Flujo de Caja', e.id, false
FROM public.loans l
LEFT JOIN LATERAL (
  SELECT ce.id FROM public.cashflow_expenses ce JOIN public.daily_cashflows d ON d.id = ce.cashflow_id
  WHERE d.date = '2026-10-08' AND ce.concept ILIKE '%vanessa%' AND ce.amount = 100000 LIMIT 1
) e ON true
WHERE l.creditor_name = 'Vanessa García'
  AND NOT EXISTS (SELECT 1 FROM public.loan_movements m WHERE m.loan_id = l.id AND m.move_date = '2026-10-08' AND m.kind = 'pago_interes');

-- ── Diana: her October interest never left the bank ──
-- It is now a cost of each month through the loans module (P&L), not a
-- Flujo de Caja outflow. Kept in the audit log before removing it.
INSERT INTO public.cashflow_audit_logs (action_type, expense_id, cashflow_id, details)
SELECT 'DELETE_EXPENSE', ce.id, ce.cashflow_id,
       jsonb_build_object('old', to_jsonb(ce), 'reason', 'Interés de Diana capitalizado: no salió plata; lo causa el módulo de Pasivos')
FROM public.cashflow_expenses ce JOIN public.daily_cashflows d ON d.id = ce.cashflow_id
WHERE d.date = '2026-10-06' AND ce.concept ILIKE '%diana%' AND ce.amount = 337183;

DELETE FROM public.cashflow_expenses ce
USING public.daily_cashflows d
WHERE d.id = ce.cashflow_id AND d.date = '2026-10-06' AND ce.concept ILIKE '%diana%' AND ce.amount = 337183;

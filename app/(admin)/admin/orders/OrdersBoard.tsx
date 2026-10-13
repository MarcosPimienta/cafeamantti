"use client";

import React, { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  Search,
  UploadCloud,
  X,
  Mail,
  Phone,
  MapPin,
  CalendarClock,
  AlertTriangle,
  MessageCircle,
  Loader2,
  Package,
  Clock,
  CheckCircle2,
  Hourglass,
  BadgeDollarSign,
  Coffee,
  Truck,
  PackageCheck,
  Ban,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { updateOrderStatus, updateOrderDueDate, sendPendingOrdersWhatsApp } from "../../actions";
import ManualOrderModal from "./ManualOrderModal";
import {
  type BoardOrder,
  UNDELIVERED,
  NEXT_STATUS,
  DELIVERED_WINDOW_DAYS,
  bogotaToday,
  relDays,
  fmtDay,
  customerOf,
  siigoOf,
  dueState,
  waLink,
  groupOrdersByStatus,
} from "./boardUtils";
import OrderActions from "./OrderActions";
import SiigoInvoiceSection from "./SiigoInvoiceSection";
import { useTr } from "@/app/(admin)/AdminI18n";

// ─── Types & vocabulary ───────────────────────────────────────────────────────


type InventoryItem = { id: string; product_code: string; product_name: string; current_stock: number };

const COLUMNS: { id: string; label: string; Icon: LucideIcon }[] = [
  { id: "pending", label: "Pendiente de pago", Icon: Hourglass },
  { id: "paid", label: "Pagado", Icon: BadgeDollarSign },
  { id: "processing", label: "Preparando", Icon: Coffee },
  { id: "shipped", label: "Enviado", Icon: Truck },
  { id: "delivered", label: "Entregado", Icon: PackageCheck },
  { id: "cancelled", label: "Cancelado", Icon: Ban },
];
const ICON: Record<string, LucideIcon> = Object.fromEntries(COLUMNS.map((c) => [c.id, c.Icon]));

/** Status icon in a soft chip — the board's only status marker. */
function StatusIcon({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  const Icon = ICON[status] ?? Hourglass;
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg bg-[#C59F59]/10 text-[#C59F59] shrink-0 ${
        size === "sm" ? "w-6 h-6" : "w-7 h-7"
      }`}
      aria-hidden="true"
    >
      <Icon className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />
    </span>
  );
}
const LABEL: Record<string, string> = Object.fromEntries(COLUMNS.map((c) => [c.id, c.label]));
// ─── Helpers ──────────────────────────────────────────────────────────────────

const cop = (n: number) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

// ─── Board ────────────────────────────────────────────────────────────────────

export default function OrdersBoard({
  orders: initialOrders,
  inventory,
  crmClients,
  whatsappConfigured,
  lastNotification,
}: {
  orders: BoardOrder[];
  inventory: InventoryItem[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  crmClients: any[];
  whatsappConfigured: boolean;
  lastNotification: { created_at: string; success: boolean; error: string | null; trigger: string } | null;
}) {
  const tr = useTr();
  // Local copy for optimistic moves; re-synced whenever the server sends new data.
  const [snapshot, setSnapshot] = useState(initialOrders);
  const [orders, setOrders] = useState(initialOrders);
  if (snapshot !== initialOrders) {
    setSnapshot(initialOrders);
    setOrders(initialOrders);
  }

  const [search, setSearch] = useState("");
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [allDelivered, setAllDelivered] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Mobile shows one status at a time; start on the first one with work in it.
  const [mobileCol, setMobileCol] = useState<string>(
    () => COLUMNS.find((c) => UNDELIVERED.has(c.id) && initialOrders.some((o) => o.status === c.id))?.id ?? "pending"
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [isSending, startSending] = useTransition();
  const [, startMoving] = useTransition();

  const today = bogotaToday();
  const sensors = useSensors(
    // A small drag threshold keeps a plain click free to open the card.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor)
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (onlyOverdue && dueState(o, today) !== "overdue") return false;
      if (!term) return true;
      const hay = [
        o.id,
        customerOf(o),
        o.contact_email,
        o.contact_phone,
        o.shipping_info?.city,
        siigoOf(o),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [orders, search, onlyOverdue, today]);

  const byColumn = useMemo(
    () => groupOrdersByStatus(filtered, COLUMNS.map((c) => c.id), { allDelivered }),
    [filtered, allDelivered]
  );

  const pending = orders.filter((o) => UNDELIVERED.has(o.status));
  const overdueCount = pending.filter((o) => dueState(o, today) === "overdue").length;
  const pendingValue = pending.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const visibleColumns = COLUMNS.filter((c) => c.id !== "cancelled" || showCancelled);
  const activeMobileCol = visibleColumns.some((c) => c.id === mobileCol) ? mobileCol : visibleColumns[0].id;
  const mobileOrders = byColumn.get(activeMobileCol) ?? [];

  const selected = orders.find((o) => o.id === selectedId) ?? null;
  const dragging = orders.find((o) => o.id === draggingId) ?? null;

  function moveOrder(orderId: string, status: string) {
    const prev = orders.find((o) => o.id === orderId);
    if (!prev || prev.status === status) return;
    if (status === "cancelled" && !confirm(tr("¿Cancelar la orden #{v}?", { v: orderId.split("-")[0] }))) return;

    const now = new Date().toISOString();
    setOrders((list) =>
      list.map((o) =>
        o.id === orderId
          ? { ...o, status, status_changed_at: now, delivered_at: status === "delivered" ? now : null }
          : o
      )
    );
    startMoving(async () => {
      try {
        await updateOrderStatus(orderId, status);
      } catch (err) {
        setOrders((list) => list.map((o) => (o.id === orderId ? prev : o)));
        setNotice({ type: "error", msg: err instanceof Error ? err.message : tr("No se pudo mover la orden") });
      }
    });
  }

  function onDragStart(e: DragStartEvent) {
    setDraggingId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setDraggingId(null);
    if (e.over) moveOrder(String(e.active.id), String(e.over.id));
  }

  function sendWhatsApp() {
    startSending(async () => {
      try {
        const res = await sendPendingOrdersWhatsApp();
        setNotice(
          res.success
            ? { type: "success", msg: tr("✓ Enviado a WhatsApp ({pendingCount} pendientes) → {recipients}", { pendingCount: res.pendingCount, recipients: res.recipients.join(", ") }) }
            : { type: "error", msg: res.error || tr("No se pudo enviar") }
        );
      } catch (err) {
        setNotice({ type: "error", msg: err instanceof Error ? err.message : tr("No se pudo enviar") });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-serif text-foreground mb-1">{tr("Órdenes")}</h1>
          <p className="text-foreground/60 text-sm">
            <span className="hidden md:inline">{tr("Arrastra cada tarjeta a la columna de su estado. Haz clic para ver el detalle.")}</span>
            <span className="md:hidden">{tr("Toca una orden para ver el detalle o pásala al siguiente estado.")}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/admin/orders/import"
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-foreground/10 hover:bg-foreground/5 rounded-xl text-xs font-bold uppercase tracking-widest"
          >
            <UploadCloud className="w-4 h-4" />
            {tr("Importar")}
          </Link>
          <button
            onClick={sendWhatsApp}
            disabled={isSending || !whatsappConfigured}
            title={
              whatsappConfigured
                ? tr("Enviar al WhatsApp de la empresa el listado de órdenes por entregar")
                : tr("Configura WHATSAPP_PROVIDER y WHATSAPP_TO en el servidor")
            }
            className="flex items-center gap-2 px-4 py-2.5 bg-[#25D366] hover:bg-[#1ebe5b] text-white rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
            <span className="sm:hidden">{tr("WhatsApp")}</span>
            <span className="hidden sm:inline">{tr("Pendientes a WhatsApp")}</span>
          </button>
          <ManualOrderModal inventory={inventory} crmClients={crmClients} />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={tr("Por entregar")} value={String(pending.length)} icon={<Package className="w-4 h-4" />} />
        <Stat
          label={tr("Atrasadas")}
          value={String(overdueCount)}
          icon={<AlertTriangle className="w-4 h-4" />}
          tone={overdueCount ? "danger" : undefined}
          onClick={overdueCount ? () => setOnlyOverdue(!onlyOverdue) : undefined}
          active={onlyOverdue}
        />
        <Stat label={tr("Valor por entregar")} value={cop(pendingValue)} icon={<Clock className="w-4 h-4" />} />
        <Stat
          label={tr("Último aviso WhatsApp")}
          value={lastNotification ? relDays(lastNotification.created_at) : "—"}
          sub={
            !whatsappConfigured
              ? "No configurado"
              : lastNotification
              ? `${lastNotification.trigger === "cron" ? "Automático" : "Manual"} · ${lastNotification.success ? "enviado" : "falló"}`
              : "Diario 8:00 a. m."
          }
          icon={<MessageCircle className="w-4 h-4" />}
          tone={lastNotification && !lastNotification.success ? "danger" : undefined}
        />
      </div>

      {notice && (
        <div
          className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl text-sm ${
            notice.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
          }`}
        >
          <span>{notice.msg}</span>
          <button onClick={() => setNotice(null)} aria-label={tr("Cerrar aviso")}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-foreground/40" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={tr("Buscar cliente, #orden, teléfono, ciudad...")}
            aria-label={tr("Buscar órdenes")}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-foreground/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#C59F59]/20"
          />
        </div>
        <div className="flex gap-2 text-xs overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap pb-1 md:pb-0">
          <Toggle checked={onlyOverdue} onChange={setOnlyOverdue} label={tr("Solo atrasadas")} />
          <Toggle checked={showCancelled} onChange={setShowCancelled} label={tr("Mostrar canceladas")} />
          <Toggle checked={allDelivered} onChange={setAllDelivered} label={tr("Todas las entregadas (no solo {DELIVERED_WINDOW_DAYS} días)", { DELIVERED_WINDOW_DAYS: DELIVERED_WINDOW_DAYS })} />
        </div>
      </div>

      {/* Mobile: status tabs + one list. No drag and drop — it fights touch scrolling. */}
      <div className="md:hidden space-y-3">
        <div role="tablist" aria-label={tr("Estados")} className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 snap-x">
          {visibleColumns.map((col) => {
            const active = col.id === activeMobileCol;
            const count = byColumn.get(col.id)?.length ?? 0;
            return (
              <button
                key={col.id}
                role="tab"
                aria-selected={active}
                onClick={() => setMobileCol(col.id)}
                className={`snap-start shrink-0 flex items-center gap-2 pl-2 pr-3 py-2 rounded-xl border text-xs font-bold whitespace-nowrap transition-all ${
                  active ? "bg-foreground text-background border-foreground" : "bg-white text-foreground/70 border-foreground/10"
                }`}
              >
                <col.Icon className={`w-4 h-4 ${active ? "" : "text-[#C59F59]"}`} />
                {tr(col.label)}
                <span className={`px-1.5 rounded-md ${active ? "bg-background/20" : "bg-foreground/5"}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-foreground/40">
          {cop(mobileOrders.reduce((s, o) => s + Number(o.total_amount || 0), 0))}
          {activeMobileCol === "delivered" && !allDelivered ? tr(" · Últimos {DELIVERED_WINDOW_DAYS} días", { DELIVERED_WINDOW_DAYS: DELIVERED_WINDOW_DAYS }) : ""}
        </p>
        {mobileOrders.length === 0 ? (
          <p className="text-sm text-foreground/40 text-center py-12 border border-dashed border-foreground/10 rounded-2xl">
            {tr("Sin órdenes en «{v}»", { v: LABEL[activeMobileCol] })}
          </p>
        ) : (
          <div className="space-y-2.5">
            {mobileOrders.map((o) => (
              <MobileCard key={o.id} order={o} today={today} onOpen={setSelectedId} onAdvance={moveOrder} />
            ))}
          </div>
        )}
      </div>

      {/* Desktop board */}
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDraggingId(null)}>
        <div className="hidden md:flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x">
          {visibleColumns.map((col) => (
            <Column
              key={col.id}
              col={col}
              orders={byColumn.get(col.id) ?? []}
              today={today}
              onOpen={setSelectedId}
              draggingId={draggingId}
              note={col.id === "delivered" && !allDelivered ? `Últimos ${DELIVERED_WINDOW_DAYS} días` : undefined}
            />
          ))}
        </div>
        <DragOverlay>
          {dragging ? <Card order={dragging} today={today} overlay /> : null}
        </DragOverlay>
      </DndContext>

      {selected && (
        <OrderPanel
          order={selected}
          today={today}
          inventory={inventory}
          crmClients={crmClients}
          onClose={() => setSelectedId(null)}
          onStatus={(s) => moveOrder(selected.id, s)}
          onDueDate={(d) => {
            const prev = selected.delivery_due_date ?? null;
            setOrders((list) => list.map((o) => (o.id === selected.id ? { ...o, delivery_due_date: d } : o)));
            startMoving(async () => {
              try {
                await updateOrderDueDate(selected.id, d);
              } catch (err) {
                setOrders((list) => list.map((o) => (o.id === selected.id ? { ...o, delivery_due_date: prev } : o)));
                setNotice({ type: "error", msg: err instanceof Error ? err.message : tr("No se pudo guardar la fecha") });
              }
            });
          }}
        />
      )}
    </div>
  );
}

// ─── Pieces ───────────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  sub,
  icon,
  tone,
  onClick,
  active,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  tone?: "danger";
  onClick?: () => void;
  active?: boolean;
}) {
  const tr = useTr();
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`text-left bg-white rounded-2xl border p-3 sm:p-4 shadow-sm min-w-0 ${
        active ? "border-red-300 ring-2 ring-red-100" : "border-foreground/5"
      } ${onClick ? "hover:border-foreground/20 cursor-pointer" : ""}`}
    >
      <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider sm:tracking-widest text-foreground/40">
        {icon}
        {tr(label)}
      </p>
      <p className={`text-lg sm:text-2xl font-serif font-bold mt-1 truncate ${tone === "danger" ? "text-red-600" : "text-foreground"}`}>{value}</p>
      {sub && <p className="text-[11px] text-foreground/40 mt-0.5">{tr(sub)}</p>}
    </Tag>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  const tr = useTr();
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={() => onChange(!checked)}
      className={`shrink-0 whitespace-nowrap px-3 py-2 rounded-xl border font-bold transition-all ${
        checked ? "bg-foreground text-background border-foreground" : "bg-white text-foreground/60 border-foreground/10 hover:bg-foreground/5"
      }`}
    >
      {tr(label)}
    </button>
  );
}

function Column({
  col,
  orders,
  today,
  onOpen,
  draggingId,
  note,
}: {
  col: (typeof COLUMNS)[number];
  orders: BoardOrder[];
  today: string;
  onOpen: (id: string) => void;
  draggingId: string | null;
  note?: string;
}) {
  const tr = useTr();
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const total = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  return (
    <section
      ref={setNodeRef}
      aria-label={tr(col.label)}
      className={`snap-start shrink-0 w-[290px] rounded-2xl p-3 flex flex-col transition-colors ${
        isOver ? "ring-2 ring-[#C59F59]/50 bg-[#C59F59]/10" : "bg-foreground/[0.03]"
      }`}
    >
      <header className="px-1 pb-3">
        <div className="flex items-center gap-2">
          <StatusIcon status={col.id} />
          <h2 className="text-sm font-bold">{tr(col.label)}</h2>
          <span className="text-xs text-foreground/40 font-bold">{orders.length}</span>
        </div>
        <p className="text-[11px] text-foreground/40 mt-1 pl-9">
          {cop(total)}
          {note ? ` · ${note}` : ""}
        </p>
      </header>
      <div className="flex-1 space-y-2.5 min-h-[120px]">
        {orders.length === 0 ? (
          <p className="text-xs text-foreground/30 text-center py-8 border border-dashed border-foreground/10 rounded-xl">
            {tr("Arrastra aquí")}
          </p>
        ) : (
          orders.map((o) => <DraggableCard key={o.id} order={o} today={today} onOpen={onOpen} hidden={draggingId === o.id} />)
        )}
      </div>
    </section>
  );
}

function DraggableCard({
  order,
  today,
  onOpen,
  hidden,
}: {
  order: BoardOrder;
  today: string;
  onOpen: (id: string) => void;
  hidden: boolean;
}) {
  const { attributes, listeners, setNodeRef } = useDraggable({ id: order.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(order.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(order.id);
        listeners?.onKeyDown?.(e);
      }}
      className={`touch-none ${hidden ? "opacity-30" : ""}`}
    >
      <Card order={order} today={today} />
    </div>
  );
}

function Card({
  order,
  today,
  overlay,
  draggable = true,
  embedded = false,
}: {
  order: BoardOrder;
  today: string;
  overlay?: boolean;
  draggable?: boolean;
  /** Inside another container (mobile): no own border/shadow, keeps the overdue stripe. */
  embedded?: boolean;
}) {
  const tr = useTr();
  const due = dueState(order, today);
  const items = order.order_items ?? [];
  const siigo = siigoOf(order);
  const city = order.shipping_info?.city;
  return (
    <article
      className={`bg-white p-3 select-none ${draggable ? "cursor-grab active:cursor-grabbing" : ""} ${
        embedded
          ? "border-0"
          : overlay
          ? "rounded-xl border shadow-2xl rotate-2 border-[#C59F59]/40"
          : "rounded-xl border shadow-sm hover:shadow-md border-foreground/5"
      } ${due === "overdue" ? "border-l-4 border-l-red-500" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] font-bold text-foreground/50">#{order.id.split("-")[0]}</span>
        {siigo && (
          <span className="text-[10px] font-bold text-[#C59F59] bg-[#C59F59]/10 px-1.5 py-0.5 rounded">{tr("Siigo #{siigo}", { siigo: siigo })}</span>
        )}
      </div>
      <p className="font-bold text-sm mt-1 leading-snug line-clamp-2">{customerOf(order)}</p>
      {items.length > 0 && (
        <p className="text-xs text-foreground/50 mt-1 line-clamp-2">
          {items
            .slice(0, 2)
            .map((it) => `${it.quantity}× ${it.product_id}${it.weight ? ` ${it.weight}` : ""}`)
            .join(" · ")}
          {items.length > 2 ? ` · +${items.length - 2}` : ""}
        </p>
      )}
      <p className="font-serif text-[#C59F59] font-bold mt-2">{cop(Number(order.total_amount || 0))}</p>
      <div className="flex flex-wrap items-center gap-1.5 mt-2 text-[10px]">
        <span className="text-foreground/40">{relDays(order.created_at)}</span>
        {city && <span className="text-foreground/40">· {city}</span>}
        {due && order.delivery_due_date && (
          <span
            className={`ml-auto px-1.5 py-0.5 rounded font-bold ${
              due === "overdue"
                ? "bg-red-100 text-red-700"
                : due === "today"
                ? "bg-amber-100 text-amber-800"
                : due === "soon"
                ? "bg-amber-50 text-amber-700"
                : "bg-foreground/5 text-foreground/50"
            }`}
          >
            {due === "overdue" ? tr("Atrasada · ") : due === "today" ? tr("Hoy · ") : ""}
            {fmtDay(order.delivery_due_date)}
          </span>
        )}
      </div>
    </article>
  );
}

function MobileCard({
  order,
  today,
  onOpen,
  onAdvance,
}: {
  order: BoardOrder;
  today: string;
  onOpen: (id: string) => void;
  onAdvance: (id: string, status: string) => void;
}) {
  const tr = useTr();
  const next = NEXT_STATUS[order.status];
  const NextIcon = next ? ICON[next] : null;
  return (
    <div className="rounded-xl overflow-hidden shadow-sm border border-foreground/5 bg-white">
      <button type="button" onClick={() => onOpen(order.id)} className="block w-full text-left">
        <Card order={order} today={today} draggable={false} embedded />
      </button>
      {next && NextIcon && (
        <button
          type="button"
          onClick={() => onAdvance(order.id, next)}
          className="w-full flex items-center justify-center gap-2 py-3 border-t border-foreground/5 text-xs font-bold text-foreground/70 active:bg-[#C59F59]/10"
        >
          {tr("Pasar a")}
          <NextIcon className="w-4 h-4 text-[#C59F59]" />
          {LABEL[next]}
          <ArrowRight className="w-3.5 h-3.5 text-foreground/30" />
        </button>
      )}
    </div>
  );
}

function OrderPanel({
  order,
  today,
  inventory,
  crmClients,
  onClose,
  onStatus,
  onDueDate,
}: {
  order: BoardOrder;
  today: string;
  inventory: InventoryItem[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  crmClients: any[];
  onClose: () => void;
  onStatus: (status: string) => void;
  onDueDate: (date: string | null) => void;
}) {
  const tr = useTr();
  const due = dueState(order, today);
  const ship = order.shipping_info || {};
  const wa = waLink(order.contact_phone);
  const siigo = siigoOf(order);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30 backdrop-blur-[2px]" onClick={onClose}>
      <aside
        className="bg-white w-full max-w-xl h-full overflow-y-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        aria-label={tr("Orden {v}", { v: order.id.split("-")[0] })}
      >
        <div className="sticky top-0 bg-white/95 backdrop-blur px-5 sm:px-8 pt-5 sm:pt-7 pb-4 sm:pb-5 border-b border-foreground/5 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-mono text-xs text-foreground/40">
                #{order.id.split("-")[0]}
                {siigo ? tr(" · Siigo #{siigo}", { siigo: siigo }) : ""}
              </p>
              <h2 className="text-xl sm:text-2xl font-serif mt-1 break-words">{customerOf(order)}</h2>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <OrderActions order={order} inventory={inventory} crmClients={crmClients} />
              <button onClick={onClose} className="p-2 rounded-xl hover:bg-foreground/5" aria-label={tr("Cerrar")}>
                <X className="w-5 h-5 text-foreground/40" />
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 sm:px-8 py-6 space-y-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {/* Properties, Notion-style. Label above value on phones, side by side from sm. */}
          <dl className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-y-1 sm:gap-y-3 gap-x-4 text-sm sm:items-center [&>dt]:text-xs sm:[&>dt]:text-sm [&>dt]:pt-2 sm:[&>dt]:pt-0">
            <dt className="text-foreground/40">{tr("Estado")}</dt>
            <dd className="flex items-center gap-2">
              <StatusIcon status={order.status} size="sm" />
              <select
                value={order.status}
                onChange={(e) => onStatus(e.target.value)}
                aria-label={tr("Estado de la orden")}
                className="flex-1 sm:flex-none px-3 py-2.5 sm:py-1.5 rounded-lg border border-foreground/10 bg-white text-sm font-bold"
              >
                {COLUMNS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {tr(c.label)}
                  </option>
                ))}
              </select>
            </dd>

            <dt className="text-foreground/40 flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4" />{" "}{tr("Entrega prometida")}
            </dt>
            <dd className="flex items-center gap-2">
              <input
                type="date"
                value={order.delivery_due_date ?? ""}
                onChange={(e) => onDueDate(e.target.value || null)}
                aria-label={tr("Fecha de entrega prometida")}
                className="flex-1 sm:flex-none px-3 py-2.5 sm:py-1.5 rounded-lg border border-foreground/10 text-sm bg-white"
              />
              {due === "overdue" && <span className="text-xs font-bold text-red-600">{tr("Atrasada")}</span>}
              {due === "today" && <span className="text-xs font-bold text-amber-700">{tr("Es hoy")}</span>}
            </dd>

            <dt className="text-foreground/40">{tr("Total")}</dt>
            <dd className="font-serif text-xl text-[#C59F59] font-bold">{cop(Number(order.total_amount || 0))}</dd>

            <dt className="text-foreground/40">{tr("Creada")}</dt>
            <dd>
              {new Date(order.created_at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}
              <span className="text-foreground/40"> · {relDays(order.created_at)}</span>
            </dd>

            {order.status_changed_at && (
              <>
                <dt className="text-foreground/40">{tr("En «{v}»", { v: LABEL[order.status] ?? order.status })}</dt>
                <dd>{tr("desde {relDays}", { relDays: relDays(order.status_changed_at) })}</dd>
              </>
            )}

            {order.delivered_at && order.status === "delivered" && (
              <>
                <dt className="text-foreground/40">{tr("Entregada")}</dt>
                <dd className="flex items-center gap-1.5 text-green-700">
                  <CheckCircle2 className="w-4 h-4" />
                  {new Date(order.delivered_at).toLocaleDateString("es-CO", { dateStyle: "medium" })}
                </dd>
              </>
            )}
          </dl>

          <SiigoInvoiceSection key={order.id} order={order} />

          {/* Contact */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">{tr("Contacto")}</h3>
            <div className="space-y-1.5 text-sm">
              {order.contact_email && (
                <p className="flex items-center gap-2 min-w-0">
                  <Mail className="w-4 h-4 text-foreground/40 shrink-0" />
                  <a href={`mailto:${order.contact_email}`} className="hover:underline truncate">{order.contact_email}</a>
                </p>
              )}
              {order.contact_phone && (
                <p className="flex flex-wrap items-center gap-2">
                  <Phone className="w-4 h-4 text-foreground/40" />
                  <a href={`tel:${order.contact_phone}`} className="hover:underline">{order.contact_phone}</a>
                  {wa && (
                    <a
                      href={wa}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#25D366]/10 text-[#128C7E] text-xs font-bold hover:bg-[#25D366]/20"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />{" "}{tr("Escribir")}
                    </a>
                  )}
                </p>
              )}
            </div>
          </section>

          {/* Shipping */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">{tr("Envío")}</h3>
            <p className="flex items-start gap-2 text-sm text-foreground/80">
              <MapPin className="w-4 h-4 text-foreground/40 mt-0.5 shrink-0" />
              <span>
                {ship.address || "—"}
                {ship.details && <><br />{ship.details}</>}
                {(ship.city || ship.state) && <><br />{[ship.city, ship.state || ship.department].filter(Boolean).join(", ")}</>}
              </span>
            </p>
          </section>

          {/* Items */}
          <section className="space-y-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">{tr("Productos")}</h3>
            <div className="rounded-xl bg-[#f9f7f0] divide-y divide-foreground/5">
              {(order.order_items ?? []).length === 0 ? (
                <p className="p-4 text-sm text-foreground/40">{tr("Sin productos")}</p>
              ) : (
                (order.order_items ?? []).map((it) => (
                  <div key={it.id} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
                    <span>
                      <span className="font-bold">{it.quantity}×</span> {it.product_id}
                      {it.weight ? <span className="text-foreground/50"> · {it.weight}</span> : null}
                      {it.grind ? <span className="text-foreground/50"> · {it.grind}</span> : null}
                    </span>
                    <span className="font-mono text-xs">{cop(Number(it.price_at_time || 0) * Number(it.quantity || 1))}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          {order.notes && (
            <section className="space-y-2">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#C59F59]">{tr("Notas")}</h3>
              <p className="text-sm text-foreground/70 whitespace-pre-wrap">{order.notes}</p>
            </section>
          )}
        </div>
      </aside>
    </div>
  );
}

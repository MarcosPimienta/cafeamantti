// In-memory stand-in for the Supabase client, good enough to run the server
// actions end to end in tests. It implements the query-builder calls the app
// uses (select/insert/update/upsert/delete, eq/in/not/is/gte/lt…, order,
// range, limit, single, maybeSingle) plus to-one and to-many embeds declared
// in RELATIONS. Rows are plain objects; column lists in select() are not
// projected (whole rows come back), which the actions never depend on.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Filter = (r: Row) => boolean;

type Relation = { table: string; localKey?: string; foreignKey?: string; many?: boolean };

/** embed name (or fk column) → how to resolve it, per parent table. */
const RELATIONS: Record<string, Record<string, Relation>> = {
  inventory_movements: {
    inventory: { table: "inventory", localKey: "inventory_id" },
    income_id: { table: "cashflow_incomes", localKey: "income_id" },
    income: { table: "cashflow_incomes", localKey: "income_id" },
  },
  cashflow_incomes: {
    cashflow_id: { table: "daily_cashflows", localKey: "cashflow_id" },
    inventory_id: { table: "inventory", localKey: "inventory_id" },
    inventory_movements: { table: "inventory_movements", foreignKey: "income_id", many: true },
  },
  cashflow_expenses: {
    cashflow_id: { table: "daily_cashflows", localKey: "cashflow_id" },
  },
  orders: {
    client_id: { table: "clients", localKey: "client_id" },
    order_items: { table: "order_items", foreignKey: "order_id", many: true },
    profiles: { table: "profiles", localKey: "user_id" },
  },
  clients: {
    orders: { table: "orders", foreignKey: "client_id", many: true },
  },
  repack_batches: {
    inventory_movements: { table: "inventory_movements", foreignKey: "repack_batch_id", many: true },
  },
};

/** Column defaults applied on insert, mirroring the migrations. */
const DEFAULTS: Record<string, () => Row> = {
  inventory_movements: () => ({ era: "v2", income_id: null, repack_batch_id: null, molienda: null }),
  cashflow_incomes: () => ({ era: "v2" }),
  cashflow_expenses: () => ({ era: "v2" }),
  repack_batches: () => ({ era: "v2" }),
  orders: () => ({ status: "pending" }),
};

export type FakeError = { message: string; code?: string };

export class FakeDB {
  tables: Record<string, Row[]> = {};
  private seq = 0;
  private failures: { table: string; op: string; message: string; after: number }[] = [];

  constructor(seed: Record<string, Row[]> = {}) {
    for (const [t, rows] of Object.entries(seed)) this.tables[t] = rows.map((r) => ({ ...r }));
  }

  rows(table: string): Row[] {
    return (this.tables[table] ??= []);
  }

  find(table: string, pred: Filter): Row | undefined {
    return this.rows(table).find(pred);
  }

  byId(table: string, id: string): Row | undefined {
    return this.find(table, (r) => r.id === id);
  }

  nextId(table: string): string {
    this.seq += 1;
    return `${table}-${String(this.seq).padStart(4, "0")}-0000-0000-000000000000`;
  }

  /**
   * Makes the (after+1)-th future `op` on `table` fail with `message`.
   * Used to prove that multi-step actions roll back.
   */
  failOn(table: string, op: "insert" | "update" | "delete" | "select", message = "forced failure", after = 0) {
    this.failures.push({ table, op, message, after });
  }

  takeFailure(table: string, op: string): FakeError | null {
    const f = this.failures.find((x) => x.table === table && x.op === op);
    if (!f) return null;
    if (f.after > 0) {
      f.after -= 1;
      return null;
    }
    this.failures.splice(this.failures.indexOf(f), 1);
    return { message: f.message };
  }
}

/** Parses "a, b, alias:fk!inner ( x, y ), rel ( z )" into embeds. */
function parseEmbeds(select: string): { alias: string; key: string }[] {
  const out: { alias: string; key: string }[] = [];
  const re = /(\w+)(?::(\w+))?(?:!inner)?\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(select))) out.push({ alias: m[1], key: m[2] ?? m[1] });
  return out;
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  return a < b ? -1 : 1;
}

class Query implements PromiseLike<{ data: any; error: FakeError | null; count?: number | null }> { // eslint-disable-line @typescript-eslint/no-explicit-any
  private op: "select" | "insert" | "update" | "delete" | "upsert" = "select";
  private filters: Filter[] = [];
  private orders: { col: string; asc: boolean }[] = [];
  private rangeArg: [number, number] | null = null;
  private limitArg: number | null = null;
  private payload: Row[] | Row | null = null;
  private selectStr = "*";
  private returning = false;
  private head = false;
  private count = false;
  private mode: "many" | "single" | "maybe" = "many";
  private upsertConflict: string | null = null;

  constructor(private db: FakeDB, private table: string) {}

  select(cols = "*", opts: { count?: string; head?: boolean } = {}) {
    if (this.op === "select") this.selectStr = cols;
    else this.returning = true;
    this.selectStr = cols;
    this.head = !!opts.head;
    this.count = !!opts.count;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.op = "insert";
    this.payload = rows;
    return this;
  }
  upsert(row: Row | Row[], opts: { onConflict?: string } = {}) {
    this.op = "upsert";
    this.payload = row;
    this.upsertConflict = opts.onConflict ?? "id";
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = "delete";
    return this;
  }

  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  neq(col: string, v: unknown) {
    this.filters.push((r) => r[col] !== v);
    return this;
  }
  in(col: string, vs: unknown[]) {
    this.filters.push((r) => vs.includes(r[col]));
    return this;
  }
  is(col: string, v: unknown) {
    this.filters.push((r) => (r[col] ?? null) === v);
    return this;
  }
  not(col: string, op: string, v: unknown) {
    if (op === "is") this.filters.push((r) => (r[col] ?? null) !== v);
    else if (op === "eq") this.filters.push((r) => r[col] !== v);
    else throw new Error(`fake: not(${op}) unsupported`);
    return this;
  }
  gte(col: string, v: string | number) {
    this.filters.push((r) => !col.includes(".") && r[col] != null && r[col] >= v);
    return this;
  }
  gt(col: string, v: string | number) {
    this.filters.push((r) => r[col] != null && r[col] > v);
    return this;
  }
  lt(col: string, v: string | number) {
    this.filters.push((r) => !col.includes(".") && r[col] != null && r[col] < v);
    return this;
  }
  lte(col: string, v: string | number) {
    this.filters.push((r) => r[col] != null && r[col] <= v);
    return this;
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.orders.push({ col, asc: opts.ascending !== false });
    return this;
  }
  range(from: number, to: number) {
    this.rangeArg = [from, to];
    return this;
  }
  limit(n: number) {
    this.limitArg = n;
    return this;
  }
  single() {
    this.mode = "single";
    return this;
  }
  maybeSingle() {
    this.mode = "maybe";
    return this;
  }

  then<T1 = any, T2 = never>( // eslint-disable-line @typescript-eslint/no-explicit-any
    onfulfilled?: ((v: any) => T1 | PromiseLike<T1>) | null, // eslint-disable-line @typescript-eslint/no-explicit-any
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve()
      .then(() => this.run())
      .then(onfulfilled, onrejected);
  }

  private matches(): Row[] {
    return this.db.rows(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  private embed(row: Row): Row {
    const out: Row = { ...row };
    for (const { alias, key } of parseEmbeds(this.selectStr)) {
      const rel = RELATIONS[this.table]?.[key] ?? RELATIONS[this.table]?.[alias];
      if (!rel) continue;
      if (rel.many) {
        out[alias] = this.db.rows(rel.table).filter((r) => r[rel.foreignKey!] === row.id).map((r) => ({ ...r }));
      } else {
        const target = this.db.rows(rel.table).find((r) => r.id === row[rel.localKey!]);
        out[alias] = target ? { ...target } : null;
      }
    }
    return out;
  }

  private finish(rows: Row[]) {
    if (this.mode === "single") {
      if (rows.length !== 1) {
        return { data: null, error: { message: `JSON object requested, ${rows.length} rows returned`, code: "PGRST116" } };
      }
      return { data: rows[0], error: null };
    }
    if (this.mode === "maybe") {
      if (rows.length > 1) return { data: null, error: { message: "multiple rows", code: "PGRST116" } };
      return { data: rows[0] ?? null, error: null };
    }
    return { data: rows, error: null };
  }

  private run() {
    const failure = this.db.takeFailure(this.table, this.op === "upsert" ? "insert" : this.op);
    if (failure) return { data: null, error: failure };

    const now = new Date().toISOString();

    if (this.op === "insert" || this.op === "upsert") {
      const list = Array.isArray(this.payload) ? this.payload : [this.payload!];
      const written: Row[] = [];
      for (const raw of list) {
        if (this.op === "upsert") {
          const key = this.upsertConflict!;
          const existing = this.db.rows(this.table).find((r) => r[key] === raw[key]);
          if (existing) {
            Object.assign(existing, raw);
            written.push(existing);
            continue;
          }
        }
        const row = {
          ...(DEFAULTS[this.table]?.() ?? {}),
          created_at: now,
          ...raw,
          id: raw.id ?? this.db.nextId(this.table),
        };
        this.db.rows(this.table).push(row);
        written.push(row);
      }
      const data = written.map((r) => this.embed(r));
      return this.returning || this.mode !== "many" ? this.finish(data) : { data: null, error: null };
    }

    if (this.op === "update") {
      const hits = this.matches();
      for (const r of hits) Object.assign(r, this.payload);
      const data = hits.map((r) => this.embed(r));
      return this.returning || this.mode !== "many" ? this.finish(data) : { data: null, error: null };
    }

    if (this.op === "delete") {
      const hits = new Set(this.matches());
      this.db.tables[this.table] = this.db.rows(this.table).filter((r) => !hits.has(r));
      return { data: null, error: null };
    }

    // select
    let rows = this.matches();
    for (const o of [...this.orders].reverse()) {
      rows = [...rows].sort((a, b) => (o.asc ? 1 : -1) * compare(a[o.col], b[o.col]));
    }
    const total = rows.length;
    if (this.rangeArg) rows = rows.slice(this.rangeArg[0], this.rangeArg[1] + 1);
    if (this.limitArg !== null) rows = rows.slice(0, this.limitArg);
    if (this.head) return { data: null, error: null, count: total };
    const res = this.finish(rows.map((r) => this.embed(r)));
    return this.count ? { ...res, count: total } : res;
  }
}

export function createFakeClient(db: FakeDB, user: { id: string; email?: string } | null) {
  return {
    auth: {
      getUser: async () => ({ data: { user }, error: null }),
    },
    from: (table: string) => new Query(db, table),
  };
}

export const ADMIN_ID = "admin-user";

/** A database with one admin profile, plus whatever the test seeds. */
export function seedDB(seed: Record<string, Row[]> = {}) {
  return new FakeDB({
    profiles: [{ id: ADMIN_ID, role: "admin", first_name: "Ada", last_name: "Admin" }],
    ...seed,
  });
}

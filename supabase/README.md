# Database migrations

Every schema change lives in `migrations/` as `YYYYMMDDHHMMSS_name.sql` and
is applied in filename order. Never edit a migration that already ran in
production: add a new one.

## Applying

GitHub → **Actions → Migrations → Run workflow**.

1. Run it with **apply = false** first: the log lists the pending migrations.
2. If the list is what you expect, run it again with **apply = true**.

Secrets needed in the repository: `SUPABASE_ACCESS_TOKEN`,
`SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`.

## One-time setup (migrations applied by hand before)

Until now migrations were pasted into the SQL editor, so Supabase has no
record of them and `db push` would try to run them all again. Once, from a
machine with the CLI (`npm i -g supabase` or `brew install supabase/tap/supabase`):

```bash
supabase login
supabase link --project-ref <PROJECT_REF>

# Mark as applied every migration that is already in the database.
# Check with the SQL editor if unsure (e.g. does the table/column exist?).
supabase migration repair --status applied 20260414000000 20260414000001 ...

# Confirm: only the truly pending ones should be listed.
supabase db push --dry-run
```

After that, the Migrations workflow keeps the record up to date.

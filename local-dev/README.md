# Local development stack

Runs PostgreSQL 16 + a GCS emulator (fake-gcs-server) via Docker Compose.
The app talks to exactly the same APIs as production — no code changes needed.

## Quick start

```bash
# 1. Copy and fill in the env file
cp local-dev/.env.local.example .env
# Fill ANTHROPIC_API_KEY and GOOGLE_CLIENT_ID at minimum

# 2. Start the stack
make local-up

# 3. Apply the database schema (migrations live in architecture/)
cd ../architecture && make db-migrate

# 4. Start the app
cd ../digital-notes && make dev
```

## Services

| Service  | Local URL                    | Purpose                   |
|----------|------------------------------|---------------------------|
| Postgres | `postgresql://localhost:5432` | Main database             |
| GCS      | `http://localhost:4443`       | Storage emulator          |
| App      | `http://localhost:5173`       | Vite dev server           |

## Database access

```bash
make db-shell        # psql session inside the container
make db-promote EMAIL=you@example.com   # grant admin + digital_notes access
```

## Promote a user to admin

After signing in with Google for the first time, promote yourself:

```bash
make db-promote EMAIL=your@email.com
```

Or directly in psql:

```sql
UPDATE users
SET access = access
          || '{"admin": true, "digital_notes": true}'::jsonb
WHERE email = 'your@email.com';
```

## Reset everything

```bash
make local-reset   # wipes volumes and restarts fresh
```

## GCS bucket

The local bucket is `digital-notes-local`.
Files are stored at: `dn/{user_id}/{scan_id}/input.{ext}` and `dn/{user_id}/{scan_id}/output.md`.

Browse the GCS emulator: `http://localhost:4443/storage/v1/b/digital-notes-local/o`

## Schema changes

Edit `local-dev/schema.sql`, then:

```bash
make local-reset   # applies the new schema on a fresh DB
```

For production migrations, apply `schema.sql` changes directly on Cloud SQL.

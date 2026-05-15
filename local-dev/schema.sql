-- ═══════════════════════════════════════════════════════════════════
-- Shared schema — used by Digital Notes, Dream Machine and future apps
-- Rule: prefer JSONB over dedicated columns unless needed for indexing
-- ═══════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Users ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    google_id       TEXT        UNIQUE NOT NULL,
    email           TEXT        UNIQUE NOT NULL,
    name            TEXT,
    avatar_url      TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- App access flags — add new apps without migrations
    -- e.g. {"digital_notes": true, "dream_machine": false, "admin": true}
    access          JSONB       NOT NULL DEFAULT '{}',

    -- User preferences — theme, language, etc.
    -- e.g. {"theme": "dark", "lang": "fr"}
    preferences     JSONB       NOT NULL DEFAULT '{}',

    -- Credits
    monthly_limit   INTEGER     NOT NULL DEFAULT 30,
    credit_policy   TEXT        NOT NULL DEFAULT 'hard'
                    CHECK (credit_policy IN ('hard', 'soft'))
);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users (google_id);
CREATE INDEX IF NOT EXISTS idx_users_email     ON users (email);

-- Auto-update updated_at on any change
CREATE OR REPLACE FUNCTION _set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION _set_updated_at();


-- ── Digital Notes — scan history ───────────────────────────────────

CREATE TABLE IF NOT EXISTS digital_notes_scans (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Cost & token tracking (Claude API)
    cost_usd        NUMERIC(12, 8),   -- e.g. 0.00234500
    input_tokens    INTEGER,
    output_tokens   INTEGER,

    -- GCS file references
    -- Pattern: gs://{bucket}/dn/{user_id}/{scan_id}/input.{ext}
    input_gcs_path  TEXT        NOT NULL,
    output_gcs_path TEXT,             -- null until processing succeeds

    -- Original file info
    -- e.g. {"filename": "invoice.pdf", "size": 204800, "mime": "application/pdf"}
    file_metadata   JSONB       NOT NULL DEFAULT '{}',

    -- Extracted content info
    -- e.g. {"title": "Q2 Invoice", "description": "...", "tags": ["finance"],
    --        "filename": "2026-05-15-q2-invoice.md"}
    output_metadata JSONB       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_dn_scans_user_id
    ON digital_notes_scans (user_id);
CREATE INDEX IF NOT EXISTS idx_dn_scans_processed_at
    ON digital_notes_scans (processed_at DESC);
-- Composite for monthly credit counting (most frequent query)
CREATE INDEX IF NOT EXISTS idx_dn_scans_user_month
    ON digital_notes_scans (user_id, processed_at DESC);

-- Forkful database schema — Milestone 1
-- Covers: catalog recipes, accounts, verification/reset tokens, sessions, settings, roles.
-- Added later: app.recipe (+ ingredients, steps, tags) and row-level security in M2,
--              app.catalog_import in M3.
--
-- Run as the Neon owner role, using the DIRECT (non-pooler) connection string:
--   psql "$DATABASE_URL_DIRECT" -f db/schema.sql
-- Safe to run more than once.
--
-- This repo is public: NO passwords in this file. After the first run, set role
-- passwords once in the Neon SQL Editor (see the end of this file).

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- typo-tolerant title search (§6.1)

-- ---------------------------------------------------------------------------
-- Roles (NFR-18). Created here, not in the Neon Console, because console roles
-- get broad extra privileges that would defeat the read-only catalog role.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'forkful_app') THEN
    CREATE ROLE forkful_app LOGIN;        -- the web app: reads/writes the app schema
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'catalog_reader') THEN
    CREATE ROLE catalog_reader LOGIN;     -- Catalog Service: read-only
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'catalog_writer') THEN
    CREATE ROLE catalog_writer LOGIN;     -- seed script, recipe import, curation only
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Schemas
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS catalog;
CREATE SCHEMA IF NOT EXISTS app;

REVOKE ALL ON SCHEMA catalog FROM PUBLIC;
REVOKE ALL ON SCHEMA app     FROM PUBLIC;

-- ===========================================================================
-- CATALOG SCHEMA — public recipes (BR-1, BR-7, BR-8)
-- ===========================================================================

CREATE TABLE IF NOT EXISTS catalog.recipe (
  catalog_id    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title         text NOT NULL CHECK (length(trim(title)) > 0),
  description   text,
  cuisine       text,
  tags          text[] NOT NULL DEFAULT '{}',
  servings      integer CHECK (servings > 0),
  prep_minutes  integer CHECK (prep_minutes >= 0),
  cook_minutes  integer CHECK (cook_minutes >= 0),
  source_url    text NOT NULL UNIQUE,                 -- REQ-12.3: no duplicates
  source_site   text NOT NULL,                        -- BR-8: always shown
  photo_path    text,                                 -- Vercel Blob display version
  thumb_path    text,                                 -- Vercel Blob thumbnail
  status        text NOT NULL DEFAULT 'active'
                CHECK (status IN ('active', 'failed', 'removed')),
  extra         jsonb NOT NULL DEFAULT '{}',
  parsed_at     timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('english', coalesce(title, '')), 'A')
   || setweight(to_tsvector('english', coalesce(cuisine, '')), 'B')
   || setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED
);

CREATE INDEX IF NOT EXISTS recipe_search_idx  ON catalog.recipe USING gin (search_vector);
CREATE INDEX IF NOT EXISTS recipe_title_trgm  ON catalog.recipe USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS recipe_tags_idx    ON catalog.recipe USING gin (tags);
CREATE INDEX IF NOT EXISTS recipe_cuisine_idx ON catalog.recipe (cuisine);
CREATE INDEX IF NOT EXISTS recipe_status_idx  ON catalog.recipe (status);

-- Structured ingredient lines (REQ-12.8, §6.2). quantity/unit are NULL when a
-- line could not be split; raw_text always keeps the original line.
CREATE TABLE IF NOT EXISTS catalog.recipe_ingredient (
  catalog_id   uuid    NOT NULL REFERENCES catalog.recipe (catalog_id) ON DELETE CASCADE,
  position     integer NOT NULL CHECK (position > 0),
  quantity     numeric CHECK (quantity >= 0),
  quantity_max numeric CHECK (quantity_max >= quantity),   -- upper end of a range like "2–3"
  unit         text,
  name         text,
  note         text,
  raw_text     text    NOT NULL,
  PRIMARY KEY (catalog_id, position)
);

CREATE TABLE IF NOT EXISTS catalog.recipe_step (
  catalog_id uuid    NOT NULL REFERENCES catalog.recipe (catalog_id) ON DELETE CASCADE,
  position   integer NOT NULL CHECK (position > 0),
  text       text    NOT NULL CHECK (length(trim(text)) > 0),
  PRIMARY KEY (catalog_id, position)
);

-- ===========================================================================
-- APP SCHEMA — accounts and sessions
-- ===========================================================================

CREATE TABLE IF NOT EXISTS app.users (
  user_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username         text NOT NULL CHECK (username ~ '^[A-Za-z0-9_.-]{3,30}$'),
  email            text NOT NULL CHECK (position('@' IN email) > 1),
  password_hash    text NOT NULL,                     -- Argon2id only (NFR-14)
  role             text NOT NULL DEFAULT 'home_cook'
                   CHECK (role IN ('home_cook', 'admin')),
  is_verified      boolean NOT NULL DEFAULT false,    -- REQ-8.7
  is_disabled      boolean NOT NULL DEFAULT false,    -- REQ-6.2
  unit_preference  text NOT NULL DEFAULT 'original'
                   CHECK (unit_preference IN ('us', 'metric', 'original')),  -- REQ-7.8
  age_confirmed_at timestamptz NOT NULL,              -- REQ-8.3 / BR-4
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness: "Sam" and "sam" are the same username (REQ-8.2, BR-5)
CREATE UNIQUE INDEX IF NOT EXISTS users_username_key ON app.users (lower(username));
CREATE UNIQUE INDEX IF NOT EXISTS users_email_key    ON app.users (lower(email));
-- Daily cleanup of never-verified accounts (REQ-8.8)
CREATE INDEX IF NOT EXISTS users_unverified_idx ON app.users (created_at) WHERE NOT is_verified;

-- Single-use links for email verification, password reset, and email change.
-- Only a hash of the token is stored; the raw token exists only in the email.
CREATE TABLE IF NOT EXISTS app.auth_token (
  token_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES app.users (user_id) ON DELETE CASCADE,
  purpose    text NOT NULL CHECK (purpose IN ('verify', 'reset', 'email_change')),
  token_hash text NOT NULL UNIQUE,
  new_email  text,                                     -- only for email_change (REQ-7.3)
  expires_at timestamptz NOT NULL,                     -- 24 h verify (REQ-8.6), 1 h reset (REQ-9.5)
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((purpose = 'email_change') = (new_email IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS auth_token_user_idx ON app.auth_token (user_id, purpose);

-- Login sessions. The cookie holds a random token; only its hash is stored,
-- so a leaked database can't be used to hijack sessions.
CREATE TABLE IF NOT EXISTS app.session (
  session_id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app.users (user_id) ON DELETE CASCADE,
  token_hash   text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),     -- 30-min idle timeout (NFR-15)
  expires_at   timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS session_user_idx ON app.session (user_id);

-- Usage limits, changeable without redeploying (NFR-29)
CREATE TABLE IF NOT EXISTS app.settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO app.settings (key, value) VALUES
  ('recipe_cap',             '100'),   -- BR-10
  ('recipe_warning_at',      '90'),    -- REQ-10.6
  ('storage_warning_percent','80')     -- REQ-6.4, NFR-8
ON CONFLICT (key) DO NOTHING;

-- ===========================================================================
-- PRIVILEGES (NFR-18, NFR-13)
-- ===========================================================================

-- catalog_reader: read the catalog, nothing else
GRANT USAGE  ON SCHEMA catalog TO catalog_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA catalog TO catalog_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog GRANT SELECT ON TABLES TO catalog_reader;

-- catalog_writer: change the catalog (seed, import, curation)
GRANT USAGE ON SCHEMA catalog TO catalog_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA catalog TO catalog_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA catalog
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO catalog_writer;

-- forkful_app: the app schema only; no access to catalog at all
-- (catalog reads go through the Catalog Service with catalog_reader)
GRANT USAGE ON SCHEMA app TO forkful_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO forkful_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO forkful_app;

-- ---------------------------------------------------------------------------
-- ONE-TIME STEP (do NOT save passwords in this file):
-- In the Neon SQL Editor, run once per role with a long random password:
--   ALTER ROLE forkful_app    PASSWORD '<long random password>';
--   ALTER ROLE catalog_reader PASSWORD '<long random password>';
--   ALTER ROLE catalog_writer PASSWORD '<long random password>';
-- Then build each connection string by swapping the user and password into
-- your Neon connection string, and put them in .env.local and Vercel:
--   DATABASE_URL_APP, DATABASE_URL_CATALOG_READ, DATABASE_URL_CATALOG_WRITE
-- ---------------------------------------------------------------------------
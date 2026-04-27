-- Run this once in the Neon SQL Editor to create the schema

CREATE TABLE IF NOT EXISTS borrowers (
  id         SERIAL PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  address    TEXT,
  city       TEXT,
  state      TEXT,
  zip        TEXT,
  dob        TEXT,
  ssn                   TEXT,
  coborrower_first_name TEXT,
  coborrower_last_name  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS properties (
  id              SERIAL PRIMARY KEY,
  address         TEXT NOT NULL,
  city            TEXT,
  state           TEXT,
  zip             TEXT,
  property_type   TEXT DEFAULT 'single_family',
  estimated_value NUMERIC(14,2) DEFAULT 0,
  year_built      INTEGER,
  square_footage  INTEGER
);

CREATE TABLE IF NOT EXISTS payments (
  id               SERIAL PRIMARY KEY,
  loan_id          INTEGER NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  payment_date     DATE NOT NULL,
  amount_paid      NUMERIC(14,2) NOT NULL,
  principal_amount NUMERIC(14,2) DEFAULT 0,
  interest_amount  NUMERIC(14,2) DEFAULT 0,
  late_fee         NUMERIC(14,2) DEFAULT 0,
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS loans (
  id               SERIAL PRIMARY KEY,
  loan_number      TEXT UNIQUE,
  borrower_id      INTEGER NOT NULL REFERENCES borrowers(id),
  property_id      INTEGER NOT NULL REFERENCES properties(id),
  loan_amount      NUMERIC(14,2) NOT NULL,
  wired_amount     NUMERIC(14,2) DEFAULT 0,
  interest_rate    NUMERIC(6,3) NOT NULL,
  loan_term        INTEGER NOT NULL,
  origination_date DATE,
  maturity_date    DATE,
  loan_type        TEXT DEFAULT 'hard_money',
  status           TEXT DEFAULT 'application',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used       BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plaid table kept commented (no longer used; bank statement upload replaces it):
-- CREATE TABLE IF NOT EXISTS plaid_items (
--   id               SERIAL PRIMARY KEY,
--   item_id          TEXT UNIQUE NOT NULL,
--   access_token     TEXT NOT NULL,
--   institution_name TEXT,
--   cursor           TEXT,
--   last_synced_at   TIMESTAMPTZ,
--   created_at       TIMESTAMPTZ DEFAULT NOW()
-- );

CREATE TABLE IF NOT EXISTS suggested_payments (
  id                   SERIAL PRIMARY KEY,
  bank_transaction_id  TEXT UNIQUE NOT NULL,
  amount               NUMERIC(14,2) NOT NULL,
  transaction_date     DATE NOT NULL,
  memo                 TEXT,
  loan_id              INTEGER REFERENCES loans(id) ON DELETE SET NULL,
  confidence           TEXT NOT NULL DEFAULT 'none',
  status               TEXT NOT NULL DEFAULT 'pending',
  payment_id           INTEGER REFERENCES payments(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS statement_uploads (
  id              SERIAL PRIMARY KEY,
  filename        TEXT NOT NULL,
  file_hash       TEXT UNIQUE NOT NULL,
  txn_count       INTEGER NOT NULL,
  imported_count  INTEGER NOT NULL,
  matched_count   INTEGER NOT NULL,
  uploaded_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Migrations for existing databases:
-- ALTER TABLE loans ADD COLUMN IF NOT EXISTS wired_amount NUMERIC(14,2) DEFAULT 0;
-- ALTER TABLE suggested_payments RENAME COLUMN plaid_transaction_id TO bank_transaction_id;

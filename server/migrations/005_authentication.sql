CREATE TABLE app_users (
  id uuid PRIMARY KEY, username text NOT NULL UNIQUE CHECK(username=lower(username)),
  password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('admin','editor','viewer')),
  disabled boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE sessions (
  token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE auth_attempts (
  key text PRIMARY KEY, attempts integer NOT NULL, reset_at timestamptz NOT NULL
);

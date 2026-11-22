CREATE TABLE assets (
  id uuid PRIMARY KEY, project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'), mime_type text NOT NULL,
  byte_size integer NOT NULL CHECK(byte_size>0 AND byte_size<=40000000), width integer, height integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id,sha256,mime_type), UNIQUE(project_id,id)
);

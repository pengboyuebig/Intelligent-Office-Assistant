-- PostgreSQL RBAC migration for existing chromaVersion databases
-- Run this against the remote PostgreSQL instance if you see:
--   "column 'owner_id' of relation 'knowledge_bases' does not exist"
--
-- Example:
--   psql -h 172.24.183.91 -U postgres -d postgres -f migrate_postgres_to_rbac.sql

-- 1. Create users table (if not exists)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
    created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT
);

-- 2. Add RBAC columns to existing knowledge_bases table
ALTER TABLE knowledge_bases
    ADD COLUMN IF NOT EXISTS owner_id TEXT NOT NULL DEFAULT 'system',
    ADD COLUMN IF NOT EXISTS is_public INTEGER NOT NULL DEFAULT 0;

-- 3. Migrate existing knowledge bases:
--    Set old knowledge bases to public so existing non-admin users can still access them.
--    If you prefer admin-only for old data, change is_public to 0 below.
UPDATE knowledge_bases
SET owner_id = 'system', is_public = 1
WHERE owner_id = 'system' AND is_public = 0;

-- 4. Seed default users (only if missing)
INSERT INTO users (id, username, password, role) VALUES ('admin', 'admin', 'admin123', 'admin')
    ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, username, password, role) VALUES ('ptyh', 'ptyh', 'ptyh123', 'user')
    ON CONFLICT (id) DO NOTHING;

-- 5. Ensure indexes exist (safe to re-run)
CREATE INDEX IF NOT EXISTS idx_documents_kb ON documents(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_kb ON chunks(knowledge_base_id);

-- PostgreSQL schema for chromaVersion (remote shared database)
-- Created: 2026-06-16
-- Auto-initialized by the Rust backend on first remote connection

CREATE TABLE IF NOT EXISTS knowledge_bases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT
);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    knowledge_base_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT
);

CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    knowledge_base_id TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT
);

CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    group_id TEXT DEFAULT '',
    system_prompt TEXT NOT NULL DEFAULT 'help',
    tools_md TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT,
    updated_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT
);

CREATE INDEX IF NOT EXISTS idx_documents_kb ON documents(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_kb ON chunks(knowledge_base_id);

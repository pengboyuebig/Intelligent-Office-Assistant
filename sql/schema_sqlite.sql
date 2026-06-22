-- SQLite schema for chromaVersion (local offline database)
-- Created: 2026-06-16
-- Auto-initialized by the Rust backend on first launch

-- Conversations (chat sessions)
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '新对话',
    skill_id TEXT,
    knowledge_base_ids TEXT DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Messages (user questions + assistant replies)
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Knowledge bases
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Documents uploaded to knowledge bases
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    knowledge_base_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);

-- Document chunks (text segments + optional local embedding)
CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    knowledge_base_id TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    embedding BLOB,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);

-- Skills / prompt templates
CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    system_prompt TEXT NOT NULL DEFAULT '你是一个有用的助手。',
    tools_md TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- Key-value application settings
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_documents_kb ON documents(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_chunks_kb ON chunks(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);

-- Default settings (inserted only if missing)
INSERT OR IGNORE INTO settings (key, value) VALUES ('api_base_url', 'http://localhost:11434/v1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('embedding_model', 'nomic-embed-text');
INSERT OR IGNORE INTO settings (key, value) VALUES ('chat_model', 'qwen3-vl:4b');
INSERT OR IGNORE INTO settings (key, value) VALUES ('top_k', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('remote_db_url', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('remote_db_enabled', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('chroma_endpoint', 'http://localhost:8000');
INSERT OR IGNORE INTO settings (key, value) VALUES ('chroma_enabled', 'false');

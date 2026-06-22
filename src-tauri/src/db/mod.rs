use rusqlite::Connection;
use std::sync::Mutex;

pub mod conversation;
pub mod knowledge;
pub mod remote_db;
pub mod skill;

pub struct Database {
    pub conn: Mutex<Connection>,
}

impl Database {
    pub fn new(db_path: &str) -> anyhow::Result<Self> {
        let conn = Connection::open(db_path)?;
        let db = Database {
            conn: Mutex::new(conn),
        };
        db.init_tables()?;
        Ok(db)
    }

    fn init_tables(&self) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL DEFAULT '新对话',
                skill_id TEXT,
                knowledge_base_ids TEXT DEFAULT '[]',
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
                content TEXT NOT NULL DEFAULT '',
                reasoning TEXT,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS knowledge_bases (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT DEFAULT '',
                owner_id TEXT NOT NULL DEFAULT 'system',
                is_public INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                knowledge_base_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                content TEXT NOT NULL,
                chunk_count INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
            );

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

            CREATE TABLE IF NOT EXISTS skills (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                description TEXT DEFAULT '',
                system_prompt TEXT NOT NULL DEFAULT '你是一个有用的助手。',
                tools_md TEXT DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                username TEXT NOT NULL UNIQUE,
                password TEXT NOT NULL,
                role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            );

            CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
            CREATE INDEX IF NOT EXISTS idx_documents_kb ON documents(knowledge_base_id);
            CREATE INDEX IF NOT EXISTS idx_chunks_kb ON chunks(knowledge_base_id);
            CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);

            INSERT OR IGNORE INTO settings (key, value) VALUES ('api_base_url', 'http://localhost:11434/v1');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('embedding_model', 'nomic-embed-text');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('chat_model', 'qwen3-vl:4b');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('top_k', '5');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('remote_db_url', '');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('remote_db_enabled', 'false');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('chroma_endpoint', 'http://localhost:8000');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('chroma_enabled', 'false');
            INSERT OR IGNORE INTO settings (key, value) VALUES ('current_user_id', 'ptyh');

            INSERT OR IGNORE INTO users (id, username, password, role) VALUES ('admin', 'admin', 'admin123', 'admin');
            INSERT OR IGNORE INTO users (id, username, password, role) VALUES ('ptyh', 'ptyh', 'ptyh123', 'user');
            ",
        )?;

        // 兼容旧数据库：如果 messages 表没有 reasoning 列则添加
        let _ = conn.execute("ALTER TABLE messages ADD COLUMN reasoning TEXT", []);

        Ok(())
    }
}

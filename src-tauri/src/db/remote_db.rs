//! 内网远程 PostgreSQL 适配层。

use serde::{Deserialize, Serialize};
use sqlx::postgres::{PgPool, PgPoolOptions};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::OnceCell;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteDbConfig {
    pub database_url: String,
    pub max_connections: u32,
    pub enabled: bool,
}

impl Default for RemoteDbConfig {
    fn default() -> Self {
        RemoteDbConfig {
            database_url: String::new(),
            max_connections: 5,
            enabled: false,
        }
    }
}

pub struct RemoteDbPool {
    config: RemoteDbConfig,
    cell: OnceCell<Arc<PgPool>>,
}

impl RemoteDbPool {
    pub fn new(config: RemoteDbConfig) -> Self {
        RemoteDbPool {
            config,
            cell: OnceCell::new(),
        }
    }

    pub fn config(&self) -> &RemoteDbConfig {
        &self.config
    }

    pub async fn pool(&self) -> Result<Arc<PgPool>, String> {
        if !self.config.enabled || self.config.database_url.is_empty() {
            return Err("远程数据库未启用".to_string());
        }

        self.cell
            .get_or_try_init(|| async {
                let pool = PgPoolOptions::new()
                    .max_connections(self.config.max_connections)
                    .acquire_timeout(Duration::from_secs(30))
                    .connect(&self.config.database_url)
                    .await
                    .map_err(|error| format!("远程数据库连接失败 [{}]: {error}", self.config.database_url))?;

                initialize_schema(&pool).await?;
                Ok(Arc::new(pool))
            })
            .await
            .map(Arc::clone)
    }
}

async fn initialize_schema(pool: &PgPool) -> Result<(), String> {
    for sql in [
        // users
        "CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('admin', 'user')), created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT)",
        // knowledge_bases (with RBAC)
        "CREATE TABLE IF NOT EXISTS knowledge_bases (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', owner_id TEXT NOT NULL DEFAULT 'system', is_public INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT)",
        // documents / chunks / skills
        "CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, knowledge_base_id TEXT NOT NULL, filename TEXT NOT NULL, content TEXT NOT NULL, chunk_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT)",
        "CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, knowledge_base_id TEXT NOT NULL, content TEXT NOT NULL, chunk_index INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT)",
        "CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', group_id TEXT DEFAULT '', system_prompt TEXT NOT NULL DEFAULT '你是一个有用的助手。', tools_md TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT, updated_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT)",
        // indexes
        "CREATE INDEX IF NOT EXISTS idx_documents_kb ON documents(knowledge_base_id)",
        "CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id)",
        "CREATE INDEX IF NOT EXISTS idx_chunks_kb ON chunks(knowledge_base_id)",
        // migration: add RBAC columns to old knowledge_bases
        "ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS owner_id TEXT NOT NULL DEFAULT 'system'",
        "ALTER TABLE knowledge_bases ADD COLUMN IF NOT EXISTS is_public INTEGER NOT NULL DEFAULT 0",
        // migration: make existing knowledge bases public so non-admin users can still access them
        "UPDATE knowledge_bases SET owner_id='system', is_public=1 WHERE owner_id='system' AND is_public=0",
    ] {
        sqlx::query(sql)
            .execute(pool)
            .await
            .map_err(|error| format!("远程数据库初始化失败: {error}"))?;
    }

    // seed default users
    for (id, username, password, role) in [
        ("admin", "admin", "admin123", "admin"),
        ("ptyh", "ptyh", "ptyh123", "user"),
    ] {
        sqlx::query("INSERT INTO users (id, username, password, role) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING")
            .bind(id)
            .bind(username)
            .bind(password)
            .bind(role)
            .execute(pool)
            .await
            .map_err(|error| format!("远程数据库初始化用户失败: {error}"))?;
    }

    Ok(())
}

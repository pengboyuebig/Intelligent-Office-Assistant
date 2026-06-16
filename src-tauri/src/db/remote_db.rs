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
                    .acquire_timeout(Duration::from_secs(5))
                    .connect(&self.config.database_url)
                    .await
                    .map_err(|error| format!("远程数据库连接失败: {error}"))?;

                initialize_schema(&pool).await?;
                Ok(Arc::new(pool))
            })
            .await
            .map(Arc::clone)
    }
}

async fn initialize_schema(pool: &PgPool) -> Result<(), String> {
    for sql in [
        "CREATE TABLE IF NOT EXISTS knowledge_bases (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT)",
        "CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, knowledge_base_id TEXT NOT NULL, filename TEXT NOT NULL, content TEXT NOT NULL, chunk_count INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT)",
        "CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, document_id TEXT NOT NULL, knowledge_base_id TEXT NOT NULL, content TEXT NOT NULL, chunk_index INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT)",
        "CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', group_id TEXT DEFAULT '', system_prompt TEXT NOT NULL DEFAULT 'help', tools_md TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT, updated_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT)",
        "CREATE INDEX IF NOT EXISTS idx_documents_kb ON documents(knowledge_base_id)",
        "CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id)",
        "CREATE INDEX IF NOT EXISTS idx_chunks_kb ON chunks(knowledge_base_id)",
    ] {
        sqlx::query(sql)
            .execute(pool)
            .await
            .map_err(|error| format!("远程数据库初始化失败: {error}"))?;
    }

    Ok(())
}

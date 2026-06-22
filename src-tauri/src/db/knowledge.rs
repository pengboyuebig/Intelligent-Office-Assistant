use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KnowledgeBase {
    pub id: String,
    pub name: String,
    pub description: String,
    pub owner_id: String,
    pub is_public: bool,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Document {
    pub id: String,
    pub knowledge_base_id: String,
    pub filename: String,
    pub content: String,
    pub chunk_count: i32,
    pub created_at: String,
}

impl Database {
    pub fn create_knowledge_base(
        &self,
        name: &str,
        description: &str,
        owner_id: &str,
        is_public: bool,
    ) -> anyhow::Result<KnowledgeBase> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO knowledge_bases (id, name, description, owner_id, is_public) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, name, description, owner_id, if is_public { 1 } else { 0 }],
        )?;

        Ok(KnowledgeBase {
            id,
            name: name.to_string(),
            description: description.to_string(),
            owner_id: owner_id.to_string(),
            is_public,
            created_at: String::new(),
        })
    }

    pub fn get_knowledge_bases(
        &self,
        current_user_id: &str,
        is_admin: bool,
    ) -> anyhow::Result<Vec<KnowledgeBase>> {
        let conn = self.conn.lock().unwrap();
        let sql = if is_admin {
            "SELECT id, name, description, owner_id, is_public, created_at FROM knowledge_bases WHERE owner_id='system' OR owner_id=?1 ORDER BY created_at DESC"
        } else {
            "SELECT id, name, description, owner_id, is_public, created_at FROM knowledge_bases WHERE is_public=1 OR owner_id=?1 ORDER BY created_at DESC"
        };
        let mut stmt = conn.prepare(sql)?;
        let mapper = |row: &rusqlite::Row| {
            Ok(KnowledgeBase {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                owner_id: row.get(3)?,
                is_public: row.get::<_, i32>(4)? == 1,
                created_at: row.get(5)?,
            })
        };
        let rows = if is_admin {
            stmt.query_map([], mapper)?
        } else {
            stmt.query_map(params![current_user_id], mapper)?
        };

        collect_rows(rows)
    }

    pub fn delete_knowledge_base(&self, id: &str
    ) -> anyhow::Result<bool> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM knowledge_bases WHERE id=?1", params![id])?;
        Ok(conn.changes() > 0)
    }

    pub fn get_documents(&self, kb_id: &str) -> anyhow::Result<Vec<Document>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, knowledge_base_id, filename, content, chunk_count, created_at
             FROM documents WHERE knowledge_base_id=?1 ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map(params![kb_id], |row| {
            Ok(Document {
                id: row.get(0)?,
                knowledge_base_id: row.get(1)?,
                filename: row.get(2)?,
                content: row.get(3)?,
                chunk_count: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;

        collect_rows(rows)
    }

    pub fn delete_document(&self, id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM documents WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn add_document_with_chunks(
        &self,
        kb_id: &str,
        filename: &str,
        content: &str,
        chunks: &[String],
        embeddings: Option<&Vec<Vec<f32>>>,
    ) -> anyhow::Result<(String, Vec<String>)> {
        let mut conn = self.conn.lock().unwrap();
        let tx = conn.transaction()?;
        let doc_id = Uuid::new_v4().to_string();
        let mut chunk_ids = Vec::with_capacity(chunks.len());

        tx.execute(
            "INSERT INTO documents (id, knowledge_base_id, filename, content) VALUES (?1, ?2, ?3, ?4)",
            params![doc_id, kb_id, filename, content],
        )?;

        for (index, chunk) in chunks.iter().enumerate() {
            let chunk_id = Uuid::new_v4().to_string();
            let embedding_bytes = embeddings
                .and_then(|items| items.get(index))
                .map(embedding_to_bytes);
            chunk_ids.push(chunk_id.clone());

            tx.execute(
                "INSERT INTO chunks (id, document_id, knowledge_base_id, content, chunk_index, embedding)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![chunk_id, doc_id, kb_id, chunk, index as i32, embedding_bytes],
            )?;
        }

        tx.execute(
            "UPDATE documents SET chunk_count=?1 WHERE id=?2",
            params![chunks.len() as i32, doc_id],
        )?;
        tx.commit()?;

        Ok((doc_id, chunk_ids))
    }
}

fn embedding_to_bytes(embedding: &Vec<f32>) -> Vec<u8> {
    embedding
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect()
}

fn collect_rows<T>(
    rows: rusqlite::MappedRows<'_, impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>>,
) -> anyhow::Result<Vec<T>> {
    let mut items = Vec::new();
    for row in rows {
        items.push(row?);
    }
    Ok(items)
}

use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KnowledgeBase {
    pub id: String,
    pub name: String,
    pub description: String,
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
    ) -> anyhow::Result<KnowledgeBase> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO knowledge_bases (id, name, description) VALUES (?1, ?2, ?3)",
            params![id, name, description],
        )?;

        Ok(KnowledgeBase {
            id,
            name: name.to_string(),
            description: description.to_string(),
            created_at: String::new(),
        })
    }

    pub fn get_knowledge_bases(&self) -> anyhow::Result<Vec<KnowledgeBase>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, created_at FROM knowledge_bases ORDER BY created_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(KnowledgeBase {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;

        collect_rows(rows)
    }

    pub fn delete_knowledge_base(&self, id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM knowledge_bases WHERE id=?1", params![id])?;
        Ok(())
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

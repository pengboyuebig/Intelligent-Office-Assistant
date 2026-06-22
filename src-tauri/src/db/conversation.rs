use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Conversation {
    pub id: String,
    pub title: String,
    pub skill_id: Option<String>,
    pub knowledge_base_ids: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Message {
    pub id: String,
    pub conversation_id: String,
    pub role: String,
    pub content: String,
    pub reasoning: Option<String>,
    pub created_at: String,
}

impl Database {
    pub fn create_conversation(
        &self,
        title: &str,
        skill_id: Option<&str>,
        kb_ids: &[String],
    ) -> anyhow::Result<Conversation> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let kb_json = serde_json::to_string(kb_ids)?;
        conn.execute(
            "INSERT INTO conversations (id, title, skill_id, knowledge_base_ids) VALUES (?1, ?2, ?3, ?4)",
            params![id, title, skill_id, kb_json],
        )?;
        Ok(Conversation {
            id: id.clone(),
            title: title.to_string(),
            skill_id: skill_id.map(|s| s.to_string()),
            knowledge_base_ids: kb_json,
            created_at: String::new(),
            updated_at: String::new(),
        })
    }

    pub fn get_conversations(&self) -> anyhow::Result<Vec<Conversation>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, title, skill_id, knowledge_base_ids, created_at, updated_at
             FROM conversations ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Conversation {
                id: row.get(0)?,
                title: row.get(1)?,
                skill_id: row.get(2)?,
                knowledge_base_ids: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn update_conversation_title(&self, id: &str, title: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE conversations SET title=?1, updated_at=datetime('now','localtime') WHERE id=?2",
            params![title, id],
        )?;
        Ok(())
    }

    pub fn update_conversation_knowledge_bases(
        &self,
        id: &str,
        kb_ids: &[String],
    ) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        let kb_json = serde_json::to_string(kb_ids)?;
        conn.execute(
            "UPDATE conversations
             SET knowledge_base_ids=?1, updated_at=datetime('now','localtime')
             WHERE id=?2",
            params![kb_json, id],
        )?;
        Ok(())
    }

    pub fn delete_conversation(&self, id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM conversations WHERE id=?1", params![id])?;
        Ok(())
    }

    pub fn add_message(
        &self,
        conversation_id: &str,
        role: &str,
        content: &str,
        reasoning: Option<&str>,
    ) -> anyhow::Result<Message> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        let reasoning_value = reasoning.map(|r| r.trim()).filter(|r| !r.is_empty());
        conn.execute(
            "INSERT INTO messages (id, conversation_id, role, content, reasoning) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, conversation_id, role, content, reasoning_value],
        )?;
        conn.execute(
            "UPDATE conversations SET updated_at=datetime('now','localtime') WHERE id=?1",
            params![conversation_id],
        )?;
        Ok(Message {
            id: id.clone(),
            conversation_id: conversation_id.to_string(),
            role: role.to_string(),
            content: content.to_string(),
            reasoning: reasoning_value.map(|r| r.to_string()),
            created_at: String::new(),
        })
    }

    pub fn get_messages(&self, conversation_id: &str) -> anyhow::Result<Vec<Message>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, conversation_id, role, content, reasoning, created_at
             FROM messages WHERE conversation_id=?1 ORDER BY created_at ASC",
        )?;
        let rows = stmt.query_map(params![conversation_id], |row| {
            Ok(Message {
                id: row.get(0)?,
                conversation_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                reasoning: row.get(4)?,
                created_at: row.get(5)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }
}

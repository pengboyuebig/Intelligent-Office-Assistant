use rusqlite::params;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::Database;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Skill {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_prompt: String,
    pub tools_md: String,
    pub created_at: String,
    pub updated_at: String,
}

impl Database {
    pub fn create_skill(
        &self,
        name: &str,
        description: &str,
        system_prompt: &str,
        tools_md: &str,
    ) -> anyhow::Result<Skill> {
        let conn = self.conn.lock().unwrap();
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO skills (id, name, description, system_prompt, tools_md) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, name, description, system_prompt, tools_md],
        )?;
        Ok(Skill {
            id,
            name: name.to_string(),
            description: description.to_string(),
            system_prompt: system_prompt.to_string(),
            tools_md: tools_md.to_string(),
            created_at: String::new(),
            updated_at: String::new(),
        })
    }

    pub fn update_skill(
        &self,
        id: &str,
        name: &str,
        description: &str,
        system_prompt: &str,
        tools_md: &str,
    ) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "UPDATE skills SET name=?1, description=?2, system_prompt=?3, tools_md=?4,
             updated_at=datetime('now','localtime') WHERE id=?5",
            params![name, description, system_prompt, tools_md, id],
        )?;
        Ok(())
    }

    pub fn get_skills(&self) -> anyhow::Result<Vec<Skill>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, system_prompt, tools_md, created_at, updated_at
             FROM skills ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(Skill {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                system_prompt: row.get(3)?,
                tools_md: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        let mut result = Vec::new();
        for row in rows {
            result.push(row?);
        }
        Ok(result)
    }

    pub fn get_skill(&self, id: &str) -> anyhow::Result<Option<Skill>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, name, description, system_prompt, tools_md, created_at, updated_at
             FROM skills WHERE id=?1",
        )?;
        let mut rows = stmt.query_map(params![id], |row| {
            Ok(Skill {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                system_prompt: row.get(3)?,
                tools_md: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn delete_skill(&self, id: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM skills WHERE id=?1", params![id])?;
        Ok(())
    }

    // ========== Settings ==========

    pub fn get_setting(&self, key: &str) -> anyhow::Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key=?1")?;
        let mut rows = stmt.query_map(params![key], |row| row.get::<_, String>(0))?;
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> anyhow::Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2)",
            params![key, value],
        )?;
        Ok(())
    }
}

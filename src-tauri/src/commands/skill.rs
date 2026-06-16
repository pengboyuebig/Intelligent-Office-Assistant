use crate::db::remote_db::RemoteDbPool;
use crate::db::skill::Skill;
use crate::db::Database;
use std::sync::Arc;
use tauri::State;

#[tauri::command]
pub async fn create_skill(
    db: State<'_, Database>,
    remote_db: State<'_, Arc<RemoteDbPool>>,
    name: String,
    description: String,
    system_prompt: String,
    tools_md: String,
) -> Result<Skill, String> {
    match remote_db.pool().await {
        Ok(p) => {
            let id = uuid::Uuid::new_v4().to_string();
            sqlx::query("INSERT INTO skills (id, name, description, system_prompt, tools_md) VALUES ($1, $2, $3, $4, $5)")
                .bind(&id).bind(&name).bind(&description).bind(&system_prompt).bind(&tools_md)
                .execute(&*p).await.map_err(|e| e.to_string())?;
            Ok(Skill {
                id,
                name,
                description,
                system_prompt,
                tools_md,
                created_at: String::new(),
                updated_at: String::new(),
            })
        }
        Err(_) => db
            .create_skill(&name, &description, &system_prompt, &tools_md)
            .map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub async fn update_skill(
    db: State<'_, Database>,
    remote_db: State<'_, Arc<RemoteDbPool>>,
    id: String,
    name: String,
    description: String,
    system_prompt: String,
    tools_md: String,
) -> Result<(), String> {
    match remote_db.pool().await {
        Ok(p) => {
            sqlx::query("UPDATE skills SET name=$1, description=$2, system_prompt=$3, tools_md=$4, updated_at=(now() AT TIME ZONE 'Asia/Shanghai')::TEXT WHERE id=$5")
                .bind(&name).bind(&description).bind(&system_prompt).bind(&tools_md).bind(&id)
                .execute(&*p).await.map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(_) => db
            .update_skill(&id, &name, &description, &system_prompt, &tools_md)
            .map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub async fn get_skills(
    db: State<'_, Database>,
    remote_db: State<'_, Arc<RemoteDbPool>>,
) -> Result<Vec<Skill>, String> {
    match remote_db.pool().await {
        Ok(p) => {
            let rows = sqlx::query_as::<_, (String, String, String, String, String, String, String)>(
                "SELECT id, name, description, system_prompt, tools_md, created_at, updated_at FROM skills ORDER BY name"
            ).fetch_all(&*p).await.map_err(|e| e.to_string())?;
            Ok(rows
                .into_iter()
                .map(|r| Skill {
                    id: r.0,
                    name: r.1,
                    description: r.2,
                    system_prompt: r.3,
                    tools_md: r.4,
                    created_at: r.5,
                    updated_at: r.6,
                })
                .collect())
        }
        Err(_) => db.get_skills().map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub async fn get_skill(
    db: State<'_, Database>,
    remote_db: State<'_, Arc<RemoteDbPool>>,
    id: String,
) -> Result<Option<Skill>, String> {
    match remote_db.pool().await {
        Ok(p) => {
            let row = sqlx::query_as::<_, (String, String, String, String, String, String, String)>(
                "SELECT id, name, description, system_prompt, tools_md, created_at, updated_at FROM skills WHERE id = $1"
            ).bind(&id).fetch_optional(&*p).await.map_err(|e| e.to_string())?;
            Ok(row.map(|r| Skill {
                id: r.0,
                name: r.1,
                description: r.2,
                system_prompt: r.3,
                tools_md: r.4,
                created_at: r.5,
                updated_at: r.6,
            }))
        }
        Err(_) => db.get_skill(&id).map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub async fn delete_skill(
    db: State<'_, Database>,
    remote_db: State<'_, Arc<RemoteDbPool>>,
    id: String,
) -> Result<(), String> {
    match remote_db.pool().await {
        Ok(p) => {
            sqlx::query("DELETE FROM skills WHERE id = $1")
                .bind(&id)
                .execute(&*p)
                .await
                .map_err(|e| e.to_string())?;
            Ok(())
        }
        Err(_) => db.delete_skill(&id).map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub async fn sync_skills_from_remote(
    db: State<'_, Database>,
    remote_db: State<'_, Arc<RemoteDbPool>>,
) -> Result<Vec<Skill>, String> {
    match remote_db.pool().await {
        Ok(p) => {
            let rows = sqlx::query_as::<_, (String, String, String, String, String, String, String)>(
                "SELECT id, name, description, system_prompt, tools_md, created_at, updated_at FROM skills ORDER BY name"
            ).fetch_all(&*p).await.map_err(|e| e.to_string())?;
            Ok(rows
                .into_iter()
                .map(|r| Skill {
                    id: r.0,
                    name: r.1,
                    description: r.2,
                    system_prompt: r.3,
                    tools_md: r.4,
                    created_at: r.5,
                    updated_at: r.6,
                })
                .collect())
        }
        Err(_) => db.get_skills().map_err(|e| e.to_string()),
    }
}

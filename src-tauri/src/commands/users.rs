use crate::db::Database;
use tauri::State;

#[tauri::command]
pub fn get_current_user(db: State<'_, Database>) -> Result<Option<serde_json::Value>, String> {
    db.get_current_user().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn login(
    db: State<'_, Database>,
    username: String,
    password: String,
) -> Result<Option<serde_json::Value>, String> {
    db.authenticate_user(&username, &password)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn switch_user(db: State<'_, Database>, user_id: String) -> Result<(), String> {
    db.set_current_user(&user_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_user(
    db: State<'_, Database>,
    id: String,
    username: String,
    password: String,
    role: String,
) -> Result<serde_json::Value, String> {
    let current = db.get_current_user().map_err(|e| e.to_string())?;
    let is_admin = current
        .as_ref()
        .and_then(|u| u["role"].as_str())
        .map(|r| r == "admin")
        .unwrap_or(false);
    if !is_admin {
        return Err("只有管理员可以创建用户".to_string());
    }
    if role != "admin" && role != "user" {
        return Err("角色只能是 admin 或 user".to_string());
    }
    db.create_user(&id, &username, &password, &role)
        .map_err(|e| e.to_string())
}

use crate::db::Database;
use tauri::State;

#[tauri::command]
pub fn get_setting(db: State<'_, Database>, key: String) -> Result<Option<String>, String> {
    db.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_setting(db: State<'_, Database>, key: String, value: String) -> Result<(), String> {
    db.set_setting(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_settings(db: State<'_, Database>) -> Result<Vec<(String, String)>, String> {
    let keys = vec![
        "llm_provider",
        "api_base_url",
        "deepseek_base_url",
        "deepseek_api_key",
        "deepseek_model",
        "embedding_model",
        "chat_model",
        "top_k",
        "chroma_endpoint",
        "chroma_enabled",
        "chroma_collection",
        "remote_db_url",
        "remote_db_enabled",
    ];

    let mut result = Vec::new();
    for key in keys {
        if let Some(value) = db.get_setting(key).map_err(|e| e.to_string())? {
            result.push((key.to_string(), value));
        }
    }

    Ok(result)
}

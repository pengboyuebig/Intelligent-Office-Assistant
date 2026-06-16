use crate::db::conversation::{Conversation, Message};
use crate::db::Database;
use tauri::State;

#[tauri::command]
pub fn create_conversation(
    db: State<'_, Database>,
    title: String,
    skill_id: Option<String>,
    knowledge_base_ids: Vec<String>,
) -> Result<Conversation, String> {
    db.create_conversation(&title, skill_id.as_deref(), &knowledge_base_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_conversations(db: State<'_, Database>) -> Result<Vec<Conversation>, String> {
    db.get_conversations().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_conversation_title(
    db: State<'_, Database>,
    id: String,
    title: String,
) -> Result<(), String> {
    db.update_conversation_title(&id, &title)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_conversation_knowledge_bases(
    db: State<'_, Database>,
    id: String,
    knowledge_base_ids: Vec<String>,
) -> Result<(), String> {
    db.update_conversation_knowledge_bases(&id, &knowledge_base_ids)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_conversation(db: State<'_, Database>, id: String) -> Result<(), String> {
    db.delete_conversation(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_message(
    db: State<'_, Database>,
    conversation_id: String,
    role: String,
    content: String,
) -> Result<Message, String> {
    db.add_message(&conversation_id, &role, &content)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_messages(
    db: State<'_, Database>,
    conversation_id: String,
) -> Result<Vec<Message>, String> {
    db.get_messages(&conversation_id).map_err(|e| e.to_string())
}

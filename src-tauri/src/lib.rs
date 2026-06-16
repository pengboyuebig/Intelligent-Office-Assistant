use crate::db::remote_db::{RemoteDbConfig, RemoteDbPool};
use crate::db::Database;
use crate::llm::chroma_adapter::{ChromaAdapter, ChromaConfig};
use std::sync::Arc;
use tauri::Manager;

mod commands;
mod db;
mod llm;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let exe_dir = std::env::current_exe()
                .ok()
                .and_then(|p| p.parent().map(|d| d.to_path_buf()))
                .unwrap_or_else(|| std::path::PathBuf::from("."));
            let db_dir = exe_dir.join("db");
            std::fs::create_dir_all(&db_dir).ok();
            let db_path = db_dir.join("swift_customer.db");

            // 本地 SQLite（私有数据）
            let db = Database::new(db_path.to_str().unwrap()).expect("无法初始化本地数据库");

            // Chroma 向量数据库配置
            let chroma_config = ChromaConfig {
                endpoint: db
                    .get_setting("chroma_endpoint")
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| "http://localhost:8000".to_string()),
                tenant: db
                    .get_setting("chroma_tenant")
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| "default_tenant".to_string()),
                database: db
                    .get_setting("chroma_database")
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| "default_database".to_string()),
                collection: db
                    .get_setting("chroma_collection")
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| "knowledge_chunks".to_string()),
                enabled: db
                    .get_setting("chroma_enabled")
                    .ok()
                    .flatten()
                    .map(|v| v == "true")
                    .unwrap_or(false),
            };

            // 远程数据库配置（内网 PostgreSQL）
            let remote_db_config = RemoteDbConfig {
                database_url: db
                    .get_setting("remote_db_url")
                    .ok()
                    .flatten()
                    .unwrap_or_default(),
                max_connections: 5,
                enabled: db
                    .get_setting("remote_db_enabled")
                    .ok()
                    .flatten()
                    .map(|v| v == "true")
                    .unwrap_or(false),
            };

            let chroma_adapter = Arc::new(ChromaAdapter::new(chroma_config));
            // 远程数据库（延迟连接，首次使用时才建立）
            let remote_db = Arc::new(RemoteDbPool::new(remote_db_config));
            let chat_task_registry = commands::chat_proxy::ChatTaskRegistry::default();

            app.manage(db);
            app.manage(chroma_adapter);
            app.manage(remote_db);
            app.manage(chat_task_registry);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // conversation (本地)
            commands::conversation::create_conversation,
            commands::conversation::get_conversations,
            commands::conversation::update_conversation_title,
            commands::conversation::update_conversation_knowledge_bases,
            commands::conversation::delete_conversation,
            commands::conversation::add_message,
            commands::conversation::get_messages,
            // knowledge (远程优先)
            commands::knowledge::create_knowledge_base,
            commands::knowledge::get_knowledge_bases,
            commands::knowledge::delete_knowledge_base,
            commands::knowledge::upload_document,
            commands::knowledge::get_documents,
            commands::knowledge::delete_document,
            commands::knowledge_search::search_knowledge,
            commands::knowledge_search::search_all_knowledge,
            // skill (远程优先)
            commands::skill::create_skill,
            commands::skill::update_skill,
            commands::skill::get_skills,
            commands::skill::get_skill,
            commands::skill::delete_skill,
            // settings (本地)
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::get_all_settings,
            // chat proxy
            commands::chat_proxy::chat_stream_proxy,
            commands::chat_proxy::cancel_chat_stream,
            commands::chat_proxy::test_connection,
            // chroma
            commands::knowledge::test_chroma_connection,
            commands::knowledge::get_chroma_status,
            // remote db
            commands::knowledge::test_remote_db_connection,
            commands::knowledge::get_remote_db_status,
            commands::skill::sync_skills_from_remote,
        ])
        .run(tauri::generate_context!())
        .expect("启动应用时发生错误");
}

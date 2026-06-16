use futures_util::StreamExt;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::Emitter;

#[derive(Debug, Serialize, Clone)]
pub struct StreamChunk {
    pub task_id: String,
    pub content: String,
    pub reasoning: String,
}

#[derive(Clone, Default)]
pub struct ChatTaskRegistry {
    tasks: Arc<Mutex<HashMap<String, Arc<AtomicBool>>>>,
}

impl ChatTaskRegistry {
    pub fn start(&self, task_id: &str) -> Arc<AtomicBool> {
        let cancel_flag = Arc::new(AtomicBool::new(false));
        self.tasks
            .lock()
            .unwrap()
            .insert(task_id.to_string(), cancel_flag.clone());
        cancel_flag
    }

    pub fn cancel(&self, task_id: &str) {
        if let Some(flag) = self.tasks.lock().unwrap().get(task_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }

    pub fn finish(&self, task_id: &str) {
        self.tasks.lock().unwrap().remove(task_id);
    }
}

#[tauri::command]
pub async fn chat_stream_proxy(
    api_base: String,
    model: String,
    messages: Vec<serde_json::Value>,
    api_key: Option<String>,
    app_handle: tauri::AppHandle,
    task_registry: tauri::State<'_, ChatTaskRegistry>,
) -> Result<String, String> {
    let base_url = api_base.trim_end_matches('/').to_string();
    let chat_url = if base_url.ends_with("/v1") {
        format!("{}/chat/completions", base_url)
    } else {
        format!("{}/v1/chat/completions", base_url)
    };

    let task_id = uuid::Uuid::new_v4().to_string();
    let cancel_flag = task_registry.start(&task_id);
    let registry = task_registry.inner().clone();
    let emit_task_id = task_id.clone();
    let finish_task_id = task_id.clone();

    tauri::async_runtime::spawn(async move {
        let result = do_chat_stream(
            &emit_task_id,
            &chat_url,
            &model,
            &messages,
            api_key,
            &app_handle,
            cancel_flag,
        )
        .await;

        match result {
            Ok(_) => {
                let _ = app_handle.emit(
                    "chat-stream-done",
                    serde_json::json!({ "task_id": emit_task_id }),
                );
            }
            Err(error) => {
                let _ = app_handle.emit(
                    "chat-stream-error",
                    serde_json::json!({
                        "task_id": emit_task_id,
                        "error": error,
                    }),
                );
            }
        }

        registry.finish(&finish_task_id);
    });

    Ok(task_id)
}

#[tauri::command]
pub fn cancel_chat_stream(
    task_id: String,
    task_registry: tauri::State<'_, ChatTaskRegistry>,
) -> Result<(), String> {
    task_registry.cancel(&task_id);
    Ok(())
}

async fn do_chat_stream(
    task_id: &str,
    chat_url: &str,
    model: &str,
    messages: &[serde_json::Value],
    api_key: Option<String>,
    app_handle: &tauri::AppHandle,
    cancel_flag: Arc<AtomicBool>,
) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| format!("创建客户端失败: {e}"))?;

    let mut builder = client.post(chat_url).json(&serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
        "temperature": 0.7,
        "max_tokens": 2048,
    }));

    if let Some(key) = &api_key {
        builder = builder.header("Authorization", format!("Bearer {}", key));
    }

    let resp = builder.send().await.map_err(|e| format!("请求失败: {e}"))?;
    let status = resp.status();

    if !status.is_success() {
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {:.200}", status.as_u16(), text));
    }

    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if cancel_flag.load(Ordering::Relaxed) {
            return Ok(());
        }

        let chunk = chunk.map_err(|e| format!("流读取错误: {e}"))?;
        let text = String::from_utf8_lossy(&chunk);
        for line in text.lines() {
            if cancel_flag.load(Ordering::Relaxed) {
                return Ok(());
            }

            let line = line.trim();
            if !line.starts_with("data: ") {
                continue;
            }

            let data = line[6..].trim();
            if data == "[DONE]" || data.is_empty() {
                continue;
            }

            if let Ok(value) = serde_json::from_str::<serde_json::Value>(data) {
                let delta = &value["choices"][0]["delta"];
                let content = delta["content"].as_str().unwrap_or("").to_string();
                let reasoning = delta["reasoning_content"]
                    .as_str()
                    .unwrap_or("")
                    .to_string();
                if !content.is_empty() || !reasoning.is_empty() {
                    let _ = app_handle.emit(
                        "chat-stream-chunk",
                        &StreamChunk {
                            task_id: task_id.to_string(),
                            content,
                            reasoning,
                        },
                    );
                }
            }
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn test_connection(api_base: String, api_key: Option<String>) -> Result<String, String> {
    let base = api_base.trim_end_matches('/');
    let url = if base.ends_with("/v1") {
        format!("{}/models", base)
    } else {
        format!("{}/v1/models", base)
    };
    let client = reqwest::Client::new();
    let mut builder = client.get(&url);
    if let Some(key) = &api_key {
        builder = builder.header("Authorization", format!("Bearer {}", key));
    }
    match builder.send().await {
        Ok(resp) => {
            if resp.status().is_success() {
                Ok("连接成功，API 服务正常运行。".to_string())
            } else {
                Err(format!("服务器返回状态码 {}", resp.status().as_u16()))
            }
        }
        Err(e) => Err(format!("连接失败: {e}")),
    }
}

use crate::db::knowledge::{Document, KnowledgeBase};
use crate::db::remote_db::RemoteDbPool;
use crate::db::Database;
use crate::llm::chroma_adapter::ChromaAdapter;
use crate::llm::client::LlmClient;
use base64::Engine;
use std::io::{Cursor, Read, Write};
use std::sync::Arc;
use std::time::Duration;
use tauri::State;

const CHUNK_SIZE: usize = 500;

fn extract_text_from_docx(data: &[u8]) -> Result<String, String> {
    let cursor = Cursor::new(data);
    let mut archive =
        zip::ZipArchive::new(cursor).map_err(|e| format!("Failed to parse docx file: {e}"))?;

    let mut xml_bytes = Vec::new();
    archive
        .by_name("word/document.xml")
        .map_err(|e| format!("word/document.xml not found: {e}"))?
        .read_to_end(&mut xml_bytes)
        .map_err(|e| format!("Failed to read docx content: {e}"))?;

    let xml_content = String::from_utf8_lossy(&xml_bytes);
    let regex =
        regex::Regex::new(r"<w:t[^>]*>([^<]*)</w:t>").map_err(|e| format!("Regex error: {e}"))?;

    let text = regex
        .captures_iter(&xml_content)
        .filter_map(|capture| capture.get(1))
        .map(|item| item.as_str())
        .collect::<Vec<_>>()
        .join("");

    if text.trim().is_empty() {
        return Err("Failed to extract text from docx file".to_string());
    }

    Ok(text.trim().to_string())
}

fn extract_text_from_pdf(data: &[u8]) -> Result<String, String> {
    use std::process::Command;

    if let Ok(document) = lopdf::Document::load_mem(data) {
        let page_numbers: Vec<u32> = document.get_pages().keys().copied().collect();
        let mut text = String::new();
        for page_number in &page_numbers {
            if let Ok(content) = document.extract_text(&[*page_number]) {
                if !content.trim().is_empty() {
                    text.push_str(&content);
                    text.push('\n');
                }
            }
        }
        if !text.trim().is_empty() {
            return Ok(text.trim().to_string());
        }
    }

    match pdf_extract::extract_text_from_mem(data) {
        Ok(text) if !text.trim().is_empty() => return Ok(text.trim().to_string()),
        _ => {}
    }

    let Some(python) = std::env::var("CHROMA_PDF_PYTHON").ok() else {
        return Err("PDF OCR fallback is not configured: set CHROMA_PDF_PYTHON".to_string());
    };
    let tesseract_cmd = std::env::var("TESSERACT_CMD").unwrap_or_default();
    let tessdata_prefix = std::env::var("TESSDATA_PREFIX").unwrap_or_default();

    let tmp_dir = std::env::temp_dir();
    let pdf_path = tmp_dir.join("chroma_pdf_upload.pdf");
    let out_path = tmp_dir.join("chroma_ocr_result.txt");

    let mut file = std::fs::File::create(&pdf_path)
        .map_err(|e| format!("Failed to create temp PDF file: {e}"))?;
    file.write_all(data)
        .map_err(|e| format!("Failed to write temp PDF file: {e}"))?;
    drop(file);

    let script = r#"
import os
import sys

pdf_path, out_path, tessdata_prefix, tesseract_cmd = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
text = ""

if tessdata_prefix:
    os.environ["TESSDATA_PREFIX"] = tessdata_prefix

try:
    import pdfplumber
    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            content = page.extract_text()
            if content:
                text += content + "\n"
except Exception:
    pass

if not text.strip():
    try:
        import pypdfium2 as pdfium
        import pytesseract
        if tesseract_cmd:
            pytesseract.pytesseract.tesseract_cmd = tesseract_cmd
        document = pdfium.PdfDocument(pdf_path)
        for i in range(len(document)):
            bitmap = document[i].render(scale=2)
            image = bitmap.to_pil()
            content = pytesseract.image_to_string(image, lang="chi_sim+eng")
            if content.strip():
                text += content.strip() + "\n"
    except Exception as error:
        with open(out_path, "w", encoding="utf-8") as file:
            file.write("ERROR:" + str(error))
        sys.exit(1)

with open(out_path, "w", encoding="utf-8") as file:
    file.write(text)
"#;

    let _ = Command::new(&python)
        .args([
            "-c",
            script,
            pdf_path.to_str().unwrap_or(""),
            out_path.to_str().unwrap_or(""),
            &tessdata_prefix,
            &tesseract_cmd,
        ])
        .output();

    let _ = std::fs::remove_file(&pdf_path);
    let text = std::fs::read_to_string(&out_path).unwrap_or_default();
    let _ = std::fs::remove_file(&out_path);

    if let Some(error) = text.strip_prefix("ERROR:") {
        return Err(format!("OCR failed: {error}"));
    }
    let trimmed = text.trim().to_string();
    if trimmed.is_empty() {
        Err("Failed to extract text from PDF file".to_string())
    } else {
        Ok(trimmed)
    }
}
pub fn chunk_text(text: &str, max_chars: usize) -> Vec<String> {
    let mut chunks = Vec::new();
    let paragraphs: Vec<&str> = text.split("\n\n").collect();
    let mut current = String::new();

    for paragraph in paragraphs {
        let paragraph = paragraph.trim();
        if paragraph.is_empty() {
            continue;
        }

        if current.chars().count() + paragraph.chars().count() > max_chars && !current.is_empty() {
            chunks.push(current.trim().to_string());
            current = String::new();
        }

        if !current.is_empty() {
            current.push_str("\n\n");
        }
        current.push_str(paragraph);

        while current.chars().count() > max_chars {
            let byte_pos = current
                .char_indices()
                .nth(max_chars)
                .map(|(index, _)| index)
                .unwrap_or(current.len());
            let split_byte = current[..byte_pos]
                .rfind(char::is_whitespace)
                .unwrap_or(byte_pos);
            let part = current[..split_byte].trim().to_string();
            chunks.push(part);
            current = current[split_byte..].trim().to_string();
        }
    }

    if !current.trim().is_empty() {
        chunks.push(current.trim().to_string());
    }

    chunks
}

fn decode_document_content(
    filename: &str,
    content: &str,
    content_type: Option<&str>,
) -> Result<String, String> {
    match (filename.to_lowercase().as_str(), content_type) {
        (name, _) if name.ends_with(".docx") => {
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(content)
                .map_err(|e| format!("docx base64 闂傚倷娴囧畷鐢稿窗閹扮増鍋￠弶鍫氭櫅缁躲倝鏌涜椤ㄥ棝宕戞径瀣瘈濠电姴鍊搁鈺冪磼閸撲礁浠辩€殿喖鐖煎畷濂割敃椤厼鍤遍柣? {e}"))?;
            extract_text_from_docx(&decoded)
        }
        (name, _) if name.ends_with(".pdf") => {
            let decoded = base64::engine::general_purpose::STANDARD
                .decode(content)
                .map_err(|e| format!("PDF base64 闂傚倷娴囧畷鐢稿窗閹扮増鍋￠弶鍫氭櫅缁躲倝鏌涜椤ㄥ棝宕戞径瀣瘈濠电姴鍊搁鈺冪磼閸撲礁浠辩€殿喖鐖煎畷濂割敃椤厼鍤遍柣? {e}"))?;
            extract_text_from_pdf(&decoded)
        }
        _ => Ok(content.to_string()),
    }
}

pub(super) async fn build_llm_client(
    db: &State<'_, Database>,
) -> Result<(String, String, LlmClient), String> {
    let provider = db
        .get_setting("llm_provider")
        .ok()
        .flatten()
        .unwrap_or_else(|| "ollama".to_string());
    let embedding_model = db
        .get_setting("embedding_model")
        .map_err(|e| e.to_string())?
        .unwrap_or_default();

    let (base_url, api_key) = if provider == "deepseek" {
        let url = db
            .get_setting("deepseek_base_url")
            .ok()
            .flatten()
            .unwrap_or_else(|| "https://api.deepseek.com/v1".to_string());
        let key = db
            .get_setting("deepseek_api_key")
            .ok()
            .flatten()
            .unwrap_or_default();
        (url, key)
    } else {
        let url = db
            .get_setting("api_base_url")
            .ok()
            .flatten()
            .unwrap_or_else(|| "http://127.0.0.1:8000/v1".to_string());
        (url, String::new())
    };

    let client = LlmClient::new(
        &base_url,
        if api_key.is_empty() {
            None
        } else {
            Some(&api_key)
        },
    );
    Ok((base_url, embedding_model, client))
}

pub(super) async fn get_embedding_with_retry(
    client: &LlmClient,
    model: &str,
    text: &str,
) -> anyhow::Result<Vec<f32>> {
    let max_retries: u32 = 3;
    let base_delay_ms: u64 = 1_000;
    let mut last = String::new();

    for attempt in 0..=max_retries {
        match client.get_embedding(model, text).await {
            Ok(embedding) => return Ok(embedding),
            Err(error) => {
                last = error.to_string();
                if attempt < max_retries && is_retryable(&last) {
                    let delay_ms = base_delay_ms * 2_u64.pow(attempt);
                    tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                }
            }
        }
    }

    Err(anyhow::anyhow!("embedding 闂傚倸鍊风粈渚€宕ョ€ｎ喖纾块柟鎯版鎼村﹪鏌ら懝鎵牚濞存粌缍婇弻娑㈠Ψ閿濆懎顬堢紓浣稿閸嬨倕顕ｉ崼鏇為唶妞ゆ劦婢€閸戜粙鎮? {}", last))
}

async fn get_embeddings_with_retry(
    client: &LlmClient,
    model: &str,
    texts: &[String],
) -> anyhow::Result<Vec<Vec<f32>>> {
    let max_retries: u32 = 3;
    let base_delay_ms: u64 = 1_000;
    let mut last = String::new();

    for attempt in 0..=max_retries {
        match client.get_embeddings(model, texts).await {
            Ok(embeddings) => return Ok(embeddings),
            Err(error) => {
                last = error.to_string();
                if attempt < max_retries && is_retryable(&last) {
                    let delay_ms = base_delay_ms * 2_u64.pow(attempt);
                    tokio::time::sleep(Duration::from_millis(delay_ms)).await;
                }
            }
        }
    }

    Err(anyhow::anyhow!("embedding 闂傚倸鍊风粈浣虹礊婵犲偆鐒界憸蹇曟閻愬绡€闁搞儜鍥紬婵犵數鍋涘Ο濠冪濠靛鍚归柡鍐ㄥ€甸崑鎾绘偡閺夋浠惧┑鐘灪椤洤顕ユ繝鍥у瀭妞ゆ洖鎳愰崬鐢告⒑鐠団€崇仭濠㈢懓妫涢懞閬嶅锤濡や礁浠? {}", last))
}

fn is_retryable(error: &str) -> bool {
    let value = error.to_lowercase();
    value.contains("timeout")
        || value.contains("connection")
        || value.contains("network")
        || value.contains("eof")
        || value.contains("reset")
        || value.contains("refused")
        || value.contains("unreachable")
        || value.contains("503")
        || value.contains("502")
        || value.contains("504")
        || value.contains("429")
        || value.contains("tls")
        || value.contains("ssl")
}

async fn load_chunk_embeddings(
    client: &LlmClient,
    embedding_model: &str,
    chunks: &[String],
) -> Option<Vec<Vec<f32>>> {
    if embedding_model.is_empty() || chunks.is_empty() {
        return None;
    }

    if let Ok(embeddings) = get_embeddings_with_retry(client, embedding_model, chunks).await {
        return Some(embeddings);
    }

    let mut single_embeddings = Vec::with_capacity(chunks.len());
    for chunk in chunks {
        match get_embedding_with_retry(client, embedding_model, chunk).await {
            Ok(embedding) => single_embeddings.push(embedding),
            Err(_) => return None,
        }
    }
    Some(single_embeddings)
}

async fn upload_remote_document(
    pool: &sqlx::PgPool,
    chroma_adapter: &ChromaAdapter,
    knowledge_base_id: &str,
    filename: &str,
    raw_content: &str,
    chunks: &[String],
    chunk_embeddings: Option<&Vec<Vec<f32>>>,
) -> Result<Document, String> {
    let doc_id = uuid::Uuid::new_v4().to_string();
    sqlx::query(
        "INSERT INTO documents (id, knowledge_base_id, filename, content) VALUES ($1, $2, $3, $4)",
    )
    .bind(&doc_id)
    .bind(knowledge_base_id)
    .bind(filename)
    .bind(raw_content)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    let mut chroma_ids = Vec::new();
    let mut chroma_vecs = Vec::new();
    let mut chroma_docs = Vec::new();
    let mut chroma_metas = Vec::new();

    for (index, chunk) in chunks.iter().enumerate() {
        let chunk_id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            "INSERT INTO chunks (id, document_id, knowledge_base_id, content, chunk_index) VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(&chunk_id)
        .bind(&doc_id)
        .bind(knowledge_base_id)
        .bind(chunk)
        .bind(index as i32)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

        if let Some(embeddings) = chunk_embeddings {
            if let Some(embedding) = embeddings.get(index) {
                chroma_ids.push(chunk_id);
                chroma_vecs.push(embedding.clone());
                chroma_docs.push(chunk.clone());
                chroma_metas.push(serde_json::json!({ "kb_id": knowledge_base_id }));
            }
        }
    }

    if !chroma_ids.is_empty() {
        let _ = chroma_adapter
            .upsert_vectors(chroma_ids, chroma_vecs, chroma_docs, chroma_metas)
            .await;
    }

    let chunk_count = chunks.len() as i32;
    sqlx::query("UPDATE documents SET chunk_count = $1 WHERE id = $2")
        .bind(chunk_count)
        .bind(&doc_id)
        .execute(pool)
        .await
        .map_err(|e| e.to_string())?;

    Ok(Document {
        id: doc_id,
        knowledge_base_id: knowledge_base_id.to_string(),
        filename: filename.to_string(),
        content: raw_content.to_string(),
        chunk_count,
        created_at: String::new(),
    })
}

async fn upload_local_document(
    db: &Database,
    chroma_adapter: &ChromaAdapter,
    knowledge_base_id: &str,
    filename: &str,
    raw_content: &str,
    chunks: &[String],
    chunk_embeddings: Option<&Vec<Vec<f32>>>,
) -> Result<Document, String> {
    let (doc_id, chunk_ids) = db
        .add_document_with_chunks(
            knowledge_base_id,
            filename,
            raw_content,
            chunks,
            chunk_embeddings,
        )
        .map_err(|e| e.to_string())?;

    if let Some(embeddings) = chunk_embeddings {
        for (index, chunk) in chunks.iter().enumerate() {
            if let Some(embedding) = embeddings.get(index) {
                let _ = chroma_adapter
                    .upsert_vectors(
                        vec![chunk_ids[index].clone()],
                        vec![embedding.clone()],
                        vec![chunk.clone()],
                        vec![serde_json::json!({ "kb_id": knowledge_base_id })],
                    )
                    .await;
            }
        }
    }

    db.get_documents(knowledge_base_id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .find(|document| document.id == doc_id)
        .ok_or_else(|| "Document creation failed".to_string())
}

#[tauri::command]
pub async fn create_knowledge_base(
    db: State<'_, Database>,
    remote_db: State<'_, Arc<RemoteDbPool>>,
    name: String,
    description: String,
) -> Result<KnowledgeBase, String> {
    if let Ok(pool) = remote_db.pool().await {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query("INSERT INTO knowledge_bases (id, name, description) VALUES ($1, $2, $3)")
            .bind(&id)
            .bind(&name)
            .bind(&description)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        return Ok(KnowledgeBase {
            id,
            name,
            description,
            created_at: String::new(),
        });
    }

    db.create_knowledge_base(&name, &description)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_knowledge_bases(
    db: State<'_, Database>,
    remote_db: State<'_, Arc<RemoteDbPool>>,
) -> Result<Vec<KnowledgeBase>, String> {
    if let Ok(pool) = remote_db.pool().await {
        let rows = sqlx::query_as::<_, (String, String, String, String)>(
            "SELECT id, name, description, created_at FROM knowledge_bases ORDER BY created_at DESC",
        )
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        return Ok(rows
            .into_iter()
            .map(|row| KnowledgeBase {
                id: row.0,
                name: row.1,
                description: row.2,
                created_at: row.3,
            })
            .collect());
    }

    db.get_knowledge_bases().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_knowledge_base(
    db: State<'_, Database>,
    remote_db: State<'_, Arc<RemoteDbPool>>,
    id: String,
) -> Result<(), String> {
    if let Ok(pool) = remote_db.pool().await {
        sqlx::query("DELETE FROM knowledge_bases WHERE id = $1")
            .bind(&id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    db.delete_knowledge_base(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_documents(
    db: State<'_, Database>,
    remote_db: State<'_, Arc<RemoteDbPool>>,
    knowledge_base_id: String,
) -> Result<Vec<Document>, String> {
    if let Ok(pool) = remote_db.pool().await {
        let rows = sqlx::query_as::<_, (String, String, String, String, i32, String)>(
            "SELECT id, knowledge_base_id, filename, content, chunk_count, created_at
             FROM documents
             WHERE knowledge_base_id = $1
             ORDER BY created_at DESC",
        )
        .bind(&knowledge_base_id)
        .fetch_all(&*pool)
        .await
        .map_err(|e| e.to_string())?;

        return Ok(rows
            .into_iter()
            .map(|row| Document {
                id: row.0,
                knowledge_base_id: row.1,
                filename: row.2,
                content: row.3,
                chunk_count: row.4,
                created_at: row.5,
            })
            .collect());
    }

    db.get_documents(&knowledge_base_id)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_document(
    db: State<'_, Database>,
    remote_db: State<'_, Arc<RemoteDbPool>>,
    id: String,
) -> Result<(), String> {
    if let Ok(pool) = remote_db.pool().await {
        sqlx::query("DELETE FROM documents WHERE id = $1")
            .bind(&id)
            .execute(&*pool)
            .await
            .map_err(|e| e.to_string())?;
        return Ok(());
    }

    db.delete_document(&id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn upload_document(
    db: State<'_, Database>,
    remote_db: State<'_, Arc<RemoteDbPool>>,
    chroma_adapter: State<'_, Arc<ChromaAdapter>>,
    knowledge_base_id: String,
    filename: String,
    content: String,
    content_type: Option<String>,
) -> Result<Document, String> {
    let text = decode_document_content(&filename, &content, content_type.as_deref())?;
    if text.trim().is_empty() {
        return Err("Document content is empty".to_string());
    }

    let chunks = chunk_text(&text, CHUNK_SIZE);
    let (_, embedding_model, client) = build_llm_client(&db).await?;
    let chunk_embeddings = load_chunk_embeddings(&client, &embedding_model, &chunks).await;

    if let Ok(pool) = remote_db.pool().await {
        return upload_remote_document(
            &pool,
            chroma_adapter.inner().as_ref(),
            &knowledge_base_id,
            &filename,
            &text,
            &chunks,
            chunk_embeddings.as_ref(),
        )
        .await;
    }

    upload_local_document(
        db.inner(),
        chroma_adapter.inner().as_ref(),
        &knowledge_base_id,
        &filename,
        &text,
        &chunks,
        chunk_embeddings.as_ref(),
    )
    .await
}

#[tauri::command]
pub async fn test_chroma_connection(
    chroma_adapter: State<'_, Arc<ChromaAdapter>>,
) -> Result<String, String> {
    chroma_adapter.test_connection().await
}

#[tauri::command]
pub fn get_chroma_status(
    chroma_adapter: State<'_, Arc<ChromaAdapter>>,
) -> Result<serde_json::Value, String> {
    let config = chroma_adapter.config();
    Ok(serde_json::json!({
        "enabled": config.enabled,
        "endpoint": config.endpoint,
        "tenant": config.tenant,
        "database": config.database,
        "collection": config.collection,
    }))
}

#[tauri::command]
pub async fn test_remote_db_connection(
    remote_db: State<'_, Arc<RemoteDbPool>>,
) -> Result<String, String> {
    match remote_db.pool().await {
        Ok(_) => Ok("远程数据库连接成功".to_string()),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub fn get_remote_db_status(
    remote_db: State<'_, Arc<RemoteDbPool>>,
) -> Result<serde_json::Value, String> {
    let config = remote_db.config();
    Ok(serde_json::json!({
        "enabled": config.enabled,
        "database_url": if config.database_url.is_empty() {
            "not configured"
        } else {
            "***configured***"
        },
    }))
}

#[cfg(test)]
mod tests {
    use super::chunk_text;

    #[test]
    fn test_chunk_text_with_long_text() {
        let text = "carbon management report content ".repeat(40);
        let chunks = chunk_text(&text, 80);
        assert!(!chunks.is_empty());
        for chunk in &chunks {
            assert!(chunk.chars().count() <= 85);
        }
    }

    #[test]
    fn test_chunk_text_short() {
        assert_eq!(chunk_text("short text", 500).len(), 1);
    }

    #[test]
    fn test_chunk_text_empty() {
        assert!(chunk_text("", 500).is_empty());
    }
}

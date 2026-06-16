use crate::commands::knowledge::{build_llm_client, get_embedding_with_retry};
use crate::db::remote_db::RemoteDbPool;
use crate::db::Database;
use crate::llm::chroma_adapter::ChromaAdapter;
use rusqlite::params;
use std::collections::HashSet;
use std::sync::Arc;
use tauri::State;

#[derive(Debug)]
struct SearchHit {
    score: usize,
    content: String,
}

#[tauri::command]
pub async fn search_knowledge(
    db: State<'_, Database>,
    remote_db: State<'_, Arc<RemoteDbPool>>,
    chroma_adapter: State<'_, Arc<ChromaAdapter>>,
    knowledge_base_id: String,
    query: String,
) -> Result<Vec<String>, String> {
    let top_k = load_top_k(&db)?;
    let vector_results = search_vectors(
        &db,
        &chroma_adapter,
        &query,
        Some(&knowledge_base_id),
        top_k,
    )
    .await?;
    let keyword_results =
        search_keywords(&db, &remote_db, &query, Some(&knowledge_base_id), top_k).await;
    Ok(resolve_results(
        db.inner(),
        Some(&knowledge_base_id),
        keyword_results,
        vector_results,
        top_k,
    ))
}

#[tauri::command]
pub async fn search_all_knowledge(
    db: State<'_, Database>,
    remote_db: State<'_, Arc<RemoteDbPool>>,
    chroma_adapter: State<'_, Arc<ChromaAdapter>>,
    query: String,
) -> Result<Vec<String>, String> {
    let top_k = load_top_k(&db)?;
    let vector_results = search_vectors(&db, &chroma_adapter, &query, None, top_k).await?;
    let keyword_results = search_keywords(&db, &remote_db, &query, None, top_k).await;
    Ok(resolve_results(
        db.inner(),
        None,
        keyword_results,
        vector_results,
        top_k,
    ))
}

fn load_top_k(db: &State<'_, Database>) -> Result<usize, String> {
    Ok(db
        .get_setting("top_k")
        .map_err(|error| error.to_string())?
        .unwrap_or_else(|| "5".to_string())
        .parse()
        .unwrap_or(5))
}

async fn search_vectors(
    db: &State<'_, Database>,
    chroma_adapter: &State<'_, Arc<ChromaAdapter>>,
    query: &str,
    kb_id: Option<&str>,
    top_k: usize,
) -> Result<Vec<String>, String> {
    let (_, embedding_model, client) = build_llm_client(db).await?;
    if embedding_model.is_empty() {
        return Ok(Vec::new());
    }

    let Ok(query_embedding) = get_embedding_with_retry(&client, &embedding_model, query).await
    else {
        return Ok(Vec::new());
    };

    let where_filter = kb_id.map(|id| serde_json::json!({ "kb_id": id }));
    let results = chroma_adapter
        .search(query_embedding, top_k * 3, where_filter)
        .await
        .unwrap_or_default();

    Ok(results.into_iter().map(|(_, content, _)| content).collect())
}

async fn search_keywords(
    db: &Database,
    remote_db: &State<'_, Arc<RemoteDbPool>>,
    query: &str,
    kb_id: Option<&str>,
    top_k: usize,
) -> Vec<String> {
    if let Ok(pool) = remote_db.pool().await {
        keyword_search_pg(&pool, query, kb_id, top_k.max(8)).await
    } else {
        keyword_search_local(db, query, kb_id, top_k.max(8))
    }
}

fn tokenize_query(query: &str) -> Vec<String> {
    let normalized = normalize_text(query);
    let chars: Vec<char> = normalized
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect();
    if chars.is_empty() {
        return Vec::new();
    }

    let mut tokens = Vec::new();
    for window_size in [4, 3, 2] {
        for window in chars.windows(window_size) {
            tokens.push(window.iter().collect::<String>());
        }
    }

    // carbon-related aliases: double-carbon, energy-carbon, carbon management.
    if normalized.contains('\u{78b3}') {
        tokens.extend(
            [
                "\u{53cc}\u{78b3}",
                "\u{80fd}\u{78b3}",
                "\u{78b3}\u{7ba1}\u{7406}",
                "\u{78b3}\u{6392}\u{653e}",
                "\u{78b3}\u{76f8}\u{5173}",
            ]
            .map(str::to_string),
        );
    }
    if normalized.contains("\u{62a5}\u{544a}") || normalized.contains("\u{6587}\u{7ae0}") {
        tokens.extend(
            [
                "\u{9700}\u{6c42}",
                "\u{8bf4}\u{660e}\u{4e66}",
                "\u{65b9}\u{6848}",
                "\u{6587}\u{6863}",
            ]
            .map(str::to_string),
        );
    }

    tokens.push(normalized);
    tokens.sort_by(|a, b| b.len().cmp(&a.len()).then_with(|| a.cmp(b)));
    tokens.dedup();
    tokens
}

fn normalize_text(value: &str) -> String {
    value
        .to_lowercase()
        .replace(".docx", "")
        .replace(".pdf", "")
        .replace(".txt", "")
}

fn score_match(content: &str, filename: &str, tokens: &[String]) -> usize {
    let content = normalize_text(content);
    let filename = normalize_text(filename);
    let mut score = 0usize;

    for token in tokens {
        let weight = token.chars().count().pow(2);
        if filename.contains(token) {
            score += weight * 6;
        }
        if content.contains(token) {
            score += weight;
        }
    }

    score
}

async fn keyword_search_pg(
    pool: &sqlx::PgPool,
    query: &str,
    kb_id: Option<&str>,
    top_k: usize,
) -> Vec<String> {
    let tokens = tokenize_query(query);
    if tokens.is_empty() {
        return Vec::new();
    }

    let mut sql = String::from(
        "SELECT c.content, d.filename
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
         WHERE LENGTH(c.content) > 5",
    );
    if kb_id.is_some() {
        sql.push_str(" AND c.knowledge_base_id = $1");
    }
    sql.push_str(" ORDER BY d.created_at DESC, c.chunk_index LIMIT $");
    sql.push_str(if kb_id.is_some() { "2" } else { "1" });

    let mut builder = sqlx::query_as::<_, (String, String)>(&sql);
    if let Some(id) = kb_id {
        builder = builder.bind(id);
    }
    builder = builder.bind((top_k * 40).max(80) as i64);

    let rows = builder.fetch_all(pool).await.unwrap_or_default();
    rank_rows(rows, &tokens, top_k)
}

fn keyword_search_local(
    db: &Database,
    query: &str,
    kb_id: Option<&str>,
    top_k: usize,
) -> Vec<String> {
    let tokens = tokenize_query(query);
    if tokens.is_empty() {
        return Vec::new();
    }

    let conn = db.conn.lock().unwrap();
    let sql = match kb_id {
        Some(_) => {
            "SELECT c.content, d.filename
             FROM chunks c
             JOIN documents d ON d.id = c.document_id
             WHERE c.knowledge_base_id = ?1 AND LENGTH(c.content) > 5
             ORDER BY d.created_at DESC, c.chunk_index
             LIMIT ?2"
        }
        None => {
            "SELECT c.content, d.filename
             FROM chunks c
             JOIN documents d ON d.id = c.document_id
             WHERE LENGTH(c.content) > 5
             ORDER BY d.created_at DESC, c.chunk_index
             LIMIT ?1"
        }
    };

    let mut stmt = match conn.prepare(sql) {
        Ok(stmt) => stmt,
        Err(_) => return Vec::new(),
    };

    let limit = (top_k * 40).max(80) as i64;
    let rows = match kb_id {
        Some(id) => stmt.query_map(params![id, limit], read_row),
        None => stmt.query_map(params![limit], read_row),
    };
    let Ok(rows) = rows else {
        return Vec::new();
    };

    rank_rows(rows.filter_map(Result::ok).collect(), &tokens, top_k)
}

fn read_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<(String, String)> {
    Ok((row.get(0)?, row.get(1)?))
}

fn rank_rows(rows: Vec<(String, String)>, tokens: &[String], top_k: usize) -> Vec<String> {
    let mut scored = rows
        .into_iter()
        .map(|(content, filename)| SearchHit {
            score: score_match(&content, &filename, tokens),
            content,
        })
        .filter(|hit| hit.score > 0)
        .collect::<Vec<_>>();

    scored.sort_by(|a, b| b.score.cmp(&a.score));
    scored
        .into_iter()
        .take(top_k)
        .map(|hit| hit.content)
        .collect()
}

fn resolve_results(
    db: &Database,
    kb_id: Option<&str>,
    keyword_results: Vec<String>,
    vector_results: Vec<String>,
    top_k: usize,
) -> Vec<String> {
    let merged = merge_results(keyword_results, vector_results, top_k.max(5));
    if merged.is_empty() {
        fallback_local_chunks(db, kb_id, top_k.max(3))
    } else {
        merged
    }
}

fn merge_results(
    keyword_results: Vec<String>,
    vector_results: Vec<String>,
    limit: usize,
) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut merged = Vec::new();

    for content in keyword_results.into_iter().chain(vector_results) {
        if seen.insert(content.clone()) {
            merged.push(content);
        }
        if merged.len() >= limit {
            break;
        }
    }

    merged
}

fn fallback_local_chunks(db: &Database, kb_id: Option<&str>, limit: usize) -> Vec<String> {
    let conn = db.conn.lock().unwrap();
    let sql = match kb_id {
        Some(_) => {
            "SELECT content FROM chunks WHERE knowledge_base_id = ?1 ORDER BY created_at DESC LIMIT ?2"
        }
        None => "SELECT content FROM chunks ORDER BY created_at DESC LIMIT ?1",
    };

    let mut stmt = match conn.prepare(sql) {
        Ok(stmt) => stmt,
        Err(_) => return vec!["知识库中没有可检索的文档。".to_string()],
    };
    let items = match kb_id {
        Some(id) => stmt
            .query_map(params![id, limit as i64], read_content_row)
            .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>()),
        None => stmt
            .query_map(params![limit as i64], read_content_row)
            .map(|rows| rows.filter_map(Result::ok).collect::<Vec<_>>()),
    }
    .unwrap_or_default();
    if items.is_empty() {
        vec!["知识库中没有可检索的文档。".to_string()]
    } else {
        items
    }
}

fn read_content_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<String> {
    row.get(0)
}

#[cfg(test)]
mod tests {
    use super::{score_match, tokenize_query};

    #[test]
    fn carbon_aliases_match_energy_carbon_filename() {
        let tokens = tokenize_query("帮我写一个关于双碳相关的文章");
        let score = score_match(
            "系统提供能源与碳排放数据统计、分析和报告能力",
            "能碳管理服务系统需求说明书V1.1-0619.docx",
            &tokens,
        );

        assert!(score > 0);
    }
}

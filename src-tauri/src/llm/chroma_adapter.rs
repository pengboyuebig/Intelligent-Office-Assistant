//! Chroma 向量数据库 HTTP 适配层。

use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::time::Duration;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChromaConfig {
    pub endpoint: String,
    pub tenant: String,
    pub database: String,
    pub collection: String,
    pub enabled: bool,
}

impl Default for ChromaConfig {
    fn default() -> Self {
        ChromaConfig {
            endpoint: "http://localhost:8000".to_string(),
            tenant: "default_tenant".to_string(),
            database: "default_database".to_string(),
            collection: "knowledge_chunks".to_string(),
            enabled: false,
        }
    }
}

#[derive(Serialize)]
struct CreateCollectionRequest {
    name: String,
    metadata: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct UpsertRequest {
    ids: Vec<String>,
    embeddings: Vec<Vec<f32>>,
    documents: Vec<Option<String>>,
    metadatas: Vec<Option<serde_json::Value>>,
}

#[derive(Serialize)]
struct QueryRequest {
    query_embeddings: Vec<Vec<f32>>,
    n_results: u32,
    include: Vec<String>,
}

#[derive(Deserialize)]
struct QueryResponse {
    ids: Vec<Vec<String>>,
    documents: Option<Vec<Vec<Option<String>>>>,
    distances: Option<Vec<Vec<f32>>>,
}

pub struct ChromaAdapter {
    config: ChromaConfig,
    client: Client,
}

impl ChromaAdapter {
    pub fn new(config: ChromaConfig) -> Self {
        ChromaAdapter {
            config,
            client: Client::new(),
        }
    }

    pub fn config(&self) -> &ChromaConfig {
        &self.config
    }

    fn api_base(&self) -> String {
        format!(
            "{}/api/v2/tenants/{}/databases/{}",
            self.config.endpoint.trim_end_matches('/'),
            self.config.tenant,
            self.config.database,
        )
    }

    pub async fn test_connection(&self) -> Result<String, String> {
        let url = format!(
            "{}/api/v2/heartbeat",
            self.config.endpoint.trim_end_matches('/')
        );
        let response = self
            .client
            .get(&url)
            .send()
            .await
            .map_err(|error| format!("Chroma 连接失败: {error}"))?;

        if response.status().is_success() {
            Ok("Chroma 连接成功".to_string())
        } else {
            Err(format!("Chroma 返回状态码 {}", response.status().as_u16()))
        }
    }

    async fn ensure_collection(&self) -> Result<(), String> {
        let base = self.api_base();
        let collection = &self.config.collection;
        let get_url = format!("{base}/collections/{collection}");

        if let Ok(response) = self.client.get(&get_url).send().await {
            if response.status().is_success() {
                return Ok(());
            }
        }

        let create_url = format!("{base}/collections");
        let body = CreateCollectionRequest {
            name: collection.clone(),
            metadata: None,
        };
        let response = self
            .client
            .post(&create_url)
            .json(&body)
            .send()
            .await
            .map_err(|error| format!("创建 Chroma 集合失败: {error}"))?;

        if response.status().is_success() {
            Ok(())
        } else {
            let status_code = response.status().as_u16();
            let text = response.text().await.unwrap_or_default();
            Err(format!(
                "创建 Chroma 集合失败: HTTP {} - {}",
                status_code,
                &text[..text.len().min(200)]
            ))
        }
    }

    pub async fn upsert_vectors(
        &self,
        chunk_ids: Vec<String>,
        vectors: Vec<Vec<f32>>,
        documents: Vec<String>,
        metadatas: Vec<serde_json::Value>,
    ) -> Result<(), String> {
        if !self.config.enabled {
            return Ok(());
        }

        self.ensure_collection().await?;
        let url = format!(
            "{}/collections/{}/upsert",
            self.api_base(),
            self.config.collection
        );
        let request = UpsertRequest {
            ids: chunk_ids,
            embeddings: vectors,
            documents: documents.into_iter().map(Some).collect(),
            metadatas: metadatas.into_iter().map(Some).collect(),
        };

        retry("向量上传", || {
            let client = &self.client;
            let url = &url;
            let body = &request;
            async move {
                let response = client
                    .post(url)
                    .json(body)
                    .send()
                    .await
                    .map_err(|error| error.to_string())?;

                if response.status().is_success() {
                    Ok(())
                } else {
                    Err(format!(
                        "Chroma upsert 失败: HTTP {}",
                        response.status().as_u16()
                    ))
                }
            }
        })
        .await
    }

    pub async fn search(
        &self,
        query_vector: Vec<f32>,
        n_results: usize,
        where_filter: Option<serde_json::Value>,
    ) -> Result<Vec<(String, String, f32)>, String> {
        if !self.config.enabled {
            return Ok(Vec::new());
        }

        self.ensure_collection().await?;
        let url = format!(
            "{}/collections/{}/query",
            self.api_base(),
            self.config.collection
        );
        let request = QueryRequest {
            query_embeddings: vec![query_vector],
            n_results: n_results as u32,
            include: vec!["documents".to_string(), "distances".to_string()],
        };

        let mut payload = serde_json::to_value(&request).map_err(|error| error.to_string())?;
        if let Some(filter) = where_filter {
            payload["where"] = filter;
        }

        let response: QueryResponse = retry("向量搜索", || {
            let client = &self.client;
            let url = &url;
            let payload = &payload;
            async move {
                let response = client
                    .post(url)
                    .json(payload)
                    .send()
                    .await
                    .map_err(|error| error.to_string())?;

                if response.status().is_success() {
                    response
                        .json::<QueryResponse>()
                        .await
                        .map_err(|error| error.to_string())
                } else {
                    Err(format!(
                        "Chroma query 失败: HTTP {}",
                        response.status().as_u16()
                    ))
                }
            }
        })
        .await?;

        Ok(parse_query_response(response))
    }
}

fn parse_query_response(response: QueryResponse) -> Vec<(String, String, f32)> {
    let mut items = Vec::new();
    let Some(first_ids) = response.ids.first() else {
        return items;
    };

    for (index, chunk_id) in first_ids.iter().enumerate() {
        let content = response
            .documents
            .as_ref()
            .and_then(|documents| documents.first())
            .and_then(|row| row.get(index))
            .and_then(Clone::clone)
            .unwrap_or_default();
        let distance = response
            .distances
            .as_ref()
            .and_then(|distances| distances.first())
            .and_then(|row| row.get(index))
            .copied()
            .unwrap_or(1.0);
        items.push((chunk_id.clone(), content, distance));
    }

    items
}

async fn retry<F, Fut, T>(operation: &str, f: F) -> Result<T, String>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, String>>,
{
    let max_retries = 3;
    let retry_interval = Duration::from_secs(5);
    let mut last_error = String::new();

    for attempt in 0..=max_retries {
        match f().await {
            Ok(result) => return Ok(result),
            Err(error) => {
                last_error = error;
                if attempt < max_retries && is_retryable(&last_error.to_lowercase()) {
                    eprintln!(
                        "Chroma {} 失败 (尝试 {}/{}): {}. 将在 {} 秒后重试...",
                        operation,
                        attempt + 1,
                        max_retries + 1,
                        last_error,
                        retry_interval.as_secs(),
                    );
                    tokio::time::sleep(retry_interval).await;
                }
            }
        }
    }

    Err(format!(
        "Chroma {} 重试 {} 次后仍然失败: {}",
        operation, max_retries, last_error
    ))
}

fn is_retryable(error: &str) -> bool {
    error.contains("timeout")
        || error.contains("connection")
        || error.contains("network")
        || error.contains("eof")
        || error.contains("reset")
        || error.contains("refused")
        || error.contains("unreachable")
        || error.contains("503")
        || error.contains("502")
        || error.contains("504")
        || error.contains("429")
        || error.contains("tls")
        || error.contains("ssl")
        || error.contains("dns")
}

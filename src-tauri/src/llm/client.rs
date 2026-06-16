use reqwest::{Client, RequestBuilder};
use serde::Serialize;
use serde_json::json;

use super::EmbeddingResponse;

#[derive(Debug, Serialize)]
struct EmbeddingRequest {
    model: String,
    input: String,
}

pub struct LlmClient {
    client: Client,
    api_prefix: String,
    api_key: Option<String>,
}

impl LlmClient {
    pub fn new(base_url: &str, api_key: Option<&str>) -> Self {
        let base = base_url.trim_end_matches('/');
        let api_prefix = if base.ends_with("/v1") {
            base.to_string()
        } else {
            format!("{base}/v1")
        };

        LlmClient {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(60))
                .build()
                .unwrap_or_else(|_| Client::new()),
            api_prefix,
            api_key: api_key.filter(|key| !key.is_empty()).map(str::to_string),
        }
    }

    fn api_url(&self, path: &str) -> String {
        format!("{}/{}", self.api_prefix, path.trim_start_matches('/'))
    }

    fn with_auth(&self, request: RequestBuilder) -> RequestBuilder {
        match &self.api_key {
            Some(key) => request.header("Authorization", format!("Bearer {key}")),
            None => request,
        }
    }

    pub async fn get_embedding(&self, model: &str, text: &str) -> anyhow::Result<Vec<f32>> {
        let request = EmbeddingRequest {
            model: model.to_string(),
            input: text.to_string(),
        };

        let response: EmbeddingResponse = self
            .with_auth(self.client.post(self.api_url("embeddings")))
            .json(&request)
            .send()
            .await?
            .json()
            .await?;

        Ok(response
            .data
            .first()
            .map(|item| item.embedding.clone())
            .unwrap_or_default())
    }

    pub async fn get_embeddings(
        &self,
        model: &str,
        texts: &[String],
    ) -> anyhow::Result<Vec<Vec<f32>>> {
        if texts.is_empty() {
            return Ok(Vec::new());
        }

        let request = json!({
            "model": model,
            "input": texts,
        });

        let response: EmbeddingResponse = self
            .with_auth(self.client.post(self.api_url("embeddings")))
            .json(&request)
            .send()
            .await?
            .json()
            .await?;

        Ok(response
            .data
            .into_iter()
            .map(|item| item.embedding)
            .collect())
    }
}

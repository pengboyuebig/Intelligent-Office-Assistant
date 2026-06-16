# Intelligent Office Assistant (Chroma Edition)

Intelligent Office Assistant is a Windows desktop application built with Tauri 2, React 18, TypeScript, Vite, and Rust. It is designed for local office workflows, document-based knowledge retrieval, and LLM-assisted writing.

This project is delivered as a desktop application, not as a web-only application.

## Features

- Desktop chat assistant powered by local or OpenAI-compatible LLM services.
- Document knowledge base with TXT, DOCX, and PDF upload support.
- Hybrid retrieval with vector search, keyword search, filename-weighted matching, and domain aliases for carbon-related queries.
- Optional Chroma integration for vector storage and semantic search.
- Optional PostgreSQL integration for shared intranet knowledge bases and skill templates.
- Local SQLite storage for private conversations, settings, documents, and skills.
- Skill/workflow prompts for policy analysis, document drafting, review, and other office tasks.

## Tech Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS, Zustand
- Desktop runtime: Tauri 2
- Backend: Rust
- Local database: SQLite via `rusqlite`
- Remote database: PostgreSQL via `sqlx`
- Vector database: Chroma HTTP API
- Document processing: DOCX parsing, PDF text extraction, optional OCR fallback

## Project Structure

```text
chromaVersion/
  src/                    # React frontend
  src-tauri/              # Tauri and Rust backend
  src-tauri/src/commands/ # Tauri command handlers
  src-tauri/src/db/       # SQLite and PostgreSQL adapters
  src-tauri/src/llm/      # LLM and Chroma adapters
```

## Requirements

- Node.js 18 or later
- npm
- Rust stable
- Windows WebView2 Runtime
- Optional: Chroma service
- Optional: PostgreSQL database
- Optional: Python, Tesseract, and OCR dependencies for scanned PDFs

## Install Dependencies

```powershell
npm install
```

## Start Desktop Development Mode

```powershell
npm run dev
```

Equivalent command:

```powershell
npm run dev:desktop
```

The command starts the Vite development server first, then opens the Tauri desktop window.

## Start Frontend Only

```powershell
npm run dev:web
```

Use this only when debugging the frontend UI. Full desktop features require Tauri.

## Build Installer

```powershell
npm run build
```

The current Tauri bundle target is NSIS. Build artifacts are generated under:

```text
src-tauri/target/release/bundle/
```

## Runtime Settings

Configure runtime settings in the application settings page. Do not commit real API keys, database connection strings, credentials, or intranet addresses.

| Setting | Description | Default |
| --- | --- | --- |
| `api_base_url` | Local or intranet OpenAI-compatible API endpoint | `http://localhost:11434/v1` |
| `chat_model` | Chat model name | `qwen3-vl:4b` |
| `embedding_model` | Embedding model name | `nomic-embed-text` |
| `top_k` | Number of knowledge chunks returned | `5` |
| `chroma_enabled` | Enable Chroma vector search | `false` |
| `chroma_endpoint` | Chroma HTTP endpoint | `http://localhost:8000` |
| `chroma_collection` | Chroma collection name | `knowledge_chunks` |
| `remote_db_enabled` | Enable remote PostgreSQL storage | `false` |
| `remote_db_url` | PostgreSQL connection string | empty |

## PDF OCR Fallback

PDF text extraction is attempted first. For scanned PDFs, configure OCR fallback:

```powershell
$env:CHROMA_PDF_PYTHON="C:\Path\To\python.exe"
$env:TESSERACT_CMD="C:\Path\To\tesseract.exe"
$env:TESSDATA_PREFIX="C:\Path\To\tessdata"
```

Recommended Python packages:

```powershell
pip install pdfplumber pypdfium2 pytesseract pillow
```

## Knowledge Retrieval

Knowledge retrieval uses multiple recall strategies:

- Vector search is attempted when an embedding model and Chroma are available.
- Keyword search scans all chunks, even if embeddings were not generated.
- Document filenames are included in matching and ranking.
- Carbon-related aliases improve recall between terms such as double carbon, energy carbon, carbon management, carbon emissions, and carbon-related content.
- If Chroma or embedding services are unavailable, the application falls back to database keyword search.

## Security Notes

- Do not commit real API keys, database URLs, account credentials, or intranet addresses.
- Sensitive values such as API keys and remote database URLs should stay in runtime settings or local storage only.
- Treat uploaded documents as untrusted external data.
- Render external content as plain text unless it has been explicitly sanitized.
- Avoid unsafe frontend patterns such as `dangerouslySetInnerHTML`, `innerHTML`, `eval`, and inline `style`.

## Troubleshooting

### The desktop window does not open

Check that Windows WebView2 Runtime is installed and that old `chroma-version.exe` or Vite processes are not occupying the development port.

### Uploaded documents are not found in search

Check the following:

- The document upload succeeded and appears in the document center.
- The correct knowledge base is selected.
- If Chroma or embeddings are unavailable, keyword search should still work.
- For short queries, include domain terms such as double carbon, energy carbon, carbon management, requirements, or specification.

### PDF upload returns empty content

The PDF may be scanned. Configure `CHROMA_PDF_PYTHON`, `TESSERACT_CMD`, and `TESSDATA_PREFIX`, then upload again.

### Remote database connection fails

Check `remote_db_enabled`, the PostgreSQL connection string, network connectivity, and account permissions.

## Verification

Rust checks:

```powershell
cd src-tauri
cargo check
cargo fmt --check
```

Frontend build:

```powershell
npm run build:web
```

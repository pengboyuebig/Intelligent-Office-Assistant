# 智能办公助手（Chroma 版）

智能办公助手的英文名称为 **Intelligent Office Assistant**。

本项目是基于 Tauri 2、React 18、TypeScript、Vite 和 Rust 构建的 Windows 桌面应用，用于本地办公场景、文档知识库检索和大模型辅助写作。

本项目交付形态是桌面应用，不是纯 Web 应用。

## 主要功能

- 桌面聊天助手：支持本地或兼容 OpenAI API 的大模型服务。
- 文档知识库：支持上传 TXT、DOCX、PDF 文档。
- 混合检索：支持向量检索、关键词检索、文件名加权匹配和双碳/能碳相关同义召回。
- Chroma 向量库：可选接入 Chroma HTTP API，用于向量保存和语义检索。
- 远程 PostgreSQL：可选接入内网数据库，用于共享知识库和技能模板。
- 本地 SQLite：默认保存私有会话、设置、文档和技能。
- 技能/工作流：支持政策分析、公文起草、审查审核等办公提示词模板。

## 技术栈

- 前端：React 18、TypeScript、Vite、Tailwind CSS、Zustand
- 桌面运行时：Tauri 2
- 后端：Rust
- 本地数据库：SQLite（`rusqlite`）
- 远程数据库：PostgreSQL（`sqlx`）
- 向量数据库：Chroma HTTP API
- 文档处理：DOCX 解析、PDF 文本提取、可选 OCR fallback

## 目录结构

```text
chromaVersion/
  src/                    # React 前端代码
  src-tauri/              # Tauri 和 Rust 后端代码
  src-tauri/src/commands/ # Tauri 命令处理
  src-tauri/src/db/       # SQLite 和 PostgreSQL 适配
  src-tauri/src/llm/      # LLM 和 Chroma 适配
```

## 环境要求

- Node.js 18 或更高版本
- npm
- Rust stable
- Windows WebView2 Runtime
- 可选：Chroma 服务
- 可选：PostgreSQL 数据库
- 可选：Python、Tesseract 和 OCR 依赖，用于扫描件 PDF

## 安装依赖

```powershell
npm install
```

## 启动桌面开发模式

```powershell
npm run dev
```

等价命令：

```powershell
npm run dev:desktop
```

该命令会先启动 Vite 开发服务，然后打开 Tauri 桌面窗口。

## 仅启动前端

```powershell
npm run dev:web
```

该命令只适合调试前端界面。完整桌面能力需要通过 Tauri 启动。

## 构建安装包

```powershell
npm run build
```

当前 Tauri 打包目标是 NSIS，构建产物位于：

```text
src-tauri/target/release/bundle/
```

## 运行配置

请在应用内设置页面配置运行参数。不要将真实 API Key、数据库连接串、账号密码或内网地址提交到仓库。

| 配置项 | 说明 | 默认值 |
| --- | --- | --- |
| `api_base_url` | 本地或内网兼容 OpenAI API 的服务地址 | `http://localhost:11434/v1` |
| `chat_model` | 聊天模型名称 | `qwen3-vl:4b` |
| `embedding_model` | 向量模型名称 | `nomic-embed-text` |
| `top_k` | 知识库返回片段数量 | `5` |
| `chroma_enabled` | 是否启用 Chroma 向量检索 | `false` |
| `chroma_endpoint` | Chroma HTTP 地址 | `http://localhost:8000` |
| `chroma_collection` | Chroma 集合名称 | `knowledge_chunks` |
| `remote_db_enabled` | 是否启用远程 PostgreSQL | `false` |
| `remote_db_url` | PostgreSQL 连接串 | 空 |

## PDF OCR Fallback

PDF 会优先尝试普通文本提取。如果 PDF 是扫描件，可以配置 OCR fallback：

```powershell
$env:CHROMA_PDF_PYTHON="C:\Path\To\python.exe"
$env:TESSERACT_CMD="C:\Path\To\tesseract.exe"
$env:TESSDATA_PREFIX="C:\Path\To\tessdata"
```

建议安装以下 Python 包：

```powershell
pip install pdfplumber pypdfium2 pytesseract pillow
```

## 知识库检索机制

知识库检索使用多路召回策略：

- 配置 embedding 模型和 Chroma 后，会优先尝试向量检索。
- 关键词检索会扫描所有知识片段，即使 embedding 生成失败也可以检索。
- 文档文件名会参与匹配和排序。
- 双碳、能碳、碳管理、碳排放、碳相关等词会互相增强召回。
- 当 Chroma 或 embedding 服务不可用时，会自动降级到数据库关键词检索。

## 安全注意

- 不要提交真实 API Key、数据库 URL、账号密码或内网地址。
- API Key、远程数据库连接串等敏感信息只应保存在运行时设置或本地存储中。
- 上传文档属于外部输入，默认不可信。
- 外部内容默认只作为纯文本渲染。
- 前端禁止使用 `dangerouslySetInnerHTML`、`innerHTML`、`eval` 和行内 `style`。

## 常见问题

### 桌面窗口没有打开

请检查 Windows WebView2 Runtime 是否已安装，并确认没有旧的 `chroma-version.exe` 或 Vite 进程占用开发端口。

### 上传文档后检索不到

请优先检查：

- 文档是否上传成功，并能在文档中心看到。
- 是否选择了正确的知识库。
- 如果 Chroma 或 embedding 不可用，系统仍会自动使用关键词检索。
- 查询过短时，可以加入业务词，例如“双碳、能碳、碳管理、需求、说明书”。

### PDF 上传后内容为空

该 PDF 可能是扫描件。请配置 `CHROMA_PDF_PYTHON`、`TESSERACT_CMD` 和 `TESSDATA_PREFIX` 后重新上传。

### 远程数据库连接失败

请检查 `remote_db_enabled`、PostgreSQL 连接串、网络连通性和账号权限。

## 验证命令

Rust 检查：

```powershell
cd src-tauri
cargo check
cargo fmt --check
```

前端构建：

```powershell
npm run build:web
```

# chromaVersion SQL 汇总

> 生成时间：2026-06-16
> 用途：部署参考 / DBA review

## 文件说明

| 文件 | 数据库 | 用途 |
|------|--------|------|
| `schema_sqlite.sql` | SQLite | 本地离线数据库建表、索引、默认配置、默认用户（全新部署） |
| `schema_postgres.sql` | PostgreSQL | 远程共享数据库建表、索引、默认用户（全新部署） |
| `migrate_postgres_to_rbac.sql` | PostgreSQL | 旧库升级到带 `users` / `owner_id` / `is_public` 的 RBAC 版本 |

> 注：SQLite schema 由 Rust 后端在首次启动时自动执行；PostgreSQL schema 在首次连接远程数据库时自动执行。部署时也可以预先手动执行这两个文件。如果远程 PostgreSQL 已经存在旧版数据（没有 `users`、`owner_id`、`is_public`），请执行 `migrate_postgres_to_rbac.sql` 进行升级。

---

## 一、SQLite 本地数据库

### 建表

#### conversations（对话）
```sql
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '新对话',
    skill_id TEXT,
    knowledge_base_ids TEXT DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

#### messages（消息：用户提问 + 助手回复）
```sql
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system', 'tool')),
    content TEXT NOT NULL DEFAULT '',
    reasoning TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);
```

#### users（本地账号 + RBAC）
```sql
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

#### knowledge_bases（知识库）
```sql
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    owner_id TEXT NOT NULL DEFAULT 'system',
    is_public INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

#### documents（文档）
```sql
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    knowledge_base_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);
```

#### chunks（文档分块）
```sql
CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    knowledge_base_id TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    embedding BLOB,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
);
```

#### skills（技能 / 系统提示词模板）
```sql
CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT DEFAULT '',
    system_prompt TEXT NOT NULL DEFAULT '你是一个有用的助手。',
    tools_md TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

#### settings（应用配置）
```sql
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
```

### 索引

```sql
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_documents_kb ON documents(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_chunks_kb ON chunks(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);
```

### 默认配置

```sql
INSERT OR IGNORE INTO settings (key, value) VALUES ('api_base_url', 'http://localhost:11434/v1');
INSERT OR IGNORE INTO settings (key, value) VALUES ('embedding_model', 'nomic-embed-text');
INSERT OR IGNORE INTO settings (key, value) VALUES ('chat_model', 'qwen3-vl:4b');
INSERT OR IGNORE INTO settings (key, value) VALUES ('top_k', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('remote_db_url', '');
INSERT OR IGNORE INTO settings (key, value) VALUES ('remote_db_enabled', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('chroma_endpoint', 'http://localhost:8000');
INSERT OR IGNORE INTO settings (key, value) VALUES ('chroma_enabled', 'false');
INSERT OR IGNORE INTO settings (key, value) VALUES ('current_user_id', 'ptyh');
```

### 默认用户

```sql
INSERT OR IGNORE INTO users (id, username, password, role) VALUES ('admin', 'admin', 'admin123', 'admin');
INSERT OR IGNORE INTO users (id, username, password, role) VALUES ('ptyh', 'ptyh', 'ptyh123', 'user');
```

### CRUD 操作

#### conversations
```sql
-- 创建对话
INSERT INTO conversations (id, title, skill_id, knowledge_base_ids) VALUES (?1, ?2, ?3, ?4);

-- 查询所有对话
SELECT id, title, skill_id, knowledge_base_ids, created_at, updated_at
FROM conversations
ORDER BY updated_at DESC;

-- 更新标题
UPDATE conversations
SET title=?1, updated_at=datetime('now','localtime')
WHERE id=?2;

-- 更新知识库关联
UPDATE conversations
SET knowledge_base_ids=?1, updated_at=datetime('now','localtime')
WHERE id=?2;

-- 删除对话（级联删除 messages）
DELETE FROM conversations WHERE id=?1;
```

#### messages
```sql
-- 添加消息
INSERT INTO messages (id, conversation_id, role, content, reasoning) VALUES (?1, ?2, ?3, ?4, ?5);

-- 更新对话时间
UPDATE conversations
SET updated_at=datetime('now','localtime')
WHERE id=?1;

-- 查询某个对话的消息
SELECT id, conversation_id, role, content, reasoning, created_at
FROM messages
WHERE conversation_id=?1
ORDER BY created_at ASC;
```

#### users
```sql
-- 查询当前用户
SELECT id, username, role FROM users WHERE id = (SELECT value FROM settings WHERE key = 'current_user_id');

-- 认证（明文密码示例，生产环境建议哈希）
SELECT id, username, role FROM users WHERE username=?1 AND password=?2;

-- 切换当前用户
INSERT OR REPLACE INTO settings (key, value) VALUES ('current_user_id', ?1);
```

#### knowledge_bases
```sql
-- 创建（普通用户：owner_id = 当前用户，is_public = 0；管理员可创建公开库）
INSERT INTO knowledge_bases (id, name, description, owner_id, is_public) VALUES (?1, ?2, ?3, ?4, ?5);

-- 列表（管理员查看全部，普通用户查看公开或自己的）
-- 管理员
SELECT id, name, description, owner_id, is_public, created_at FROM knowledge_bases ORDER BY created_at DESC;
-- 普通用户
SELECT id, name, description, owner_id, is_public, created_at
FROM knowledge_bases
WHERE is_public=1 OR owner_id=?1
ORDER BY created_at DESC;

-- 删除（管理员可删除全部，普通用户只能删除自己的）
-- 管理员
DELETE FROM knowledge_bases WHERE id=?1;
-- 普通用户
DELETE FROM knowledge_bases WHERE id=?1 AND owner_id=?2;
```

#### documents
```sql
-- 列表（含完整 content）
SELECT id, knowledge_base_id, filename, content, chunk_count, created_at
FROM documents
WHERE knowledge_base_id=?1
ORDER BY created_at DESC;

-- 删除
DELETE FROM documents WHERE id=?1;

-- 插入
INSERT INTO documents (id, knowledge_base_id, filename, content) VALUES (?1, ?2, ?3, ?4);

-- 更新 chunk_count
UPDATE documents SET chunk_count=?1 WHERE id=?2;
```

#### chunks
```sql
-- 插入分块
INSERT INTO chunks (id, document_id, knowledge_base_id, content, chunk_index, embedding)
VALUES (?1, ?2, ?3, ?4, ?5, ?6);
```

#### skills
```sql
-- 创建
INSERT INTO skills (id, name, description, system_prompt, tools_md) VALUES (?1, ?2, ?3, ?4, ?5);

-- 更新
UPDATE skills
SET name=?1, description=?2, system_prompt=?3, tools_md=?4,
    updated_at=datetime('now','localtime')
WHERE id=?5;

-- 列表
SELECT id, name, description, system_prompt, tools_md, created_at, updated_at
FROM skills
ORDER BY updated_at DESC;

-- 单条
SELECT id, name, description, system_prompt, tools_md, created_at, updated_at
FROM skills
WHERE id=?1;

-- 删除
DELETE FROM skills WHERE id=?1;
```

#### settings
```sql
-- 读取
SELECT value FROM settings WHERE key=?1;

-- 写入
INSERT OR REPLACE INTO settings (key, value) VALUES (?1, ?2);
```

---

## 二、PostgreSQL 远程数据库

### 建表

#### users（共享账号 + RBAC）
```sql
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
    created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT
);
```

#### knowledge_bases
```sql
CREATE TABLE IF NOT EXISTS knowledge_bases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    owner_id TEXT NOT NULL DEFAULT 'system',
    is_public INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT
);
```

#### documents
```sql
CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    knowledge_base_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT
);
```

#### chunks
```sql
CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    knowledge_base_id TEXT NOT NULL,
    content TEXT NOT NULL,
    chunk_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT
);
```

#### skills
```sql
CREATE TABLE IF NOT EXISTS skills (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    group_id TEXT DEFAULT '',
    system_prompt TEXT NOT NULL DEFAULT '你是一个有用的助手。',
    tools_md TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT,
    updated_at TEXT NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Shanghai')::TEXT
);
```

### 索引

```sql
CREATE INDEX IF NOT EXISTS idx_documents_kb ON documents(knowledge_base_id);
CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_chunks_kb ON chunks(knowledge_base_id);
```

### 默认用户

```sql
INSERT INTO users (id, username, password, role) VALUES ('admin', 'admin', 'admin123', 'admin')
    ON CONFLICT (id) DO NOTHING;
INSERT INTO users (id, username, password, role) VALUES ('ptyh', 'ptyh', 'ptyh123', 'user')
    ON CONFLICT (id) DO NOTHING;
```

### CRUD 操作

#### users
```sql
-- 查询当前用户
SELECT id, username, role FROM users WHERE id = (SELECT value FROM settings WHERE key = 'current_user_id');

-- 认证
SELECT id, username, role FROM users WHERE username=$1 AND password=$2;
```

#### knowledge_bases
```sql
-- 创建
INSERT INTO knowledge_bases (id, name, description, owner_id, is_public)
VALUES ($1, $2, $3, $4, $5);

-- 列表（管理员查看全部）
SELECT id, name, description, owner_id, is_public, created_at
FROM knowledge_bases
ORDER BY created_at DESC;

-- 列表（普通用户查看公开或自己的）
SELECT id, name, description, owner_id, is_public, created_at
FROM knowledge_bases
WHERE is_public=1 OR owner_id=$1
ORDER BY created_at DESC;

-- 删除（管理员）
DELETE FROM knowledge_bases WHERE id = $1;

-- 删除（普通用户，仅自己的）
DELETE FROM knowledge_bases WHERE id = $1 AND owner_id = $2;
```

#### documents
```sql
INSERT INTO documents (id, knowledge_base_id, filename, content) VALUES ($1, $2, $3, $4);

UPDATE documents SET chunk_count = $1 WHERE id = $2;

SELECT id, knowledge_base_id, filename, content, chunk_count, created_at
FROM documents
WHERE knowledge_base_id = $1
ORDER BY created_at DESC;

DELETE FROM documents WHERE id = $1;
```

#### chunks
```sql
INSERT INTO chunks (id, document_id, knowledge_base_id, content, chunk_index)
VALUES ($1, $2, $3, $4, $5);
```

#### skills
```sql
INSERT INTO skills (id, name, description, system_prompt, tools_md) VALUES ($1, $2, $3, $4, $5);

UPDATE skills
SET name=$1, description=$2, system_prompt=$3, tools_md=$4,
    updated_at=(now() AT TIME ZONE 'Asia/Shanghai')::TEXT
WHERE id=$5;

SELECT id, name, description, system_prompt, tools_md, created_at, updated_at
FROM skills ORDER BY name;

SELECT id, name, description, system_prompt, tools_md, created_at, updated_at
FROM skills WHERE id = $1;

DELETE FROM skills WHERE id = $1;
```

#### 关键词检索（动态 SQL）

```sql
-- 带知识库过滤
SELECT c.content, d.filename
FROM chunks c
JOIN documents d ON d.id = c.document_id
WHERE c.knowledge_base_id = $1
  AND LENGTH(c.content) > 5
ORDER BY d.created_at DESC, c.chunk_index
LIMIT $2;

-- 跨知识库
SELECT c.content, d.filename
FROM chunks c
JOIN documents d ON d.id = c.document_id
WHERE LENGTH(c.content) > 5
ORDER BY d.created_at DESC, c.chunk_index
LIMIT $1;
```

---

## 三、权限模型说明

| 角色 | 知识库创建 | 公共知识库 | 知识库删除 | 文档上传 |
|------|-----------|-----------|-----------|---------|
| admin | 可创建 | 可创建公开库（owner_id = 'system'） | 可删除全部 | 可上传到任意库 |
| user | 可创建 | 不可创建公开库 | 仅删除自己的 | 仅上传到可访问的库 |

- `is_public = 1` 表示公开库，所有用户可见。
- `is_public = 0` 且 `owner_id = 'system'` 表示管理员创建的私有系统库。
- `is_public = 0` 且 `owner_id = 当前用户ID` 表示普通用户的私有库。

---

## 四、部署建议

1. **本地 SQLite**：无需预先执行，应用首次启动会自动创建。如需预置，可手动执行 `schema_sqlite.sql`。
2. **远程 PostgreSQL**：建议由 DBA 预先执行 `schema_postgres.sql`，并授予应用账号 `INSERT/SELECT/UPDATE/DELETE` 权限。
3. **连接字符串示例**：
   ```
   postgres://username:password@host:5432/database
   ```
4. **注意**：PostgreSQL 远程库目前不包含 `conversations` / `messages` 表，对话记录仍保存在本地 SQLite 中。
5. **安全建议**：默认用户密码仅用于测试/首次登录，生产环境应在首次部署后修改 `admin` 和 `ptyh` 的密码。

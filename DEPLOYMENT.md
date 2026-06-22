# chromaVersion 部署方案

> 版本：0.1.0
> 更新：2026-06-16

## 一、部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                        客户端（Windows）                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │         GLKJ 智能办公助手 (Chroma版) 桌面应用            │  │
│  │              Tauri + React + WebView2                  │  │
│  └───────────────────────────────────────────────────────┘  │
│                              │                              │
│                              ▼                              │
│  ┌──────────────┐   ┌─────────────────┐   ┌──────────────┐ │
│  │ 本地 SQLite  │   │   Chroma 向量库  │   │ 远程 PostgreSQL │ │
│  │ 对话/设置/本地 │   │  http://host:8000 │   │  共享知识库/技能 │ │
│  │ 知识库（可选） │   │                 │   │              │ │
│  └──────────────┘   └─────────────────┘   └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────────┐
              │      LLM 推理服务（Ollama /    │
              │       DeepSeek / 其他 OpenAI   │
              │          兼容接口）             │
              └───────────────────────────────┘
```

### 组件说明

| 组件 | 是否必需 | 部署位置 | 说明 |
|------|---------|---------|------|
| Tauri 桌面客户端 | 是 | 用户 Windows 电脑 | 安装包约 5-10MB |
| WebView2 Runtime | 是 | 用户 Windows 电脑 | 安装时自动下载/引导安装 |
| Chroma 向量数据库 | 是（推荐服务端） | 内网服务器 | 用于文档向量检索 |
| PostgreSQL | 可选（推荐） | 内网服务器 | 共享知识库、文档、技能模板 |
| LLM 推理服务 | 是 | 内网服务器或本地 | Ollama / DeepSeek / 其他兼容接口 |

---

## 二、服务端环境准备

### 2.1 推荐服务器配置

| 规模 | CPU | 内存 | 磁盘 | 适用场景 |
|------|-----|------|------|---------|
| 小型（1-10人） | 4核 | 16GB | 100GB SSD | 测试、小团队 |
| 中型（10-50人） | 8核 | 32GB | 500GB SSD | 部门级共享 |
| 大型（50人以上） | 16核+ | 64GB+ | 1TB+ SSD | 企业级部署 |

### 2.2 操作系统

- 推荐：**Ubuntu 22.04 LTS / Debian 12 / CentOS 7+**
- 内网可达，客户端能通过 IP + 端口访问
- 防火墙放行以下端口：
  - `8000`：Chroma
  - `5432`：PostgreSQL
  - `11434`：Ollama（如使用）
  - 其他 LLM 服务对应端口

---

## 三、Chroma 向量数据库部署

### 方式一：Docker 部署（推荐）

```bash
# 1. 安装 Docker（如未安装）
curl -fsSL https://get.docker.com | sh

# 2. 创建持久化目录
mkdir -p /opt/chroma/data

# 3. 运行 Chroma
docker run -d \
  --name chroma \
  -p 8000:8000 \
  -v /opt/chroma/data:/chroma/chroma \
  -e IS_PERSISTENT=TRUE \
  -e PERSIST_DIRECTORY=/chroma/chroma \
  -e ANONYMIZED_TELEMETRY=FALSE \
  --restart unless-stopped \
  chromadb/chroma:latest

# 4. 验证
curl http://localhost:8000/api/v1/heartbeat
```

### 方式二：pip 部署

```bash
# 1. 创建 Python 虚拟环境
python3 -m venv /opt/chroma/venv
source /opt/chroma/venv/bin/activate

# 2. 安装 Chroma
pip install chromadb

# 3. 启动服务
chroma run --path /opt/chroma/data --host 0.0.0.0 --port 8000

# 4. 使用 systemd 托管（见下方 service 文件）
```

### systemd 服务文件（pip 方式）

`/etc/systemd/system/chroma.service`：

```ini
[Unit]
Description=Chroma Vector Database
After=network.target

[Service]
Type=simple
User=chroma
Group=chroma
WorkingDirectory=/opt/chroma
Environment="PATH=/opt/chroma/venv/bin"
ExecStart=/opt/chroma/venv/bin/chroma run --path /opt/chroma/data --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
useradd -r -s /bin/false chroma
chown -R chroma:chroma /opt/chroma
systemctl daemon-reload
systemctl enable --now chroma
systemctl status chroma
```

---

## 四、PostgreSQL 远程数据库部署

### 4.1 Docker 部署（推荐）

```bash
# 1. 创建数据目录
mkdir -p /opt/postgres/data

# 2. 运行 PostgreSQL
docker run -d \
  --name postgres \
  -p 5432:5432 \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=YourStrongPassword \
  -e POSTGRES_DB=chroma_db \
  -v /opt/postgres/data:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16

# 3. 执行项目 schema
# 将 chromaVersion/sql/schema_postgres.sql 复制到服务器后执行
docker exec -i postgres psql -U postgres -d chroma_db < schema_postgres.sql
```

### 4.2 原生部署

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install -y postgresql-16

# 启动并启用
sudo systemctl enable --now postgresql

# 创建数据库和用户
sudo -u postgres psql -c "CREATE DATABASE chroma_db;"
sudo -u postgres psql -c "CREATE USER chroma_user WITH PASSWORD 'YourStrongPassword';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE chroma_db TO chroma_user;"

# 执行 schema
sudo -u postgres psql -d chroma_db -f schema_postgres.sql
```

### 4.3 允许远程连接

编辑 `postgresql.conf`：

```conf
listen_addresses = '*'
```

编辑 `pg_hba.conf`，添加：

```conf
host    chroma_db    chroma_user    0.0.0.0/0    scram-sha-256
```

重启 PostgreSQL：

```bash
sudo systemctl restart postgresql
```

> 生产环境建议把 `0.0.0.0/0` 改为具体内网网段。

### 4.4 旧数据库升级到 RBAC 版本

如果你的 PostgreSQL 已经运行过旧版 schema（没有 `users`、`owner_id`、`is_public` 字段），执行升级脚本：

```bash
# 将 chromaVersion/sql/migrate_postgres_to_rbac.sql 复制到服务器后执行
docker exec -i postgres psql -U postgres -d chroma_db < migrate_postgres_to_rbac.sql

# 原生部署
sudo -u postgres psql -d chroma_db -f migrate_postgres_to_rbac.sql
```

升级脚本会：
1. 创建 `users` 表
2. 给 `knowledge_bases` 增加 `owner_id` / `is_public` 字段
3. 将已有知识库标记为公开（避免普通用户突然看不到旧数据）
4. 插入默认的 `admin` / `ptyh` 账号

> 生产环境请在升级后尽快修改默认密码。

---

## 五、LLM 推理服务部署

### 方式一：Ollama（本地/内网部署）

```bash
# 1. 安装 Ollama
curl -fsSL https://ollama.com/install.sh | sh

# 2. 拉取模型
ollama pull qwen2.5:14b
ollama pull nomic-embed-text

# 3. 启动服务（默认监听 localhost:11434）
ollama serve

# 4. 如需远程访问，设置环境变量
export OLLAMA_HOST=0.0.0.0:11434
ollama serve
```

### 方式二：DeepSeek（云端 API）

无需部署，只需在客户端设置：
- Provider：`deepseek`
- Base URL：`https://api.deepseek.com/v1`
- API Key：从 DeepSeek 官网获取

### 方式三：vLLM / Xinference / 其他兼容服务

按对应工具文档部署，确保提供 OpenAI 兼容的 `/v1/chat/completions` 和 `/v1/embeddings` 接口。

---

## 六、客户端部署

### 6.1 构建安装包

在开发机上执行：

```bash
cd chromaVersion
npm install
npm run build
```

产物位置：

```
chromaVersion/src-tauri/target/release/bundle/nsis/
Intelligent Office Assistant (Chroma Edition)_0.1.0_x64-setup.exe
```

### 6.2 分发给用户

将 `.exe` 安装包分发给用户，双击安装即可。

安装过程中：
- 如果系统没有 WebView2，安装程序会自动下载并安装
- 安装完成后在开始菜单/桌面生成快捷方式

### 6.3 静默安装（可选）

```powershell
# 静默安装
"Intelligent Office Assistant (Chroma Edition)_0.1.0_x64-setup.exe" /S
```

---

## 七、客户端配置

安装完成后，打开应用，进入 **设置** 页面，配置以下项：

### 7.1 LLM 设置

| 设置项 | Ollama 示例 | DeepSeek 示例 |
|--------|------------|---------------|
| 提供商 | `ollama` | `deepseek` |
| API Base URL | `http://10.1.42.164:11434/v1` | `https://api.deepseek.com/v1` |
| API Key | 空（本地通常不需要） | `sk-xxxxxxxx` |
| Chat Model | `qwen2.5:14b` | `deepseek-chat` |
| Embedding Model | `nomic-embed-text` | `text-embedding-3-small` |

### 7.2 Chroma 设置

| 设置项 | 示例 |
|--------|------|
| 启用 Chroma | `true` |
| Chroma Endpoint | `http://10.1.42.164:8000` |
| Chroma Collection | `default`（或自定义） |

### 7.3 远程 PostgreSQL 设置

| 设置项 | 示例 |
|--------|------|
| 启用远程数据库 | `true` |
| 数据库连接字符串 | `postgres://chroma_user:YourStrongPassword@10.1.42.164:5432/chroma_db` |

配置完成后，点击各模块的"测试连接"按钮验证。

---

## 八、数据存储策略

| 数据类型 | 存储位置 | 是否共享 | 删除策略 | 权限控制 |
|---------|---------|---------|---------|---------|
| 对话记录 | 本地 SQLite | 否（每个用户本地） | 用户手动删除 | 本地当前用户 |
| 应用设置 | 本地 SQLite | 否 | 用户手动修改 | 本地当前用户 |
| 本地知识库 | 本地 SQLite + 本地 Chroma | 否 | 用户手动删除 | 本地当前用户 |
| 共享知识库 | 远程 PostgreSQL + 远程 Chroma | 是 | 用户手动删除 | 基于 `users.role` 的 RBAC |
| 共享技能模板 | 远程 PostgreSQL | 是 | 用户手动删除 | 管理员可管理，普通用户可查看 |

### 用户与权限

本地 SQLite 和远程 PostgreSQL 均包含 `users` 表，内置两个默认账号：

| 用户名 | 密码 | 角色 | 权限 |
|--------|------|------|------|
| `admin` | `admin123` | 管理员 | 可创建公开知识库、删除所有知识库、上传文档到任意知识库 |
| `ptyh` | `ptyh123` | 普通用户 | 只能创建自己的私有知识库，只能操作自己有权限的知识库 |

> 生产环境请在首次部署后修改默认密码。客户端可在 **系统设置 → 当前用户** 中切换账号。

---

## 九、备份方案

### 9.1 本地 SQLite 备份

客户端数据文件默认位于：

```
%APPDATA%\com.swift.chroma-version\
```

备份策略：
- 建议通过域控/桌面管理软件定期备份该目录
- 关键文件：`*.db`、设置文件

### 9.2 PostgreSQL 备份

```bash
# 每日全量备份
0 2 * * * docker exec postgres pg_dump -U postgres chroma_db > /backup/chroma_db_$(date +\%Y\%m\%d).sql

# 保留 30 天
find /backup -name "chroma_db_*.sql" -mtime +30 -delete
```

### 9.3 Chroma 数据备份

```bash
# 备份 Chroma 数据目录
tar czf /backup/chroma_data_$(date +%Y%m%d).tar.gz /opt/chroma/data
```

---

## 十、升级方案

### 10.1 服务端升级

```bash
# Chroma
docker pull chromadb/chroma:latest
docker restart chroma

# PostgreSQL
docker pull postgres:16
docker stop postgres
docker rm postgres
# 使用原有数据卷重新启动（见 4.1 命令）
```

### 10.2 客户端升级

1. 重新执行 `npm run build` 生成新版安装包
2. 分发给用户覆盖安装即可
3. 本地 SQLite 数据会自动保留

---

## 十一、常见问题

### Q1：安装包提示缺少 WebView2
安装程序会自动下载 WebView2 bootstrapper 并引导安装。如内网无法访问互联网，请提前下载完整 WebView2 Runtime 并静默安装。

### Q2：客户端无法连接 Chroma
- 检查 Chroma 服务是否启动：`curl http://server-ip:8000/api/v1/heartbeat`
- 检查防火墙是否放行 8000 端口
- 检查客户端填写的 endpoint 是否正确（注意不需要 `/api/v1` 后缀）

### Q3：PostgreSQL 连接失败
- 检查 PostgreSQL 是否允许远程连接
- 检查 `pg_hba.conf` 配置
- 检查用户名/密码/数据库名是否正确
- 检查防火墙是否放行 5432 端口

### Q4：对话记录不同步
对话记录（conversations / messages）目前只保存在本地 SQLite，不会在 PostgreSQL 中共享。如需多人共享对话，需要额外开发。

### Q5：LLM 回复被截断
- 检查模型服务是否有限流或输出长度限制
- 检查网络稳定性
- 如使用 Ollama，可尝试更换更大参数的模型

---

## 十二、安全建议

1. **内网部署**：所有服务端组件建议部署在内网，不直接暴露到公网
2. **API Key 管理**：DeepSeek 等云端 API Key 不要硬编码，通过客户端设置输入
3. **数据库权限**：PostgreSQL 用户只授予必要权限，不要给 superuser
4. **定期备份**：SQLite、PostgreSQL、Chroma 数据都要定期备份
5. **HTTPS**：如需跨网段访问，建议通过 Nginx 反向代理加 TLS

---

## 十三、附录

### 13.1 项目 SQL 文件

| 文件 | 说明 |
|------|------|
| `chromaVersion/sql/schema_sqlite.sql` | SQLite 本地库 schema（全新部署） |
| `chromaVersion/sql/schema_postgres.sql` | PostgreSQL 远程库 schema（全新部署） |
| `chromaVersion/sql/migrate_postgres_to_rbac.sql` | 旧 PostgreSQL 库升级到 RBAC 版本的迁移脚本 |
| `chromaVersion/sql/README.md` | 完整 SQL 汇总 |

### 13.2 相关端口

| 服务 | 默认端口 |
|------|---------|
| Chroma | 8000 |
| PostgreSQL | 5432 |
| Ollama | 11434 |
| Tauri 前端 dev | 1422 |

### 13.3 联系方式

部署过程中如有问题，请提供以下信息排查：
- 服务端操作系统及版本
- 各服务日志
- 客户端报错截图或完整错误信息
- 客户端配置（可隐藏 API Key）

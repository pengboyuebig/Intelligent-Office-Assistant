# Chroma 向量数据库部署指南

> 适用于 chromaVersion 项目
> 推荐：Docker 方式（最简单、最稳定）

---

## 一、准备工作

### 1.1 服务器要求

| 规模 | CPU | 内存 | 磁盘 | 适用 |
|------|-----|------|------|------|
| 小型 | 2核 | 4GB | 50GB | 测试、个人使用 |
| 中型 | 4核 | 8GB | 200GB SSD | 10-50人团队 |
| 大型 | 8核+ | 16GB+ | 500GB+ SSD | 企业级共享 |

### 1.2 操作系统

推荐 **Ubuntu 22.04 LTS** 或 **Debian 12**。

### 1.3 安装 Docker（如未安装）

```bash
# 一键安装 Docker
curl -fsSL https://get.docker.com | sh

# 启动 Docker
sudo systemctl enable --now docker

# 验证
sudo docker --version
```

---

## 二、方式一：Docker 部署（推荐）

### 2.1 创建数据目录

```bash
# 创建持久化目录
sudo mkdir -p /opt/chroma/data

# 设置权限（容器内 chroma 用户 UID 为 1000）
sudo chown -R 1000:1000 /opt/chroma/data
```

### 2.2 运行 Chroma 容器

```bash
sudo docker run -d \
  --name chroma \
  -p 8000:8000 \
  -v /opt/chroma/data:/chroma/chroma \
  -e IS_PERSISTENT=TRUE \
  -e PERSIST_DIRECTORY=/chroma/chroma \
  -e ANONYMIZED_TELEMETRY=FALSE \
  --restart unless-stopped \
  chromadb/chroma:latest
```

参数说明：
- `-d`：后台运行
- `-p 8000:8000`：映射端口
- `-v /opt/chroma/data:/chroma/chroma`：数据持久化
- `-e IS_PERSISTENT=TRUE`：启用持久化
- `-e ANONYMIZED_TELEMETRY=FALSE`：关闭匿名遥测
- `--restart unless-stopped`：开机自启

### 2.3 验证部署

```bash
# 查看容器状态
sudo docker ps | grep chroma

# 测试心跳接口
curl http://localhost:8000/api/v1/heartbeat

# 正常应返回类似 {"nanosecond heartbeat": 1234567890}
```

### 2.4 查看日志

```bash
sudo docker logs -f chroma
```

### 2.5 停止/重启/删除

```bash
# 停止
sudo docker stop chroma

# 重启
sudo docker restart chroma

# 删除容器（数据不会丢失，在 /opt/chroma/data）
sudo docker rm -f chroma

# 升级（拉取最新镜像后重新运行）
sudo docker pull chromadb/chroma:latest
sudo docker rm -f chroma
sudo docker run -d \
  --name chroma \
  -p 8000:8000 \
  -v /opt/chroma/data:/chroma/chroma \
  -e IS_PERSISTENT=TRUE \
  -e PERSIST_DIRECTORY=/chroma/chroma \
  -e ANONYMIZED_TELEMETRY=FALSE \
  --restart unless-stopped \
  chromadb/chroma:latest
```

---

## 三、方式二：Docker Compose 部署（更推荐）

创建 `docker-compose.yml`：

```yaml
version: "3.8"

services:
  chroma:
    image: chromadb/chroma:latest
    container_name: chroma
    ports:
      - "8000:8000"
    volumes:
      - /opt/chroma/data:/chroma/chroma
    environment:
      - IS_PERSISTENT=TRUE
      - PERSIST_DIRECTORY=/chroma/chroma
      - ANONYMIZED_TELEMETRY=FALSE
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/heartbeat"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 10s
```

启动：

```bash
sudo mkdir -p /opt/chroma/data
sudo chown -R 1000:1000 /opt/chroma/data
sudo docker compose up -d
```

---

## 四、方式三：pip 部署（适合不使用 Docker 的环境）

### 4.1 安装 Python 依赖

```bash
# 创建虚拟环境
sudo mkdir -p /opt/chroma
sudo python3 -m venv /opt/chroma/venv

# 激活虚拟环境
source /opt/chroma/venv/bin/activate

# 安装 Chroma
pip install chromadb
```

### 4.2 创建启动脚本

`/opt/chroma/start.sh`：

```bash
#!/bin/bash
source /opt/chroma/venv/bin/activate
chroma run \
  --path /opt/chroma/data \
  --host 0.0.0.0 \
  --port 8000
```

```bash
chmod +x /opt/chroma/start.sh
```

### 4.3 创建 systemd 服务

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
ExecStart=/opt/chroma/venv/bin/chroma run --path /opt/chroma/data --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

创建用户并启动：

```bash
# 创建专用用户
sudo useradd -r -s /bin/false chroma

# 设置权限
sudo chown -R chroma:chroma /opt/chroma

# 重载 systemd
sudo systemctl daemon-reload

# 开机自启并立即启动
sudo systemctl enable --now chroma

# 查看状态
sudo systemctl status chroma
```

---

## 五、网络配置

### 5.1 防火墙放行

```bash
# Ubuntu/Debian (ufw)
sudo ufw allow 8000/tcp

# CentOS/RHEL (firewalld)
sudo firewall-cmd --permanent --add-port=8000/tcp
sudo firewall-cmd --reload
```

### 5.2 客户端连接地址

客户端设置中填写：

```text
http://服务器IP:8000
```

例如：
```text
http://10.1.42.164:8000
```

> 注意：不需要加 `/api/v1` 后缀，应用内部会自动处理。

---

## 六、验证 Chroma 可用性

### 6.1 服务端本地测试

```bash
curl http://localhost:8000/api/v1/heartbeat
```

### 6.2 从客户端电脑测试

在 Windows 客户端 PowerShell 中：

```powershell
Invoke-RestMethod -Uri "http://服务器IP:8000/api/v1/heartbeat"
```

### 6.3 在应用内测试

打开 GLKJ 智能办公助手 → 设置 → Chroma 设置 → 点击"测试 Chroma 连接"。

---

## 七、备份与恢复

### 7.1 备份

```bash
# 停止容器（保证数据一致性）
sudo docker stop chroma

# 打包数据目录
sudo tar czf /backup/chroma_data_$(date +%Y%m%d_%H%M%S).tar.gz /opt/chroma/data

# 启动容器
sudo docker start chroma
```

### 7.2 恢复

```bash
# 停止并删除旧容器
sudo docker stop chroma
sudo docker rm chroma

# 清空/恢复数据目录
sudo rm -rf /opt/chroma/data/*
sudo tar xzf /backup/chroma_data_xxxx.tar.gz -C /

# 重新启动
sudo docker run -d \
  --name chroma \
  -p 8000:8000 \
  -v /opt/chroma/data:/chroma/chroma \
  -e IS_PERSISTENT=TRUE \
  -e PERSIST_DIRECTORY=/chroma/chroma \
  -e ANONYMIZED_TELEMETRY=FALSE \
  --restart unless-stopped \
  chromadb/chroma:latest
```

---

## 八、常见问题

### Q1：容器启动后端口无法访问
- 检查防火墙是否放行 8000
- 检查容器是否正常运行：`sudo docker ps`
- 检查日志：`sudo docker logs chroma`

### Q2：数据没有持久化，重启后丢失
- 确认 `-v /opt/chroma/data:/chroma/chroma` 已挂载
- 确认 `IS_PERSISTENT=TRUE` 已设置
- 确认数据目录权限正确：`sudo chown -R 1000:1000 /opt/chroma/data`

### Q3：客户端提示 Chroma 连接失败
- 从客户端电脑 `curl http://服务器IP:8000/api/v1/heartbeat` 测试
- 确认客户端填写的 endpoint 没有多余斜杠或 `/api/v1`
- 确认服务器防火墙放行

### Q4：Chroma 占用内存过大
- 限制容器内存：Docker 启动时加 `--memory=4g`
- 定期清理不再使用的 collection

### Q5：需要 HTTPS
- 前面加 Nginx 反向代理
- 或者内部使用，直接 HTTP 即可

---

## 九、推荐生产配置

```bash
# 创建数据目录并授权
sudo mkdir -p /opt/chroma/data
sudo chown -R 1000:1000 /opt/chroma/data

# 运行（带内存限制和重启策略）
sudo docker run -d \
  --name chroma \
  --memory=8g \
  --memory-swap=8g \
  -p 8000:8000 \
  -v /opt/chroma/data:/chroma/chroma \
  -e IS_PERSISTENT=TRUE \
  -e PERSIST_DIRECTORY=/chroma/chroma \
  -e ANONYMIZED_TELEMETRY=FALSE \
  --restart unless-stopped \
  chromadb/chroma:latest
```

---

## 十、相关命令速查

| 操作 | 命令 |
|------|------|
| 查看状态 | `sudo docker ps \| grep chroma` |
| 查看日志 | `sudo docker logs -f chroma` |
| 重启服务 | `sudo docker restart chroma` |
| 停止服务 | `sudo docker stop chroma` |
| 进入容器 | `sudo docker exec -it chroma /bin/sh` |
| 测试心跳 | `curl http://localhost:8000/api/v1/heartbeat` |
| 查看版本 | `sudo docker exec chroma pip show chromadb` |

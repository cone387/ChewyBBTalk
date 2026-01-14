# ChewyBBTalk 部署指南

本项目提供两种部署方式，您可以根据需求选择：

## 🚀 部署方式对比

| 特性 | 单容器部署 | Docker Compose 多容器 |
|------|-----------|---------------------|
| **复杂度** | 简单 | 中等 |
| **资源占用** | 低 | 中 |
| **可扩展性** | 低 | 高 |
| **维护性** | 中 | 高 |
| **适用场景** | 小型项目、测试环境 | 生产环境、大规模部署 |

---

## 📦 方式一：单容器部署

所有服务（Django + 前端 + Nginx + Authelia）运行在同一个容器中。

### 1. 准备工作

```bash
cd deploy/single-container

# 复制环境变量文件
cp .env.example .env

# 编辑 .env 文件，修改以下配置：
# - SECRET_KEY: Django 密钥
# - AUTHELIA_SESSION_SECRET: Authelia session 密钥
# - AUTHELIA_ENCRYPTION_KEY: Authelia 加密密钥（至少20个字符）
vi .env
```

### 2. 修改 Authelia 用户密码

```bash
# 生成新密码的 hash
docker run --rm authelia/authelia:latest \
  authelia crypto hash generate argon2 --password 'your-new-password'

# 将生成的 hash 复制到 authelia/users_database.yml 中
vi authelia/users_database.yml
```

### 3. 构建并启动

```bash
# 构建镜像
docker-compose build

# 启动服务
docker-compose up -d

# 查看日志
docker-compose logs -f
```

### 4. 访问应用

- **前端应用**: http://localhost
- **Authelia 登录**: http://localhost/authelia/
- **默认账号**: admin / password（请立即修改）

### 5. 数据持久化

数据存储在以下目录：
- `./data/media/` - 媒体文件
- `./data/db/` - SQLite 数据库
- `./data/authelia/` - Authelia 数据
- `./logs/` - 日志文件

---

## 🐳 方式二：Docker Compose 多容器部署

各服务独立运行在单独的容器中，便于扩展和维护。

### 1. 准备工作

```bash
cd deploy/docker-compose

# 复制环境变量文件
cp .env.example .env

# 编辑配置
vi .env
```

### 2. 修改 Authelia 配置

```bash
# 编辑 Authelia 配置文件
vi authelia/configuration.yml

# 重点修改以下配置：
# - session.secret
# - session.domain（改为你的域名）
# - storage.encryption_key

# 修改用户密码
vi authelia/users_database.yml
```

### 3. 启动服务

```bash
# 启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f authelia
docker-compose logs -f backend
```

### 4. 服务端口

- **Nginx (前端)**: 80 (HTTP), 443 (HTTPS)
- **Backend**: 8000 (内部)
- **Authelia**: 9091 (内部)
- **Frontend**: 80 (内部)

### 5. 健康检查

```bash
# 检查所有服务健康状态
docker-compose ps

# 测试 API
curl http://localhost/api/v1/bbtalk/

# 测试 Authelia
curl http://localhost/authelia/
```

---

## 🔐 安全配置

### 生产环境必须修改的配置

1. **Django SECRET_KEY**
   ```bash
   # 生成随机密钥
   python -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'
   ```

2. **Authelia Session Secret**
   ```bash
   # 生成随机字符串（至少32个字符）
   openssl rand -base64 32
   ```

3. **Authelia Encryption Key**
   ```bash
   # 生成随机字符串（至少20个字符）
   openssl rand -base64 24
   ```

4. **修改默认用户密码**
   ```bash
   # 生成密码 hash
   docker run --rm authelia/authelia:latest \
     authelia crypto hash generate argon2 --password 'your-secure-password'
   ```

---

## 🌐 域名和 HTTPS 配置

### 配置域名

1. **单容器部署**: 修改 `nginx.conf` 中的 `server_name`
2. **多容器部署**: 修改 `nginx/nginx.conf` 和 `authelia/configuration.yml` 中的域名

### 启用 HTTPS

#### 使用 Let's Encrypt（推荐）

```bash
# 安装 certbot
apt-get install certbot python3-certbot-nginx

# 获取证书
certbot --nginx -d your-domain.com

# 自动续期
certbot renew --dry-run
```

#### 手动配置证书

1. 将证书文件放到 `nginx/ssl/` 目录
2. 修改 `nginx/nginx.conf`，取消注释 HTTPS server 部分
3. 重启 nginx

---

## 📊 监控和维护

### 查看日志

```bash
# 单容器部署
docker-compose logs -f

# 多容器部署 - 所有服务
docker-compose logs -f

# 多容器部署 - 特定服务
docker-compose logs -f backend
docker-compose logs -f authelia
```

### 备份数据

```bash
# 单容器部署
tar -czf backup-$(date +%Y%m%d).tar.gz ./data

# 多容器部署
docker-compose exec backend python manage.py dumpdata > backup.json
tar -czf backup-$(date +%Y%m%d).tar.gz backup.json
```

### 更新服务

```bash
# 拉取最新代码
git pull

# 重新构建并启动
docker-compose build
docker-compose up -d

# 运行数据库迁移
docker-compose exec backend python manage.py migrate
```

---

## 🔧 故障排查

### 常见问题

1. **无法访问服务**
   - 检查防火墙规则
   - 检查端口是否被占用：`netstat -tlnp | grep :80`
   - 查看容器日志：`docker-compose logs`

2. **认证失败**
   - 检查 Authelia 配置文件
   - 确认用户密码 hash 是否正确
   - 查看 Authelia 日志：`docker-compose logs authelia`

3. **API 无法访问**
   - 检查 Backend 服务状态
   - 确认 nginx 配置中的代理设置
   - 测试后端健康检查：`curl http://localhost:8000/api/v1/bbtalk/`

4. **数据库连接失败**
   - 检查 DATABASE_URL 配置
   - 确认数据库服务是否运行
   - 查看后端日志

---

## 📚 其他资源

- [Authelia 官方文档](https://www.authelia.com/docs/)
- [Django 部署检查清单](https://docs.djangoproject.com/en/stable/howto/deployment/checklist/)
- [Nginx 配置最佳实践](https://www.nginx.com/resources/wiki/start/)

---

## 💡 生产环境建议

1. ✅ 使用 PostgreSQL 替代 SQLite
2. ✅ 启用 HTTPS
3. ✅ 配置日志轮转
4. ✅ 设置自动备份
5. ✅ 使用 LDAP 或外部认证后端
6. ✅ 配置邮件通知
7. ✅ 设置监控告警
8. ✅ 使用 CDN 加速静态资源

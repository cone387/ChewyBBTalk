# ChewyBBTalk 后端

Django 5.2 + DRF 的碎碎念后端服务。

## 本地开发

```bash
# 安装依赖
cd backend
uv sync

# 数据库迁移
uv run python chewy_space/manage.py migrate

# 初始化管理员（admin / admin123）
uv run python chewy_space/manage.py init_system

# 将历史明文 S3 密钥回填为加密值（可重复执行，不修改管理员密码）
uv run python chewy_space/manage.py encrypt_storage_secrets

# 创建所有用户的 ZIP 备份（默认写入 DATA_DIR/backups，每用户保留 7 份）
uv run python chewy_space/manage.py backup_data

# 只备份指定用户并保留 14 份；可先用 --dry-run 预览
uv run python chewy_space/manage.py backup_data --user-id 1 --keep 14 --dry-run

# 启动开发服务器
uv run python chewy_space/manage.py runserver 0.0.0.0:8020
```

或者用项目根目录的脚本一键启动：

```bash
./start_backend.sh
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | 数据库连接 | `sqlite:///db.sqlite3` |
| `DEBUG` | 调试模式 | `True` |
| `SECRET_KEY` | Django Secret Key | 自动生成并持久化 |
| `ALLOWED_HOSTS` | 允许的主机 | `*` |
| `ADMIN_USERNAME` | 初始管理员用户名 | `admin` |
| `ADMIN_PASSWORD` | 初始管理员密码 | `admin123` |

S3 Secret Access Key 会以 `enc:v1:` 格式加密存储，密钥由 `SECRET_KEY` 派生。请保持生产环境的 `SECRET_KEY` 稳定；历史明文配置可按上面的命令手动回填，管理员密码策略不受影响。

支持 SQLite、PostgreSQL、MySQL，通过 `DATABASE_URL` 切换：

```bash
# PostgreSQL
DATABASE_URL=postgresql://user:pass@localhost:5432/chewybbtalk

# MySQL
DATABASE_URL=mysql://user:pass@localhost:3306/chewybbtalk
```

## API 文档

启动后访问 Swagger UI 查看完整 API 文档：

- http://localhost:8020/api/schema/swagger-ui/
- http://localhost:8020/api/schema/redoc/

## 项目结构

```
backend/
├── chewy_space/
│   ├── bbtalk/            # 核心业务模块
│   │   ├── models.py        # User、BBTalk、Tag、Attachment 模型
│   │   ├── views.py         # API 视图
│   │   ├── serializers.py   # 序列化器
│   │   ├── authentication.py # JWT + Session 认证
│   │   ├── storage_provider.py # 用户自定义 S3 存储
│   │   ├── data_export.py   # 数据导出
│   │   └── data_import.py   # 数据导入
│   ├── chewy_space/       # Django 配置
│   │   ├── settings.py      # 统一配置（环境变量驱动）
│   │   └── urls.py          # 路由
│   └── manage.py
├── pyproject.toml         # 依赖配置
└── Dockerfile
```

## 运行测试

```bash
uv run python chewy_space/manage.py test bbtalk
```

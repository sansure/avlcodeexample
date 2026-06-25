# ac-cloudflare-r2-d1-gist

基于 **Cloudflare Workers + D1 + R2** 的 Gist 代码片段分享服务。

## 功能特性

- 📝 **创建 Gist** — 支持标题、描述、多个文件
- 🔗 **短链接 ID** — 自动生成 8 位字母数字 ID
- 🔒 **公开/私有** — 私有 Gist 需要 `secret_key` 才能查看/更新/删除
- ⏱ **过期时间** — 可设置 1-365 天，默认 30 天，到期自动清理
- 💾 **R2 存储内容** — key 格式为 `gists/{gist_id}/{filename}`
- 🗄 **D1 存储元数据** — 包含 `gists`、`gist_files`、`r2_quota`、`d1_quota` 表
- 📊 **配额统计与限制** — R2 Class A/B、存储，D1 读写删统一统计
- 🧹 **Cron 清理** — 每天自动清理过期 Gist
- 🌐 **HTML 展示页 / Raw 页 / REST API**

## 技术栈

| 组件 | 用途 |
|------|------|
| **Cloudflare Workers** | 边缘计算，处理请求 |
| **Cloudflare D1** | 元数据、文件索引、配额统计 |
| **Cloudflare R2** | 文件内容持久化存储 |
| **Cron Triggers** | 每日清理过期数据 |

## 目录结构

```
.
├── src/
│   └── index.js      # 单文件 Worker 入口（含配额管理器）
├── schema.sql        # D1 数据库表结构
├── wrangler.toml     # Wrangler 配置
├── package.json      # 项目配置
└── README.md         # 本文档
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 D1 数据库

```bash
wrangler d1 create gistdb
```

将返回的 `database_id` 填入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "gistdb"
database_id = "your-database-id"
```

### 3. 创建 R2 存储桶

在 Cloudflare Dashboard 创建 R2 存储桶（如 `ac-gist-storage`），然后在 `wrangler.toml` 中绑定：

```toml
[[r2_buckets]]
binding = "GIST_BUCKET"
bucket_name = "ac-gist-storage"
```

### 4. 初始化数据库

本地开发：

```bash
npm run db:migrate
```

远程部署：

```bash
npm run db:migrate:remote
```

### 5. 本地开发

```bash
npm run dev
```

### 6. 部署

```bash
npm run deploy
```

## 集成到主项目

本项目可独立部署，也可集成到 `avlcodeexample` 主项目统一部署。

### 集成方式

1. 在 `avlcodeexample/routes.config.js` 中添加：

```js
{
  name: "gist",
  dir: "ac-cloudflare-r2-d1-gist",
  route: "/gist/",
  description: "基于 Cloudflare Workers + D1 + R2 的 Gist 代码片段分享服务",
}
```

2. 在 `avlcodeexample/schema.sql` 中执行本项目的 `schema.sql` 语句（创建 gists、gist_files、r2_quota、d1_quota 表）。

3. 主项目 `wrangler.toml` 已包含 `AVLCODEDB` 和 `AVLCODE_BUCKET` 绑定，本子项目会自动识别并使用它们。

4. 运行主项目构建脚本：

```bash
cd avlcodeexample
npm run build
npm run deploy
```

## 配额机制（所有项目共用）

本项目内置统一的 `QuotaManager`，用于统计和限制 D1/R2 使用：

### R2 免费额度

| 类型 | 操作 | 限额 |
|------|------|------|
| Class A | PUT / DELETE / LIST | 900,000 次/月 |
| Class B | GET / HEAD | 9,000,000 次/月 |
| Storage | 总存储量 | 8 GB |

### D1 免费额度（参考）

| 类型 | 操作 | 限额 |
|------|------|------|
| Reads | SELECT | 100,000,000 行/天 |
| Writes | INSERT / UPDATE | 1,000,000 行/天 |
| Deletes | DELETE | 1,000,000 行/天 |

### 配额表

- `r2_quota`：按月统计 R2 Class A/B 操作次数和存储字节数
- `d1_quota`：按天统计 D1 读/写/删操作次数

每次 R2 操作前会检查配额，超限时返回 `429 Too Many Requests`。

## API 文档

### 创建 Gist

```http
POST /api/gists
Content-Type: application/json

{
  "title": "My Gist",
  "description": "A sample gist",
  "is_public": true,
  "days": 30,
  "files": [
    { "filename": "hello.js", "content": "console.log('hello');" },
    { "filename": "readme.md", "content": "# Hello" }
  ]
}
```

响应：

```json
{
  "id": "a1b2c3d4",
  "secret_key": "...",
  "title": "My Gist",
  "description": "A sample gist",
  "is_public": true,
  "expires_at": "2026-07-24T02:00:00.000Z",
  "files": [
    { "filename": "hello.js", "content_type": "application/javascript", "size": 24 },
    { "filename": "readme.md", "content_type": "text/markdown", "size": 7 }
  ]
}
```

### 获取 Gist

```http
GET /api/gists/{id}
# 私有 Gist 需要：
GET /api/gists/{id}?secret_key=xxx
```

### 更新 Gist

```http
PUT /api/gists/{id}?secret_key=xxx
Content-Type: application/json

{
  "title": "Updated Title",
  "files": [
    { "filename": "hello.js", "content": "console.log('world');" }
  ]
}
```

### 删除 Gist

```http
DELETE /api/gists/{id}?secret_key=xxx
```

### 列出公开 Gist

```http
GET /api/gists?limit=20&offset=0
```

### 查看原始文件

```http
GET /raw/{id}/{filename}
```

### HTML 页面

- 首页：`GET /`
- Gist 展示页：`GET /{id}`
- Raw 内容页：`GET /raw/{id}/{filename}`

## Cron 清理

`wrangler.toml` 中配置了每天 UTC 02:00 执行清理任务：

```toml
[[triggers]]
crons = ["0 2 * * *"]
```

清理任务会：

1. 查询所有已过期的 Gist
2. 删除对应的 R2 对象
3. 删除 D1 中的元数据
4. 校准 R2 存储配额

本地手动触发：

```bash
npm run cleanup
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `BASE_URL` | 站点基础 URL | 自动从请求推断 |
| `MAX_CONTENT_SIZE` | 单个文件大小限制（字节） | 1048576 (1MB) |
| `DEFAULT_TTL_DAYS` | 默认保留天数 | 30 |

## 注意事项

- `secret_key` 仅在创建时返回，请妥善保存
- 私有 Gist 可通过 URL 参数 `?secret_key=xxx` 或请求头 `X-Secret-Key: xxx` 访问
- 配额统计按月/按天重置，可在 D1 中查询 `r2_quota` 和 `d1_quota` 表

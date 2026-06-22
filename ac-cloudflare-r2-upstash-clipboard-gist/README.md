# ac-cloudflare-r2-upstash-clipboard-gist

基于 **Cloudflare Workers + R2 + Upstash Redis** 的云端剪贴板与代码片段分享服务。

## 功能

- 📋 **创建分享** — 粘贴文本/代码，生成短链接
- 🔗 **查看分享** — 通过 `https://worker/slug` 访问
- 📄 **原始内容** — `GET /raw/:slug` 返回纯文本
- 🏷️ **语言标识** — 可选标注代码语言（如 javascript, python, go）
- 📊 **浏览计数** — 自动记录浏览次数
- ⏱ **过期时间** — 自定义保留天数（1-365天）
- 📑 **最近分享** — 首页展示最近 20 条分享
- 📋 **一键复制** — 查看页支持复制到剪贴板

## 技术栈

| 组件 | 用途 |
|------|------|
| **Cloudflare Workers** | 无服务器边缘计算，处理 API 请求 |
| **Cloudflare R2** | 持久化存储内容（大文件） |
| **Upstash Redis** | 元数据索引、浏览计数、最近列表 |

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 配置 R2 存储桶

在 Cloudflare Dashboard 创建 R2 存储桶（如 `ac-clipboard-gist`），然后在 `wrangler.toml` 中绑定：

```toml
[[r2_buckets]]
binding = "CLIPBOARD_BUCKET"
bucket_name = "ac-clipboard-gist"
```

3. 配置 Upstash Redis

在 [Upstash Console](https://console.upstash.com) 创建 Redis 实例，获取 REST URL 和 Token，添加到 `wrangler.toml`：

```toml
[vars]
UPSTASH_REDIS_REST_URL = "https://your-name.upstash.io"
UPSTASH_REDIS_REST_TOKEN = "your-token"
```

4. 本地开发

```bash
npm run dev
```

5. 部署

```bash
npm run deploy
```

## API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 前端页面 |
| POST | `/api/create` | 创建分享（JSON body: `{content, lang?, days?}`） |
| GET | `/raw/:slug` | 获取原始内容 |
| GET | `/api/meta/:slug` | 获取元数据 |
| GET | `/api/recent` | 最近分享列表 |

## 目录结构

```
.
├── src/
│   ├── index.js      # Worker 入口与前端页面
│   └── store.js      # Upstash Redis / R2 / 内存存储封装
├── package.json
├── wrangler.toml
└── README.md
```

## 说明

- 未配置 Upstash 时回退到内存存储（仅适合本地开发，重启丢失）
- 未配置 R2 时，小内容（<50KB）存储在 Redis 中，大内容需要 R2
- 默认保留 30 天，可通过 `days` 参数自定义（1-365）
# ac-memfire-cloud-counter

基于 **Memfire Cloud + Cloudflare Workers + Upstash Redis** 的免费访问计数器服务。

## 功能

- `/` — 计数器展示页面
- `POST /api/count?path=/foo` — 增加计数（按总访问量、今日、本小时、页面路径聚合）
- `GET /api/count` — 查询当前计数
- `GET /api/stats` — 查询完整统计（含页面路径分布）
- 支持 CORS，可嵌入任意静态站点

## 技术栈

- **Cloudflare Workers**：无服务器边缘计算
- **Upstash Redis**：免费 Serverless Redis，用于实时计数
- **Memfire Cloud**（可选）：免费 PostgreSQL，用于持久化历史数据

## 快速开始

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

复制 `wrangler.toml` 中的注释变量，填入你的 Upstash Redis REST URL 和 Token：

```toml
[vars]
UPSTASH_REDIS_REST_URL = "https://your-name.upstash.io"
UPSTASH_REDIS_REST_TOKEN = "your-token"
```

3. 本地开发

```bash
npm run dev
```

4. 部署

```bash
npm run deploy
```

## 前端嵌入示例

```html
<script>
fetch('https://your-worker.your-subdomain.workers.dev/api/count?path=' + encodeURIComponent(location.pathname), {
  method: 'POST'
});
</script>
```

## 目录结构

```
.
├── src/
│   ├── index.js      # Worker 入口与前端页面
│   └── counter.js    # Upstash Redis / 内存存储封装
├── package.json
├── wrangler.toml
└── README.md
```

## 说明

- 若未配置 Upstash，计数器将回退到内存存储（仅当前 Worker 实例有效，重启清零，仅适合本地测试）。
- Memfire Cloud 集成待后续扩展，当前版本以 Upstash Redis 为主存储。

# AVL Code 示例工程集合

基于 Cloudflare Workers 边缘部署的示例工程集合。

## 项目列表

| 项目 | 路径 | 说明 |
|------|------|------|
| Gist 代码片段 | `/gist/` | 基于 D1 + R2 的代码片段分享 |
| AC 审稿小工具 | `/review/` | 稿件提交、分配审稿人、审稿意见与附件管理 |

## 本地开发

### 环境要求

- Node.js 20+
- 全局 `npm`（若沙箱环境没有，见下方「无全局 npm」方案）

### 标准启动

```bash
npm install
npm run db:migrate
npm run build
npm run dev
```

访问：

- 主站：`http://localhost:8902/`
- 审稿工具：`http://localhost:8902/review/`
- Gist：`http://localhost:8902/gist/`

### 无全局 npm 环境

当前仓库已内置本地 Node（`.node/bin/node`），可直接运行：

```bash
.node/bin/node scripts/migrate-local.js   # D1 本地迁移
.node/bin/node scripts/build-local.js     # 合并子项目
.node/bin/node scripts/dev-local.js 8902  # 启动 dev 服务器
```

如果端口 `8902` 被占用，换一个端口即可：

```bash
.node/bin/node scripts/dev-local.js 8903
```

## 审稿小工具登录

访问 `http://localhost:8902/review/`，使用默认 Token 登录：

- `admin` — 管理员
- `reviewer01` ~ `reviewer09` — 审稿人
- `submitter01` ~ `submitter09` — 投稿人

调试端点：`GET /review/api/debug/login?token=xxx`

## 部署

```bash
npm run deploy
```

需要配置 `credentials.json`（参考 `credentials.example.json`）。

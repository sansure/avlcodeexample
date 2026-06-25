# avlcodeexample

AVL Code 示例工程集合，用于沉淀各类工具、系统与代码示例。基于 Cloudflare Workers 部署，支持 D1 数据库与 R2 对象存储。

## 子项目列表

| 序号 | 目录 | 说明 |
|------|------|------|
| 1 | `ac-review-tool` | ac 审稿小工具 |
| 2 | `ac-avlcode-access-log-scheduler` | ac 定时处理 avlcode 的访问日志 |
| 3 | `ac-multimodal-code-examples` | ac 多模态代码示例 |
| 4 | `ac-website-cms` | ac 制作网站内容发布系统 |
| 5 | `ac-avl-user-feedback` | ac 制作 avl 用户反馈系统 |
| 6 | `ac-cloudflare-r2-d1-gist` | 基于 Cloudflare Workers + D1 + R2 的 Gist 代码片段分享服务 |
| 7 | `ac-roundtable-remake` | ac 重制圆桌会议 |
| 8 | `ac-memfire-cloud-counter` | ac 制作 memfire cloud + cloudflare worker + upstash 免费计数器 |
| 9 | `ac-zhijia-performance-analysis` | ac 审查智甲代码，定位卡顿瓶颈 |
| 10 | `ac-serial-number-generator` | ac 自动生成序列号系统与验证系统 |

---

## 本地开发环境

### 前置要求

- Node.js 18+
- npm 或 pnpm

### 安装依赖

```bash
npm install
```

### 初始化本地 D1 数据库

```bash
npm run db:migrate
```

### 启动本地开发服务器

```bash
npm run dev
```

启动后监听 `0.0.0.0:8902`，可通过以下地址访问：

- http://localhost:8902
- http://127.0.0.1:8902
- http://10.254.28.19:8902

> 注意：由于当前 Docker 环境中 8900/8901 端口被占用，因此使用 8902 端口。如需修改端口，请编辑 `package.json` 中的 `dev` 脚本。

---

## 本地模拟测试（无需 Cloudflare 账号）

项目内置了基于 Miniflare 的本地模拟测试脚本，可在不部署到 Cloudflare 的情况下验证 Worker 逻辑：

```bash
npm run test:local
```

该脚本会：
1. 使用 Miniflare 启动本地 Worker 模拟环境；
2. 自动初始化 D1 数据库（执行 `schema.sql`）；
3. 模拟 R2 存储桶；
4. 测试首页、Gist 首页、API 接口、Gist 创建/查看/Raw 文件/列表等功能。

> 注意：`src/routes/` 是构建生成的目录，运行测试前请确保已执行 `npm run build` 或测试脚本已包含最新子项目代码。

---

## API 接口

### 项目列表

```bash
curl http://10.254.28.19:8902/api/projects
```

### R2 文件操作

```bash
# 列出文件
curl http://10.254.28.19:8902/api/files

# 上传文件
curl -X PUT http://10.254.28.19:8902/api/files/test.txt \
  -H "Content-Type: text/plain" \
  -d "hello r2"

# 读取文件
curl http://10.254.28.19:8902/api/files/test.txt

# 删除文件
curl -X DELETE http://10.254.28.19:8902/api/files/test.txt
```

---

## 部署

### 配置 Cloudflare 凭证

1. 复制示例文件：
   ```bash
   cp credentials.example.json credentials.json
   ```

2. 编辑 `credentials.json`，填入你的 Cloudflare Account ID 和 API Token：
   ```json
   {
     "account_id": "your-cloudflare-account-id",
     "api_token": "your-cloudflare-api-token"
   }
   ```

   - `credentials.json` 已被 `.gitignore` 忽略，不会提交到 Git 仓库。
   - 获取 API Token：https://developers.cloudflare.com/fundamentals/api/get-started/create-token/

### 执行部署

```bash
npm run deploy
```

> 注意：Cloudflare Workers 不会自动从 GitHub 拉取部署，需要手动执行 `npm run deploy` 或配置 CI/CD。

---

*创建时间：2026-06-22*

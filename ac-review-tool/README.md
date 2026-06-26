# ac-review-tool

基于 Cloudflare Workers + D1 + R2 的审稿小工具。

## 功能

- 稿件管理：创建、列表、详情、编辑、删除
- 审稿流程：管理员分配审稿人，审稿人提交意见与评分
- 多轮审稿：保留完整审稿历史，支持版本迭代
- 附件管理：上传/下载/删除图片、PDF、Word 等附件
- 角色权限：投稿人、审稿人、管理员
- 统计面板：个人看板与全局状态统计
- 评语模板：常用审稿评语快速复用

## 共享配额

本工具与 `ac-cloudflare-r2-d1-gist` 共享同一个 D1 数据库与 R2 存储桶，复用 `r2_quota` 与 `d1_quota` 配额表，统一限制 R2/D1 使用量，超限时提示用户。

## 本地开发

**注意：首次运行前必须先执行数据库迁移，否则会出现 `D1_ERROR: no such table: review_users`。**

### 标准方式（全局 npm 可用时）

```bash
cd avlcodeexample
npm install
npm run db:migrate
npm run dev
```

访问 `http://localhost:8902/review/`。

### 沙箱/无全局 npm 环境

如果当前环境没有全局 `npm`/`node`，请使用根目录的本地 Node 脚本：

```bash
cd avlcodeexample
.node/bin/node scripts/migrate-local.js
.node/bin/node scripts/build-local.js
.node/bin/node scripts/dev-local.js [端口]
```

- `dev-local.js` 默认端口 `8902`，可通过参数指定其他端口（如 `8903`）
- 若提示端口被占用，换一个端口即可

## 默认登录 Token

| Token | 角色 | 说明 |
|-------|------|------|
| `admin` | 管理员 | 拥有全部权限 |
| `reviewer01` ~ `reviewer09` | 审稿人 | 可审稿、评分 |
| `submitter01` ~ `submitter09` | 投稿人 | 可创建/管理自己的稿件 |

## 调试端点

`GET /review/api/debug/login?token=xxx` — 返回数据库状态、用户查询结果等调试信息。

## 集成到主项目

主项目 `avlcodeexample` 的 `routes.config.js` 已配置本工具，运行 `npm run build` 后会自动合并到根目录 Worker，通过 `/review/` 访问。

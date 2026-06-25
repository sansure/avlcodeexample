/**
 * ac-review-tool
 * 基于 Cloudflare Workers + D1 + R2 的审稿小工具
 *
 * 特性：
 * - 稿件创建、列表、详情、编辑、删除
 * - 审稿流程：分配审稿人、提交审稿意见、多轮历史
 * - 附件上传/下载/删除（R2）
 * - 角色权限（submitter/reviewer/admin）
 * - 统计面板
 * - 常用审稿评语模板
 *
 * 与 ac-cloudflare-r2-d1-gist 共享 D1/R2 配额表与配额管理类。
 */

// ==================== 配置 ====================
const CONFIG = {
  MAX_CONTENT_SIZE: parseInt(globalThis.MAX_CONTENT_SIZE || "10485760", 10),
  MAX_ATTACHMENT_SIZE: parseInt(globalThis.MAX_ATTACHMENT_SIZE || "10485760", 10),
  R2_KEY_PREFIX: "reviews/",
  R2_CLASS_A_MONTHLY: 900_000,
  R2_CLASS_B_MONTHLY: 9_000_000,
  R2_STORAGE_BYTES: 8 * 1024 * 1024 * 1024,
  D1_READS_DAILY: 100_000_000,
  D1_WRITES_DAILY: 1_000_000,
  D1_DELETES_DAILY: 1_000_000,
  TOKEN_COOKIE: "review_token",
  DEFAULT_PAGE_SIZE: 10,
  STATUSES: {
    pending: "待审",
    reviewing: "审核中",
    approved: "已通过",
    rejected: "已拒绝",
    revising: "需修改",
  },
  ROLES: {
    submitter: "投稿人",
    reviewer: "审稿人",
    admin: "管理员",
  },
};

// ==================== 工具函数 ====================
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Cookie",
      ...extraHeaders,
    },
  });
}

function html(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function text(body, status = 200, extraHeaders = {}) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      ...extraHeaders,
    },
  });
}

function corsPreflight() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Cookie",
    },
  });
}

function getDb(env) {
  return env.DB || env.AVLCODEDB;
}

function getBucket(env) {
  return env.REVIEW_BUCKET || env.AVLCODE_BUCKET || env.GIST_BUCKET;
}

function generateId(length = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < length; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function generateAttachmentId() {
  return "att-" + generateId(12);
}

function getMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getDayKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function normalizeUrl(url) {
  const prefix = "/review";
  if (url.pathname === prefix) {
    url.pathname = "/";
  } else if (url.pathname.startsWith(prefix + "/")) {
    url.pathname = url.pathname.slice(prefix.length) || "/";
  }
  return url;
}

function parseCookieHeader(header) {
  const cookies = {};
  if (!header) return cookies;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key) cookies[key] = rest.join("=").trim();
  }
  return cookies;
}

function setCookieHeader(name, value, options = {}) {
  const parts = [`${name}=${value}`];
  if (options.maxAge) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join("; ");
}

function clearCookieHeader(name, path = "/") {
  return `${name}=; Path=${path}; Max-Age=0; HttpOnly; SameSite=Lax`;
}

function nowIso() {
  return new Date().toISOString();
}

function guessContentType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const map = {
    js: "application/javascript",
    json: "application/json",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    md: "text/markdown",
    txt: "text/plain",
    pdf: "application/pdf",
    doc: "application/msword",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    xls: "application/vnd.ms-excel",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    webp: "image/webp",
  };
  return map[ext] || "application/octet-stream";
}

// ==================== 配额管理器（与 gist 项目共用机制） ====================
class QuotaError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "QuotaError";
    this.code = code;
  }
}

class QuotaManager {
  constructor(db, bucket) {
    this.db = db;
    this.bucket = bucket;
    this.month = getMonthKey();
    this.day = getDayKey();
    this.r2Quota = null;
    this.d1Quota = null;
    this.pending = {
      r2ClassA: 0,
      r2ClassB: 0,
      r2Storage: 0,
      d1Reads: 0,
      d1Writes: 0,
      d1Deletes: 0,
    };
    this.flushed = false;
  }

  async init() {
    if (!this.db) return;
    await this.loadR2Quota();
    await this.loadD1Quota();
  }

  async loadR2Quota() {
    const id = `r2:${this.month}`;
    let row = await this.db.prepare("SELECT * FROM r2_quota WHERE id = ?").bind(id).first();
    if (!row) {
      row = { id, month: this.month, class_a_count: 0, class_b_count: 0, storage_bytes: 0 };
    }
    this.r2Quota = row;
  }

  async loadD1Quota() {
    const id = `d1:${this.day}`;
    let row = await this.db.prepare("SELECT * FROM d1_quota WHERE id = ?").bind(id).first();
    if (!row) {
      row = { id, day: this.day, reads: 0, writes: 0, deletes: 0 };
    }
    this.d1Quota = row;
  }

  checkR2ClassA(cost = 1) {
    if (!this.db) return true;
    return this.r2Quota.class_a_count + this.pending.r2ClassA + cost <= CONFIG.R2_CLASS_A_MONTHLY;
  }

  recordR2ClassA(cost = 1) {
    this.pending.r2ClassA += cost;
  }

  checkR2ClassB(cost = 1) {
    if (!this.db) return true;
    return this.r2Quota.class_b_count + this.pending.r2ClassB + cost <= CONFIG.R2_CLASS_B_MONTHLY;
  }

  recordR2ClassB(cost = 1) {
    this.pending.r2ClassB += cost;
  }

  checkR2Storage(additionalBytes = 0) {
    if (!this.db) return true;
    return this.r2Quota.storage_bytes + this.pending.r2Storage + additionalBytes <= CONFIG.R2_STORAGE_BYTES;
  }

  recordR2Storage(deltaBytes) {
    this.pending.r2Storage += deltaBytes;
  }

  checkD1Read(cost = 1) {
    if (!this.db) return true;
    return this.d1Quota.reads + this.pending.d1Reads + cost <= CONFIG.D1_READS_DAILY;
  }

  recordD1Read(cost = 1) {
    this.pending.d1Reads += cost;
  }

  checkD1Write(cost = 1) {
    if (!this.db) return true;
    return this.d1Quota.writes + this.pending.d1Writes + cost <= CONFIG.D1_WRITES_DAILY;
  }

  recordD1Write(cost = 1) {
    this.pending.d1Writes += cost;
  }

  checkD1Delete(cost = 1) {
    if (!this.db) return true;
    return this.d1Quota.deletes + this.pending.d1Deletes + cost <= CONFIG.D1_DELETES_DAILY;
  }

  recordD1Delete(cost = 1) {
    this.pending.d1Deletes += cost;
  }

  async flush() {
    if (!this.db || this.flushed) return;
    this.flushed = true;
    const now = nowIso();

    try {
      if (this.pending.r2ClassA || this.pending.r2ClassB || this.pending.r2Storage) {
        await this.db
          .prepare(
            `INSERT INTO r2_quota (id, month, class_a_count, class_b_count, storage_bytes, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               class_a_count = class_a_count + excluded.class_a_count,
               class_b_count = class_b_count + excluded.class_b_count,
               storage_bytes = storage_bytes + excluded.storage_bytes,
               updated_at = excluded.updated_at`
          )
          .bind(
            this.r2Quota.id,
            this.r2Quota.month,
            this.pending.r2ClassA,
            this.pending.r2ClassB,
            this.pending.r2Storage,
            now
          )
          .run();
      }

      if (this.pending.d1Reads || this.pending.d1Writes || this.pending.d1Deletes) {
        await this.db
          .prepare(
            `INSERT INTO d1_quota (id, day, reads, writes, deletes, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               reads = reads + excluded.reads,
               writes = writes + excluded.writes,
               deletes = deletes + excluded.deletes,
               updated_at = excluded.updated_at`
          )
          .bind(
            this.d1Quota.id,
            this.d1Quota.day,
            this.pending.d1Reads,
            this.pending.d1Writes,
            this.pending.d1Deletes,
            now
          )
          .run();
      }
    } catch (err) {
      console.error("Failed to flush quota:", err);
    }
  }
}

// ==================== R2 存储层（带配额检查） ====================
class R2Store {
  constructor(bucket, quota) {
    this.bucket = bucket;
    this.quota = quota;
  }

  async put(key, body, metadata = {}) {
    const bytes = body.byteLength || 0;
    if (!this.quota.checkR2ClassA(1)) throw new QuotaError("R2 Class A quota exceeded", "R2_CLASS_A_EXCEEDED");
    if (!this.quota.checkR2Storage(bytes)) throw new QuotaError("R2 storage quota exceeded", "R2_STORAGE_EXCEEDED");
    await this.bucket.put(key, body, metadata);
    this.quota.recordR2ClassA(1);
    this.quota.recordR2Storage(bytes);
  }

  async get(key) {
    if (!this.quota.checkR2ClassB(1)) throw new QuotaError("R2 Class B quota exceeded", "R2_CLASS_B_EXCEEDED");
    const obj = await this.bucket.get(key);
    this.quota.recordR2ClassB(1);
    return obj;
  }

  async delete(key) {
    if (!this.quota.checkR2ClassA(1)) throw new QuotaError("R2 Class A quota exceeded", "R2_CLASS_A_EXCEEDED");
    await this.bucket.delete(key);
    this.quota.recordR2ClassA(1);
  }
}


// ==================== 认证与权限 ====================
async function getCurrentUser(request, env, quota) {
  const db = getDb(env);
  if (!db) return null;

  const cookies = parseCookieHeader(request.headers.get("Cookie"));
  const token = cookies[CONFIG.TOKEN_COOKIE];
  if (!token) return null;

  if (!quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
  const user = await db.prepare("SELECT * FROM review_users WHERE token = ?").bind(token).first();
  quota.recordD1Read(1);
  return user || null;
}

function requireAuth(user) {
  if (!user) {
    const err = new Error("请先登录");
    err.code = "AUTH_REQUIRED";
    throw err;
  }
}

function requireRole(user, roles) {
  requireAuth(user);
  if (!roles.includes(user.role)) {
    const err = new Error("权限不足");
    err.code = "FORBIDDEN";
    throw err;
  }
}

function canModifySubmission(submission, user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  return submission.author_id === user.id;
}

function canReview(submission, user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  if (user.role !== "reviewer") return false;
  return submission.assigned_reviewer_id === user.id;
}

// ==================== D1 存储层 ====================
async function listUsers(db, quota) {
  if (!quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
  const { results } = await db.prepare("SELECT id, name, role, created_at FROM review_users ORDER BY role, name").all();
  quota.recordD1Read(results.length);
  return results || [];
}

async function listSubmissions(db, quota, options = {}) {
  const { status, category, authorId, reviewerId, page = 1, pageSize = CONFIG.DEFAULT_PAGE_SIZE } = options;
  const conditions = [];
  const params = [];

  if (status) {
    conditions.push("s.status = ?");
    params.push(status);
  }
  if (category) {
    conditions.push("s.category = ?");
    params.push(category);
  }
  if (authorId) {
    conditions.push("s.author_id = ?");
    params.push(authorId);
  }
  if (reviewerId) {
    conditions.push("s.assigned_reviewer_id = ?");
    params.push(reviewerId);
  }

  const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
  const limit = Math.max(1, Math.min(parseInt(pageSize, 10) || CONFIG.DEFAULT_PAGE_SIZE, 100));
  const offset = (Math.max(1, parseInt(page, 10) || 1) - 1) * limit;

  if (!quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
  const countResult = await db.prepare(`SELECT COUNT(*) as total FROM review_submissions s ${where}`).bind(...params).first();
  quota.recordD1Read(1);
  const total = countResult?.total || 0;

  if (!quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
  const { results } = await db
    .prepare(
      `SELECT s.*, author.name as author_name, reviewer.name as reviewer_name
       FROM review_submissions s
       LEFT JOIN review_users author ON s.author_id = author.id
       LEFT JOIN review_users reviewer ON s.assigned_reviewer_id = reviewer.id
       ${where}
       ORDER BY s.updated_at DESC
       LIMIT ? OFFSET ?`
    )
    .bind(...params, limit, offset)
    .all();
  quota.recordD1Read(results.length);

  return { submissions: results || [], total, page: Math.floor(offset / limit) + 1, pageSize: limit };
}

async function getSubmission(db, quota, id) {
  if (!quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
  const submission = await db
    .prepare(
      `SELECT s.*, author.name as author_name, reviewer.name as reviewer_name
       FROM review_submissions s
       LEFT JOIN review_users author ON s.author_id = author.id
       LEFT JOIN review_users reviewer ON s.assigned_reviewer_id = reviewer.id
       WHERE s.id = ?`
    )
    .bind(id)
    .first();
  quota.recordD1Read(1);
  return submission || null;
}

async function createSubmission(db, quota, data) {
  if (!quota.checkD1Write(1)) throw new QuotaError("D1 write quota exceeded", "D1_WRITE_EXCEEDED");
  const id = generateId(10);
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO review_submissions (id, title, author_id, content, category, tags, status, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, data.title, data.authorId, data.content, data.category || null, data.tags || null, "pending", 1, now, now)
    .run();
  quota.recordD1Write(1);
  return { id };
}

async function updateSubmission(db, quota, id, data) {
  const fields = [];
  const values = [];
  if (data.title !== undefined) {
    fields.push("title = ?");
    values.push(data.title);
  }
  if (data.content !== undefined) {
    fields.push("content = ?");
    values.push(data.content);
  }
  if (data.category !== undefined) {
    fields.push("category = ?");
    values.push(data.category || null);
  }
  if (data.tags !== undefined) {
    fields.push("tags = ?");
    values.push(data.tags || null);
  }
  if (data.status !== undefined) {
    fields.push("status = ?");
    values.push(data.status);
  }
  if (data.assignedReviewerId !== undefined) {
    fields.push("assigned_reviewer_id = ?");
    values.push(data.assignedReviewerId || null);
  }
  if (data.version !== undefined) {
    fields.push("version = ?");
    values.push(data.version);
  }
  if (fields.length === 0) return;

  fields.push("updated_at = ?");
  values.push(nowIso());
  values.push(id);

  if (!quota.checkD1Write(1)) throw new QuotaError("D1 write quota exceeded", "D1_WRITE_EXCEEDED");
  await db.prepare(`UPDATE review_submissions SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
  quota.recordD1Write(1);
}

async function deleteSubmission(db, quota, id) {
  if (!quota.checkD1Delete(1)) throw new QuotaError("D1 delete quota exceeded", "D1_DELETE_EXCEEDED");
  await db.prepare("DELETE FROM review_reviews WHERE submission_id = ?").bind(id).run();
  quota.recordD1Delete(1);

  if (!quota.checkD1Delete(1)) throw new QuotaError("D1 delete quota exceeded", "D1_DELETE_EXCEEDED");
  await db.prepare("DELETE FROM review_attachments WHERE submission_id = ?").bind(id).run();
  quota.recordD1Delete(1);

  if (!quota.checkD1Delete(1)) throw new QuotaError("D1 delete quota exceeded", "D1_DELETE_EXCEEDED");
  await db.prepare("DELETE FROM review_submissions WHERE id = ?").bind(id).run();
  quota.recordD1Delete(1);
}

async function listReviews(db, quota, submissionId) {
  if (!quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
  const { results } = await db
    .prepare(
      `SELECT r.*, u.name as reviewer_name
       FROM review_reviews r
       JOIN review_users u ON r.reviewer_id = u.id
       WHERE r.submission_id = ?
       ORDER BY r.created_at DESC`
    )
    .bind(submissionId)
    .all();
  quota.recordD1Read(results.length);
  return results || [];
}

async function createReview(db, quota, data) {
  if (!quota.checkD1Write(1)) throw new QuotaError("D1 write quota exceeded", "D1_WRITE_EXCEEDED");
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO review_reviews (submission_id, reviewer_id, verdict, comment, score, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(data.submissionId, data.reviewerId, data.verdict, data.comment || null, data.score || null, now)
    .run();
  quota.recordD1Write(1);
}

async function listAttachments(db, quota, submissionId) {
  if (!quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
  const { results } = await db
    .prepare(
      `SELECT a.*, u.name as uploader_name
       FROM review_attachments a
       JOIN review_users u ON a.uploaded_by = u.id
       WHERE a.submission_id = ?
       ORDER BY a.created_at DESC`
    )
    .bind(submissionId)
    .all();
  quota.recordD1Read(results.length);
  return results || [];
}

async function getAttachment(db, quota, id) {
  if (!quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
  const attachment = await db.prepare("SELECT * FROM review_attachments WHERE id = ?").bind(id).first();
  quota.recordD1Read(1);
  return attachment || null;
}

async function createAttachment(db, quota, data) {
  if (!quota.checkD1Write(1)) throw new QuotaError("D1 write quota exceeded", "D1_WRITE_EXCEEDED");
  const id = generateAttachmentId();
  await db
    .prepare(
      `INSERT INTO review_attachments (id, submission_id, filename, content_type, size, r2_key, uploaded_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, data.submissionId, data.filename, data.contentType, data.size, data.r2Key, data.uploadedBy, nowIso())
    .run();
  quota.recordD1Write(1);
  return { id };
}

async function deleteAttachment(db, quota, id) {
  if (!quota.checkD1Delete(1)) throw new QuotaError("D1 delete quota exceeded", "D1_DELETE_EXCEEDED");
  await db.prepare("DELETE FROM review_attachments WHERE id = ?").bind(id).run();
  quota.recordD1Delete(1);
}

async function getStats(db, quota, user) {
  const stats = {};

  if (!quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
  const statusResult = await db
    .prepare("SELECT status, COUNT(*) as count FROM review_submissions GROUP BY status")
    .all();
  quota.recordD1Read(statusResult.results.length);
  stats.byStatus = {};
  for (const row of statusResult.results || []) {
    stats.byStatus[row.status] = row.count;
  }

  if (user) {
    if (!quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
    const mySubmissions = await db
      .prepare("SELECT COUNT(*) as count FROM review_submissions WHERE author_id = ?")
      .bind(user.id)
      .first();
    quota.recordD1Read(1);
    stats.mySubmissions = mySubmissions?.count || 0;

    if (user.role === "reviewer" || user.role === "admin") {
      if (!quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
      const myReviews = await db
        .prepare("SELECT COUNT(*) as count FROM review_submissions WHERE assigned_reviewer_id = ?")
        .bind(user.id)
        .first();
      quota.recordD1Read(1);
      stats.myReviews = myReviews?.count || 0;
    }
  }

  return stats;
}

async function listCategories(db, quota) {
  if (!quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
  const { results } = await db.prepare("SELECT DISTINCT category FROM review_submissions WHERE category IS NOT NULL AND category != ''").all();
  quota.recordD1Read(results.length);
  return (results || []).map((r) => r.category);
}

async function listTemplates(db, quota) {
  if (!quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
  const { results } = await db.prepare("SELECT * FROM review_templates ORDER BY name").all();
  quota.recordD1Read(results.length);
  return results || [];
}

async function createTemplate(db, quota, data) {
  if (!quota.checkD1Write(1)) throw new QuotaError("D1 write quota exceeded", "D1_WRITE_EXCEEDED");
  const id = "tpl-" + generateId(8);
  await db
    .prepare("INSERT INTO review_templates (id, name, verdict, comment, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, data.name, data.verdict, data.comment, data.createdBy, nowIso())
    .run();
  quota.recordD1Write(1);
  return { id };
}

async function deleteTemplate(db, quota, id) {
  if (!quota.checkD1Delete(1)) throw new QuotaError("D1 delete quota exceeded", "D1_DELETE_EXCEEDED");
  await db.prepare("DELETE FROM review_templates WHERE id = ?").bind(id).run();
  quota.recordD1Delete(1);
}


// ==================== API 请求处理器 ====================
async function withQuota(env, handler) {
  const db = getDb(env);
  const bucket = getBucket(env);
  if (!db) return json({ error: "D1 database not bound" }, 500);
  if (!bucket) return json({ error: "R2 bucket not bound" }, 500);

  const quota = new QuotaManager(db, bucket);
  await quota.init();
  try {
    return await handler(db, bucket, quota);
  } catch (err) {
    if (err instanceof QuotaError) {
      return json({ error: err.message, code: err.code }, 429);
    }
    if (err.code === "AUTH_REQUIRED") {
      return json({ error: err.message, code: "AUTH_REQUIRED" }, 401);
    }
    if (err.code === "FORBIDDEN") {
      return json({ error: err.message, code: "FORBIDDEN" }, 403);
    }
    console.error("Handler error:", err);
    if (err.message && err.message.includes("no such table")) {
      return json({
        error: "数据库表不存在，请先执行迁移：npm run db:migrate（本地）或 npm run db:migrate:remote（远程）",
        code: "D1_SCHEMA_MISSING",
        detail: err.message,
      }, 500);
    }
    return json({ error: err.message }, 500);
    return json({ error: err.message }, 500);
  } finally {
    await quota.flush();
  }
}

async function handleLogin(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const body = await request.json();
    const token = body?.token?.trim();
    if (!token) return json({ error: "Token 不能为空" }, 400);

    if (!quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
    const user = await db.prepare("SELECT id, name, role FROM review_users WHERE token = ?").bind(token).first();
    quota.recordD1Read(1);

    if (!user) return json({ error: "Token 无效" }, 401);

    const headers = {
      "Set-Cookie": setCookieHeader(CONFIG.TOKEN_COOKIE, token, {
        path: "/review",
        maxAge: 7 * 24 * 60 * 60,
        httpOnly: true,
        sameSite: "Lax",
      }),
    };
    return json({ user }, 200, headers);
  });
}

async function handleLogout(request, env, ctx, url) {
  const headers = {
    "Set-Cookie": clearCookieHeader(CONFIG.TOKEN_COOKIE, "/review"),
  };
  return json({ success: true }, 200, headers);
}

async function handleMe(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    if (!user) return json({ user: null });
    return json({ user: { id: user.id, name: user.name, role: user.role } });
  });
}

async function handleListSubmissions(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireAuth(user);

    const options = {
      status: url.searchParams.get("status") || undefined,
      category: url.searchParams.get("category") || undefined,
      page: url.searchParams.get("page") || 1,
      pageSize: url.searchParams.get("pageSize") || CONFIG.DEFAULT_PAGE_SIZE,
    };

    if (user.role === "submitter") {
      options.authorId = user.id;
    } else if (user.role === "reviewer") {
      options.reviewerId = user.id;
    }

    const result = await listSubmissions(db, quota, options);
    return json(result);
  });
}

async function handleGetSubmission(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireAuth(user);

    const match = url.pathname.match(/^\/api\/submissions\/([a-z0-9-]+)$/);
    if (!match) return json({ error: "Invalid submission id" }, 400);
    const id = match[1];

    const submission = await getSubmission(db, quota, id);
    if (!submission) return json({ error: "Not found" }, 404);

    if (user.role === "submitter" && submission.author_id !== user.id) {
      return json({ error: "Forbidden" }, 403);
    }
    if (user.role === "reviewer" && submission.assigned_reviewer_id !== user.id && submission.author_id !== user.id) {
      return json({ error: "Forbidden" }, 403);
    }

    const reviews = await listReviews(db, quota, id);
    const attachments = await listAttachments(db, quota, id);

    return json({ submission, reviews, attachments });
  });
}

async function handleCreateSubmission(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireRole(user, ["submitter", "admin"]);

    const body = await request.json();
    if (!body?.title || typeof body.title !== "string" || body.title.trim().length === 0) {
      return json({ error: "标题不能为空" }, 400);
    }
    if (!body?.content || typeof body.content !== "string") {
      return json({ error: "正文不能为空" }, 400);
    }
    if (body.content.length > CONFIG.MAX_CONTENT_SIZE) {
      return json({ error: `正文超过 ${CONFIG.MAX_CONTENT_SIZE} 字符限制` }, 413);
    }

    const result = await createSubmission(db, quota, {
      title: body.title.trim(),
      authorId: user.id,
      content: body.content,
      category: body.category,
      tags: body.tags,
    });

    return json({ success: true, id: result.id }, 201);
  });
}

async function handleUpdateSubmission(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireAuth(user);

    const match = url.pathname.match(/^\/api\/submissions\/([a-z0-9-]+)$/);
    if (!match) return json({ error: "Invalid submission id" }, 400);
    const id = match[1];

    const submission = await getSubmission(db, quota, id);
    if (!submission) return json({ error: "Not found" }, 404);

    const body = await request.json();

    if (body.status === "reviewing" || body.assignedReviewerId !== undefined) {
      requireRole(user, ["admin"]);
    }

    if (user.role === "submitter") {
      if (submission.author_id !== user.id) return json({ error: "Forbidden" }, 403);
      if (body.status !== undefined) return json({ error: "投稿人不能变更稿件状态" }, 403);
    }

    if (user.role === "reviewer") {
      if (submission.assigned_reviewer_id !== user.id) return json({ error: "Forbidden" }, 403);
      if (body.status !== undefined && !["approved", "rejected", "revising"].includes(body.status)) {
        return json({ error: "审稿人只能变更稿件状态为通过/拒绝/需修改" }, 403);
      }
    }

    const updates = {};
    if (body.title !== undefined) updates.title = body.title.trim();
    if (body.content !== undefined) updates.content = body.content;
    if (body.category !== undefined) updates.category = body.category;
    if (body.tags !== undefined) updates.tags = body.tags;
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === "revising") {
        updates.version = (submission.version || 1) + 1;
      }
    }
    if (body.assignedReviewerId !== undefined) updates.assignedReviewerId = body.assignedReviewerId;

    if (user.role === "submitter" && submission.status === "revising" && body.content !== undefined) {
      updates.version = (submission.version || 1) + 1;
    }

    if (updates.content && updates.content.length > CONFIG.MAX_CONTENT_SIZE) {
      return json({ error: `正文超过 ${CONFIG.MAX_CONTENT_SIZE} 字符限制` }, 413);
    }

    await updateSubmission(db, quota, id, updates);
    return json({ success: true });
  });
}

async function handleDeleteSubmission(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireAuth(user);

    const match = url.pathname.match(/^\/api\/submissions\/([a-z0-9-]+)$/);
    if (!match) return json({ error: "Invalid submission id" }, 400);
    const id = match[1];

    const submission = await getSubmission(db, quota, id);
    if (!submission) return json({ error: "Not found" }, 404);

    if (!canModifySubmission(submission, user)) {
      return json({ error: "Forbidden" }, 403);
    }

    const r2 = new R2Store(bucket, quota);
    const attachments = await listAttachments(db, quota, id);

    if (!quota.checkR2ClassA(attachments.length)) {
      throw new QuotaError("R2 Class A quota exceeded", "R2_CLASS_A_EXCEEDED");
    }

    for (const att of attachments) {
      await r2.delete(att.r2_key);
      quota.recordR2Storage(-att.size);
    }

    await deleteSubmission(db, quota, id);
    return json({ success: true });
  });
}

async function handleAssignReviewer(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireRole(user, ["admin"]);

    const match = url.pathname.match(/^\/api\/submissions\/([a-z0-9-]+)\/assign$/);
    if (!match) return json({ error: "Invalid URL" }, 400);
    const id = match[1];

    const body = await request.json();
    const reviewerId = body?.reviewerId || null;

    const submission = await getSubmission(db, quota, id);
    if (!submission) return json({ error: "Not found" }, 404);

    if (reviewerId) {
      if (!quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
      const reviewer = await db.prepare("SELECT * FROM review_users WHERE id = ? AND role = 'reviewer'").bind(reviewerId).first();
      quota.recordD1Read(1);
      if (!reviewer) return json({ error: "审稿人不存在" }, 400);
    }

    await updateSubmission(db, quota, id, {
      assignedReviewerId: reviewerId,
      status: reviewerId ? "reviewing" : submission.status,
    });

    return json({ success: true });
  });
}

async function handleCreateReview(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireRole(user, ["reviewer", "admin"]);

    const match = url.pathname.match(/^\/api\/submissions\/([a-z0-9-]+)\/reviews$/);
    if (!match) return json({ error: "Invalid URL" }, 400);
    const id = match[1];

    const submission = await getSubmission(db, quota, id);
    if (!submission) return json({ error: "Not found" }, 404);

    if (!canReview(submission, user)) {
      return json({ error: "Forbidden" }, 403);
    }

    const body = await request.json();
    if (!["approved", "rejected", "revising"].includes(body?.verdict)) {
      return json({ error: "结论必须是 approved/rejected/revising" }, 400);
    }
    const score = parseInt(body.score, 10);
    if (body.score !== undefined && (isNaN(score) || score < 1 || score > 5)) {
      return json({ error: "评分必须是 1-5 的整数" }, 400);
    }

    await createReview(db, quota, {
      submissionId: id,
      reviewerId: user.id,
      verdict: body.verdict,
      comment: body.comment,
      score: body.score !== undefined ? score : null,
    });

    await updateSubmission(db, quota, id, { status: body.verdict });

    return json({ success: true }, 201);
  });
}

async function handleUploadAttachment(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireAuth(user);

    const match = url.pathname.match(/^\/api\/submissions\/([a-z0-9-]+)\/attachments$/);
    if (!match) return json({ error: "Invalid URL" }, 400);
    const submissionId = match[1];

    const submission = await getSubmission(db, quota, submissionId);
    if (!submission) return json({ error: "Not found" }, 404);

    if (!canModifySubmission(submission, user) && !canReview(submission, user)) {
      return json({ error: "Forbidden" }, 403);
    }

    const contentType = request.headers.get("Content-Type") || "application/octet-stream";
    const contentDisposition = request.headers.get("Content-Disposition") || "";
    let filename = "unnamed";
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
    if (filenameMatch) filename = filenameMatch[1];

    const body = await request.arrayBuffer();
    if (body.byteLength > CONFIG.MAX_ATTACHMENT_SIZE) {
      return json({ error: `附件超过 ${CONFIG.MAX_ATTACHMENT_SIZE} 字节限制` }, 413);
    }

    const random = generateId(8);
    const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const r2Key = `${CONFIG.R2_KEY_PREFIX}${submissionId}/${random}-${safeFilename}`;

    const r2 = new R2Store(bucket, quota);
    await r2.put(r2Key, body, {
      httpMetadata: { contentType },
      customMetadata: { submission_id: submissionId, uploaded_by: user.id },
    });

    const result = await createAttachment(db, quota, {
      submissionId,
      filename,
      contentType,
      size: body.byteLength,
      r2Key,
      uploadedBy: user.id,
    });

    return json({ success: true, attachment: { id: result.id, filename, size: body.byteLength, content_type: contentType } }, 201);
  });
}

async function handleDownloadAttachment(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireAuth(user);

    const match = url.pathname.match(/^\/api\/attachments\/([a-z0-9-]+)$/);
    if (!match) return json({ error: "Invalid attachment id" }, 400);
    const id = match[1];

    const attachment = await getAttachment(db, quota, id);
    if (!attachment) return json({ error: "Not found" }, 404);

    const submission = await getSubmission(db, quota, attachment.submission_id);
    if (!submission) return json({ error: "Not found" }, 404);

    if (user.role === "submitter" && submission.author_id !== user.id) {
      return json({ error: "Forbidden" }, 403);
    }
    if (user.role === "reviewer" && submission.assigned_reviewer_id !== user.id && submission.author_id !== user.id) {
      return json({ error: "Forbidden" }, 403);
    }

    const r2 = new R2Store(bucket, quota);
    const obj = await r2.get(attachment.r2_key);
    if (!obj) return json({ error: "File not found in storage" }, 404);

    return new Response(obj.body, {
      headers: {
        "Content-Type": attachment.content_type || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${attachment.filename.replace(/"/g, '\\"')}"`,
        "Content-Length": String(attachment.size),
      },
    });
  });
}

async function handleDeleteAttachment(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireAuth(user);

    const match = url.pathname.match(/^\/api\/attachments\/([a-z0-9-]+)$/);
    if (!match) return json({ error: "Invalid attachment id" }, 400);
    const id = match[1];

    const attachment = await getAttachment(db, quota, id);
    if (!attachment) return json({ error: "Not found" }, 404);

    const submission = await getSubmission(db, quota, attachment.submission_id);
    if (!submission) return json({ error: "Not found" }, 404);

    if (!canModifySubmission(submission, user) && attachment.uploaded_by !== user.id) {
      return json({ error: "Forbidden" }, 403);
    }

    const r2 = new R2Store(bucket, quota);
    await r2.delete(attachment.r2_key);
    quota.recordR2Storage(-attachment.size);
    await deleteAttachment(db, quota, id);

    return json({ success: true });
  });
}

async function handleGetStats(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireAuth(user);
    const stats = await getStats(db, quota, user);
    return json(stats);
  });
}

async function handleListUsers(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireRole(user, ["admin"]);
    const users = await listUsers(db, quota);
    return json({ users });
  });
}

async function handleListCategories(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireAuth(user);
    const categories = await listCategories(db, quota);
    return json({ categories });
  });
}

async function handleListTemplates(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireAuth(user);
    const templates = await listTemplates(db, quota);
    return json({ templates });
  });
}

async function handleCreateTemplate(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireRole(user, ["admin"]);

    const body = await request.json();
    if (!body?.name || !body?.verdict || !body?.comment) {
      return json({ error: "name/verdict/comment 必填" }, 400);
    }

    const result = await createTemplate(db, quota, {
      name: body.name,
      verdict: body.verdict,
      comment: body.comment,
      createdBy: user.id,
    });

    return json({ success: true, id: result.id }, 201);
  });
}

async function handleDeleteTemplate(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const user = await getCurrentUser(request, env, quota);
    requireRole(user, ["admin"]);

    const match = url.pathname.match(/^\/api\/templates\/([a-z0-9-]+)$/);
    if (!match) return json({ error: "Invalid template id" }, 400);
    const id = match[1];

    await deleteTemplate(db, quota, id);
    return json({ success: true });
  });
}


// ==================== HTML 模板（单页应用） ====================
const APP_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AC 审稿小工具</title>
  <style>
    :root { --bg: #0b1120; --card: #151e32; --text: #e2e8f0; --muted: #94a3b8; --accent: #38bdf8; --accent-2: #818cf8; --border: #1e293b; --danger: #ef4444; --success: #22c55e; --warn: #f59e0b; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    .container { max-width: 1100px; margin: 0 auto; padding: 1.5rem 1rem; }
    header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border); }
    header h1 { margin: 0; font-size: 1.5rem; background: linear-gradient(90deg, var(--accent), var(--accent-2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .nav { display: flex; gap: .5rem; flex-wrap: wrap; }
    .nav button { background: transparent; color: var(--muted); border: 1px solid var(--border); padding: .4rem .8rem; border-radius: 6px; cursor: pointer; }
    .nav button:hover, .nav button.active { color: var(--text); border-color: var(--accent); }
    .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.25rem; margin-bottom: 1rem; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 1rem; }
    .stat { text-align: center; }
    .stat .num { font-size: 2rem; font-weight: 700; color: var(--accent); }
    .stat .label { color: var(--muted); font-size: .9rem; }
    .row { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; margin-bottom: .75rem; }
    .row label { color: var(--muted); font-size: .9rem; }
    input, textarea, select { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: .65rem .9rem; font-size: .95rem; }
    input:focus, textarea:focus, select:focus { outline: 2px solid var(--accent); }
    textarea { min-height: 160px; resize: vertical; }
    button { background: var(--accent); color: #0b1120; border: 0; padding: .55rem 1rem; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: .9rem; }
    button:hover { filter: brightness(1.1); }
    button.secondary { background: var(--border); color: var(--text); }
    button.danger { background: var(--danger); color: #fff; }
    button.success { background: var(--success); color: #0b1120; }
    .badge { display: inline-block; padding: .15rem .5rem; border-radius: 999px; font-size: .75rem; font-weight: 600; }
    .badge-pending { background: rgba(245,158,11,.15); color: var(--warn); }
    .badge-reviewing { background: rgba(56,189,248,.15); color: var(--accent); }
    .badge-approved { background: rgba(34,197,94,.15); color: var(--success); }
    .badge-rejected { background: rgba(239,68,68,.15); color: var(--danger); }
    .badge-revising { background: rgba(168,85,247,.15); color: #a855f7; }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th, td { text-align: left; padding: .65rem .5rem; border-bottom: 1px solid var(--border); }
    th { color: var(--muted); font-weight: 500; }
    tr:hover td { background: rgba(255,255,255,.02); }
    .empty { color: var(--muted); padding: 2rem; text-align: center; }
    .error { color: #f87171; }
    .success { color: #4ade80; }
    .muted { color: var(--muted); }
    .meta { font-size: .8rem; color: var(--muted); }
    .actions { display: flex; gap: .5rem; flex-wrap: wrap; margin-top: .75rem; }
    .review-item { border-left: 3px solid var(--accent); padding-left: .75rem; margin-bottom: 1rem; }
    .review-item.approved { border-color: var(--success); }
    .review-item.rejected { border-color: var(--danger); }
    .review-item.revising { border-color: #a855f7; }
    .attachment { display: flex; justify-content: space-between; align-items: center; padding: .5rem; background: var(--bg); border-radius: 6px; margin-bottom: .5rem; }
    .score { color: #fbbf24; }
    .login-box { max-width: 360px; margin: 10vh auto; }
    .hidden { display: none; }
    .pagination { display: flex; justify-content: center; gap: .5rem; margin-top: 1rem; }
    .pagination button { padding: .4rem .75rem; }
    @media (max-width: 640px) { header h1 { font-size: 1.2rem; } .grid { grid-template-columns: repeat(2, 1fr); } }
  </style>
</head>
<body>
  <div class="container">
    <header id="app-header" class="hidden">
      <h1>AC 审稿小工具</h1>
      <span class="badge" style="background:rgba(245,158,11,.15);color:var(--warn);">示例工程无权限管理</span>
      <div class="nav" id="main-nav">
        <button data-view="dashboard" class="active">看板</button>
        <button data-view="list">稿件列表</button>
        <button data-view="new" id="btn-new">新建稿件</button>
        <button data-view="templates" id="btn-templates" class="hidden">评语模板</button>
        <button id="btn-logout">退出</button>
      </div>
    </header>

    <div id="login-view">
      <div class="card login-box">
        <h2>登录审稿小工具</h2>
        <p class="muted" style="color:var(--warn);font-size:.85rem;">⚠️ 示例工程无权限管理，Token 仅作演示用途</p>
        <p class="muted">请输入 Token 登录</p>
        <input id="login-token" type="password" placeholder="例如：admin-token-avl-review">
        <div class="actions">
          <button id="btn-login">登录</button>
        </div>
        <p class="muted" style="margin-top:1rem;font-size:.8rem;">默认 Token：<br>admin-token-avl-review（管理员）<br>reviewer-token-avl-001（审稿人）<br>submitter-token-avl-001（投稿人）</p>
        <div id="login-error" class="error"></div>
      </div>
    </div>

    <div id="app-view" class="hidden">
      <div id="view-dashboard" class="view">
        <div class="card">
          <h2 id="welcome-title">欢迎</h2>
          <p class="muted" id="welcome-role"></p>
        </div>
        <div class="grid" id="stats-grid"></div>
      </div>

      <div id="view-list" class="view hidden">
        <div class="card">
          <h2>稿件列表</h2>
          <div class="row">
            <label>状态：</label>
            <select id="filter-status"><option value="">全部</option></select>
            <label>分类：</label>
            <select id="filter-category"><option value="">全部</option></select>
            <label id="label-mine"><input type="checkbox" id="filter-mine"> 仅看我的</label>
            <button id="btn-search">查询</button>
          </div>
          <div id="list-table"></div>
          <div class="pagination" id="list-pagination"></div>
        </div>
      </div>

      <div id="view-new" class="view hidden">
        <div class="card">
          <h2 id="form-title">新建稿件</h2>
          <input id="sub-title" placeholder="标题">
          <input id="sub-category" placeholder="分类（可选）">
          <input id="sub-tags" placeholder="标签，用逗号分隔（可选）">
          <textarea id="sub-content" placeholder="在此输入正文内容..."></textarea>
          <div class="actions">
            <button id="btn-save">保存</button>
            <button class="secondary" id="btn-cancel">取消</button>
          </div>
          <div id="form-error" class="error"></div>
        </div>
      </div>

      <div id="view-detail" class="view hidden">
        <div class="card">
          <div id="detail-header"></div>
          <div id="detail-actions" class="actions"></div>
        </div>
        <div class="card">
          <h3>正文</h3>
          <div id="detail-content" style="white-space:pre-wrap;line-height:1.7;"></div>
        </div>
        <div class="card" id="detail-attachments-card">
          <h3>附件</h3>
          <div id="detail-attachments"></div>
          <div id="upload-area" class="hidden" style="margin-top:.75rem;">
            <input type="file" id="file-input">
            <button id="btn-upload">上传附件</button>
          </div>
        </div>
        <div class="card" id="detail-reviews-card">
          <h3>审稿历史</h3>
          <div id="detail-reviews"></div>
          <div id="review-form" class="hidden" style="margin-top:1rem;">
            <h4>提交审稿意见</h4>
            <div class="row">
              <select id="review-verdict">
                <option value="approved">通过</option>
                <option value="rejected">拒绝</option>
                <option value="revising">需修改</option>
              </select>
              <select id="review-template" class="secondary">
                <option value="">选择模板</option>
              </select>
              <select id="review-score">
                <option value="">评分</option>
                <option value="5">5 分</option>
                <option value="4">4 分</option>
                <option value="3">3 分</option>
                <option value="2">2 分</option>
                <option value="1">1 分</option>
              </select>
            </div>
            <textarea id="review-comment" placeholder="请输入审稿评语..."></textarea>
            <button id="btn-submit-review">提交审稿意见</button>
          </div>
        </div>
      </div>

      <div id="view-templates" class="view hidden">
        <div class="card">
          <h2>常用审稿评语模板</h2>
          <div id="templates-list"></div>
          <div style="margin-top:1rem;">
            <input id="tpl-name" placeholder="模板名称">
            <select id="tpl-verdict">
              <option value="approved">通过</option>
              <option value="rejected">拒绝</option>
              <option value="revising">需修改</option>
            </select>
            <textarea id="tpl-comment" placeholder="评语内容"></textarea>
            <button id="btn-add-template">添加模板</button>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    (function() {
      var BASE = window.location.origin + window.location.pathname.replace(/\\/?$/, '');
      var user = null;
      var currentSubmission = null;
      var templates = [];
      var users = [];
      var currentPage = 1;

      function $(id) { return document.getElementById(id); }

      function api(path, options) {
        options = options || {};
        options.headers = options.headers || {};
        options.credentials = 'same-origin';
        return fetch(BASE + path, options).then(function(r) {
          return r.json().then(function(d) {
            if (!r.ok) throw new Error(d.error || 'HTTP ' + r.status);
            return d;
          });
        });
      }

      function statusLabel(s) {
        var map = { pending: '待审', reviewing: '审核中', approved: '已通过', rejected: '已拒绝', revising: '需修改' };
        return map[s] || s;
      }

      function roleLabel(r) {
        var map = { submitter: '投稿人', reviewer: '审稿人', admin: '管理员' };
        return map[r] || r;
      }

      function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, function(c) {
          return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
      }

      function showView(name) {
        document.querySelectorAll('.view').forEach(function(el) { el.classList.add('hidden'); });
        document.querySelectorAll('.nav button[data-view]').forEach(function(el) { el.classList.remove('active'); });
        var view = $('view-' + name);
        if (view) view.classList.remove('hidden');
        var nav = document.querySelector('.nav button[data-view="' + name + '"]');
        if (nav) nav.classList.add('active');
      }

      function renderStats() {
        api('/api/stats').then(function(stats) {
          var html = '';
          if (stats.mySubmissions !== undefined) {
            html += '<div class="card stat"><div class="num">' + stats.mySubmissions + '</div><div class="label">我的投稿</div></div>';
          }
          if (stats.myReviews !== undefined) {
            html += '<div class="card stat"><div class="num">' + stats.myReviews + '</div><div class="label">我的审稿任务</div></div>';
          }
          for (var s in stats.byStatus) {
            html += '<div class="card stat"><div class="num">' + stats.byStatus[s] + '</div><div class="label">' + statusLabel(s) + '</div></div>';
          }
          $('stats-grid').innerHTML = html || '<div class="empty">暂无数据</div>';
        }).catch(function(e) { $('stats-grid').innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>'; });
      }

      function renderSubmissions(page) {
        currentPage = page || 1;
        var status = $('filter-status').value;
        var category = $('filter-category').value;
        var mine = $('filter-mine').checked;
        var qs = '?page=' + currentPage;
        if (status) qs += '&status=' + encodeURIComponent(status);
        if (category) qs += '&category=' + encodeURIComponent(category);
        if (mine) qs += '&filter=mine';
        api('/api/submissions' + qs).then(function(data) {
          var subs = data.submissions || [];
          if (subs.length === 0) {
            $('list-table').innerHTML = '<div class="empty">暂无稿件</div>';
            $('list-pagination').innerHTML = '';
            return;
          }
          var html = '<table><thead><tr><th>标题</th><th>作者</th><th>分类</th><th>状态</th><th>审稿人</th><th>更新时间</th></tr></thead><tbody>';
          for (var i = 0; i < subs.length; i++) {
            var s = subs[i];
            html += '<tr style="cursor:pointer" data-id="' + escapeHtml(s.id) + '">';
            html += '<td>' + escapeHtml(s.title) + '</td>';
            html += '<td>' + escapeHtml(s.author_name || s.author_id) + '</td>';
            html += '<td>' + escapeHtml(s.category || '-') + '</td>';
            html += '<td><span class="badge badge-' + s.status + '">' + statusLabel(s.status) + '</span></td>';
            html += '<td>' + escapeHtml(s.reviewer_name || s.reviewer_id || '-') + '</td>';
            html += '<td class="meta">' + new Date(s.updated_at).toLocaleString() + '</td>';
            html += '</tr>';
          }
          html += '</tbody></table>';
          $('list-table').innerHTML = html;
          $('list-table').querySelectorAll('tbody tr').forEach(function(row) {
            row.addEventListener('click', function() { loadDetail(row.dataset.id); });
          });

          var pages = Math.ceil(data.total / data.pageSize);
          var phtml = '';
          for (var p = 1; p <= pages; p++) {
            phtml += '<button class="' + (p === currentPage ? '' : 'secondary') + '" data-page="' + p + '">' + p + '</button>';
          }
          $('list-pagination').innerHTML = phtml;
          $('list-pagination').querySelectorAll('button').forEach(function(btn) {
            btn.addEventListener('click', function() { renderSubmissions(parseInt(btn.dataset.page)); });
          });
        }).catch(function(e) { $('list-table').innerHTML = '<div class="error">' + escapeHtml(e.message) + '</div>'; });
      }

      function loadFilters() {
        api('/api/categories').then(function(data) {
          var html = '<option value="">全部分类</option>';
          (data.categories || []).forEach(function(c) { html += '<option value="' + escapeHtml(c) + '">' + escapeHtml(c) + '</option>'; });
          $('filter-category').innerHTML = html;
        });
      }

      function loadUsers() {
        if (user.role !== 'admin') return;
        api('/api/users').then(function(data) { users = data.users || []; });
      }

      function loadTemplates() {
        api('/api/templates').then(function(data) {
          templates = data.templates || [];
          var html = '<option value="">选择模板</option>';
          templates.forEach(function(t) { html += '<option value="' + escapeHtml(t.id) + '">' + escapeHtml(t.name) + '</option>'; });
          $('review-template').innerHTML = html;
          renderTemplatesList();
        });
      }

      function renderTemplatesList() {
        var html = '';
        templates.forEach(function(t) {
          html += '<div class="review-item ' + t.verdict + '">';
          html += '<strong>' + escapeHtml(t.name) + '</strong> <span class="badge badge-' + t.verdict + '">' + statusLabel(t.verdict) + '</span>';
          html += '<p>' + escapeHtml(t.comment) + '</p>';
          if (user.role === 'admin') html += '<button class="danger small" data-tpl="' + t.id + '">删除</button>';
          html += '</div>';
        });
        $('templates-list').innerHTML = html || '<div class="empty">暂无模板</div>';
        $('templates-list').querySelectorAll('button[data-tpl]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            if (!confirm('确定删除该模板？')) return;
            api('/api/templates/' + btn.dataset.tpl, { method: 'DELETE' }).then(loadTemplates);
          });
        });
      }

      function loadDetail(id) {
        api('/api/submissions/' + id).then(function(data) {
          currentSubmission = data.submission;
          var s = data.submission;
          $('detail-header').innerHTML = '<h2>' + escapeHtml(s.title) + '</h2>' +
            '<p class="meta">作者：' + escapeHtml(s.author_name || s.author_id) +
            ' | 分类：' + escapeHtml(s.category || '-') +
            ' | 标签：' + escapeHtml(s.tags || '-') +
            ' | 状态：<span class="badge badge-' + s.status + '">' + statusLabel(s.status) + '</span>' +
            ' | 版本：v' + (s.version || 1) + '</p>';

          var actions = '';
          if (canModifySubmission(s)) {
            actions += '<button id="btn-edit">编辑</button>';
            actions += '<button class="danger" id="btn-delete">删除</button>';
          }
          if (user.role === 'admin') {
            actions += '<select id="assign-reviewer" style="width:auto;"><option value="">分配审稿人</option>';
            users.forEach(function(u) {
              if (u.role === 'reviewer') actions += '<option value="' + escapeHtml(u.id) + '"' + (s.assigned_reviewer_id === u.id ? ' selected' : '') + '>' + escapeHtml(u.name) + '</option>';
            });
            actions += '</select><button id="btn-assign">分配</button>';
          }
          $('detail-actions').innerHTML = actions;

          $('detail-content').textContent = s.content;

          var attHtml = '';
          (data.attachments || []).forEach(function(a) {
            attHtml += '<div class="attachment">';
            attHtml += '<span>' + escapeHtml(a.filename) + ' <span class="meta">(' + formatSize(a.size) + ')</span></span>';
            attHtml += '<span><a href="' + BASE + '/api/attachments/' + a.id + '" target="_blank">下载</a>';
            if (canModifySubmission(s) || a.uploaded_by === user.id) attHtml += ' | <a href="#" class="delete-att" data-id="' + a.id + '">删除</a>';
            attHtml += '</span></div>';
          });
          $('detail-attachments').innerHTML = attHtml || '<div class="empty">暂无附件</div>';
          $('detail-attachments').querySelectorAll('.delete-att').forEach(function(link) {
            link.addEventListener('click', function(e) {
              e.preventDefault();
              if (!confirm('确定删除该附件？')) return;
              api('/api/attachments/' + link.dataset.id, { method: 'DELETE' }).then(function() { loadDetail(id); });
            });
          });

          var canUpload = canModifySubmission(s) || canReview(s);
          $('upload-area').classList.toggle('hidden', !canUpload);

          var revHtml = '';
          (data.reviews || []).forEach(function(r) {
            revHtml += '<div class="review-item ' + r.verdict + '">';
            revHtml += '<strong>' + escapeHtml(r.reviewer_name || r.reviewer_id) + '</strong> ';
            revHtml += '<span class="badge badge-' + r.verdict + '">' + statusLabel(r.verdict) + '</span>';
            if (r.score) revHtml += ' <span class="score">' + '★'.repeat(r.score) + '</span>';
            revHtml += '<p>' + escapeHtml(r.comment || '无评语') + '</p>';
            revHtml += '<div class="meta">' + new Date(r.created_at).toLocaleString() + '</div>';
            revHtml += '</div>';
          });
          $('detail-reviews').innerHTML = revHtml || '<div class="empty">暂无审稿意见</div>';

          var canReviewFlag = canReview(s);
          $('review-form').classList.toggle('hidden', !canReviewFlag);

          bindDetailActions(id);
          showView('detail');
        }).catch(function(e) { alert(e.message); });
      }

      function bindDetailActions(id) {
        var editBtn = $('btn-edit');
        if (editBtn) editBtn.addEventListener('click', function() { openEditForm(currentSubmission); });
        var delBtn = $('btn-delete');
        if (delBtn) delBtn.addEventListener('click', function() {
          if (!confirm('确定删除该稿件？')) return;
          api('/api/submissions/' + id, { method: 'DELETE' }).then(function() { showView('list'); renderSubmissions(1); });
        });
        var assignBtn = $('btn-assign');
        if (assignBtn) assignBtn.addEventListener('click', function() {
          var reviewerId = $('assign-reviewer').value;
          api('/api/submissions/' + id + '/assign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reviewerId: reviewerId })
          }).then(function() { loadDetail(id); });
        });
        var uploadBtn = $('btn-upload');
        if (uploadBtn) uploadBtn.addEventListener('click', function() {
          var file = $('file-input').files[0];
          if (!file) { alert('请选择文件'); return; }
          if (file.size > 10 * 1024 * 1024) { alert('文件不能超过 10MB'); return; }
          api('/api/submissions/' + id + '/attachments', {
            method: 'POST',
            headers: { 'Content-Type': file.type || 'application/octet-stream', 'Content-Disposition': 'filename="' + file.name + '"' },
            body: file
          }).then(function() { $('file-input').value = ''; loadDetail(id); });
        });
        var submitReviewBtn = $('btn-submit-review');
        if (submitReviewBtn) submitReviewBtn.addEventListener('click', function() {
          api('/api/submissions/' + id + '/reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              verdict: $('review-verdict').value,
              comment: $('review-comment').value,
              score: $('review-score').value || undefined
            })
          }).then(function() { $('review-comment').value = ''; loadDetail(id); renderStats(); });
        });
        var tplSelect = $('review-template');
        if (tplSelect) tplSelect.addEventListener('change', function() {
          var t = templates.find(function(x) { return x.id === tplSelect.value; });
          if (t) { $('review-verdict').value = t.verdict; $('review-comment').value = t.comment; }
        });
      }

      function canModifySubmission(s) {
        if (!user) return false;
        if (user.role === 'admin') return true;
        return s.author_id === user.id;
      }

      function canReview(s) {
        if (!user) return false;
        if (user.role === 'admin') return true;
        if (user.role !== 'reviewer') return false;
        return s.assigned_reviewer_id === user.id;
      }

      function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
      }

      function openEditForm(s) {
        $('form-title').textContent = '编辑稿件';
        $('sub-title').value = s.title;
        $('sub-category').value = s.category || '';
        $('sub-tags').value = s.tags || '';
        $('sub-content').value = s.content;
        $('form-error').textContent = '';
        $('btn-save').dataset.id = s.id;
        showView('new');
      }

      function resetForm() {
        $('form-title').textContent = '新建稿件';
        $('sub-title').value = '';
        $('sub-category').value = '';
        $('sub-tags').value = '';
        $('sub-content').value = '';
        $('form-error').textContent = '';
        delete $('btn-save').dataset.id;
      }

      function init() {
        api('/api/auth/me').then(function(data) {
          if (data.user) { setUser(data.user); } else { showLogin(); }
        }).catch(showLogin);

        $('btn-login').addEventListener('click', function() {
          var token = $('login-token').value.trim();
          api('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: token })
          }).then(function(data) { setUser(data.user); }).catch(function(e) { $('login-error').textContent = e.message; });
        });

        $('btn-logout').addEventListener('click', function() {
          api('/api/auth/logout', { method: 'POST' }).then(function() { location.reload(); });
        });

        document.querySelectorAll('.nav button[data-view]').forEach(function(btn) {
          btn.addEventListener('click', function() {
            var view = btn.dataset.view;
            if (view === 'new') { resetForm(); }
            showView(view);
            if (view === 'list') renderSubmissions(1);
            if (view === 'dashboard') renderStats();
            if (view === 'templates') loadTemplates();
          });
        });

        $('btn-search').addEventListener('click', function() { renderSubmissions(1); });
        $('filter-status').innerHTML = '<option value="">全部状态</option>' +
          '<option value="pending">待审</option>' +
          '<option value="reviewing">审核中</option>' +
          '<option value="approved">已通过</option>' +
          '<option value="rejected">已拒绝</option>' +
          '<option value="revising">需修改</option>';

        $('btn-save').addEventListener('click', function() {
          var id = $('btn-save').dataset.id;
          var payload = {
            title: $('sub-title').value.trim(),
            category: $('sub-category').value.trim(),
            tags: $('sub-tags').value.trim(),
            content: $('sub-content').value
          };
          if (!payload.title) { $('form-error').textContent = '标题不能为空'; return; }
          var method = id ? 'PUT' : 'POST';
          var path = id ? '/api/submissions/' + id : '/api/submissions';
          api(path, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
            .then(function() { showView('list'); renderSubmissions(1); renderStats(); })
            .catch(function(e) { $('form-error').textContent = e.message; });
        });

        $('btn-cancel').addEventListener('click', function() { showView('list'); renderSubmissions(1); });

        $('btn-add-template').addEventListener('click', function() {
          api('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: $('tpl-name').value.trim(),
              verdict: $('tpl-verdict').value,
              comment: $('tpl-comment').value.trim()
            })
          }).then(function() { $('tpl-name').value = ''; $('tpl-comment').value = ''; loadTemplates(); });
        });
      }

      function setUser(u) {
        user = u;
        $('app-header').classList.remove('hidden');
        $('login-view').classList.add('hidden');
        $('app-view').classList.remove('hidden');
        $('btn-new').classList.toggle('hidden', user.role === 'reviewer');
        $('welcome-title').textContent = '欢迎，' + user.name;
        $('welcome-role').innerHTML = '角色：' + roleLabel(user.role) + ' <span style="color:var(--warn);font-size:.85rem;">（示例工程无权限管理）</span>';
        $('label-mine').classList.add('hidden');
        $('welcome-title').textContent = '欢迎，' + user.name;
        $('welcome-role').textContent = '角色：' + roleLabel(user.role);
        loadFilters();
        loadUsers();
        loadTemplates();
        renderStats();
        showView('dashboard');
      }

      function showLogin() {
        $('app-header').classList.add('hidden');
        $('login-view').classList.remove('hidden');
        $('app-view').classList.add('hidden');
      }

      init();
    })();
  </script>
</body>
</html>`;

// ==================== Worker 入口 ====================
export default {
  async fetch(request, env, ctx) {
    const url = normalizeUrl(new URL(request.url));

    if (request.method === "OPTIONS") {
      return corsPreflight();
    }

    try {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return html(APP_HTML);
      }

      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        return await handleLogin(request, env, ctx, url);
      }
      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        return await handleLogout(request, env, ctx, url);
      }
      if (url.pathname === "/api/auth/me" && request.method === "GET") {
        return await handleMe(request, env, ctx, url);
      }

      if (url.pathname === "/api/submissions" && request.method === "GET") {
        return await handleListSubmissions(request, env, ctx, url);
      }
      if (url.pathname === "/api/submissions" && request.method === "POST") {
        return await handleCreateSubmission(request, env, ctx, url);
      }

      const submissionMatch = url.pathname.match(/^\/api\/submissions\/([a-z0-9-]+)$/);
      if (submissionMatch) {
        if (request.method === "GET") return await handleGetSubmission(request, env, ctx, url);
        if (request.method === "PUT") return await handleUpdateSubmission(request, env, ctx, url);
        if (request.method === "DELETE") return await handleDeleteSubmission(request, env, ctx, url);
      }

      const assignMatch = url.pathname.match(/^\/api\/submissions\/([a-z0-9-]+)\/assign$/);
      if (assignMatch && request.method === "POST") {
        return await handleAssignReviewer(request, env, ctx, url);
      }

      const reviewsMatch = url.pathname.match(/^\/api\/submissions\/([a-z0-9-]+)\/reviews$/);
      if (reviewsMatch && request.method === "POST") {
        return await handleCreateReview(request, env, ctx, url);
      }

      const attachmentsMatch = url.pathname.match(/^\/api\/submissions\/([a-z0-9-]+)\/attachments$/);
      if (attachmentsMatch && request.method === "POST") {
        return await handleUploadAttachment(request, env, ctx, url);
      }

      const attachmentMatch = url.pathname.match(/^\/api\/attachments\/([a-z0-9-]+)$/);
      if (attachmentMatch) {
        if (request.method === "GET") return await handleDownloadAttachment(request, env, ctx, url);
        if (request.method === "DELETE") return await handleDeleteAttachment(request, env, ctx, url);
      }

      if (url.pathname === "/api/stats" && request.method === "GET") {
        return await handleGetStats(request, env, ctx, url);
      }
      if (url.pathname === "/api/users" && request.method === "GET") {
        return await handleListUsers(request, env, ctx, url);
      }
      if (url.pathname === "/api/categories" && request.method === "GET") {
        return await handleListCategories(request, env, ctx, url);
      }
      if (url.pathname === "/api/templates" && request.method === "GET") {
        return await handleListTemplates(request, env, ctx, url);
      }
      if (url.pathname === "/api/templates" && request.method === "POST") {
        return await handleCreateTemplate(request, env, ctx, url);
      }
      const templateMatch = url.pathname.match(/^\/api\/templates\/([a-z0-9-]+)$/);
      if (templateMatch && request.method === "DELETE") {
        return await handleDeleteTemplate(request, env, ctx, url);
      }

      return json({ error: "Not Found" }, 404);
    } catch (err) {
      console.error("Unhandled error:", err);
      return json({ error: err.message }, 500);
    }
  },
};

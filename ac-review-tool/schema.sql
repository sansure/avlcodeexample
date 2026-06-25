-- ac-review-tool 数据库 Schema
-- 本地开发: npm run db:migrate
-- 远程部署: npm run db:migrate:remote
-- 注意：r2_quota / d1_quota 表与 ac-cloudflare-r2-d1-gist 共用，见根目录 schema.sql

-- 审稿系统用户表
CREATE TABLE IF NOT EXISTS review_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('submitter','reviewer','admin')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 稿件表
CREATE TABLE IF NOT EXISTS review_submissions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  author_id TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  tags TEXT,
  status TEXT DEFAULT 'pending' CHECK(status IN ('pending','reviewing','approved','rejected','revising')),
  assigned_reviewer_id TEXT,
  version INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 审稿意见表
CREATE TABLE IF NOT EXISTS review_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK(verdict IN ('approved','rejected','revising')),
  comment TEXT,
  score INTEGER CHECK(score BETWEEN 1 AND 5),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 附件表
CREATE TABLE IF NOT EXISTS review_attachments (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER DEFAULT 0,
  r2_key TEXT NOT NULL,
  uploaded_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 审稿评语模板表
CREATE TABLE IF NOT EXISTS review_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  verdict TEXT NOT NULL,
  comment TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_review_submissions_author ON review_submissions(author_id);
CREATE INDEX IF NOT EXISTS idx_review_submissions_status ON review_submissions(status);
CREATE INDEX IF NOT EXISTS idx_review_submissions_reviewer ON review_submissions(assigned_reviewer_id);
CREATE INDEX IF NOT EXISTS idx_review_reviews_submission ON review_reviews(submission_id);
CREATE INDEX IF NOT EXISTS idx_review_attachments_submission ON review_attachments(submission_id);

-- 初始化默认用户（仅在表为空时插入，生产环境应替换为安全 Token）
INSERT OR REPLACE INTO review_users (id, name, token, role) VALUES
('admin', '管理员', 'admin', 'admin'),
('reviewer01', '审稿人01', 'reviewer01', 'reviewer'),
('reviewer02', '审稿人02', 'reviewer02', 'reviewer'),
('reviewer03', '审稿人03', 'reviewer03', 'reviewer'),
('reviewer04', '审稿人04', 'reviewer04', 'reviewer'),
('reviewer05', '审稿人05', 'reviewer05', 'reviewer'),
('reviewer06', '审稿人06', 'reviewer06', 'reviewer'),
('reviewer07', '审稿人07', 'reviewer07', 'reviewer'),
('reviewer08', '审稿人08', 'reviewer08', 'reviewer'),
('reviewer09', '审稿人09', 'reviewer09', 'reviewer'),
('submitter01', '投稿人01', 'submitter01', 'submitter'),
('submitter02', '投稿人02', 'submitter02', 'submitter'),
('submitter03', '投稿人03', 'submitter03', 'submitter'),
('submitter04', '投稿人04', 'submitter04', 'submitter'),
('submitter05', '投稿人05', 'submitter05', 'submitter'),
('submitter06', '投稿人06', 'submitter06', 'submitter'),
('submitter07', '投稿人07', 'submitter07', 'submitter'),
('submitter08', '投稿人08', 'submitter08', 'submitter'),
('submitter09', '投稿人09', 'submitter09', 'submitter');

-- 初始化常用审稿模板
INSERT OR IGNORE INTO review_templates (id, name, verdict, comment, created_by) VALUES
('tpl-approve-1', '通过：质量优秀', 'approved', '稿件内容完整、逻辑清晰，建议直接通过。', 'admin'),
('tpl-reject-1', '拒绝：方向不符', 'rejected', '稿件主题与当前栏目方向不符，建议退稿。', 'admin'),
('tpl-revise-1', '需修改：补充细节', 'revising', '整体方向可行，但需补充实验细节与数据支撑，请修改后重新提交。', 'admin'),
('tpl-revise-2', '需修改：格式问题', 'revising', '内容尚可，但格式与引用规范存在较多问题，请按模板调整后重投。', 'admin');

-- 在 Cloudflare 控制台 D1 页面手动执行的 SQL
-- 路径：Workers & Pages -> D1 -> avlcodedb -> Console -> 粘贴执行
-- 原则：所有表使用 IF NOT EXISTS，所有初始化数据使用 INSERT OR IGNORE/REPLACE，不影响现有数据

-- 1. 项目列表（首页 /api/projects 使用）
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  dir TEXT NOT NULL,
  description TEXT,
  path TEXT NOT NULL,
  status TEXT DEFAULT 'planned',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 访问日志
CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. R2 文件元数据（根项目使用）
CREATE TABLE IF NOT EXISTS r2_files (
  key TEXT PRIMARY KEY,
  content_type TEXT,
  size INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. Gist 主表
CREATE TABLE IF NOT EXISTS gists (
  id TEXT PRIMARY KEY,
  title TEXT,
  description TEXT,
  is_public INTEGER DEFAULT 1,
  secret_key TEXT,
  expires_at DATETIME NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 5. Gist 文件表
CREATE TABLE IF NOT EXISTS gist_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gist_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT,
  size INTEGER DEFAULT 0,
  r2_key TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(gist_id, filename)
);
CREATE INDEX IF NOT EXISTS idx_gist_files_gist_id ON gist_files(gist_id);

-- 6. R2 配额表（按月统计，所有子项目共用）
CREATE TABLE IF NOT EXISTS r2_quota (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  class_a_count INTEGER DEFAULT 0,
  class_b_count INTEGER DEFAULT 0,
  storage_bytes INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_r2_quota_month ON r2_quota(month);

-- 7. D1 配额表（按天统计，所有子项目共用）
CREATE TABLE IF NOT EXISTS d1_quota (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  reads INTEGER DEFAULT 0,
  writes INTEGER DEFAULT 0,
  deletes INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_d1_quota_day ON d1_quota(day);

-- ============================================================
-- ac-review-tool 子项目表（审稿小工具）
-- 复用 r2_quota / d1_quota 配额统计表
-- ============================================================

CREATE TABLE IF NOT EXISTS review_users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK(role IN ('submitter','reviewer','admin')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS review_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL,
  reviewer_id TEXT NOT NULL,
  verdict TEXT NOT NULL CHECK(verdict IN ('approved','rejected','revising')),
  comment TEXT,
  score INTEGER CHECK(score BETWEEN 1 AND 5),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

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

-- 8. 初始化项目数据（首页显示用）
-- 使用 INSERT OR REPLACE 更新 review-tool 的路径与描述，其余项目使用 INSERT OR IGNORE 不覆盖已有数据
INSERT OR IGNORE INTO projects (id, name, dir, description, path, status) VALUES
('gist', 'Gist 代码片段分享', 'ac-cloudflare-r2-d1-gist', '基于 Cloudflare Workers + D1 + R2 的 Gist 代码片段分享服务（支持配额统计与限制）。', '/gist/', 'online'),
('counter', '免费访问计数器', 'ac-memfire-cloud-counter', '基于 Memfire Cloud + Cloudflare Worker + Upstash 的免费访问计数器。', '/counter/', 'planned'),
('access-log', '访问日志调度器', 'ac-avlcode-access-log-scheduler', 'ac 定时处理 avlcode 的访问日志。', '/access-log/', 'planned'),
('multimodal', '多模态代码示例', 'ac-multimodal-code-examples', 'ac 多模态代码示例。', '/multimodal/', 'planned'),
('website-cms', '网站内容发布系统', 'ac-website-cms', 'ac 制作网站内容发布系统。', '/website-cms/', 'planned'),
('user-feedback', 'AVL 用户反馈系统', 'ac-avl-user-feedback', 'ac 制作 avl 用户反馈系统。', '/user-feedback/', 'planned'),
('roundtable', '圆桌会议重制版', 'ac-roundtable-remake', 'ac 重制圆桌会议。', '/roundtable/', 'planned'),
('zhijia-analysis', '智甲性能分析', 'ac-zhijia-performance-analysis', 'ac 审查智甲代码，定位卡顿瓶颈。', '/zhijia-analysis/', 'planned'),
('serial-number', '序列号生成与验证系统', 'ac-serial-number-generator', 'ac 自动生成序列号系统与验证系统。', '/serial-number/', 'planned');

INSERT OR REPLACE INTO projects (id, name, dir, description, path, status) VALUES
('review-tool', 'AC 审稿小工具', 'ac-review-tool', 'ac 审稿小工具：稿件提交、分配审稿人、审稿意见与附件管理（共享 R2/D1 配额限制）。', '/review/', 'online');

-- 9. 初始化审稿小工具默认用户（不影响已存在用户）
INSERT OR IGNORE INTO review_users (id, name, token, role) VALUES
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

-- 10. 初始化审稿评语模板（不影响已存在模板）
INSERT OR IGNORE INTO review_templates (id, name, verdict, comment, created_by) VALUES
('tpl-approve-1', '通过：质量优秀', 'approved', '稿件内容完整、逻辑清晰，建议直接通过。', 'admin'),
('tpl-reject-1', '拒绝：方向不符', 'rejected', '稿件主题与当前栏目方向不符，建议退稿。', 'admin'),
('tpl-revise-1', '需修改：补充细节', 'revising', '整体方向可行，但需补充实验细节与数据支撑，请修改后重新提交。', 'admin'),
('tpl-revise-2', '需修改：格式问题', 'revising', '内容尚可，但格式与引用规范存在较多问题，请按模板调整后重投。', 'admin');

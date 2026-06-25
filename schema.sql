-- AVL Code 示例工程集合数据库Schema
-- 本地开发时使用: npm run db:migrate

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

CREATE TABLE IF NOT EXISTS access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  method TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS r2_files (
  key TEXT PRIMARY KEY,
  content_type TEXT,
  size INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 初始化示例数据
INSERT OR IGNORE INTO projects (id, name, dir, description, path, status) VALUES
('gist', 'Gist 代码片段分享', 'ac-cloudflare-r2-d1-gist', '基于 Cloudflare Workers + D1 + R2 的 Gist 代码片段分享服务（支持配额统计与限制）。', '/gist/', 'online'),
('counter', '免费访问计数器', 'ac-memfire-cloud-counter', '基于 Memfire Cloud + Cloudflare Worker + Upstash 的免费访问计数器。', '/counter/', 'planned'),
('review-tool', 'AC 审稿小工具', 'ac-review-tool', 'ac 审稿小工具。', '/review-tool/', 'planned'),
('access-log', '访问日志调度器', 'ac-avlcode-access-log-scheduler', 'ac 定时处理 avlcode 的访问日志。', '/access-log/', 'planned'),
('multimodal', '多模态代码示例', 'ac-multimodal-code-examples', 'ac 多模态代码示例。', '/multimodal/', 'planned'),
('website-cms', '网站内容发布系统', 'ac-website-cms', 'ac 制作网站内容发布系统。', '/website-cms/', 'planned'),
('user-feedback', 'AVL 用户反馈系统', 'ac-avl-user-feedback', 'ac 制作 avl 用户反馈系统。', '/user-feedback/', 'planned'),
('roundtable', '圆桌会议重制版', 'ac-roundtable-remake', 'ac 重制圆桌会议。', '/roundtable/', 'planned'),
('zhijia-analysis', '智甲性能分析', 'ac-zhijia-performance-analysis', 'ac 审查智甲代码，定位卡顿瓶颈。', '/zhijia-analysis/', 'planned'),
('serial-number', '序列号生成与验证系统', 'ac-serial-number-generator', 'ac 自动生成序列号系统与验证系统。', '/serial-number/', 'planned');


-- ============================================================
-- ac-cloudflare-r2-d1-gist 子项目表（Gist 代码片段分享服务）
-- 同时作为所有子项目共用的 D1/R2 配额统计表
-- ============================================================

-- Gist 主表
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

-- Gist 文件表
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

-- R2 使用配额表（按月统计，所有子项目共用）
-- Class A: PUT/DELETE/LIST，免费额度 90 万次/月
-- Class B: GET/HEAD，免费额度 900 万次/月
-- Storage: 8GB
CREATE TABLE IF NOT EXISTS r2_quota (
  id TEXT PRIMARY KEY,
  month TEXT NOT NULL,
  class_a_count INTEGER DEFAULT 0,
  class_b_count INTEGER DEFAULT 0,
  storage_bytes INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_r2_quota_month ON r2_quota(month);

-- D1 使用配额表（按天统计，所有子项目共用）
-- reads: SELECT 行数
-- writes: INSERT/UPDATE 行数
-- deletes: DELETE 行数
CREATE TABLE IF NOT EXISTS d1_quota (
  id TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  reads INTEGER DEFAULT 0,
  writes INTEGER DEFAULT 0,
  deletes INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_d1_quota_day ON d1_quota(day);

-- ac-cloudflare-r2-d1-gist 数据库 Schema
-- 本地开发: npm run db:migrate
-- 远程部署: npm run db:migrate:remote

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

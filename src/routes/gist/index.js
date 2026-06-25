/**
 * ac-cloudflare-r2-d1-gist
 * 基于 Cloudflare Workers + D1 + R2 的 Gist 代码片段分享服务
 *
 * 特性：
 * - 创建/查看/更新/删除 Gist（公开/私有）
 * - 多文件支持，R2 存储内容，D1 存储元数据
 * - 1-365 天过期时间，Cron 每日清理
 * - R2/D1 使用配额统一统计与限制
 * - HTML 展示页、Raw 内容页、REST API
 *
 * 部署方式：
 * - 独立部署：使用本目录 wrangler.toml 中的 DB / GIST_BUCKET 绑定
 * - 集成到主项目：使用 avlcodeexample 根目录的 AVLCODEDB / AVLCODE_BUCKET 绑定
 */

// ==================== 配置 ====================
const CONFIG = {
  MAX_CONTENT_SIZE: parseInt(globalThis.MAX_CONTENT_SIZE || "1048576", 10),
  MAX_TOTAL_SIZE: 5 * 1024 * 1024,
  DEFAULT_TTL_DAYS: parseInt(globalThis.DEFAULT_TTL_DAYS || "30", 10),
  MAX_TTL_DAYS: 365,
  MIN_TTL_DAYS: 1,
  MAX_FILES_PER_GIST: 10,
  MAX_TITLE_LENGTH: 200,
  MAX_DESC_LENGTH: 2000,
  MAX_FILENAME_LENGTH: 255,
  ID_LENGTH: 8,
  SECRET_LENGTH: 32,
  R2_KEY_PREFIX: "gists/",
  R2_CLASS_A_MONTHLY: 900_000,
  R2_CLASS_B_MONTHLY: 9_000_000,
  R2_STORAGE_BYTES: 8 * 1024 * 1024 * 1024,
  D1_READS_DAILY: 100_000_000,
  D1_WRITES_DAILY: 1_000_000,
  D1_DELETES_DAILY: 1_000_000,
};

// ==================== HTML 模板 ====================
const HOME_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gist Share - 代码片段分享</title>
  <style>
    :root { --bg: #0b1120; --card: #151e32; --text: #e2e8f0; --muted: #94a3b8; --accent: #38bdf8; --accent-2: #818cf8; --border: #1e293b; --danger: #ef4444; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; padding: 2rem 1rem; }
    .container { max-width: 900px; margin: 0 auto; }
    header { text-align: center; margin-bottom: 2rem; }
    h1 { margin: 0 0 .25rem; background: linear-gradient(90deg, var(--accent), var(--accent-2)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
    .sub { color: var(--muted); margin: 0; }
    form { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; margin-bottom: 2rem; }
    input, textarea, select { width: 100%; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: .75rem 1rem; font-size: .95rem; margin-bottom: .75rem; }
    input:focus, textarea:focus, select:focus { outline: 2px solid var(--accent); }
    textarea { min-height: 120px; font-family: "Fira Code", "Cascadia Code", monospace; resize: vertical; }
    .row { display: flex; gap: .75rem; align-items: center; flex-wrap: wrap; margin-bottom: .75rem; }
    .row label { display: flex; align-items: center; gap: .4rem; color: var(--muted); cursor: pointer; }
    .row input[type="checkbox"] { width: auto; margin: 0; }
    .row input[type="number"] { width: 100px; }
    .file-row { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; margin-bottom: .75rem; }
    .file-row input { margin-bottom: .5rem; }
    .file-row textarea { min-height: 100px; }
    button { background: var(--accent); color: #0b1120; border: 0; padding: .65rem 1.25rem; border-radius: 8px; font-weight: 600; cursor: pointer; font-size: .95rem; }
    button:hover { filter: brightness(1.1); }
    button.secondary { background: var(--border); color: var(--text); }
    button.danger { background: var(--danger); color: #fff; }
    .actions { display: flex; gap: .75rem; flex-wrap: wrap; margin-top: .5rem; }
    .result { margin-top: 1rem; padding: 1rem; background: var(--bg); border-radius: 8px; border: 1px solid var(--border); }
    .result a { color: var(--accent); word-break: break-all; }
    .error { color: #f87171; }
    .success { color: #4ade80; }
    .recent { margin-top: 2rem; }
    .recent h3 { margin-bottom: .75rem; }
    .gist-item { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: .875rem 1rem; margin-bottom: .6rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: .5rem; }
    .gist-item a { color: var(--accent); font-weight: 600; text-decoration: none; }
    .gist-item a:hover { text-decoration: underline; }
    .gist-item .meta { color: var(--muted); font-size: .8rem; }
    .hidden { display: none; }
    @media (max-width: 640px) { body { padding: 1rem; } h1 { font-size: 1.6rem; } }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>📝 Gist Share</h1>
      <p class="sub">基于 Cloudflare Workers + D1 + R2 的代码片段分享服务</p>
    </header>

    <form id="gist-form" onsubmit="return false;">
      <input id="title" placeholder="标题（可选）" maxlength="200">
      <textarea id="description" placeholder="描述（可选）" maxlength="2000"></textarea>
      <div class="row">
        <label><input type="checkbox" id="is-public" checked> 公开 Gist</label>
        <span style="color:var(--muted)">保留</span>
        <input id="days" type="number" value="30" min="1" max="365">
        <span style="color:var(--muted)">天</span>
      </div>

      <div id="files">
        <div class="file-row">
          <input class="filename" placeholder="文件名（如 hello.js）" required>
          <textarea class="content" placeholder="在此粘贴文件内容..." required></textarea>
        </div>

      <div class="actions">
        <button type="button" id="add-file" class="secondary">+ 添加文件</button>
        <button type="submit" id="create-btn">📤 创建 Gist</button>
      </div>
      <div id="result"></div>
    </form>

    <div class="recent">
      <h3>📚 最新公开 Gist</h3>
      <div id="public-list"><div style="color:var(--muted)">加载中...</div></div>
    </div>

  <script>
    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function computeBase() {
      var path = window.location.pathname.replace(/\\/+$/,'');

      path = path.replace(/\\/[a-z0-9]{8}$/,'');

      return window.location.origin + path;
    }

    var BASE = computeBase();
    console.log('Gist BASE:', BASE);

    function addFileRow() {
      var files = document.getElementById('files');
      var count = files.querySelectorAll('.file-row').length;
      if (count >= 10) { alert('最多 10 个文件'); return; }
      var row = document.createElement('div');
      row.className = 'file-row';
      row.innerHTML = '<input class="filename" placeholder="文件名（如 hello.js）" required>' +
        '<textarea class="content" placeholder="在此粘贴文件内容..." required></textarea>' +
        '<button type="button" class="remove-file secondary">删除文件</button>';
      files.appendChild(row);
      console.log('Added file row, total:', count + 1);
    }

    var addFileBtn = document.getElementById('add-file');
    if (addFileBtn) {
      addFileBtn.addEventListener('click', function() {
        console.log('Add file clicked');
        addFileRow();
      });
    }

    var filesContainer = document.getElementById('files');
    if (filesContainer) {
      filesContainer.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove-file')) {
          var row = e.target.closest('.file-row');
          if (row) row.remove();
        }
      });
    }

    var gistForm = document.getElementById('gist-form');
    if (gistForm) {
      gistForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        console.log('Form submit');
        var result = document.getElementById('result');
        result.innerHTML = '';

        var title = document.getElementById('title').value.trim();
        var description = document.getElementById('description').value.trim();
        var is_public = document.getElementById('is-public').checked;
        var days = parseInt(document.getElementById('days').value) || 30;

        var rows = document.querySelectorAll('.file-row');
        var files = [];
        rows.forEach(function(row) {
          var filename = row.querySelector('.filename').value.trim();
          var content = row.querySelector('.content').value;
          if (filename) files.push({ filename: filename, content: content });
        });

        if (files.length === 0) {
          result.innerHTML = '<div class="error">请至少添加一个文件</div>';
          return;
        }

        try {
          var url = BASE + '/api/gists';
          console.log('POST', url, { title: title, is_public: is_public, days: days, files: files.length });
          var r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title, description: description, is_public: is_public, days: days, files: files }),
          });
          var text = await r.text();
          var d = {};
          try { d = JSON.parse(text); } catch (parseErr) { d = { error: '非 JSON 响应: ' + text.slice(0, 200) }; }
          if (r.ok) {
            var viewUrl = BASE + '/' + d.id;
            var manageUrl = viewUrl + '?secret_key=' + encodeURIComponent(d.secret_key);
            result.innerHTML = '<div class="success">✅ 创建成功！</div>' +
              '<div>查看链接：<a href="' + viewUrl + '" target="_blank">' + viewUrl + '</a></div>' +
              '<div>管理链接（含 secret_key，请妥善保存）：<a href="' + manageUrl + '" target="_blank">' + manageUrl + '</a></div>';
            loadPublic();
          } else {
            result.innerHTML = '<div class="error">[' + r.status + '] ' + escapeHtml(d.error || '创建失败') + '</div>';
          }
        } catch (err) {
          console.error('Create error:', err);
          result.innerHTML = '<div class="error">' + escapeHtml(err.message) + '</div>';
        }
      });
    }

    async function loadPublic() {
      var list = document.getElementById('public-list');
      try {
        var r = await fetch(BASE + '/api/gists?limit=20');
        var text = await r.text();
        var d = {};
        try { d = JSON.parse(text); } catch (parseErr) { throw new Error('非 JSON 响应: ' + text.slice(0, 200)); }
        if (!r.ok) { throw new Error(d.error || 'HTTP ' + r.status); }
        if (!d.gists || d.gists.length === 0) {
          list.innerHTML = '<div style="color:var(--muted)">暂无公开 Gist</div>';
          return;
        }
        list.innerHTML = d.gists.map(function(g) {
          var title = g.title || g.id;
          var desc = g.description ? '<div class="meta">' + escapeHtml(g.description.slice(0, 80)) + (g.description.length > 80 ? '...' : '') + '</div>' : '';
          return '<div class="gist-item"><div><a href="' + BASE + '/' + g.id + '">' + escapeHtml(title) + '</a>' + desc + '</div><div class="meta">' + g.files.length + ' 文件 · ' + new Date(g.created_at).toLocaleString() + '</div></div>';
        }).join('');
      } catch (e) {
        console.error('loadPublic error:', e);
        list.innerHTML = '<div style="color:var(--muted)">加载失败: ' + escapeHtml(e.message) + '</div>';
      }
    }


    loadPublic();
  </script>
</body>
</html>`;

const VIEW_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gist View</title>
  <style>
    :root { --bg: #0b1120; --card: #151e32; --text: #e2e8f0; --muted: #94a3b8; --accent: #38bdf8; --accent-2: #818cf8; --border: #1e293b; --danger: #ef4444; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); min-height: 100vh; padding: 2rem 1rem; }
    .container { max-width: 960px; margin: 0 auto; }
    .header { margin-bottom: 1.5rem; }
    h1 { margin: 0 0 .5rem; word-break: break-word; }
    .description { color: var(--muted); margin-bottom: .5rem; white-space: pre-wrap; }
    .meta { color: var(--muted); font-size: .85rem; }
    .tabs { display: flex; gap: .25rem; flex-wrap: wrap; margin-bottom: .75rem; border-bottom: 1px solid var(--border); padding-bottom: .5rem; }
    .tab { background: transparent; color: var(--muted); border: 1px solid transparent; padding: .4rem .8rem; border-radius: 6px; cursor: pointer; font-weight: 500; }
    .tab:hover { color: var(--text); }
    .tab.active { background: var(--card); color: var(--accent); border-color: var(--border); }
    .file-content { background: var(--card); border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
    .file-content pre { margin: 0; padding: 1.25rem; overflow-x: auto; font-family: "Fira Code", "Cascadia Code", monospace; font-size: .875rem; line-height: 1.6; }
    .file-content code { color: var(--text); }
    .actions { display: flex; gap: .75rem; flex-wrap: wrap; margin-top: 1.25rem; }
    .actions a, .actions button { text-decoration: none; }
    button { background: var(--accent); color: #0b1120; border: 0; padding: .6rem 1.1rem; border-radius: 8px; font-weight: 600; cursor: pointer; }
    button:hover { filter: brightness(1.1); }
    button.secondary { background: var(--border); color: var(--text); }
    button.danger { background: var(--danger); color: #fff; }
    .error { color: #f87171; padding: 2rem; text-align: center; }
    .empty { color: var(--muted); padding: 2rem; text-align: center; }
    @media (max-width: 640px) { body { padding: 1rem; } h1 { font-size: 1.4rem; } }
  </style>
</head>
<body>
  <div class="container">
    <div id="gist-container">
      <div class="empty">加载中...</div>
    </div>

  <script>
    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, function(c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
      });
    }

    function computeBase() {
      var path = window.location.pathname.replace(/\\/+$/,'');

      path = path.replace(/\\/[a-z0-9]{8}$/,'');

      return window.location.origin + path;
    }

    var BASE = computeBase();
    var pathParts = window.location.pathname.replace(/\\/+$/, '').split('/');

    var gistId = pathParts[pathParts.length - 1];
    var params = new URLSearchParams(window.location.search);
    var secretKey = params.get('secret_key');
    var currentGist = null;

    async function loadGist() {
      var container = document.getElementById('gist-container');
      try {
        var url = BASE + '/api/gists/' + gistId;
        if (secretKey) url += '?secret_key=' + encodeURIComponent(secretKey);
        var r = await fetch(url);
        var text = await r.text();
        var g = {};
        try { g = JSON.parse(text); } catch (parseErr) { throw new Error('非 JSON 响应: ' + text.slice(0, 200)); }
        if (!r.ok) { throw new Error(g.error || 'HTTP ' + r.status); }
        currentGist = g;
        renderGist();
      } catch (e) {
        container.innerHTML = '<div class="error">加载失败：' + escapeHtml(e.message) + '</div>';
      }
    }

    function renderGist() {
      var g = currentGist;
      var container = document.getElementById('gist-container');
      var desc = g.description ? '<div class="description">' + escapeHtml(g.description) + '</div>' : '';
      var isOwner = !!secretKey && secretKey === g.secret_key;
      var ownerActions = isOwner
        ? '<button id="edit-btn" class="secondary">编辑</button><button id="delete-btn" class="danger">删除</button>'
        : '';

      var tabsHtml = '';
      if (g.files.length > 1) {
        tabsHtml = '<div class="tabs">' + g.files.map(function(f, i) {
          return '<button class="tab ' + (i === 0 ? 'active' : '') + '" data-filename="' + escapeHtml(f.filename) + '">' + escapeHtml(f.filename) + '</button>';
        }).join('') + '</div>';
      }

      container.innerHTML = '<div class="header"><h1>' + escapeHtml(g.title || '未命名 Gist') + '</h1>' + desc +
        '<div class="meta">ID: ' + g.id + ' · ' + (g.is_public ? '公开' : '私有') + ' · 过期: ' + new Date(g.expires_at).toLocaleString() + ' · ' + g.files.length + ' 文件</div></div>' +
        tabsHtml + '<div class="file-content" id="file-content"><div class="empty">加载中...</div></div>' +
        '<div class="actions"><button id="copy-btn">📋 复制</button><a id="raw-link" class="secondary" target="_blank" style="display:inline-flex;align-items:center;padding:.6rem 1.1rem;border-radius:8px;">查看原始</a>' + ownerActions + '<a href="' + BASE + '" class="secondary" style="display:inline-flex;align-items:center;padding:.6rem 1.1rem;border-radius:8px;">← 首页</a></div>';

      var copyBtn = document.getElementById('copy-btn');
      if (copyBtn) {
        copyBtn.addEventListener('click', function() {
          var code = document.querySelector('#file-content code');
          if (code) navigator.clipboard.writeText(code.textContent).then(function() { alert('已复制'); });
        });
      }

      if (isOwner) {
        var deleteBtn = document.getElementById('delete-btn');
        if (deleteBtn) {
          deleteBtn.addEventListener('click', async function() {
            if (!confirm('确定删除此 Gist？此操作不可恢复。')) return;
            try {
              var r = await fetch(BASE + '/api/gists/' + gistId + '?secret_key=' + encodeURIComponent(secretKey), { method: 'DELETE' });
              if (r.ok) { alert('已删除'); window.location.href = BASE; }
              else { var d = await r.json(); alert(d.error || '删除失败'); }
            } catch (e) { alert(e.message); }
          });
        }
        var editBtn = document.getElementById('edit-btn');
        if (editBtn) {
          editBtn.addEventListener('click', function() {
            alert('编辑功能请通过 REST API 使用 PUT /api/gists/' + gistId);
          });
        }
      }

      document.querySelectorAll('.tab').forEach(function(tab) {
        tab.addEventListener('click', function() { loadFile(tab.dataset.filename); });
      });

      if (g.files.length > 0) loadFile(g.files[0].filename);
    }

    async function loadFile(filename) {
      var contentEl = document.getElementById('file-content');
      contentEl.innerHTML = '<div class="empty">加载中...</div>';

      document.querySelectorAll('.tab').forEach(function(t) {
        t.classList.toggle('active', t.dataset.filename === filename);
      });

      try {
        var url = BASE + '/raw/' + gistId + '/' + encodeURIComponent(filename);
        if (secretKey) url += '?secret_key=' + encodeURIComponent(secretKey);
        var r = await fetch(url);
        var text = await r.text();
        contentEl.innerHTML = '<pre><code>' + escapeHtml(text) + '</code></pre>';
        var rawLink = document.getElementById('raw-link');
        if (rawLink) rawLink.href = url;
      } catch (e) {
        contentEl.innerHTML = '<div class="error">加载失败：' + escapeHtml(e.message) + '</div>';
      }
    }

    loadGist();
  </script>
</body>
</html>`;

// ==================== 工具函数 ====================
function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Secret-Key",
      ...extraHeaders,
    },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
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
      "Access-Control-Allow-Headers": "Content-Type, X-Secret-Key",
    },
  });
}

function getDb(env) {
  return env.DB || env.AVLCODEDB;
}

function getBucket(env) {
  return env.GIST_BUCKET || env.AVLCODE_BUCKET || env.CLIPBOARD_BUCKET;
}

function generateId(length = CONFIG.ID_LENGTH) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < length; i++) {
    id += chars[Math.floor(Math.random() * chars.length)];
  }
  return id;
}

function generateSecret(length = CONFIG.SECRET_LENGTH) {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let secret = "";
  for (let i = 0; i < length; i++) {
    secret += chars[Math.floor(Math.random() * chars.length)];
  }
  return secret;
}

function getMonthKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function getDayKey(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function addDays(days, date = new Date()) {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function normalizeUrl(url) {
  const prefix = "/gist";
  if (url.pathname === prefix) {
    url.pathname = "/";
  } else if (url.pathname.startsWith(prefix + "/")) {
    url.pathname = url.pathname.slice(prefix.length) || "/";
  }
  return url;
}

function guessContentType(filename) {
  const ext = filename.split(".").pop().toLowerCase();
  const map = {
    js: "application/javascript",
    mjs: "application/javascript",
    ts: "application/typescript",
    json: "application/json",
    html: "text/html",
    htm: "text/html",
    css: "text/css",
    md: "text/markdown",
    txt: "text/plain",
    py: "text/x-python",
    java: "text/x-java-source",
    c: "text/x-c",
    cpp: "text/x-c++",
    h: "text/x-c",
    hpp: "text/x-c++",
    go: "text/x-go",
    rs: "text/x-rust",
    rb: "text/x-ruby",
    php: "text/x-php",
    sh: "text/x-shellscript",
    bash: "text/x-shellscript",
    yaml: "text/yaml",
    yml: "text/yaml",
    xml: "application/xml",
    svg: "image/svg+xml",
  };
  return map[ext] || "text/plain";
}

function clampDays(days) {
  return Math.min(Math.max(parseInt(days, 10) || CONFIG.DEFAULT_TTL_DAYS, CONFIG.MIN_TTL_DAYS), CONFIG.MAX_TTL_DAYS);
}

function validateGistBody(body) {
  if (!body || typeof body !== "object") return { ok: false, error: "Invalid JSON body" };
  if (!Array.isArray(body.files) || body.files.length === 0) return { ok: false, error: "files array is required" };
  if (body.files.length > CONFIG.MAX_FILES_PER_GIST) return { ok: false, error: `Max ${CONFIG.MAX_FILES_PER_GIST} files per gist` };

  for (const file of body.files) {
    if (!file || typeof file !== "object") return { ok: false, error: "Invalid file entry" };
    if (!file.filename || typeof file.filename !== "string") return { ok: false, error: "filename is required" };
    if (file.filename.length > CONFIG.MAX_FILENAME_LENGTH) return { ok: false, error: `filename too long (max ${CONFIG.MAX_FILENAME_LENGTH})` };
    if (file.filename.includes("/") || file.filename.includes("\\") || file.filename === "." || file.filename === "..") {
      return { ok: false, error: "filename contains invalid characters" };
    }
    if (typeof file.content !== "string") return { ok: false, error: "content must be string" };
    const size = new TextEncoder().encode(file.content).length;
    if (size > CONFIG.MAX_CONTENT_SIZE) {
      return { ok: false, error: `file "${file.filename}" exceeds ${CONFIG.MAX_CONTENT_SIZE} bytes` };
    }

  if (body.title && typeof body.title === "string" && body.title.length > CONFIG.MAX_TITLE_LENGTH) {
    return { ok: false, error: `title too long (max ${CONFIG.MAX_TITLE_LENGTH})` };
  }
  if (body.description && typeof body.description === "string" && body.description.length > CONFIG.MAX_DESC_LENGTH) {
    return { ok: false, error: `description too long (max ${CONFIG.MAX_DESC_LENGTH})` };
  }

  return { ok: true };
}
}


function getSecretKey(request, url) {
  const header = request.headers.get("X-Secret-Key");
  if (header) return header;
  return url.searchParams.get("secret_key");
}

function sanitizeGist(gist, withSecret = false) {
  const result = {
    id: gist.id,
    title: gist.title,
    description: gist.description,
    is_public: !!gist.is_public,
    expires_at: gist.expires_at,
    created_at: gist.created_at,
    updated_at: gist.updated_at,
    files: (gist.files || []).map((f) => ({
      filename: f.filename,
      content_type: f.content_type,
      size: f.size,
    })),
  };
  if (withSecret && withSecret === gist.secret_key) {
    result.secret_key = gist.secret_key;
  }
  return result;
}

// ==================== 配额管理器（所有项目共用机制） ====================
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
    const now = new Date().toISOString();

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

  async reconcileStorage() {
    if (!this.db) return;
    try {
      const { results } = await this.db.prepare("SELECT COALESCE(SUM(size), 0) as total FROM gist_files").all();
      this.recordD1Read(1);
      const actual = results[0]?.total || 0;
      await this.db
        .prepare("UPDATE r2_quota SET storage_bytes = ?, updated_at = ? WHERE id = ?")
        .bind(actual, new Date().toISOString(), this.r2Quota.id)
        .run();
      this.recordD1Write(1);
    } catch (err) {
      console.error("Failed to reconcile storage:", err);
    }


  }

}


// ==================== D1 存储层 ====================
class GistStore {
  constructor(db, quota) {
    this.db = db;
    this.quota = quota;
  }

  async createGist(gist) {
    if (!this.quota.checkD1Write(1)) throw new QuotaError("D1 write quota exceeded", "D1_WRITE_EXCEEDED");
    await this.db
      .prepare(
        `INSERT INTO gists (id, title, description, is_public, secret_key, expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(gist.id, gist.title, gist.description, gist.is_public, gist.secret_key, gist.expires_at, gist.created_at, gist.updated_at)
      .run();
    this.quota.recordD1Write(1);

    for (const file of gist.files) {
      if (!this.quota.checkD1Write(1)) throw new QuotaError("D1 write quota exceeded", "D1_WRITE_EXCEEDED");
      await this.db
        .prepare(
          `INSERT INTO gist_files (gist_id, filename, content_type, size, r2_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(gist.id, file.filename, file.contentType, file.size, file.r2Key, gist.created_at, gist.updated_at)
        .run();
      this.quota.recordD1Write(1);
  }

    }

  async getGist(id, secretKey = null) {
    if (!this.quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
    const gist = await this.db.prepare("SELECT * FROM gists WHERE id = ?").bind(id).first();
    this.quota.recordD1Read(1);
    if (!gist) return null;

    if (!gist.is_public && gist.secret_key !== secretKey) {
      const err = new Error("Private gist requires secret_key");
      err.code = "AUTH_REQUIRED";
      throw err;
    }

    if (new Date(gist.expires_at) <= new Date()) {
      return null;
    }

    if (!this.quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
    const { results } = await this.db.prepare("SELECT * FROM gist_files WHERE gist_id = ? ORDER BY filename").bind(id).all();
    this.quota.recordD1Read(results.length);
    gist.files = results || [];
    return gist;
  }

  async updateGist(id, updates) {
    const fields = [];
    const values = [];
    if (updates.title !== undefined) {
      fields.push("title = ?");
      values.push(updates.title);
    }
    if (updates.description !== undefined) {
      fields.push("description = ?");
      values.push(updates.description);
    }
    if (updates.is_public !== undefined) {
      fields.push("is_public = ?");
      values.push(updates.is_public);
    }
    if (updates.expires_at !== undefined) {
      fields.push("expires_at = ?");
      values.push(updates.expires_at);
    }
    if (fields.length === 0) return;

    fields.push("updated_at = ?");
    values.push(new Date().toISOString());
    values.push(id);

    if (!this.quota.checkD1Write(1)) throw new QuotaError("D1 write quota exceeded", "D1_WRITE_EXCEEDED");
    await this.db.prepare(`UPDATE gists SET ${fields.join(", ")} WHERE id = ?`).bind(...values).run();
    this.quota.recordD1Write(1);
  }

  async deleteFiles(gistId) {
    if (!this.quota.checkD1Delete(1)) throw new QuotaError("D1 delete quota exceeded", "D1_DELETE_EXCEEDED");
    await this.db.prepare("DELETE FROM gist_files WHERE gist_id = ?").bind(gistId).run();
    this.quota.recordD1Delete(1);
  }

  async addFiles(gistId, files) {
    const now = new Date().toISOString();
    for (const file of files) {
      if (!this.quota.checkD1Write(1)) throw new QuotaError("D1 write quota exceeded", "D1_WRITE_EXCEEDED");
      await this.db
        .prepare(
          `INSERT INTO gist_files (gist_id, filename, content_type, size, r2_key, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(gistId, file.filename, file.contentType, file.size, file.r2Key, now, now)
        .run();
      this.quota.recordD1Write(1);
  }

    }

  async deleteGist(id) {
    if (!this.quota.checkD1Delete(1)) throw new QuotaError("D1 delete quota exceeded", "D1_DELETE_EXCEEDED");
    await this.db.prepare("DELETE FROM gist_files WHERE gist_id = ?").bind(id).run();
    this.quota.recordD1Delete(1);

    if (!this.quota.checkD1Delete(1)) throw new QuotaError("D1 delete quota exceeded", "D1_DELETE_EXCEEDED");
    await this.db.prepare("DELETE FROM gists WHERE id = ?").bind(id).run();
    this.quota.recordD1Delete(1);
  }

  async listPublicGists(limit, offset) {
    if (!this.quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
    const { results } = await this.db
      .prepare(
        `SELECT * FROM gists
         WHERE is_public = 1 AND expires_at > ?
         ORDER BY created_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(new Date().toISOString(), limit, offset)
      .all();
    this.quota.recordD1Read(results.length);

    if (results.length > 0) {
      if (!this.quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
      const gistIds = results.map((g) => g.id);
      const placeholders = gistIds.map(() => "?").join(",");
      const { results: files } = await this.db
        .prepare(`SELECT * FROM gist_files WHERE gist_id IN (${placeholders}) ORDER BY filename`)
        .bind(...gistIds)
        .all();
      this.quota.recordD1Read(files.length);

      const filesByGist = {};
      for (const f of files) {
        if (!filesByGist[f.gist_id]) filesByGist[f.gist_id] = [];
        filesByGist[f.gist_id].push(f);
      }
      for (const g of results) {
        g.files = filesByGist[g.id] || [];
      }
    }


    return results || [];
  }

  async listExpiredGists() {
    if (!this.quota.checkD1Read(1)) throw new QuotaError("D1 read quota exceeded", "D1_READ_EXCEEDED");
    const { results } = await this.db.prepare("SELECT * FROM gists WHERE expires_at <= ?").bind(new Date().toISOString()).all();
    this.quota.recordD1Read(results.length);
    return results || [];
  }
}

// ==================== R2 存储层（带配额检查） ====================
class R2Store {
  constructor(bucket, quota) {
    this.bucket = bucket;
    this.quota = quota;
  }

  async put(key, body, metadata = {}) {
    const bytes = typeof body === "string" ? new TextEncoder().encode(body).length : body.byteLength || 0;
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

  async head(key) {
    if (!this.quota.checkR2ClassB(1)) throw new QuotaError("R2 Class B quota exceeded", "R2_CLASS_B_EXCEEDED");
    const obj = await this.bucket.head(key);
    this.quota.recordR2ClassB(1);
    return obj;
  }

  async delete(key) {
    if (!this.quota.checkR2ClassA(1)) throw new QuotaError("R2 Class A quota exceeded", "R2_CLASS_A_EXCEEDED");
    await this.bucket.delete(key);
    this.quota.recordR2ClassA(1);
  }
}


// ==================== 请求处理器 ====================
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
    console.error("Handler error:", err);
    return json({ error: err.message }, 500);
  } finally {
    await quota.flush();
  }
}


async function handleCreate(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const body = await request.json();
    console.log("Create gist request:", JSON.stringify({ title: body?.title, is_public: body?.is_public, days: body?.days, fileCount: body?.files?.length }));
    const validation = validateGistBody(body);
    if (!validation.ok) return json({ error: validation.error }, 400);

    const days = clampDays(body.days);
    const now = new Date();
    const gistId = generateId();
    const secretKey = generateSecret();

    const files = body.files.map((file) => {
      const contentType = file.content_type || guessContentType(file.filename);
      const size = new TextEncoder().encode(file.content).length;
      return {
        filename: file.filename,
        content: file.content,
        contentType,
        size,
        r2Key: `${CONFIG.R2_KEY_PREFIX}${gistId}/${file.filename}`,
      };
    });

    const totalSize = files.reduce((sum, f) => sum + f.size, 0);
    if (totalSize > CONFIG.MAX_TOTAL_SIZE) {
      return json({ error: `Total content size exceeds ${CONFIG.MAX_TOTAL_SIZE} bytes` }, 413);
    }

    if (!quota.checkR2ClassA(files.length)) throw new QuotaError("R2 Class A quota exceeded", "R2_CLASS_A_EXCEEDED");
    if (!quota.checkR2Storage(totalSize)) throw new QuotaError("R2 storage quota exceeded", "R2_STORAGE_EXCEEDED");
    if (!quota.checkD1Write(1 + files.length)) throw new QuotaError("D1 write quota exceeded", "D1_WRITE_EXCEEDED");

    const r2 = new R2Store(bucket, quota);
    const store = new GistStore(db, quota);

    for (const file of files) {
      await r2.put(file.r2Key, file.content, {
        httpMetadata: { contentType: file.contentType },
        customMetadata: { gist_id: gistId, filename: file.filename },
      });
    }

    await store.createGist({
      id: gistId,
      title: body.title || "",
      description: body.description || "",
      is_public: body.is_public === false ? 0 : 1,
      secret_key: secretKey,
      expires_at: addDays(days, now).toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
      files,
    });

    return json(
      {
        id: gistId,
        secret_key: secretKey,
        title: body.title || "",
        description: body.description || "",
        is_public: body.is_public !== false,
        expires_at: addDays(days, now).toISOString(),
        files: files.map((f) => ({ filename: f.filename, content_type: f.contentType, size: f.size })),
      },
      201
    );
  });
}

async function handleUpdate(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const match = url.pathname.match(/^\/api\/gists\/([a-z0-9]+)$/);
    if (!match) return json({ error: "Invalid gist id" }, 400);
    const gistId = match[1];
    const secretKey = getSecretKey(request, url);
    if (!secretKey) return json({ error: "secret_key required" }, 401);

    const body = await request.json();
    const store = new GistStore(db, quota);

    const gist = await store.getGist(gistId, secretKey);
    if (!gist) return json({ error: "Not found" }, 404);

    const updates = {};
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.is_public !== undefined) updates.is_public = body.is_public ? 1 : 0;
    if (body.days !== undefined) {
      const days = clampDays(body.days);
      const created = new Date(gist.created_at);
      updates.expires_at = addDays(days, created).toISOString();
    }

    const r2 = new R2Store(bucket, quota);

    if (body.files) {
      const validation = validateGistBody({ ...body, files: body.files });
      if (!validation.ok) return json({ error: validation.error }, 400);

      const newFiles = body.files.map((file) => {
        const contentType = file.content_type || guessContentType(file.filename);
        const size = new TextEncoder().encode(file.content).length;
        return {
          filename: file.filename,
          content: file.content,
          contentType,
          size,
          r2Key: `${CONFIG.R2_KEY_PREFIX}${gistId}/${file.filename}`,
        };
      });

      const totalSize = newFiles.reduce((sum, f) => sum + f.size, 0);
      if (totalSize > CONFIG.MAX_TOTAL_SIZE) {
        return json({ error: `Total content size exceeds ${CONFIG.MAX_TOTAL_SIZE} bytes` }, 413);
      }

      const oldSize = gist.files.reduce((sum, f) => sum + f.size, 0);
      const sizeDelta = totalSize - oldSize;

      if (!quota.checkR2ClassA(newFiles.length + gist.files.length)) {
        throw new QuotaError("R2 Class A quota exceeded", "R2_CLASS_A_EXCEEDED");
      }
      if (!quota.checkR2Storage(sizeDelta)) {
        throw new QuotaError("R2 storage quota exceeded", "R2_STORAGE_EXCEEDED");
      }
      if (!quota.checkD1Write(1 + newFiles.length + 1)) {
        throw new QuotaError("D1 write quota exceeded", "D1_WRITE_EXCEEDED");
      }
      if (!quota.checkD1Delete(1)) {
        throw new QuotaError("D1 delete quota exceeded", "D1_DELETE_EXCEEDED");
      }

      for (const file of gist.files) {
        await r2.delete(file.r2_key);
      }
      await store.deleteFiles(gistId);

      for (const file of newFiles) {
        await r2.put(file.r2Key, file.content, {
          httpMetadata: { contentType: file.contentType },
          customMetadata: { gist_id: gistId, filename: file.filename },
        });
      }
      await store.addFiles(gistId, newFiles);
    }

    await store.updateGist(gistId, updates);
    return json({ success: true, id: gistId });
  });
}

async function handleDelete(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const match = url.pathname.match(/^\/api\/gists\/([a-z0-9]+)$/);
    if (!match) return json({ error: "Invalid gist id" }, 400);
    const gistId = match[1];
    const secretKey = getSecretKey(request, url);
    if (!secretKey) return json({ error: "secret_key required" }, 401);

    const store = new GistStore(db, quota);
    const r2 = new R2Store(bucket, quota);

    const gist = await store.getGist(gistId, secretKey);
    if (!gist) return json({ error: "Not found" }, 404);

    if (!quota.checkR2ClassA(gist.files.length)) {
      throw new QuotaError("R2 Class A quota exceeded", "R2_CLASS_A_EXCEEDED");
    }
    if (!quota.checkD1Delete(2)) {
      throw new QuotaError("D1 delete quota exceeded", "D1_DELETE_EXCEEDED");
    }

    for (const file of gist.files) {
      await r2.delete(file.r2_key);
      quota.recordR2Storage(-file.size);
    }

    await store.deleteGist(gistId);
    return json({ success: true });
  });
}

async function handleGet(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const match = url.pathname.match(/^\/api\/gists\/([a-z0-9]+)$/);
    if (!match) return json({ error: "Invalid gist id" }, 400);
    const gistId = match[1];
    const secretKey = getSecretKey(request, url);

    const store = new GistStore(db, quota);
    const gist = await store.getGist(gistId, secretKey);
    if (!gist) return json({ error: "Not found" }, 404);

    return json(sanitizeGist(gist, secretKey));
  });
}

async function handleList(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const limit = Math.min(parseInt(url.searchParams.get("limit"), 10) || 20, 100);
    const offset = parseInt(url.searchParams.get("offset"), 10) || 0;
    const store = new GistStore(db, quota);
    const gists = await store.listPublicGists(limit, offset);
    return json({ gists: gists.map((g) => sanitizeGist(g)) });
  });
}

async function handleRaw(request, env, ctx, url) {
  return withQuota(env, async (db, bucket, quota) => {
    const match = url.pathname.match(/^\/raw\/([a-z0-9]+)\/(.+)$/);
    if (!match) return json({ error: "Invalid URL" }, 400);
    const gistId = match[1];
    const filename = decodeURIComponent(match[2]);
    const secretKey = getSecretKey(request, url);

    const store = new GistStore(db, quota);
    const r2 = new R2Store(bucket, quota);

    const gist = await store.getGist(gistId, secretKey);
    if (!gist) return json({ error: "Not found" }, 404);

    const file = gist.files.find((f) => f.filename === filename);
    if (!file) return json({ error: "File not found" }, 404);

    const obj = await r2.get(file.r2_key);
    if (!obj) return json({ error: "File not found in storage" }, 404);

    const content = await obj.text();
    return text(content, 200, { "Content-Type": file.content_type || "text/plain" });
  });
}

async function handleCleanup(env, ctx) {
  const db = getDb(env);
  const bucket = getBucket(env);
  if (!db || !bucket) {
    console.error("Cleanup skipped: D1 or R2 not bound");
    return;
  }

  const quota = new QuotaManager(db, bucket);
  await quota.init();

  try {
    const store = new GistStore(db, quota);
    const r2 = new R2Store(bucket, quota);

    const expired = await store.listExpiredGists();
    console.log(`Found ${expired.length} expired gists to clean up`);

    for (const gist of expired) {
      try {
        if (!quota.checkD1Read(1)) {
          console.warn("D1 read quota exceeded during cleanup, stopping");
          break;
        }
        const { results: files } = await db.prepare("SELECT * FROM gist_files WHERE gist_id = ?").bind(gist.id).all();
        quota.recordD1Read(1);

        if (!quota.checkR2ClassA(files.length)) {
          console.warn("R2 Class A quota exceeded during cleanup, stopping");
          break;
        }

        for (const file of files) {
          await r2.delete(file.r2_key);
          quota.recordR2Storage(-file.size);
        }

        if (!quota.checkD1Delete(2)) {
          console.warn("D1 delete quota exceeded during cleanup, stopping");
          break;
        }

        await store.deleteGist(gist.id);
        console.log(`Cleaned up gist ${gist.id}`);
      } catch (err) {
        console.error(`Failed to cleanup gist ${gist.id}:`, err);
      }
    }


    await quota.reconcileStorage();
  } finally {
    await quota.flush();
  }
}


// ==================== Worker 入口 ====================

export default {
  async fetch(request, env, ctx) {
    const url = normalizeUrl(new URL(request.url));

    if (request.method === "OPTIONS") {
      return corsPreflight();
    }

    try {
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return html(HOME_HTML);
      }

      if (url.pathname === "/api/gists" && request.method === "POST") {
        return await handleCreate(request, env, ctx, url);
      }

      if (url.pathname === "/api/gists" && request.method === "GET") {
        return await handleList(request, env, ctx, url);
      }

      const gistApiMatch = url.pathname.match(/^\/api\/gists\/([a-z0-9]+)$/);
      if (gistApiMatch) {
        if (request.method === "GET") return await handleGet(request, env, ctx, url);
        if (request.method === "PUT") return await handleUpdate(request, env, ctx, url);
        if (request.method === "DELETE") return await handleDelete(request, env, ctx, url);
      }

      if (url.pathname.startsWith("/raw/")) {
        return await handleRaw(request, env, ctx, url);
      }

      if (url.pathname.match(/^\/[a-z0-9]+$/)) {
        return html(VIEW_HTML);
      }

      return json({ error: "Not Found" }, 404);
    } catch (err) {
      console.error("Unhandled error:", err);
      return json({ error: err.message }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    console.log("Running scheduled cleanup:", event.cron);
    await handleCleanup(env, ctx);
  },
};

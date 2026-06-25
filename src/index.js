const SITE_BASE_URL = globalThis.SITE_BASE_URL || "https://example.avlcodesite.xyz";

// 子项目路由（由 scripts/build-routes.js 生成）
// 开发时如果未运行 build，routes 可能不存在，使用空对象兜底
let routes = {};
try {
  const routesModule = await import("./routes/index.js");
  routes = routesModule.routes || {};
} catch (e) {
  // 子项目未合并时忽略
}

const INDEX_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AVL Code 示例工程集合</title>
  <style>
    :root {
      --bg: #0b1120;
      --card: #151e32;
      --text: #e2e8f0;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --accent-2: #818cf8;
      --border: #1e293b;
      --online: #22c55e;
      --planned: #f59e0b;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: radial-gradient(ellipse at top, #111827 0%, var(--bg) 60%);
      color: var(--text);
      min-height: 100vh;
      padding: 2rem 1rem;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
    }
    header {
      text-align: center;
      margin-bottom: 3rem;
    }
    header h1 {
      font-size: 2.25rem;
      margin: 0 0 0.5rem;
      background: linear-gradient(90deg, var(--accent), var(--accent-2));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    header p {
      color: var(--muted);
      margin: 0;
      font-size: 1.05rem;
    }
    .domain {
      display: inline-block;
      margin-top: 1rem;
      padding: 0.35rem 0.9rem;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 0.875rem;
      color: var(--accent);
      font-family: "Fira Code", "Cascadia Code", monospace;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 1.25rem;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1.5rem;
      transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    .card:hover {
      transform: translateY(-3px);
      box-shadow: 0 12px 24px rgba(0, 0, 0, 0.25);
      border-color: #334155;
    }
    .card.online {
      border-left: 4px solid var(--online);
    }
    .card.planned {
      border-left: 4px solid var(--planned);
      opacity: 0.92;
    }
    .card-header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 0.75rem;
    }
    .card h2 {
      font-size: 1.15rem;
      margin: 0;
      line-height: 1.35;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      padding: 0.2rem 0.55rem;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.02em;
      white-space: nowrap;
    }
    .badge.online { background: rgba(34, 197, 94, 0.15); color: var(--online); }
    .badge.planned { background: rgba(245, 158, 11, 0.15); color: var(--planned); }
    .card p {
      color: var(--muted);
      font-size: 0.92rem;
      line-height: 1.55;
      margin: 0 0 1.25rem;
      flex: 1;
    }
    .card a, .card .placeholder {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.4rem;
      padding: 0.6rem 1rem;
      border-radius: 8px;
      font-size: 0.9rem;
      font-weight: 600;
      text-decoration: none;
      margin-top: auto;
    }
    .card a {
      background: var(--accent);
      color: #0b1120;
    }
    .card a:hover {
      filter: brightness(1.1);
    }
    .card .placeholder {
      background: #1e293b;
      color: var(--muted);
      cursor: not-allowed;
    }
    .card .meta {
      font-size: 0.78rem;
      color: #64748b;
      margin-top: 0.75rem;
      font-family: "Fira Code", "Cascadia Code", monospace;
    }
    footer {
      text-align: center;
      margin-top: 3rem;
      color: #64748b;
      font-size: 0.85rem;
    }
    footer a {
      color: var(--muted);
    }
    @media (max-width: 640px) {
      header h1 { font-size: 1.75rem; }
      .grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>AVL Code 示例工程集合</h1>
      <p>沉淀各类工具、系统与代码示例，基于 Cloudflare Workers 边缘部署。</p>
      <div class="domain">${SITE_BASE_URL}</div>
    </header>

    <main class="grid" id="project-grid"></main>

    <footer>
      <p>仓库：<a href="https://github.com/sansure/avlcodeexample" target="_blank">sansure/avlcodeexample</a></p>
    </footer>
  </div>

  <script>
    async function loadProjects() {
      try {
        const res = await fetch('/api/projects');
        const projects = await res.json();
        const grid = document.getElementById('project-grid');
        grid.innerHTML = projects.map(p => {
          const isOnline = p.status === 'online';
          const link = isOnline
            ? \`<a href="\${p.path}">进入项目 →</a>\`
            : \`<span class="placeholder">待部署</span>\`;
          return \`
            <article class="card \${p.status}">
              <div class="card-header">
                <h2>\${p.name}</h2>
                <span class="badge \${p.status}">\${isOnline ? '● 已上线' : '○ 计划中'}</span>
              </div>
              <p>\${p.description}</p>
              \${link}
              <div class="meta">\${p.path}</div>
            </article>
          \`;
        }).join('');
      } catch (e) {
        console.error('加载项目失败:', e);
      }
    }
    loadProjects();
  </script>
</body>
</html>`;

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

// D1: 获取项目列表
async function getProjects(db) {
  const { results } = await db.prepare(
    "SELECT id, name, dir, description, path, status FROM projects ORDER BY created_at DESC"
  ).all();
  return results || [];
}

// D1: 记录访问日志
async function recordAccess(db, request) {
  const url = new URL(request.url);
  const ip = request.headers.get("CF-Connecting-IP") || "127.0.0.1";
  const ua = request.headers.get("User-Agent") || "";
  try {
    await db.prepare(
      "INSERT INTO access_logs (path, method, ip, user_agent) VALUES (?, ?, ?, ?)"
    ).bind(url.pathname, request.method, ip, ua).run();
  } catch (e) {
    console.error("记录访问日志失败:", e);
  }
}

// R2: 列出文件
async function listFiles(bucket) {
  const objects = await bucket.list();
  return (objects.objects || []).map(obj => ({
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded,
    httpEtag: obj.httpEtag,
  }));
}

// R2: 上传文件
async function putFile(bucket, key, request) {
  const contentType = request.headers.get("Content-Type") || "application/octet-stream";
  const body = await request.arrayBuffer();
  await bucket.put(key, body, { httpMetadata: { contentType } });
  return { key, size: body.byteLength, contentType };
}

// R2: 读取文件
async function getFile(bucket, key) {
  const object = await bucket.get(key);
  if (!object) return null;
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType || "application/octet-stream",
      "Content-Length": object.size,
      "ETag": object.httpEtag,
    },
  });
}

// R2: 删除文件
async function deleteFile(bucket, key) {
  await bucket.delete(key);
  return { success: true, key };
}

// 处理根目录自身的 API 请求
async function handleRootApi(request, env, url) {
  // API: 项目列表
  if (url.pathname === "/api/projects") {
    if (!env.AVLCODEDB) {
      return json({ error: "D1 database not bound" }, 500);
    }
    const projects = await getProjects(env.AVLCODEDB);
    return json(projects);
  }

  // API: 项目访问记录
  if (url.pathname.startsWith("/api/projects/") && url.pathname.endsWith("/visit")) {
    if (!env.AVLCODEDB) {
      return json({ error: "D1 database not bound" }, 500);
    }
    const id = url.pathname.split("/")[3];
    await env.AVLCODEDB.prepare(
      "UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(id).run();
    return json({ success: true, id });
  }

  // API: R2 文件列表
  if (url.pathname === "/api/files") {
    if (!env.AVLCODE_BUCKET) {
      return json({ error: "R2 bucket not bound" }, 500);
    }
    if (request.method === "GET") {
      const files = await listFiles(env.AVLCODE_BUCKET);
      return json(files);
    }
    if (request.method === "POST" || request.method === "PUT") {
      return json({ error: "请使用 /api/files/:key 上传文件" }, 400);
    }
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders() });
  }

  // API: R2 文件操作
  const fileMatch = url.pathname.match(/^\/api\/files\/(.+)$/);
  if (fileMatch) {
    if (!env.AVLCODE_BUCKET) {
      return json({ error: "R2 bucket not bound" }, 500);
    }
    const key = decodeURIComponent(fileMatch[1]);
    if (request.method === "GET") {
      const response = await getFile(env.AVLCODE_BUCKET, key);
      if (!response) return json({ error: "File not found" }, 404);
      return response;
    }
    if (request.method === "PUT" || request.method === "POST") {
      const result = await putFile(env.AVLCODE_BUCKET, key, request);
      return json(result, 201);
    }
    if (request.method === "DELETE") {
      const result = await deleteFile(env.AVLCODE_BUCKET, key);
      return json(result);
    }
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders() });
  }

  return null;
}

// 处理子项目路由分发
async function handleSubProjects(request, env, ctx, url) {
  for (const [route, handler] of Object.entries(routes)) {
    if (url.pathname.startsWith(route) || url.pathname === route.replace(/\/$/, "")) {
      if (handler && typeof handler.fetch === "function") {
        return handler.fetch(request, env, ctx);
      }
    }
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // CORS 预检
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    // 记录访问日志（如果 D1 已绑定）
    if (env.AVLCODEDB) {
      await recordAccess(env.AVLCODEDB, request);
    }

    // 1. 优先处理子项目路由
    const subResponse = await handleSubProjects(request, env, ctx, url);
    if (subResponse) return subResponse;

    // 2. 处理根目录 API
    const apiResponse = await handleRootApi(request, env, url);
    if (apiResponse) return apiResponse;

    // 3. 首页
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return html(INDEX_HTML);
    }

    return new Response("Not Found", { status: 404 });
  },

  async scheduled(event, env, ctx) {
    // 委托给 gist 子项目的定时清理任务
    const gist = routes["/gist/"];
    if (gist && typeof gist.scheduled === "function") {
      console.log("Delegating scheduled event to gist subproject");
      await gist.scheduled(event, env, ctx);
    }
  },
};
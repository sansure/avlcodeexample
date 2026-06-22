const SITE_BASE_URL = globalThis.SITE_BASE_URL || "https://example.avlcodesite.xyz";

const PROJECTS = [
  {
    id: "clipboard",
    name: "Cloud Clipboard / Gist",
    dir: "ac-cloudflare-r2-upstash-clipboard-gist",
    desc: "基于 Cloudflare Workers + R2 + Upstash Redis 的云端剪贴板与代码片段分享服务。",
    path: "/clipboard/",
    status: "online",
  },
  {
    id: "counter",
    name: "免费访问计数器",
    dir: "ac-memfire-cloud-counter",
    desc: "基于 Memfire Cloud + Cloudflare Worker + Upstash 的免费访问计数器。",
    path: "/counter/",
    status: "planned",
  },
  {
    id: "review-tool",
    name: "AC 审稿小工具",
    dir: "ac-review-tool",
    desc: "ac 审稿小工具。",
    path: "/review-tool/",
    status: "planned",
  },
  {
    id: "access-log",
    name: "访问日志调度器",
    dir: "ac-avlcode-access-log-scheduler",
    desc: "ac 定时处理 avlcode 的访问日志。",
    path: "/access-log/",
    status: "planned",
  },
  {
    id: "multimodal",
    name: "多模态代码示例",
    dir: "ac-multimodal-code-examples",
    desc: "ac 多模态代码示例。",
    path: "/multimodal/",
    status: "planned",
  },
  {
    id: "website-cms",
    name: "网站内容发布系统",
    dir: "ac-website-cms",
    desc: "ac 制作网站内容发布系统。",
    path: "/website-cms/",
    status: "planned",
  },
  {
    id: "user-feedback",
    name: "AVL 用户反馈系统",
    dir: "ac-avl-user-feedback",
    desc: "ac 制作 avl 用户反馈系统。",
    path: "/user-feedback/",
    status: "planned",
  },
  {
    id: "roundtable",
    name: "圆桌会议重制版",
    dir: "ac-roundtable-remake",
    desc: "ac 重制圆桌会议。",
    path: "/roundtable/",
    status: "planned",
  },
  {
    id: "zhijia-analysis",
    name: "智甲性能分析",
    dir: "ac-zhijia-performance-analysis",
    desc: "ac 审查智甲代码，定位卡顿瓶颈。",
    path: "/zhijia-analysis/",
    status: "planned",
  },
  {
    id: "serial-number",
    name: "序列号生成与验证系统",
    dir: "ac-serial-number-generator",
    desc: "ac 自动生成序列号系统与验证系统。",
    path: "/serial-number/",
    status: "planned",
  },
];

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
    const projects = ${JSON.stringify(PROJECTS)};
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
          <p>\${p.desc}</p>
          \${link}
          <div class="meta">\${p.path}</div>
        </article>
      \`;
    }).join('');
  </script>
</body>
</html>`;

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    // 主站只处理 GET 请求与根路径
    if (request.method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return html(INDEX_HTML);
    }

    return new Response("Not Found", { status: 404 });
  },
};

import { createStore, generateSlug, DEFAULT_PREFIX, RECENT_KEY, RECENT_MAX } from "./store.js";

const MAX_CONTENT_SIZE = parseInt(globalThis.MAX_CONTENT_SIZE || "1048576", 10);
const TTL_SECONDS = 86400 * 30; // 30 days

const FRONTEND_HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cloud Clipboard / Gist</title>
  <style>
    :root { --bg: #0f172a; --card: #1e293b; --text: #e2e8f0; --accent: #38bdf8; --border: #334155; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; flex-direction: column; align-items: center; min-height: 100vh; padding: 2rem; }
    h1 { margin-bottom: .25rem; }
    p.sub { opacity: .7; margin-top: 0; margin-bottom: 1.5rem; }
    .container { max-width: 800px; width: 100%; }
    textarea { width: 100%; min-height: 200px; background: var(--card); color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; font-family: "Fira Code", "Cascadia Code", monospace; font-size: .875rem; resize: vertical; }
    textarea:focus { outline: 2px solid var(--accent); }
    .row { display: flex; gap: .5rem; margin: .75rem 0; flex-wrap: wrap; }
    .row input { flex: 1; min-width: 120px; background: var(--card); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: .6rem .75rem; }
    .row input:focus { outline: 2px solid var(--accent); }
    button { background: var(--accent); color: #0f172a; border: 0; padding: .6rem 1.25rem; border-radius: 6px; font-weight: 600; cursor: pointer; }
    button:hover { filter: brightness(1.1); }
    button.secondary { background: var(--border); color: var(--text); }
    .result { margin-top: 1rem; }
    .result a { color: var(--accent); word-break: break-all; }
    .error { color: #f87171; margin-top: .5rem; }
    .recent { margin-top: 2rem; }
    .recent h3 { margin-bottom: .5rem; }
    .recent-item { background: var(--card); border: 1px solid var(--border); border-radius: 6px; padding: .5rem .75rem; margin-bottom: .5rem; display: flex; justify-content: space-between; align-items: center; }
    .recent-item a { color: var(--accent); }
    .recent-item .meta { font-size: .75rem; opacity: .6; }
    pre.code-block { background: var(--card); border: 1px solid var(--border); border-radius: 8px; padding: 1rem; overflow-x: auto; font-family: "Fira Code", "Cascadia Code", monospace; font-size: .8125rem; line-height: 1.5; }
    .actions { display: flex; gap: .5rem; margin-top: 1rem; }
    .badge { display: inline-block; background: var(--accent); color: #0f172a; font-size: .75rem; font-weight: 600; padding: .15rem .5rem; border-radius: 4px; margin-left: .5rem; }
  </style>
</head>
<body>
  <div class="container">
    <h1>📋 Cloud Clipboard / Gist</h1>
    <p class="sub">基于 Cloudflare Workers + R2 + Upstash Redis 的云端剪贴板与代码片段分享</p>

    <div id="create-view">
      <textarea id="content-input" placeholder="在此粘贴文本或代码..."></textarea>
      <div class="row">
        <input id="lang-input" placeholder="语言标识（可选，如 javascript, python, go）">
        <input id="ttl-input" type="number" value="30" min="1" max="365" style="max-width:100px" title="保留天数">
        <span style="opacity:.6;font-size:.875rem;align-self:center">天</span>
      </div>
      <div class="row">
        <button id="create-btn">📤 创建分享</button>
        <button id="clear-btn" class="secondary">清空</button>
      </div>
      <div id="create-result" class="result"></div>
    </div>

    <div id="view-view" style="display:none">
      <pre id="view-content" class="code-block"></pre>
      <div class="actions">
        <button id="copy-btn">📋 复制</button>
        <button id="raw-btn" class="secondary">查看原始</button>
        <button id="back-btn" class="secondary">← 返回</button>
      </div>
      <div id="view-meta" style="margin-top:.5rem;font-size:.8125rem;opacity:.7"></div>
    </div>

    <div class="recent" id="recent-section">
      <h3>最近分享</h3>
      <div id="recent-list"></div>
    </div>
  </div>

  <script>
    const BASE = window.location.origin;
    let currentSlug = null;

    document.getElementById('create-btn').addEventListener('click', async () => {
      const content = document.getElementById('content-input').value.trim();
      if (!content) { document.getElementById('create-result').innerHTML = '<div class="error">请输入内容</div>'; return; }
      const lang = document.getElementById('lang-input').value.trim();
      const days = parseInt(document.getElementById('ttl-input').value) || 30;
      try {
        const r = await fetch(BASE + '/api/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, lang: lang || undefined, days }),
        });
        const d = await r.json();
        if (d.slug) {
          document.getElementById('create-result').innerHTML = '<div>✅ 创建成功！分享链接：<br><a href="' + BASE + '/' + d.slug + '" target="_blank">' + BASE + '/' + d.slug + '</a></div>';
          loadRecent();
        } else {
          document.getElementById('create-result').innerHTML = '<div class="error">' + (d.error || '创建失败') + '</div>';
        }
      } catch (e) {
        document.getElementById('create-result').innerHTML = '<div class="error">' + e.message + '</div>';
      }
    });

    document.getElementById('clear-btn').addEventListener('click', () => {
      document.getElementById('content-input').value = '';
      document.getElementById('lang-input').value = '';
      document.getElementById('create-result').innerHTML = '';
    });

    document.getElementById('back-btn').addEventListener('click', () => {
      document.getElementById('create-view').style.display = 'block';
      document.getElementById('view-view').style.display = 'none';
      currentSlug = null;
    });

    document.getElementById('copy-btn').addEventListener('click', () => {
      const code = document.getElementById('view-content').textContent;
      navigator.clipboard.writeText(code).then(() => alert('已复制到剪贴板'));
    });

    document.getElementById('raw-btn').addEventListener('click', () => {
      if (currentSlug) window.open(BASE + '/raw/' + currentSlug, '_blank');
    });

    async function loadRecent() {
      try {
        const r = await fetch(BASE + '/api/recent');
        const d = await r.json();
        const list = document.getElementById('recent-list');
        if (!d.recent || d.recent.length === 0) { list.innerHTML = '<div style="opacity:.5">暂无分享</div>'; return; }
        list.innerHTML = d.recent.map(item => {
          const preview = (item.preview || '').slice(0, 60);
          const lang = item.lang ? '<span class="badge">' + item.lang + '</span>' : '';
          return '<div class="recent-item"><div><a href="' + BASE + '/' + item.slug + '">' + item.slug + '</a>' + lang + '<div class="meta">' + preview + '…</div></div><div class="meta">' + (item.created ? new Date(item.created).toLocaleString() : '') + '</div></div>';
        }).join('');
      } catch (e) { /* ignore */ }
    }

    // Check if we're viewing a slug
    const path = window.location.pathname.slice(1);
    if (path && path !== '' && !path.startsWith('api/')) {
      document.getElementById('create-view').style.display = 'none';
      document.getElementById('view-view').style.display = 'block';
      currentSlug = path;
      fetch(BASE + '/raw/' + path).then(r => r.text()).then(text => {
        document.getElementById('view-content').textContent = text;
      });
      fetch(BASE + '/api/meta/' + path).then(r => r.json()).then(d => {
        const meta = [];
        if (d.lang) meta.push('语言: ' + d.lang);
        if (d.created) meta.push('创建: ' + new Date(d.created).toLocaleString());
        if (d.views !== undefined) meta.push('浏览: ' + d.views + ' 次');
        document.getElementById('view-meta').textContent = meta.join(' | ');
      }).catch(() => {});
    }

    loadRecent();
  </script>
</body>
</html>`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function text(body, status = 200) {
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const store = createStore(env);
    const bucket = env.CLIPBOARD_BUCKET;

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    try {
      // ── Frontend ──────────────────────────────────────
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return html(FRONTEND_HTML);
      }

      // ── Create snippet ────────────────────────────────
      if (url.pathname === "/api/create" && request.method === "POST") {
        const body = await request.json();
        const content = body.content;
        if (!content || typeof content !== "string") {
          return json({ error: "content is required" }, 400);
        }
        if (content.length > MAX_CONTENT_SIZE) {
          return json({ error: `content exceeds ${MAX_CONTENT_SIZE} bytes` }, 413);
        }

        const slug = generateSlug();
        const lang = body.lang || "";
        const days = Math.min(Math.max(parseInt(body.days) || 30, 1), 365);
        const now = new Date().toISOString();
        const metadata = JSON.stringify({ slug, lang, created: now, views: 0 });

        // Save to Redis index
        await store.setex(DEFAULT_PREFIX + slug, TTL_SECONDS, metadata);
        await store.lpush(RECENT_KEY, JSON.stringify({ slug, lang, preview: content.slice(0, 120), created: now }));
        await store.ltrim(RECENT_KEY, 0, RECENT_MAX - 1);

        // Save to R2 (if available)
        if (bucket) {
          await bucket.put(`content/${slug}`, content, {
            customMetadata: { lang, created: now },
          });
          await bucket.put(`meta/${slug}`, metadata, {
            customMetadata: { lang, created: now },
          });
        } else {
          // Fallback: store content in Redis too (smaller content only)
          if (content.length < 50000) {
            await store.setex(DEFAULT_PREFIX + "content:" + slug, TTL_SECONDS, content);
          }
        }

        return json({ slug, url: `${url.origin}/${slug}` });
      }

      // ── View raw content ──────────────────────────────
      if (url.pathname.startsWith("/raw/")) {
        const slug = url.pathname.slice(5);
        if (!slug) return json({ error: "slug required" }, 400);

        let content = null;

        // Try R2 first
        if (bucket) {
          try {
            const obj = await bucket.get(`content/${slug}`);
            if (obj) content = await obj.text();
          } catch { /* not found */ }
        }

        // Fallback to Redis
        if (!content) {
          content = await store.get(DEFAULT_PREFIX + "content:" + slug);
        }

        if (!content) return json({ error: "Not found" }, 404);

        // Increment view count
        try {
          const metaRaw = await store.get(DEFAULT_PREFIX + slug);
          if (metaRaw) {
            const meta = JSON.parse(metaRaw);
            meta.views = (meta.views || 0) + 1;
            await store.setex(DEFAULT_PREFIX + slug, TTL_SECONDS, JSON.stringify(meta));
          }
        } catch { /* ignore */ }

        return text(content);
      }

      // ── Get metadata ─────────────────────────────────
      if (url.pathname.startsWith("/api/meta/")) {
        const slug = url.pathname.slice(10);
        if (!slug) return json({ error: "slug required" }, 400);

        const metaRaw = await store.get(DEFAULT_PREFIX + slug);
        if (!metaRaw) return json({ error: "Not found" }, 404);

        return json(JSON.parse(metaRaw));
      }

      // ── Recent list ───────────────────────────────────
      if (url.pathname === "/api/recent") {
        const items = await store.lrange(RECENT_KEY, 0, 19);
        const recent = items.map((i) => {
          try { return JSON.parse(i); } catch { return { slug: i }; }
        });
        return json({ recent });
      }

      // ── View snippet page ─────────────────────────────
      // If path is a slug, serve the frontend (client-side routing)
      const slug = url.pathname.slice(1);
      if (slug && /^[a-z0-9]{8}$/.test(slug)) {
        return html(FRONTEND_HTML);
      }

      return json({ error: "Not Found" }, 404);
    } catch (err) {
      return json({ error: err.message }, 500);
    }
  },
};
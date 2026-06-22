import { createStore, keyTotal, keyToday, keyHourly, keyPath } from "./counter.js";

const HTML = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Memfire Cloud Counter</title>
  <style>
    :root { --bg: #0f172a; --card: #1e293b; --text: #e2e8f0; --accent: #38bdf8; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: var(--bg); color: var(--text); display: flex; flex-direction: column; align-items: center; min-height: 100vh; padding: 2rem; }
    h1 { margin-bottom: .5rem; }
    p.sub { opacity: .7; margin-top: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; width: 100%; max-width: 720px; margin: 1.5rem 0; }
    .card { background: var(--card); border-radius: 12px; padding: 1.25rem; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,.2); }
    .card .value { font-size: 2.5rem; font-weight: 700; color: var(--accent); }
    .card .label { font-size: .875rem; opacity: .7; margin-top: .25rem; }
    button { background: var(--accent); color: #0f172a; border: 0; padding: .75rem 1.5rem; border-radius: 8px; font-weight: 600; cursor: pointer; }
    button:hover { filter: brightness(1.1); }
    pre { background: var(--card); padding: 1rem; border-radius: 8px; max-width: 720px; width: 100%; overflow-x: auto; }
  </style>
</head>
<body>
  <h1>🔥 Memfire Cloud Counter</h1>
  <p class="sub">基于 Cloudflare Workers + Upstash Redis + Memfire Cloud 的免费计数器示例</p>
  <div class="grid">
    <div class="card"><div class="value" id="total">-</div><div class="label">总访问</div></div>
    <div class="card"><div class="value" id="today">-</div><div class="label">今日访问</div></div>
    <div class="card"><div class="value" id="hour">-</div><div class="label">本小时</div></div>
  </div>
  <button id="btn">手动 +1</button>
  <pre id="raw"></pre>
  <script>
    async function refresh() {
      const r = await fetch('/api/count');
      const d = await r.json();
      document.getElementById('total').textContent = d.total ?? 0;
      document.getElementById('today').textContent = d.today ?? 0;
      document.getElementById('hour').textContent = d.hour ?? 0;
      document.getElementById('raw').textContent = JSON.stringify(d, null, 2);
    }
    document.getElementById('btn').addEventListener('click', async () => {
      await fetch('/api/count', { method: 'POST' });
      await refresh();
    });
    refresh();
  </script>
</body>
</html>`;

function jsonResponse(data, status = 200) {
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const store = createStore(env);

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
      if (url.pathname === "/" || url.pathname === "/index.html") {
        return new Response(HTML, {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        });
      }

      if (url.pathname === "/api/count") {
        if (request.method === "POST") {
          await store.incr(keyTotal());
          await store.incr(keyToday());
          await store.incr(keyHourly());
          const path = url.searchParams.get("path") || "/";
          await store.hincrby(keyPath(), path);
        }
        const [total, today, hour] = await Promise.all([
          store.get(keyTotal()).then((v) => Number(v) || 0),
          store.get(keyToday()).then((v) => Number(v) || 0),
          store.get(keyHourly()).then((v) => Number(v) || 0),
        ]);
        return jsonResponse({ total, today, hour });
      }

      if (url.pathname === "/api/stats") {
        const paths = await store.hgetall(keyPath());
        const [total, today, hour] = await Promise.all([
          store.get(keyTotal()).then((v) => Number(v) || 0),
          store.get(keyToday()).then((v) => Number(v) || 0),
          store.get(keyHourly()).then((v) => Number(v) || 0),
        ]);
        return jsonResponse({ total, today, hour, paths });
      }

      return jsonResponse({ error: "Not Found" }, 404);
    } catch (err) {
      return jsonResponse({ error: err.message }, 500);
    }
  },
};

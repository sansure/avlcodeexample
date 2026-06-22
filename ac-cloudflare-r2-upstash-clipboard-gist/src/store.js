/**
 * Storage layer for clipboard/gist service.
 *
 * - Upstash Redis: index (slug → metadata) + recent list
 * - Cloudflare R2: full content persistence
 * - Fallback: in-memory Map (dev/test only)
 */

const DEFAULT_PREFIX = "clip:";
const RECENT_KEY = "clip:recent";
const RECENT_MAX = 100;

function generateSlug(length = 8) {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let slug = "";
  for (let i = 0; i < length; i++) {
    slug += chars[Math.floor(Math.random() * chars.length)];
  }
  return slug;
}

// ── Upstash Redis ──────────────────────────────────────────────

class UpstashStore {
  constructor(url, token) {
    this.base = url.replace(/\/$/, "");
    this.token = token;
  }

  async cmd(command, ...args) {
    const path = `/${command}/${args.map(encodeURIComponent).join("/")}`;
    const res = await fetch(`${this.base}${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`Upstash error: ${res.status}`);
    return res.json();
  }

  async cmdPost(command, ...args) {
    const res = await fetch(`${this.base}/${command}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`Upstash error: ${res.status}`);
    return res.json();
  }

  async set(key, value) {
    return this.cmd("set", key, value);
  }

  async get(key) {
    return this.cmd("get", key);
  }

  async del(key) {
    return this.cmd("del", key);
  }

  async lpush(key, value) {
    return this.cmd("lpush", key, value);
  }

  async lrange(key, start, stop) {
    return this.cmd("lrange", key, start, stop);
  }

  async ltrim(key, start, stop) {
    return this.cmd("ltrim", key, start, stop);
  }

  async expire(key, seconds) {
    return this.cmd("expire", key, seconds);
  }

  async setex(key, seconds, value) {
    return this.cmd("setex", key, seconds, value);
  }
}

// ── In-Memory Fallback ─────────────────────────────────────────

class MemoryStore {
  constructor() {
    this.map = new Map();
    this.recent = [];
  }

  async set(key, value) {
    this.map.set(key, value);
  }

  async get(key) {
    return this.map.get(key) || null;
  }

  async del(key) {
    this.map.delete(key);
  }

  async lpush(key, value) {
    if (key === RECENT_KEY) {
      this.recent.unshift(value);
      if (this.recent.length > RECENT_MAX) this.recent.pop();
    }
  }

  async lrange(key, start, stop) {
    if (key === RECENT_KEY) {
      const end = stop < 0 ? this.recent.length + stop : stop;
      return this.recent.slice(start, end + 1);
    }
    return [];
  }

  async ltrim(key, start, stop) {
    if (key === RECENT_KEY) {
      const end = stop < 0 ? this.recent.length + stop : stop;
      this.recent = this.recent.slice(start, end + 1);
    }
  }

  async expire(_key, _seconds) {
    // no-op for memory store
  }

  async setex(key, seconds, value) {
    this.map.set(key, value);
  }
}

// ── Factory ────────────────────────────────────────────────────

export function createStore(env) {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashStore(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  }
  console.warn("Upstash not configured, using in-memory fallback (data lost on restart)");
  return new MemoryStore();
}

// ── Helpers ────────────────────────────────────────────────────

export { generateSlug, DEFAULT_PREFIX, RECENT_KEY, RECENT_MAX };
/**
 * Counter storage backed by Upstash Redis.
 * Falls back to in-memory map if Upstash credentials are not configured.
 */

const DEFAULT_NAMESPACE = "ac:counter";

class UpstashRedis {
  constructor(url, token) {
    this.url = url.replace(/\/$/, "");
    this.token = token;
  }

  async request(command, ...args) {
    const res = await fetch(`${this.url}/${command}/${args.map(encodeURIComponent).join("/")}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      throw new Error(`Upstash error: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async post(command, ...args) {
    const res = await fetch(`${this.url}/${command}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      throw new Error(`Upstash error: ${res.status} ${await res.text()}`);
    }
    return res.json();
  }

  async incr(key) {
    return this.request("incr", key);
  }

  async get(key) {
    return this.request("get", key);
  }

  async mget(keys) {
    if (keys.length === 0) return [];
    return this.post("mget", ...keys);
  }

  async hincrby(key, field, amount = 1) {
    return this.request("hincrby", key, field, amount);
  }

  async hgetall(key) {
    return this.request("hgetall", key);
  }
}

class MemoryStore {
  constructor() {
    this.data = new Map();
    this.hashes = new Map();
  }

  async incr(key) {
    const v = (this.data.get(key) || 0) + 1;
    this.data.set(key, v);
    return v;
  }

  async get(key) {
    return this.data.get(key) || 0;
  }

  async mget(keys) {
    return keys.map((k) => this.data.get(k) || 0);
  }

  async hincrby(key, field, amount = 1) {
    const h = this.hashes.get(key) || new Map();
    const v = (h.get(field) || 0) + amount;
    h.set(field, v);
    this.hashes.set(key, h);
    return v;
  }

  async hgetall(key) {
    const h = this.hashes.get(key);
    if (!h) return {};
    const obj = {};
    for (const [k, v] of h.entries()) obj[k] = v;
    return obj;
  }
}

export function createStore(env) {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    return new UpstashRedis(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  }
  return new MemoryStore();
}

export function keyTotal(ns = DEFAULT_NAMESPACE) {
  return `${ns}:total`;
}

export function keyToday(ns = DEFAULT_NAMESPACE) {
  const date = new Date().toISOString().slice(0, 10);
  return `${ns}:daily:${date}`;
}

export function keyHourly(ns = DEFAULT_NAMESPACE) {
  const hour = new Date().toISOString().slice(0, 13);
  return `${ns}:hourly:${hour}`;
}

export function keyPath(ns = DEFAULT_NAMESPACE) {
  return `${ns}:paths`;
}

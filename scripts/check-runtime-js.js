const res = await fetch("http://127.0.0.1:8903/review/");
const text = await res.text();
const m = text.match(/<script>([\s\S]*)<\/script>/);
if (!m) {
  console.error("no script");
  process.exit(1);
}
const js = m[1];
const fs = await import("fs");
fs.writeFileSync(".tmp-runtime-js.js", js);

const { spawnSync } = await import("child_process");
const result = spawnSync(
  ".node/bin/node",
  ["--check", ".tmp-runtime-js.js"],
  { encoding: "utf8" }
);
if (result.status !== 0) {
  console.error("❌ Runtime JS syntax error:");
  console.error(result.stderr);
  process.exit(1);
}
console.log("✅ Runtime JS syntax OK");

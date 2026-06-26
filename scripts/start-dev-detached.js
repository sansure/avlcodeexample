import { spawn } from "child_process";
import { open } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const port = process.argv[2] || "8904";
const logPath = path.join(root, `wrangler-dev-${port}.log`);

const log = await open(logPath, "a");
const child = spawn(
  path.join(root, ".node/bin/node"),
  [path.join(root, "node_modules/wrangler/bin/wrangler.js"), "dev", "--port", port, "--ip", "0.0.0.0"],
  {
    cwd: root,
    detached: true,
    stdio: ["ignore", log.fd, log.fd],
    env: process.env,
  }
);
child.unref();
console.log(`Started wrangler dev on port ${port} (pid ${child.pid}). Log: ${logPath}`);

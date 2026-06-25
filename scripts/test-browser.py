#!/usr/bin/env python3
# 启动 Miniflare HTTP 服务器并用 curl 访问，验证前端 HTML 和后端 API 是否可访问

import subprocess
import json
import time
import sys
import os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
node = os.path.join(root, ".node", "bin", "node")

# 启动 Miniflare 并获取 URL
print("🚀 启动 Miniflare HTTP 服务器...")
proc = subprocess.Popen(
    [node, os.path.join(root, "scripts", "dev-local.js")],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
    bufsize=1,
)

url = None
for _ in range(30):
    line = proc.stderr.readline()
    if line:
        print(line.strip())
        if "MINIFLARE_URL=" in line:
            url = line.strip().split("MINIFLARE_URL=")[1]
            break
    time.sleep(0.5)

if not url:
    print("❌ 无法获取 Miniflare URL")
    proc.terminate()
    sys.exit(1)

base = f"{url}/gist"
print(f"\n✅ 服务器已启动: {base}")

# 测试首页
def curl(path, method="GET", data=None):
    cmd = ["curl", "-s", "-w", "\\nHTTP_CODE:%{http_code}", "-X", method]
    if data:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(data)]
    cmd += [path]
    result = subprocess.run(cmd, capture_output=True, text=True)
    body, code = result.stdout.rsplit("\nHTTP_CODE:", 1)
    return int(code.strip()), body

print("\n🧪 测试 Gist 首页")
code, body = curl(base + "/")
print(f"   状态: {code}, 长度: {len(body)}")
if code == 200:
    with open(os.path.join(root, "gist-home-debug.html"), "w") as f:
        f.write(body)
    print("   已保存 HTML 到 gist-home-debug.html")
else:
    print(f"   响应: {body[:200]}")

print("\n🧪 测试创建 Gist")
code, body = curl(base + "/api/gists", "POST", {
    "title": "浏览器测试 Gist",
    "description": "测试",
    "is_public": True,
    "days": 7,
    "files": [
        {"filename": "test.js", "content": "console.log('ok');"}
    ]
})
print(f"   状态: {code}")
print(f"   响应: {body[:300]}")

gist_id = None
if code == 201:
    data = json.loads(body)
    gist_id = data.get("id")

if gist_id:
    print(f"\n🧪 测试 API 获取 Gist ({gist_id})")
    code, body = curl(base + f"/api/gists/{gist_id}")
    print(f"   状态: {code}")

    print(f"\n🧪 测试 Raw 文件 ({gist_id}/test.js)")
    code, body = curl(base + f"/raw/{gist_id}/test.js")
    print(f"   状态: {code}, 内容: {body[:80]}")

print("\n🧪 测试最新公开 Gist 列表")
code, body = curl(base + "/api/gists?limit=20")
print(f"   状态: {code}")
print(f"   响应: {body[:300]}")

proc.terminate()
print("\n🎉 测试完成")

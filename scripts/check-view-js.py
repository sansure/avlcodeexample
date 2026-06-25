#!/usr/bin/env python3
import subprocess
import os
import re
import urllib.request
import json

root = '/workspace/hxswork/edrAiFunction/avlcodeexample'
node = os.path.join(root, '.node', 'bin', 'node')

# We need to fetch a view page. First create a gist via API.
# But server isn't running. Let's just extract VIEW_HTML from source and check its script.
path = os.path.join(root, 'ac-cloudflare-r2-d1-gist', 'src', 'index.js')
with open(path, 'r') as f:
    content = f.read()

m = re.search(r'const VIEW_HTML = `([\s\S]*?)`;', content)
if not m:
    print('VIEW_HTML not found')
    exit(1)

html = m.group(1)
scripts = re.findall(r'<script>([\s\S]*?)</script>', html)
print(f'Found {len(scripts)} script blocks in VIEW_HTML')

for i, script in enumerate(scripts):
    tmp_path = os.path.join(root, f'tmp-view-script-{i}.js')
    with open(tmp_path, 'w') as f:
        f.write(script)
    result = subprocess.run([node, '--check', tmp_path], capture_output=True, text=True)
    print(f"Script {i}: returncode={result.returncode}")
    if result.returncode != 0:
        print("stderr:", result.stderr)
    os.remove(tmp_path)

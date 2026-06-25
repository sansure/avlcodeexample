#!/usr/bin/env python3
import subprocess
import os
import re

root = '/workspace/hxswork/edrAiFunction/avlcodeexample'
node = os.path.join(root, '.node', 'bin', 'node')
html_path = os.path.join(root, 'gist-home-debug.html')

with open(html_path, 'r') as f:
    html = f.read()

# Extract script content
scripts = re.findall(r'<script>([\s\S]*?)</script>', html)
print(f'Found {len(scripts)} script blocks')

for i, script in enumerate(scripts):
    tmp_path = os.path.join(root, f'tmp-script-{i}.js')
    with open(tmp_path, 'w') as f:
        f.write(script)
    result = subprocess.run([node, '--check', tmp_path], capture_output=True, text=True)
    print(f"Script {i}: returncode={result.returncode}")
    if result.returncode != 0:
        print("stderr:", result.stderr)
    os.remove(tmp_path)

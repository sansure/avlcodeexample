#!/usr/bin/env python3
import subprocess
import os

root = '/workspace/hxswork/edrAiFunction/avlcodeexample'
node = os.path.join(root, '.node', 'bin', 'node')
result = subprocess.run([node, os.path.join(root, 'scripts', 'test-local.js')], capture_output=True, text=True, timeout=120)
print("returncode:", result.returncode)
print("stdout:", result.stdout)
print("stderr:", result.stderr)

#!/usr/bin/env python3
import subprocess
import os

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
node = os.path.join(root, ".node", "bin", "node")
path = os.path.join(root, "src", "routes", "gist", "index.js")

result = subprocess.run([node, "--check", path], capture_output=True, text=True)
print("returncode:", result.returncode)
print("stdout:", result.stdout)
print("stderr:", result.stderr)

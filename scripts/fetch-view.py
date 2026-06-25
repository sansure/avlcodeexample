#!/usr/bin/env python3
import subprocess
import time
import urllib.request
import os
import sys

root = '/workspace/hxswork/edrAiFunction/avlcodeexample'
node = os.path.join(root, '.node', 'bin', 'node')

proc = subprocess.Popen(
    [node, os.path.join(root, 'scripts', 'dev-local.js')],
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
        if 'MINIFLARE_URL=' in line:
            url = line.strip().split('MINIFLARE_URL=')[1]
            break
    time.sleep(0.5)

if not url:
    print('Failed to get URL')
    proc.terminate()
    sys.exit(1)

# Create a gist first
import urllib.request
import json
req = urllib.request.Request(
    url + '/gist/api/gists',
    data=json.dumps({
        'title': 'view test',
        'description': 'test',
        'is_public': True,
        'days': 7,
        'files': [{'filename': 'a.js', 'content': 'console.log(1);'}]
    }).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='POST'
)
resp = urllib.request.urlopen(req)
data = json.loads(resp.read().decode('utf-8'))
gist_id = data['id']
print('Created gist:', gist_id)

# Fetch view page
resp = urllib.request.urlopen(url + '/gist/' + gist_id)
html = resp.read().decode('utf-8')

idx = html.find('computeBase')
print('Context around computeBase:')
print(repr(html[idx:idx+200]))

if '\\/' in html[idx:idx+300]:
    print('OK: backslash present in regex')
else:
    print('ERROR: backslash missing in regex')

proc.terminate()

#!/usr/bin/env python3
import re

path = '/workspace/hxswork/edrAiFunction/avlcodeexample/ac-cloudflare-r2-d1-gist/src/index.js'
with open(path, 'r') as f:
    content = f.read()

# 正确的 computeBase 函数（源代码中需要双反斜杠，输出到 HTML 时才是单反斜杠）
correct_compute = '''    function computeBase() {
      var path = window.location.pathname.replace(/\\\\/+$/, '');
      path = path.replace(/\\\\/[a-z0-9]{8}$/, '');
      return window.location.origin + path;
    }'''

# 替换所有 computeBase 函数
pattern = r'    function computeBase\(\) \{[\s\S]*?return window\.location\.origin \+ path;\s*?\}'
content = re.sub(pattern, correct_compute, content)

with open(path, 'w') as f:
    f.write(content)
print('done')

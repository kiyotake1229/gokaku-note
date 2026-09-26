#!/usr/bin/env python3
"""公開する前に、個人名や手元のパスが入っていないかを調べる。見つかったら終了コード1（公開を止める）。
名前は tools/names.local.json（Git に入れない）から読む。"""
import json, os, subprocess, sys
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
words = ['/Users/', 'Dropbox']
p = os.path.join(ROOT, 'tools', 'names.local.json')
if os.path.exists(p):
    n = json.load(open(p, encoding='utf-8'))
    for w in n.get('learner', []) + n.get('mentor', []):
        w = w.replace('さんへ ／ ', '').replace('さんへ', '').replace('さん', '')
        if w:
            words.append(w)
files = subprocess.run(['git', 'ls-files', '-co', '--exclude-standard', '-z'], cwd=ROOT, capture_output=True, text=True).stdout.split('\0')
bad = []
for f in filter(None, files):
    if f == 'tools/check_private.py':
        continue
    try:
        t = open(os.path.join(ROOT, f), encoding='utf-8').read()
    except Exception:
        continue
    for w in words:
        if w in t:
            bad.append((f, w))
if bad:
    print('公開を止めました。次のファイルに個人名などが入っています：')
    for f, w in bad:
        print('  ', f, '→', w)
    sys.exit(1)
print('個人名のチェック：OK')

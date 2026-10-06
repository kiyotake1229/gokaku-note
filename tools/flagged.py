#!/usr/bin/env python3
"""アプリで「この問題、おかしい？」と報告された問題を、いまの問題データと並べて表示する（再チェックの材料）。

使い方:
  python3 tools/flagged.py <バックアップ.json>        … アプリの「バックアップ」で保存したファイル
  python3 tools/flagged.py "<報告の文章>"             … 「報告した問題 → コピー」で送られてきた文章（id が入っている）
  --json を付けると、再チェックのワークフローに渡せる形（id の一覧）で出す
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
args = [a for a in sys.argv[1:] if not a.startswith('--')]
if not args:
    sys.exit(__doc__)
src = args[0]
flags = {}
if os.path.exists(src):
    j = json.load(open(src, encoding='utf-8'))
    d = j.get('data', j)
    flags = d.get('flags') or {}
else:
    for m in re.finditer(r'([a-z0-9-]+:[A-Za-z0-9_.:-]+)（[^）]*）［([^］]*)］([^\n]*)(?:\n　メモ：([^\n]*))?', src):
        flags[m.group(1)] = {'kind': m.group(2), 'stem': m.group(3), 'note': m.group(4) or ''}

meta = json.load(open(os.path.join(DATA, 'certs.json'), encoding='utf-8'))
allq = {}
for c in meta['certs']:
    for q in json.load(open(os.path.join(DATA, 'questions', f'{c["id"]}.json'), encoding='utf-8')):
        allq[q['id']] = q
    for x in c.get('extras') or []:
        fp = os.path.join(ROOT, x['file'])
        if os.path.exists(fp):
            for q in json.load(open(fp, encoding='utf-8')):
                allq[q['id']] = q

if '--json' in sys.argv:
    print(json.dumps(sorted(flags), ensure_ascii=False))
    sys.exit(0)
print(f'報告 {len(flags)}件')
for qid, f in flags.items():
    q = allq.get(qid)
    print('\n==', qid, '［', f.get('kind', ''), '］', f.get('note', ''))
    if not q:
        print('  （いまのデータにない問題です）'); continue
    print('  問題：', q['stem'][:300])
    for i, ch in enumerate(q['choices']):
        print('   ', '◯' if i in q['answer'] else '・', ch[:120])
    print('  解説：', q['explanation'][:300])
    print('  出典：', q.get('source', ''))

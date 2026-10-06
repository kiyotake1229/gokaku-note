#!/usr/bin/env python3
"""教科書（点検ずみのレッスン）を、アプリ用の data/lessons/<資格>.json にまとめる。

  python3 tools/build_lessons.py <成果物のフォルダ>/lessons

- 同じ資格のグループ（例：itpass-sm, itpass-t, itpass-n）は、分野の順番に並べて1つにする
- 確認問題の id は、実在する問題だけを残す（なければ外す）
- 表の区切り行（|---|）は消す
"""
import json, os, sys, glob, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
SRC = sys.argv[1]
meta = json.load(open(os.path.join(DATA, 'certs.json'), encoding='utf-8'))
CERTS = {c['id']: c for c in meta['certs']}

def all_qids(cid):
    ids = {q['id'] for q in json.load(open(os.path.join(DATA, 'questions', f'{cid}.json'), encoding='utf-8'))}
    for x in CERTS[cid].get('extras') or []:
        fp = os.path.join(ROOT, x['file'])
        if os.path.exists(fp):
            ids |= {q['id'] for q in json.load(open(fp, encoding='utf-8'))}
    return ids

books = {}
for fp in sorted(glob.glob(os.path.join(SRC, '*.verified.json'))):
    d = json.load(open(fp, encoding='utf-8'))
    books.setdefault(d['cert'], []).extend(d['chapters'])

os.makedirs(os.path.join(DATA, 'lessons'), exist_ok=True)
for cid, chapters in books.items():
    order = {x['id']: i for i, x in enumerate(CERTS[cid]['categories'])}
    qids = all_qids(cid)
    chapters = sorted([ch for ch in chapters if ch['cat'] in order], key=lambda ch: order[ch['cat']])
    seen, dropped, n = set(), [], 0
    for ch in chapters:
        for l in ch['lessons']:
            assert l['id'] not in seen, f'レッスンIDの重複 {l["id"]}'
            seen.add(l['id'])
            l['body'] = '\n'.join(x for x in l['body'].split('\n') if not re.match(r'^\s*\|?\s*:?-{2,}[-:| ]*$', x))
            l['minutes'] = max(2, min(6, int(l.get('minutes') or 4)))
            keep = [q for q in (l.get('check') or []) if q in qids]
            dropped += [q for q in (l.get('check') or []) if q not in qids]
            l['check'] = keep[:4]
            n += 1
    json.dump({'cert': cid, 'chapters': chapters}, open(os.path.join(DATA, 'lessons', f'{cid}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'data/lessons/{cid}.json: {len(chapters)}章 {n}回' + (f'（実在しない確認問題を外した：{dropped}）' if dropped else ''))

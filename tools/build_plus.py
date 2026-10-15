#!/usr/bin/env python3
"""追加の練習問題（ワークフローで作成 → 答えを見ずに解く → 点検ずみ）を data/extra/<資格>-plus.json に取り込む。

使い方: python3 tools/build_plus.py <成果物のフォルダ> [--rejected id,id,...] [--dry]
  成果物のフォルダ：q_<組>.reviewed.json が入ったフォルダ（例：tools/work/plus-2026-10-15）
  --rejected：点検で直したあと、解き直しで答えが合わなかった問題（入れない）
すでに <資格>-plus.json がある資格は、同じ id を置きかえ、新しい id を足す。
教科書で確認問題が2問に満たない回には、同じ分野の追加問題を足す（ほかの回で使っていないものから）。
"""
import json, os, re, sys, glob, difflib, unicodedata
from collections import Counter, defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
SRC = sys.argv[1]
DRY = '--dry' in sys.argv
REJ = set(sys.argv[sys.argv.index('--rejected') + 1].split(',')) if '--rejected' in sys.argv else set()

meta = json.load(open(os.path.join(DATA, 'certs.json'), encoding='utf-8'))
CERTS = {c['id']: c for c in meta['certs']}
COUNT_WORD = re.compile(r'(二つ|2つ|２つ|三つ|3つ|３つ)')

def norm(s):
    return re.sub(r'[\s、。，．・「」『』（）()]', '', unicodedata.normalize('NFKC', s))

def load_all(cid):
    qs = json.load(open(os.path.join(DATA, 'questions', f'{cid}.json'), encoding='utf-8'))
    for x in CERTS[cid].get('extras') or []:
        if x['set'] == 'plus':
            continue
        p = os.path.join(ROOT, x['file'])
        if os.path.exists(p):
            qs += json.load(open(p, encoding='utf-8'))
    return qs

new = defaultdict(list)
problems = []
for f in sorted(glob.glob(os.path.join(SRC, 'q_*.reviewed.json'))):
    for q in json.load(open(f, encoding='utf-8')):
        cid = q['id'].split(':', 1)[0]
        if cid not in CERTS:
            problems.append(f'{q["id"]}: 資格がない'); continue
        if q['id'] in REJ:
            print('  解き直しで外した:', q['id']); continue
        cats = {x['id'] for x in CERTS[cid]['categories']}
        ch, ans = q.get('choices') or [], q.get('answer') or []
        ok = q.get('cat') in cats and 3 <= len(ch) <= 6 and ans and all(isinstance(i, int) and 0 <= i < len(ch) for i in ans) and len(set(ans)) == len(ans) and len(ans) < len(ch)
        if not ok:
            problems.append(f'{q["id"]}: 形がおかしい（cat={q.get("cat")} 選択肢{len(ch)} 正解{ans}）'); continue
        if len(ans) > 1 and not COUNT_WORD.search(q['stem']):
            problems.append(f'{q["id"]}: 複数選択なのに、選ぶ数が問題文にない'); continue
        new[cid].append({'id': q['id'], 'cat': q['cat'], 'stem': q['stem'].strip(), 'choices': [str(c).strip() for c in ch],
                         'answer': sorted(ans), 'explanation': q['explanation'].strip(), 'difficulty': int(q.get('difficulty') or 2),
                         'source': (q.get('source') or '').strip()})

for cid, items in new.items():
    c = CERTS[cid]
    path = f'data/extra/{cid}-plus.json'
    old = json.load(open(os.path.join(ROOT, path), encoding='utf-8')) if os.path.exists(os.path.join(ROOT, path)) else []
    by = {q['id']: q for q in old}
    stems = [norm(q['stem']) for q in load_all(cid)]
    added = 0
    for q in items:
        n = norm(q['stem'])
        if q['id'] not in by and any(abs(len(s) - len(n)) < 60 and difflib.SequenceMatcher(None, s, n).ratio() > 0.88 for s in stems):
            print('  今の問題とほぼ同じ（外した）:', q['id'], q['stem'][:40]); continue
        stems.append(n)
        added += q['id'] not in by
        by[q['id']] = q
    out = sorted(by.values(), key=lambda q: ([x['id'] for x in c['categories']].index(q['cat']), q['id']))
    print(f'{cid}: 追加の問題 {len(out)}問（今回 新しく{added}） 分野ごと {dict(Counter(q["cat"] for q in out))} 複数選択 {sum(len(q["answer"]) > 1 for q in out)} 正解の位置 {dict(Counter(q["answer"][0] for q in out))}')
    if not DRY:
        json.dump(out, open(os.path.join(ROOT, path), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        c['extras'] = [x for x in c.get('extras') or [] if x['set'] != 'plus'] + [{'set': 'plus', 'kind': 'main', 'title': '追加の問題', 'file': path}]

    # 教科書：確認問題が2問に満たない回に、同じ分野の追加問題を足す
    lp = os.path.join(DATA, 'lessons', f'{cid}.json')
    if os.path.exists(lp):
        bk = json.load(open(lp, encoding='utf-8'))
        used = Counter(q for ch in bk['chapters'] for l in ch['lessons'] for q in l.get('check') or [])
        filled = 0
        for ch in bk['chapters']:
            for l in ch['lessons']:
                if len(l.get('check') or []) >= 2:
                    continue
                pool = sorted([q['id'] for q in out if q['cat'] == ch['cat'] and q['id'] not in (l.get('check') or [])], key=lambda i: used[i])
                for qid in pool[:2 - len(l.get('check') or [])]:
                    l.setdefault('check', []).append(qid); used[qid] += 1; filled += 1
        if filled:
            print(f'  教科書の確認問題を {filled}問 足した')
            if not DRY:
                json.dump(bk, open(lp, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))

if not DRY:
    json.dump(meta, open(os.path.join(DATA, 'certs.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
if problems:
    print('== 問題点（入れなかった）'); [print('  ', p) for p in problems]

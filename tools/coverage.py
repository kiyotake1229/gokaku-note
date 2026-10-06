#!/usr/bin/env python3
"""公式の出題範囲のキーワードが、アプリの教科書・用語・問題にどれだけ入っているか（網羅率）を数える。

  python3 tools/coverage.py <キーワード一覧のフォルダ> [--out <結果.json>]

キーワード一覧（*.keywords.json）は、公式シラバスなどから書き出したもの（公開リポジトリには入れない）。
- 説明あり：教科書・用語（用語辞典をふくむ）・要点まとめ・問題の解説のどこかに出てくる
- 問題だけ：問題文や選択肢にだけ出てくる
- なし：どこにも出てこない
"""
import json, os, sys, re, unicodedata, glob
from collections import defaultdict, Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
SRC = sys.argv[1]
OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else None
meta = json.load(open(os.path.join(DATA, 'certs.json'), encoding='utf-8'))
CERTS = {c['id']: c for c in meta['certs']}

def norm(t):
    t = unicodedata.normalize('NFKC', str(t or '')).lower()
    t = re.sub(r'\s+', '', t)
    return t.replace('ー', '').replace('・', '').replace('-', '').replace('‐', '')

def load(path):
    return json.load(open(path, encoding='utf-8')) if os.path.exists(path) else None

def corpus(cid):
    exp, men = [], []
    for l in [l for ch in (load(os.path.join(DATA, 'lessons', f'{cid}.json')) or {'chapters': []})['chapters'] for l in ch['lessons']]:
        exp += [l['title'], ' '.join(l.get('goals') or []), l['body']]
    for t in (load(os.path.join(DATA, 'terms', f'{cid}.json')) or []) + (load(os.path.join(DATA, 'glossary', f'{cid}.json')) or []):
        exp += [t['term'], t.get('reading', ''), t['meaning'], t.get('example', '')]
    sm = load(os.path.join(DATA, 'summaries', f'{cid}.json'))
    if sm: exp.append(json.dumps(sm, ensure_ascii=False))
    qs = load(os.path.join(DATA, 'questions', f'{cid}.json')) or []
    for x in CERTS[cid].get('extras') or []:
        qs += load(os.path.join(ROOT, x['file'])) or []
    for q in qs:
        exp.append(q['explanation'])
        men += [q['stem'], ' '.join(q['choices'])]
    # 項目のあいだに区切りを入れる（英字の用語が、となりの項目とくっついて見つからなくならないように）
    return norm(' ¦ '.join(exp)), norm(' ¦ '.join(men))

def keys(k):
    term = str(k.get('term', ''))
    out = {term}
    base = re.sub(r'[（(].*?[）)]', '', term)
    out.add(base)
    for inner in re.findall(r'[（(](.*?)[）)]', term):
        for part in re.split(r'[：:,，、]', inner):
            out.add(part)
    for a in k.get('alt') or []:
        out.add(a)
    res = []
    for x in out:
        n = norm(x)
        if len(n) < 2: continue
        if re.fullmatch(r'[a-z0-9.+#&/]+', n):
            if n in ('it', 'ai', 'id', 'os', 'pc', 'web'): continue
        res.append(n)
    return res

def found(n, hay):
    if re.fullmatch(r'[a-z0-9.+#&/]+', n):
        return re.search(r'(?<![a-z0-9])' + re.escape(n) + r'(?![a-z0-9])', hay) is not None
    return n in hay

# どのキーワード一覧を、どの資格と比べるか
PLAN = {
    'ip65': ['itpass'], 'ip01': ['itpass'], 'sg41': ['sg'], 'sg01': ['sg'], 'jstqb': ['jstqb'], 'genai': ['genai'],
    'ga4': ['ga4'], 'gads': ['gads'], 'line': ['line-basic', 'line-adv'],
}
cache = {}
report = {}
for name, cids in PLAN.items():
    kw = load(os.path.join(SRC, f'{name}.keywords.json'))
    if not kw:
        print(f'{name}: キーワード一覧がない'); continue
    for c in cids:
        if c not in cache: cache[c] = corpus(c)
    exp = ' '.join(cache[c][0] for c in cids)
    men = ' '.join(cache[c][1] for c in cids)
    rows = []
    for k in kw:
        if k.get('kind') == 'lo':
            continue
        ks = keys(k)
        st = 'explained' if any(found(x, exp) for x in ks) else 'mentioned' if any(found(x, men) for x in ks) else 'missing'
        rows.append({**k, 'status': st})
    cnt = Counter(r['status'] for r in rows)
    total = len(rows) or 1
    by_kind = Counter(r.get('kind', 'term') for r in rows)
    report[name] = {'total': len(rows), 'explained': cnt['explained'], 'mentioned': cnt['mentioned'], 'missing': cnt['missing'], 'kinds': dict(by_kind), 'rows': rows}
    print(f'{name:6s} {len(rows):5d}件  説明あり {cnt["explained"]:4d}（{cnt["explained"] * 100 // total}%）  問題だけ {cnt["mentioned"]:4d}  なし {cnt["missing"]:4d}（{cnt["missing"] * 100 // total}%）  {dict(by_kind)}')
if OUT:
    json.dump(report, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)

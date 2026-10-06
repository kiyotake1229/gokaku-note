#!/usr/bin/env python3
"""問題集ワークフローの記録（journal.jsonl）から、アプリ用の問題・用語データを組み立てる。

使い方:
  python3 tools/build_data.py <journal.jsonl> [<journal2.jsonl> ...] [--preview]
  --preview: 検証が終わっていないバッチも含める（画面の確認用）
"""
import json, re, sys, os, difflib, unicodedata
from collections import defaultdict, OrderedDict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')

journals = [a for a in sys.argv[1:] if not a.startswith('--')]
preview = '--preview' in sys.argv

meta = json.load(open(os.path.join(DATA, 'certs.json'), encoding='utf-8'))
CERTS = {c['id']: c for c in meta['certs']}
CATS = {c['id']: {x['id'] for x in c['categories']} for c in meta['certs']}

# ---- journal を読む ----
label_of, results = {}, {}
for journal in journals:
    for line in open(journal, encoding='utf-8'):
        try:
            e = json.loads(line)
        except Exception:
            continue
        if e.get('type') == 'started':
            label_of[e['key']] = e.get('label')
        elif e.get('type') == 'result':
            lab = label_of.get(e['key'])
            if lab and e.get('result') is not None:
                results[lab] = e.get('result')

def get(kind, bid):
    return results.get(f'{kind}:{bid}')

batches = sorted({lab.split(':', 1)[1] for lab in results if lab.startswith('gen:')})

def same_set(a, b):
    return a is not None and b is not None and len(a) == len(b) and set(a) == set(b)

LABEL_RE = re.compile(r'^\s*(?:[アイウエオカ]|[A-FＡ-Ｆa-f]|[1-6１-６])\s*[\.．、:：)）　 ]\s*')

def clean_choice(s):
    # 選択肢の文は変えない（「2.5か月」「a → b」などを壊さないため）。前後の空白だけ取る
    return str(s).strip()

def valid_q(q):
    ch = q.get('choices') or []
    ans = q.get('answer') or []
    return 3 <= len(ch) <= 6 and len(ans) >= 1 and all(isinstance(i, int) and 0 <= i < len(ch) for i in ans) and len(set(ans)) == len(ans) and q.get('stem')

stats = OrderedDict()
fixed_items, excluded = [], []
_ex = os.path.join(ROOT, 'tools', 'exclude.json')
_exd = json.load(open(_ex, encoding='utf-8')) if os.path.exists(_ex) else {}
if isinstance(_exd, list):
    _exd = {'questions': _exd}
EXCLUDE = set(_exd.get('questions', []))
EXCLUDE_T = set(_exd.get('terms', []))
out_q = defaultdict(list)
out_t = defaultdict(list)
problems = []
pending = []

for bid in batches:
    gen = get('gen', bid)
    if not gen or not gen.get('questions'):
        problems.append(f'{bid}: 作成結果なし')
        continue
    qs = [q for q in gen['questions'] if valid_q(q)]
    solved, reviewed, fixed = get('solve', bid), get('review', bid), get('fix', bid)
    verified = solved is not None and reviewed is not None
    sMap = {a['id']: a for a in (solved or {}).get('answers', [])}
    rMap = {r['id']: r for r in (reviewed or {}).get('reviews', [])}
    trMap = {r['term']: r for r in (reviewed or {}).get('termReviews', [])}
    clean, flagged = [], []
    for q in qs:
        s, r = sMap.get(q['id']), rMap.get(q['id'])
        agree = s is not None and same_set(s.get('chosen'), q['answer']) and s.get('confidence') == 'high'
        ok = r is not None and r.get('verdict') == 'ok'
        (clean if agree and ok else flagged).append(q)
    terms_clean, term_flags = [], []
    for t in gen.get('terms') or []:
        r = trMap.get(t['term'])
        if r and r.get('verdict') != 'ok':
            term_flags.append(t)
        else:
            terms_clean.append(t)
    final_q, final_t, dropped = list(clean), list(terms_clean), 0
    state = 'verified'
    if not verified:
        state = 'unverified'
        if not preview:
            pending.append(bid)
            continue
        final_q, final_t = qs, gen.get('terms') or []
    elif flagged or term_flags:
        if fixed is None:
            # 修正待ち：両方の検証に合格した問題だけを先に使う（指摘のある問題は入れない）
            state = 'partial'
            pending.append(bid)
            if preview:
                final_q = clean + flagged
                final_t = terms_clean + term_flags
        else:
            by = {x['id']: x for x in fixed.get('questions', [])}
            for q in flagged:
                d = by.get(q['id'])
                if not d:
                    dropped += 1
                elif d['action'] == 'keep':
                    kq = dict(q); kq['_fx'] = True
                    final_q.append(kq)
                elif d['action'] == 'fix' and d.get('fixed') and valid_q(d['fixed']):
                    fq = dict(d['fixed'])
                    fq['id'] = q['id']
                    fq['cert'] = q['cert'] if bid.startswith('guide-') and fq.get('cert') not in CERTS else q['cert']
                    fq['cat'] = fq.get('cat') or q['cat']
                    fq['_fx'] = True
                    final_q.append(fq)
                else:
                    dropped += 1
            tby = {x['term']: x for x in fixed.get('terms', [])}
            for t in term_flags:
                d = tby.get(t['term'])
                if d and d['action'] == 'keep':
                    final_t.append(t)
                elif d and d['action'] == 'fix' and d.get('fixed'):
                    ft = dict(d['fixed'])
                    ft['cat'] = ft.get('cat') or t.get('cat')
                    final_t.append(ft)
    stats[bid] = {'state': state, 'generated': len(gen['questions']), 'clean': len(clean) if verified else None, 'final': len(final_q), 'dropped': dropped, 'terms': len(final_t)}
    for q in final_q:
        cert = q.get('cert')
        if cert not in CERTS:
            problems.append(f'{bid}/{q["id"]}: 不明な資格 {cert}')
            continue
        cat = q.get('cat')
        if cat not in CATS[cert]:
            problems.append(f'{bid}/{q["id"]}: 不明な分野 {cert}/{cat}')
            continue
        choices = [clean_choice(c) for c in q['choices']]
        item = OrderedDict(
            id=f'{cert}:{bid}-{q["id"]}', cat=cat, stem=q['stem'].strip(), choices=choices,
            answer=sorted(q['answer']), explanation=q['explanation'].strip(), difficulty=int(q.get('difficulty') or 2),
            source=(q.get('source') or '').strip(),
        )
        if state not in ('verified', 'partial'):
            item['_unverified'] = True
        if q.get('_fx'):
            fixed_items.append(dict(item))
        if item['id'] in EXCLUDE:
            excluded.append(item['id'])
            continue
        out_q[cert].append(item)
    for t in final_t:
        cert = None
        # 用語の資格は、バッチの資格に合わせる
        for q in qs:
            cert = q.get('cert'); break
        if not cert or cert not in CERTS:
            continue
        out_t[cert].append({'term': t['term'].strip(), 'reading': (t.get('reading') or '').strip(), 'meaning': t['meaning'].strip(), 'example': (t.get('example') or '').strip(), 'cat': t.get('cat') if t.get('cat') in CATS[cert] else ''})

# ---- 重複の除去（問題文がほぼ同じもの） ----
def norm(s):
    s = unicodedata.normalize('NFKC', s)
    return re.sub(r'[\s、。，．・「」『』（）()\[\]]', '', s)

dups = []
for cert, lst in out_q.items():
    keep = []
    seen = []
    for q in lst:
        n = norm(q['stem'])
        hit = None
        for (m, kq) in seen:
            if abs(len(m) - len(n)) < 40 and difflib.SequenceMatcher(None, m, n).ratio() > 0.9:
                hit = kq; break
        if hit:
            dups.append((q['id'], hit['id']))
            continue
        seen.append((n, q))
        keep.append(q)
    out_q[cert] = keep

# ---- 用語：ガイドの基本用語と合わせる ----
BASE = {}
for k in ['line', 'gads', 'ga4', 'itpass', 'genai', 'jstqb', 'sg']:
    p = os.path.join(DATA, 'terms', f'_base_{k}.json')
    if os.path.exists(p):
        BASE[k] = json.load(open(p, encoding='utf-8'))
LINE_ADV_BASE = {'Messaging API', 'Reply API と Push API など'}

def tkey(s):
    s = unicodedata.normalize('NFKC', s)
    s = re.sub(r'[（(].*?[）)]', '', s)
    return re.sub(r'[\s／/・]', '', s).lower()

final_terms = {}
for cid, c in CERTS.items():
    g = c['guide']
    base = BASE.get(g, [])
    if g == 'line':
        base = [t for t in base if (t['term'] in LINE_ADV_BASE) == (cid == 'line-adv')]
    items, keys = [], set()
    for t in base:
        k = tkey(t['term'])
        if k in keys: continue
        keys.add(k)
        items.append({'id': f'{cid}:t:{t["term"]}', 'term': t['term'], 'reading': '', 'meaning': t['meaning'], 'example': t.get('example', ''), 'cat': ''})
    for t in out_t.get(cid, []):
        k = tkey(t['term'])
        if k in keys: continue
        keys.add(k)
        items.append({'id': f'{cid}:t:{t["term"]}', **t})
    final_terms[cid] = items

# ---- 手直しを当てる ----
# tools/recheck.json：再チェック（別のAI）で確定した修正。{"id", "set": {項目: 値}} の形（項目を丸ごと置きかえる）
# tools/overrides.json：手で書いた修正。{"id", "field", "old", "new"}（文字列の置きかえ）または {"id", "set": {...}}
unapplied = []
def apply(items, rules):
    by = {x['id']: x for x in items}
    for r in rules:
        x = by.get(r['id'])
        ok = False
        if x is not None and 'set' in r:
            for k, v in r['set'].items():
                if k in ('stem', 'choices', 'answer', 'explanation', 'source', 'term', 'reading', 'meaning', 'example'):
                    x[k] = v; ok = True
        elif x is not None:
            if r['field'] == 'choices':
                for i, c in enumerate(x['choices']):
                    if r['old'] in c:
                        x['choices'][i] = c.replace(r['old'], r['new']); ok = True
            elif r['old'] in (x.get(r['field']) or ''):
                x[r['field']] = x[r['field']].replace(r['old'], r['new']); ok = True
            if not ok and x is not None and r['new'] in json.dumps(x, ensure_ascii=False):
                ok = True  # すでに直っている
        if not ok:
            unapplied.append(r['id'] + ' / ' + r.get('field', 'set'))
for fname in ('recheck.json', 'overrides.json'):
    _ov = os.path.join(ROOT, 'tools', fname)
    if not os.path.exists(_ov):
        continue
    OV = json.load(open(_ov, encoding='utf-8'))
    for cid in CERTS:
        apply(out_q.get(cid, []), [r for r in OV.get('questions', []) if r['id'].startswith(cid + ':')])
        apply(final_terms[cid], [r for r in OV.get('terms', []) if r['id'].startswith(cid + ':')])
# 再チェックで外すことになった用語
for cid in CERTS:
    final_terms[cid] = [t for t in final_terms[cid] if t['id'] not in EXCLUDE_T]

# ---- 書き出し ----
os.makedirs(os.path.join(DATA, 'questions'), exist_ok=True)
for cid in CERTS:
    qs = out_q.get(cid, [])
    order = {x['id']: i for i, x in enumerate(CERTS[cid]['categories'])}
    qs.sort(key=lambda q: (order.get(q['cat'], 99), q['id']))
    json.dump(qs, open(os.path.join(DATA, 'questions', f'{cid}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    json.dump(final_terms[cid], open(os.path.join(DATA, 'terms', f'{cid}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    by = defaultdict(int)
    for q in qs: by[q['cat']] += 1
    # 公式の過去問（IPA 公開問題）や、2027年からの新しい範囲の問題（data/extra/）も数に入れる
    extra_by_set, new_total = {}, 0
    for x in CERTS[cid].get('extras') or []:
        fp = os.path.join(ROOT, x['file'])
        if not os.path.exists(fp):
            continue
        xs = json.load(open(fp, encoding='utf-8'))
        extra_by_set[x['set']] = len(xs)
        for q in xs: by[q['cat']] += 1
        if x.get('kind') == 'new':
            new_total += len(xs)
    CERTS[cid]['counts'] = {'total': len(qs) + sum(extra_by_set.values()), 'main': len(qs), 'byCat': dict(by), 'terms': len(final_terms[cid])}
    if extra_by_set:
        CERTS[cid]['counts']['extra'] = extra_by_set
        CERTS[cid]['counts']['newTotal'] = new_total
    # 用語辞典（公式の出題範囲の用語）
    gp = os.path.join(DATA, 'glossary', f'{cid}.json')
    if os.path.exists(gp):
        n_dict = len(json.load(open(gp, encoding='utf-8')))
        CERTS[cid]['glossary'] = f'data/glossary/{cid}.json'
        CERTS[cid]['counts']['dict'] = n_dict
        CERTS[cid]['counts']['terms'] += n_dict
    # 教科書の回数
    lp = os.path.join(DATA, 'lessons', f'{cid}.json')
    if os.path.exists(lp):
        CERTS[cid]['counts']['lessons'] = sum(len(ch['lessons']) for ch in json.load(open(lp, encoding='utf-8'))['chapters'])

json.dump(meta, open(os.path.join(DATA, 'certs.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)

json.dump(fixed_items, open(os.path.join(ROOT, 'tools', 'fixed_questions.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print('== 修正後に採用した問題', len(fixed_items), '／ 除外リストで外した問題', len(excluded))
print('== バッチ')
for k, v in stats.items():
    print(f'  {k:12s} {v}')
print('== 資格ごと')
for cid in CERTS:
    print(f'  {cid:11s} 問題 {CERTS[cid]["counts"]["total"]:4d}  用語 {CERTS[cid]["counts"]["terms"]:3d}  {CERTS[cid]["counts"]["byCat"]}')
print('== 合計', sum(c['counts']['total'] for c in CERTS.values()), '問 /', sum(c['counts']['terms'] for c in CERTS.values()), '語')
if pending: print('== 未完了のバッチ', pending)
if unapplied: print('== 当てられなかった手直し（要確認）', unapplied)
if dups: print('== 重複として除いた問題', dups)
if problems: print('== 問題点'); [print('  ', p) for p in problems]

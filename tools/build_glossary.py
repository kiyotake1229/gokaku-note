#!/usr/bin/env python3
"""網羅の穴うめ（用語辞典・教科書の追加回・既存の回への追記）を、アプリのデータに取り込む。

  python3 tools/build_glossary.py <穴うめの成果物のフォルダ>

- <まとまり>.verified.json の glossary → data/glossary/<資格>.json（同じ用語は1つにまとめる。アプリの用語と重なるものは入れない）
- lessons → data/lessons/<資格>.json の同じ分野の章の最後に足す（同じ id はもう一度足さない）
- append → 既存の回の本文の最後に足す（同じ文はもう一度足さない）
"""
import json, os, sys, glob, re, unicodedata

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
SRC = sys.argv[1]
meta = json.load(open(os.path.join(DATA, 'certs.json'), encoding='utf-8'))
CERTS = {c['id']: c for c in meta['certs']}

def norm(t):
    t = unicodedata.normalize('NFKC', str(t or '')).lower()
    t = re.sub(r'[（(].*?[）)]', '', t)
    return re.sub(r'\s+', '', t).replace('ー', '').replace('・', '')

def cert_of(cert, cat):
    if cert in ('line-basic', 'line-adv') or cert.startswith('line'):
        return 'line-adv' if str(cat).startswith('la') else 'line-basic'
    return cert

def qids(cid):
    ids = {q['id'] for q in json.load(open(os.path.join(DATA, 'questions', f'{cid}.json'), encoding='utf-8'))}
    for x in CERTS[cid].get('extras') or []:
        fp = os.path.join(ROOT, x['file'])
        if os.path.exists(fp):
            ids |= {q['id'] for q in json.load(open(fp, encoding='utf-8'))}
    return ids

gloss = {cid: {} for cid in CERTS}
for cid in CERTS:
    gp = os.path.join(DATA, 'glossary', f'{cid}.json')
    if os.path.exists(gp):
        for t in json.load(open(gp, encoding='utf-8')):
            gloss[cid][norm(t['term'])] = t
main_terms = {cid: {norm(t['term']) for t in json.load(open(os.path.join(DATA, 'terms', f'{cid}.json'), encoding='utf-8'))} for cid in CERTS}
books = {cid: json.load(open(os.path.join(DATA, 'lessons', f'{cid}.json'), encoding='utf-8')) for cid in CERTS if os.path.exists(os.path.join(DATA, 'lessons', f'{cid}.json'))}
stat = {'glossary': 0, 'dup': 0, 'lessons': 0, 'append': 0, 'dropped_checks': 0}

files = sorted(glob.glob(os.path.join(SRC, '*.verified.json')))
for fp in files:
    key = os.path.basename(fp).replace('.verified.json', '')
    inp = json.load(open(os.path.join(SRC, f'{key}.input.json'), encoding='utf-8'))
    d = json.load(open(fp, encoding='utf-8'))
    base_cert = inp['cert']
    for g in d.get('glossary') or []:
        cid = cert_of(g.get('cert') or base_cert, g.get('cat', ''))
        k = norm(g.get('term'))
        if not k or not str(g.get('meaning', '')).strip():
            continue
        if k in main_terms[cid] or k in gloss[cid]:
            stat['dup'] += 1; continue
        cats = {x['id'] for x in CERTS[cid]['categories']}
        gloss[cid][k] = {'id': f'{cid}:g:{g["term"].strip()}', 'term': g['term'].strip(), 'reading': g.get('reading', '') or '', 'meaning': g['meaning'].strip(),
                         'example': (g.get('example') or '').strip(), 'cat': g.get('cat') if g.get('cat') in cats else '', 'src': (g.get('src') or '').strip()}
        stat['glossary'] += 1
    for l in d.get('lessons') or []:
        cid = cert_of(l.get('cert') or base_cert, l.get('cat', ''))
        bk = books.get(cid)
        if not bk: continue
        ch = next((c for c in bk['chapters'] if c['cat'] == l.get('cat')), None)
        if not ch: continue
        if any(x['id'] == l['id'] for c in bk['chapters'] for x in c['lessons']):
            continue
        ok_ids = qids(cid)
        chk = [q for q in (l.get('check') or []) if q in ok_ids]
        stat['dropped_checks'] += len(l.get('check') or []) - len(chk)
        body = '\n'.join(x for x in str(l.get('body', '')).split('\n') if not re.match(r'^\s*\|?\s*:?-{2,}[-:| ]*$', x))
        ch['lessons'].append({'id': l['id'], 'title': l['title'], 'minutes': max(2, min(6, int(l.get('minutes') or 4))), 'goals': l.get('goals') or [], 'body': body, 'check': chk[:4]})
        stat['lessons'] += 1
    for a in d.get('append') or []:
        for cid, bk in books.items():
            for c in bk['chapters']:
                for x in c['lessons']:
                    if x['id'] == a.get('lesson') and a.get('body') and a['body'].strip() not in x['body']:
                        x['body'] = x['body'].rstrip() + '\n\n' + a['body'].strip()
                        stat['append'] += 1

os.makedirs(os.path.join(DATA, 'glossary'), exist_ok=True)
for cid, g in gloss.items():
    if not g: continue
    items = sorted(g.values(), key=lambda t: (t.get('cat') or 'zz', t.get('reading') or t['term']))
    json.dump(items, open(os.path.join(DATA, 'glossary', f'{cid}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'data/glossary/{cid}.json: {len(items)}語')
for cid, bk in books.items():
    json.dump(bk, open(os.path.join(DATA, 'lessons', f'{cid}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print(stat)

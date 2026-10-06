#!/usr/bin/env python3
"""問題・用語データの機械的なチェック。問題があれば一覧を出す（終了コード1）。"""
import json, os, re, sys, unicodedata
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
meta = json.load(open(os.path.join(DATA, 'certs.json'), encoding='utf-8'))

errors, warns = [], []
LABEL_START = re.compile(r'^\s*(?:[アイウエオカ]|[A-F]|[1-6])\s*[\.．、:：)）]')
# 解説が選択肢を記号で呼んでいそうな書き方（「アは」「選択肢イ」「Aは誤り」など）
LABEL_REF = re.compile(r'(?:選択肢\s*[アイウエオカA-F]|(?<![ァ-ヶー])[アイウエ](?:は|が|も|と|の説明|：)(?![ァ-ヶー])|(?<![A-Za-z])[A-D](?:は|が|も|：)(?![A-Za-z]))')
COUNT_WORD = re.compile(r'(二つ|2つ|２つ|三つ|3つ|３つ|すべて|全て|複数|選べ|選んで)')

all_ids = Counter()
for c in meta['certs']:
    cid = c['id']
    cats = {x['id'] for x in c['categories']}
    qs = json.load(open(os.path.join(DATA, 'questions', f'{cid}.json'), encoding='utf-8'))
    main_n = len(qs)
    # 公式の過去問・新しい範囲の問題（data/extra/）も同じように確かめる
    for x in c.get('extras') or []:
        fp = os.path.join(ROOT, x['file'])
        if not os.path.exists(fp):
            errors.append(f'{cid}: {x["file"]} がない'); continue
        xs = json.load(open(fp, encoding='utf-8'))
        for q in xs:
            q['_extra'] = x
            for f in q.get('figs') or []:
                if not os.path.exists(os.path.join(DATA, 'extra', 'img', f)):
                    errors.append(f'{q["id"]}: 図 {f} がない')
            for i, f in enumerate(q.get('figs') or []):
                mk = f'［図{i + 1}］'
                if mk not in q['stem'] and len(q.get('figs')) > 1:
                    warns.append(f'{q["id"]}: 問題文に {mk} の印がない')
        qs = qs + xs
    for q in qs:
        all_ids[q['id']] += 1
        where = q['id']
        if not q['id'].startswith(cid + ':'):
            errors.append(f'{where}: id の先頭が資格IDではない')
        if q['cat'] not in cats:
            errors.append(f'{where}: 分野 {q["cat"]} が {cid} にない')
        ch = q['choices']
        maxc = 10 if q.get('_extra') else 6
        if not 3 <= len(ch) <= maxc:
            errors.append(f'{where}: 選択肢の数 {len(ch)}')
        if any(not str(x).strip() for x in ch):
            errors.append(f'{where}: 空の選択肢')
        norm = [unicodedata.normalize('NFKC', x).strip() for x in ch]
        if len(set(norm)) != len(norm):
            errors.append(f'{where}: 同じ選択肢が重複')
        if not q['answer'] or any(not (0 <= i < len(ch)) for i in q['answer']) or len(set(q['answer'])) != len(q['answer']):
            errors.append(f'{where}: 正解の番号が不正 {q["answer"]}')
        if q.get('_extra') and q['_extra'].get('kind') == 'past' and not str(q.get('source', '')).startswith('出典：'):
            errors.append(f'{where}: 公開問題の出典の書き方が違う')
        if len(q['answer']) > 1 and not COUNT_WORD.search(q['stem']):
            warns.append(f'{where}: 複数選択なのに、問題文に選ぶ数が書かれていない')
        if len(q['answer']) == len(ch):
            errors.append(f'{where}: すべての選択肢が正解になっている')
        for x in ch:
            if LABEL_START.match(x):
                warns.append(f'{where}: 選択肢の先頭に記号 → {x[:20]}')
            if re.search(r'(上記|以上)の(すべて|いずれ)|いずれでもない|すべて正しい', x):
                warns.append(f'{where}: 位置に依存する選択肢 → {x[:30]}')
        m = LABEL_REF.search(q['explanation'])
        # 選択肢の順番を入れかえない問題（公開問題など）は、解説で記号を使ってよい
        if m and not q.get('fixed'):
            warns.append(f'{where}: 解説が記号で選択肢を呼んでいる可能性 → 「{m.group(0)}」')
        if len(q['explanation']) < 30:
            warns.append(f'{where}: 解説が短い（{len(q["explanation"])}字）')
        if q['stem'].count('```') % 2:
            errors.append(f'{where}: コードの囲み ``` が閉じていない')
        if not 1 <= int(q.get('difficulty', 0)) <= 3:
            errors.append(f'{where}: 難易度が不正')
    ts = json.load(open(os.path.join(DATA, 'terms', f'{cid}.json'), encoding='utf-8'))
    tid = Counter(t['id'] for t in ts)
    for k, v in tid.items():
        if v > 1:
            errors.append(f'{cid}: 用語IDの重複 {k}')
    for t in ts:
        if not t['meaning'].strip():
            errors.append(f'{t["id"]}: 用語の意味が空')
        if t.get('cat') and t['cat'] not in cats:
            errors.append(f'{t["id"]}: 用語の分野 {t["cat"]} が不正')
    # 模擬試験の配分が足りるか
    mock = c['mock']
    by = Counter(q['cat'] for q in qs if not re.search(r':(?:n27|s27)-', q['id']))
    if len(qs) < mock['count']:
        warns.append(f'{cid}: 問題数 {len(qs)} が模擬試験の {mock["count"]} 問に足りない')
    for cat, n in (mock.get('dist') or {}).items():
        if by.get(cat, 0) < n:
            warns.append(f'{cid}: 分野 {cat} の問題 {by.get(cat, 0)} が模擬試験の配分 {n} に足りない')
    for f in c.get('fields') or []:
        n = sum(by.get(x['id'], 0) for x in c['categories'] if x.get('field') == f['id'])
        if n < f['count']:
            warns.append(f'{cid}: {f["name"]} の問題 {n} が模擬試験の配分 {f["count"]} に足りない')

for k, v in all_ids.items():
    if v > 1:
        errors.append(f'問題IDの重複 {k}')

# 教科書：分野・確認問題・本文の形
for c in meta['certs']:
    lp = os.path.join(DATA, 'lessons', f'{c["id"]}.json')
    if not os.path.exists(lp):
        continue
    cats = {x['id'] for x in c['categories']}
    bk = json.load(open(lp, encoding='utf-8'))
    lids = Counter()
    for ch in bk['chapters']:
        if ch['cat'] not in cats:
            errors.append(f'{c["id"]} 教科書: 分野 {ch["cat"]} がない')
        for l in ch['lessons']:
            lids[l['id']] += 1
            if not l.get('title') or len(l.get('body', '')) < 200:
                errors.append(f'{l["id"]}: 題か本文が短すぎる')
            for q in l.get('check') or []:
                if q not in all_ids:
                    errors.append(f'{l["id"]}: 確認問題 {q} がない')
            if len(l.get('body', '')) > 2600:
                warns.append(f'{l["id"]}: 本文が長い（{len(l["body"])}字）')
            if not l.get('check'):
                warns.append(f'{l["id"]}: 確認問題がない')
    for k, v in lids.items():
        if v > 1:
            errors.append(f'教科書のIDの重複 {k}')

print(f'エラー {len(errors)} 件 / 注意 {len(warns)} 件')
for e in errors:
    print('  [エラー]', e)
for w in warns:
    print('  [注意]', w)
sys.exit(1 if errors else 0)

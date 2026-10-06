#!/usr/bin/env python3
"""ワークフローの成果物から、アプリ用の追加データを作る。

  python3 tools/build_extra.py <成果物のフォルダ> [--rejected <json>]

作るもの：
- data/extra/itpass-r08.json, itpass-r07.json, sg-r08.json（IPA 公開問題。出典つき・選択肢の順番は固定）
- data/extra/img/*.png（公開問題の図。灰色にして容量を小さくする）
- data/extra/itpass-n27.json, sg-n27.json（2027年からの新しい範囲。--rejected の問題は入れない）
- data/summaries/<資格>.json（要点まとめ。点検ずみの版）
- data/certs.json の extras（追加データの一覧）と、新しい範囲の分野
"""
import json, os, sys, glob, shutil, re
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, 'data')
SRC = sys.argv[1]
rejected = set()
if '--rejected' in sys.argv:
    rejected = set(json.load(open(sys.argv[sys.argv.index('--rejected') + 1], encoding='utf-8')))

os.makedirs(os.path.join(DATA, 'extra', 'img'), exist_ok=True)
os.makedirs(os.path.join(DATA, 'summaries'), exist_ok=True)

def clean_img(src, dst):
    # スキャンの細かい汚れを抑え、16階調の灰色にして小さくする
    im = Image.open(src).convert('L')
    im = im.point(lambda v: 255 if v > 225 else v)
    im = im.quantize(colors=16, method=Image.Quantize.MEDIANCUT) if hasattr(Image, 'Quantize') else im.quantize(16)
    im.save(dst, optimize=True)

PAST = [
    # (資格, 公開問題の組, 成果物のまとまり, 出典の書き方, タイトル, 時間)
    ('itpass', 'r08', ['r08a', 'r08b', 'r08c'], '出典：令和8年度 ITパスポート試験 公開問題 問{no}', '令和8年度 公開問題', 120),
    ('itpass', 'r07', ['r07a', 'r07b', 'r07c'], '出典：令和7年度 ITパスポート試験 公開問題 問{no}', '令和7年度 公開問題', 120),
    ('sg', 'r08', ['sg08'], '出典：令和8年度 情報セキュリティマネジメント試験 公開問題（科目A・B）問{no}', '令和8年度 公開問題（15問）', 30),
]
meta = json.load(open(os.path.join(DATA, 'certs.json'), encoding='utf-8'))
CERTS = {c['id']: c for c in meta['certs']}
extras = {cid: [] for cid in CERTS}
img_n = 0
for cid, set_id, chunks, src_fmt, title, minutes in PAST:
    qs = []
    for k in chunks:
        qs += json.load(open(os.path.join(SRC, 'past', f'{k}.final.json'), encoding='utf-8'))
    qs.sort(key=lambda q: q['no'])
    out = []
    for q in qs:
        figs = []
        for f in q.get('figs') or []:
            name = f'{cid}-{f}'  # 例 itpass-r08-026-1.png
            clean_img(os.path.join(SRC, 'past', 'fig', f), os.path.join(DATA, 'extra', 'img', name))
            figs.append(name)
            img_n += 1
        # 空欄の書き方（［a］［ a ］［　a　］など）をそろえる
        blank = lambda t: re.sub(r'［\s*([a-z][0-9]?)\s*］', '［\u3000\\1\u3000］', t)
        x = {'id': f'{cid}:{set_id}-{q["no"]:03d}', 'cat': q['cat'], 'no': q['no'], 'stem': blank(q['stem']), 'choices': [blank(c) for c in q['choices']],
             'answer': q['answer'], 'explanation': blank(q['explanation']), 'difficulty': int(q.get('difficulty') or 2),
             'source': src_fmt.format(no=q['no']), 'fixed': True}
        if figs: x['figs'] = figs
        if q.get('note'): x['note'] = q['note']
        out.append(x)
    fn = f'data/extra/{cid}-{set_id}.json'
    json.dump(out, open(os.path.join(ROOT, fn), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    extras[cid].append({'set': set_id, 'kind': 'past', 'title': title, 'file': fn, 'minutes': minutes})
    print(f'{fn}: {len(out)}問')

# ---- 2027年からの新しい範囲 ----
NEW_CATS = [
    {'id': 'n1', 'name': '新範囲：ビジネス変革・マインド'},
    {'id': 'n2', 'name': '新範囲：データマネジメント'},
    {'id': 'n3', 'name': '新範囲：デジタル技術'},
    {'id': 'n4', 'name': '新範囲：情報倫理・法規'},
]
for cid in ['itpass', 'sg']:
    fp = os.path.join(SRC, 'newexam', f'{cid}.reviewed.json')
    if not os.path.exists(fp):
        print('（まだない）', fp); continue
    qs = [q for q in json.load(open(fp, encoding='utf-8')) if q['id'] not in rejected]
    out = []
    for q in qs:
        x = {k: q[k] for k in ('id', 'cat', 'stem', 'choices', 'answer', 'explanation', 'difficulty', 'source') if k in q}
        x['difficulty'] = int(x.get('difficulty') or 2)
        if q.get('fixed'): x['fixed'] = True
        out.append(x)
    fn = f'data/extra/{cid}-n27.json'
    json.dump(out, open(os.path.join(ROOT, fn), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    extras[cid].append({'set': 'n27', 'kind': 'new', 'title': '2027年からの新しい範囲', 'file': fn})
    print(f'{fn}: {len(out)}問（外した問題 {len([1 for q in json.load(open(fp, encoding="utf-8")) if q["id"] in rejected])}）')
    if cid == 'itpass':
        have = {x['id'] for x in CERTS[cid]['categories']}
        used = {q['cat'] for q in out}
        for nc in NEW_CATS:
            if nc['id'] in used and nc['id'] not in have:
                CERTS[cid]['categories'].append(nc)

for cid, xs in extras.items():
    if xs: CERTS[cid]['extras'] = xs

# ---- 要点まとめ ----
for fp in sorted(glob.glob(os.path.join(SRC, 'summaries', '*.verified.json'))):
    d = json.load(open(fp, encoding='utf-8'))
    cid = d['cert']
    cats = {}
    for cat, v in d['cats'].items():
        cats[cat] = {k: v.get(k) for k in ('lead', 'points', 'pairs', 'formulas', 'traps') if v.get(k)}
    json.dump({'cert': cid, 'cats': cats}, open(os.path.join(DATA, 'summaries', f'{cid}.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(f'data/summaries/{cid}.json: {len(cats)}分野')

json.dump(meta, open(os.path.join(DATA, 'certs.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('図', img_n, '枚')

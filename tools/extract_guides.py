import re, json, html, os, sys
# 学習ガイドのHTMLは、study-app の1つ上のフォルダにある
APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.dirname(APP)
OUT = os.path.join(APP, "data")
FILES = {
 'line': '01_LINEヤフーマーケティングスキルバッジ.html',
 'gads': '02_Google広告認定資格.html',
 'ga4': '03_GA4認定資格.html',
 'itpass': '04_ITパスポート.html',
 'genai': '05_生成AIパスポート.html',
 'jstqb': '06_JSTQB_Foundation_Level.html',
 'sg': '07_情報セキュリティマネジメント.html',
 'intro': 'はじめに_資格取得の学習ガイド.html',
}
# 公開サイトに個人名を出さないため、名前は手元だけのファイル（Git に入れない）から読む
# tools/names.local.json の例: {"learner": ["〇〇さんへ ／ ", "〇〇さんへ", "〇〇さん"], "mentor": ["△△さん"]}
_NAMES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'names.local.json')
NAMES = json.load(open(_NAMES_PATH, encoding='utf-8')) if os.path.exists(_NAMES_PATH) else {'learner': [], 'mentor': []}

def neutral(s):
    s = s.replace('\U0001F536 ', '').replace('\U0001F536', '')
    for n in NAMES.get('learner', []):
        s = s.replace(n, '' if n.endswith('へ ／ ') or n.endswith('へ') else 'あなた')
    for n in NAMES.get('mentor', []):
        s = s.replace(n, '{{mentor}}')
    return s
def strip_tags(s):
    s = re.sub(r'<br\s*/?>', '\n', s)
    s = re.sub(r'<[^>]+>', '', s)
    return html.unescape(s).strip()
def body_of(t):
    m = re.search(r'<body[^>]*>(.*)</body>', t, re.S)
    b = m.group(1)
    b = re.sub(r'<p class="crumb">.*?</p>', '', b, flags=re.S)
    b = re.sub(r'<footer.*?</footer>', '', b, flags=re.S)
    b = re.sub(r'^\s*<div class="wrap">', '', b); b = re.sub(r'</div>\s*$', '', b.strip())
    # links: open externally, drop links to other local manual html
    b = re.sub(r'<a href="(https?://[^"]+)"', r'<a href="\1" target="_blank" rel="noopener"', b)
    b = re.sub(r'<a href="[^"]+\.html"[^>]*>(.*?)</a>', r'<span class="xref">\1</span>', b, flags=re.S)
    return b
def parse_terms(sec_html):
    terms = []
    for tr in re.findall(r'<tr>(.*?)</tr>', sec_html, re.S):
        cells = re.findall(r'<t[hd][^>]*>(.*?)</t[hd]>', tr, re.S)
        if len(cells) >= 2:
            name = strip_tags(cells[0]).replace('\n', '')
            if name in ('用語',): continue
            terms.append({'term': neutral(name), 'meaning': neutral(strip_tags(cells[1])), 'example': neutral(strip_tags(cells[2])) if len(cells) > 2 else ''})
    return terms
for key, fn in FILES.items():
    t = open(os.path.join(SRC, fn), encoding='utf-8').read()
    title = strip_tags(re.search(r'<h1>(.*?)</h1>', t, re.S).group(1))
    b = body_of(t)
    lead_m = re.search(r'<p class="lead">(.*?)</p>', b, re.S)
    lead = strip_tags(lead_m.group(1)) if lead_m else ''
    pre = b.split('<h2', 1)[0]
    pre = re.sub(r'<h1>.*?</h1>', '', pre, flags=re.S)
    pre = re.sub(r'<p class="lead">.*?</p>', '', pre, flags=re.S)
    parts = re.split(r'(?=<h2[ >])', b)[1:]
    sections, terms, practice = [], [], []
    for p in parts:
        h = strip_tags(re.search(r'<h2[^>]*>(.*?)</h2>', p, re.S).group(1))
        inner = re.sub(r'<h2[^>]*>.*?</h2>', '', p, count=1, flags=re.S).strip()
        htitle = re.sub(r'^\d+\.\s*', '', h)
        if '練習問題' in h:
            practice.append(strip_tags(inner)); continue
        if '用語' in h and '<table' in inner:
            terms += parse_terms(inner)
            continue
        # h3 terms block inside a section
        m = re.search(r'<h3>[^<]*覚えるべき用語[^<]*</h3>(.*?)(?=<h3>|$)', inner, re.S)
        if m:
            terms += parse_terms(m.group(1))
            inner = inner.replace(m.group(0), '')
        sections.append({'title': neutral(htitle), 'html': neutral(inner)})
    out = {'id': key, 'title': neutral(title), 'lead': neutral(lead), 'notice': neutral(pre.strip()), 'sections': sections}
    json.dump(out, open(f'{OUT}/guides/{key}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    if terms:
        json.dump(terms, open(f'{OUT}/terms/_base_{key}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(key, '| sections:', [s['title'] for s in sections], '| terms:', len(terms), '| notice:', len(pre.strip()))

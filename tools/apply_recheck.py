#!/usr/bin/env python3
"""再チェック（recheck-all ワークフロー）の記録から、確定した修正・削除を取り出す。

使い方:
  python3 tools/apply_recheck.py <journal.jsonl> [<journal2.jsonl> ...] --batches <batches.json> [--write]

- 判定の流れはワークフローと同じ：
  「答えを見ずに解いたAIが高い確信で正解と一致」かつ「校閲者が ok」→ 問題なし。
  それ以外は判定役の決定（keep / fix / drop）。問題文・選択肢・正解を変えた fix は、
  もう一度、答えを見ずに解いたAIが一致したときだけ採用（一致しなければ drop）。
  判定役の結果がない問題は、安全のため drop。
- --write を付けると tools/recheck.json（修正）と tools/exclude.json（削除）と tools/recheck_report.md を書く。
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
argv = sys.argv[1:]
write = '--write' in argv
if '--batches' not in argv:
    sys.exit('--batches <batches.json> が必要です')
batches = json.load(open(argv[argv.index('--batches') + 1], encoding='utf-8'))
journals = [a for a in argv if a.endswith('.jsonl')]

# ---- 記録を読む（同じラベルは、あとの結果を優先） ----
label_of, res = {}, {}
for j in journals:
    for line in open(j, encoding='utf-8'):
        try:
            e = json.loads(line)
        except Exception:
            continue
        if e.get('type') == 'started':
            label_of[e['key']] = e.get('label')
        elif e.get('type') == 'result' and e.get('result') is not None:
            lab = label_of.get(e['key'])
            if lab:
                res[lab] = e['result']

def same(a, b):
    return isinstance(a, list) and isinstance(b, list) and len(a) == len(b) and set(a) == set(b)

def valid_fixed(f):
    return (isinstance(f, dict) and isinstance(f.get('choices'), list) and len(f['choices']) >= 3
            and isinstance(f.get('answer'), list) and len(f['answer']) >= 1
            and all(isinstance(i, int) and 0 <= i < len(f['choices']) for i in f['answer'])
            and len(set(f['answer'])) == len(f['answer']) and f.get('stem') and f.get('explanation'))

fixes_q, drops_q, keeps_q, oks, pending = [], [], [], 0, []
for b in batches['q']:
    key = b['key']
    solve, check = res.get(f'solve:{key}'), res.get(f'check:{key}')
    if solve is None or check is None:
        pending.append(key); continue
    full = json.load(open(b['full'], encoding='utf-8'))
    sm = {a['id']: a for a in solve.get('answers', [])}
    cm = {r['id']: r for r in check.get('results', [])}
    flagged = []
    for q in full:
        s, c = sm.get(q['id']), cm.get(q['id'])
        solver_ok = bool(s) and s.get('confidence') == 'high' and same(s.get('chosen'), q['answer'])
        check_ok = bool(c) and c.get('verdict') == 'ok'
        if solver_ok and check_ok:
            oks += 1
        else:
            flagged.append((q, s, c))
    if not flagged:
        continue
    judge = res.get(f'judge:{key}')
    if judge is None:
        pending.append(key + '(judge)'); continue
    dm = {d['id']: d for d in judge.get('decisions', [])}
    resolve = res.get(f'resolve:{key}')
    rm = {a['id']: a for a in (resolve or {}).get('answers', [])}
    need_resolve = False
    for q, s, c in flagged:
        d = dm.get(q['id'])
        why = lambda: {'solver': (s and {'chosen': s.get('chosen'), 'confidence': s.get('confidence'), 'issue': s.get('issue', '')}), 'checker': (c and {'verdict': c.get('verdict'), 'problems': c.get('problems', ''), 'evidence': c.get('evidence', '')})}
        if not d:
            drops_q.append({'id': q['id'], 'reason': '判定役から結果が返らなかったため、安全のため外す', **why()}); continue
        if d['action'] == 'keep':
            keeps_q.append({'id': q['id'], 'reason': d.get('reason', ''), 'evidence': d.get('evidence', ''), **why()})
        elif d['action'] == 'fix':
            f = d.get('fixed')
            if not valid_fixed(f):
                drops_q.append({'id': q['id'], 'reason': '修正案の形式が不正: ' + d.get('reason', ''), **why()}); continue
            changed = f['stem'] != q['stem'] or f['choices'] != list(q['choices'].values()) or not same(f['answer'], q['answer'])
            if changed:
                a = rm.get(q['id'])
                if resolve is None:
                    need_resolve = True; continue
                if a and a.get('confidence') == 'high' and same(a.get('chosen'), f['answer']):
                    fixes_q.append({'id': q['id'], 'reason': d.get('reason', ''), 'evidence': d.get('evidence', ''), 'set': {k: f.get(k, '') for k in ('stem', 'choices', 'answer', 'explanation', 'source')}, 'resolved': True, **why()})
                else:
                    drops_q.append({'id': q['id'], 'reason': '修正後の問題を解き直したAIの答えが一致しなかった（' + (json.dumps(a.get('chosen')) + ' / ' + a.get('confidence', '') + (' / ' + a['issue'] if a.get('issue') else '') if a else '結果なし') + '）。元の指摘: ' + d.get('reason', ''), **why()})
            else:
                fixes_q.append({'id': q['id'], 'reason': d.get('reason', ''), 'evidence': d.get('evidence', ''), 'set': {k: f.get(k, '') for k in ('stem', 'choices', 'answer', 'explanation', 'source')}, **why()})
        else:
            drops_q.append({'id': q['id'], 'reason': d.get('reason', ''), 'evidence': d.get('evidence', ''), **why()})
    if need_resolve:
        pending.append(key + '(resolve)')

fixes_t, drops_t, keeps_t, oks_t, pending_t = [], [], [], 0, []
for b in batches['t']:
    key = b['key']
    check = res.get(f'terms:{key}')
    if check is None:
        pending_t.append(key); continue
    items = {t['id']: t for t in json.load(open(b['file'], encoding='utf-8'))}
    results = check.get('results', [])
    flagged = [r for r in results if r.get('verdict') != 'ok' and r['id'] in items]
    oks_t += len([r for r in results if r.get('verdict') == 'ok'])
    if not flagged:
        continue
    judge = res.get(f'tjudge:{key}')
    if judge is None:
        pending_t.append(key + '(judge)'); continue
    dm = {d['id']: d for d in judge.get('decisions', [])}
    for r in flagged:
        t, d = items[r['id']], dm.get(r['id'])
        base = {'id': r['id'], 'term': t['term'], 'checker': {'verdict': r.get('verdict'), 'problems': r.get('problems', ''), 'evidence': r.get('evidence', '')}}
        if not d:
            drops_t.append({**base, 'reason': '判定役から結果が返らなかったため、安全のため外す'})
        elif d['action'] == 'fix' and isinstance(d.get('fixed'), dict) and (d['fixed'].get('meaning') or t.get('meaning')):
            f = d['fixed']
            fixes_t.append({**base, 'reason': d.get('reason', ''), 'evidence': d.get('evidence', ''), 'set': {'term': f.get('term') or t['term'], 'reading': f.get('reading') if f.get('reading') is not None else t.get('reading', ''), 'meaning': f.get('meaning') or t['meaning'], 'example': f.get('example') if f.get('example') is not None else t.get('example', '')}})
        elif d['action'] == 'keep':
            keeps_t.append({**base, 'reason': d.get('reason', ''), 'evidence': d.get('evidence', '')})
        else:
            drops_t.append({**base, 'reason': d.get('reason', ''), 'evidence': d.get('evidence', '')})

total_q = sum(b['n'] for b in batches['q'])
total_t = sum(b['n'] for b in batches['t'])
done_q = total_q - sum(b['n'] for b in batches['q'] if b['key'] in pending or any(p.startswith(b['key'] + '(') for p in pending))
print(f'問題: {total_q}問中 判定済み {done_q}問 ／ 問題なし {oks}、元のまま {len(keeps_q)}、修正 {len(fixes_q)}、削除 {len(drops_q)}')
print(f'用語: {total_t}語中 ／ 問題なし {oks_t}、元のまま {len(keeps_t)}、修正 {len(fixes_t)}、削除 {len(drops_t)}')
if pending: print('  未完了の問題バッチ:', pending)
if pending_t: print('  未完了の用語バッチ:', pending_t)

if write:
    json.dump({'questions': [{'id': f['id'], 'set': f['set']} for f in fixes_q], 'terms': [{'id': f['id'], 'set': f['set']} for f in fixes_t]},
              open(os.path.join(ROOT, 'tools', 'recheck.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    json.dump({'questions': [d['id'] for d in drops_q], 'terms': [d['id'] for d in drops_t]},
              open(os.path.join(ROOT, 'tools', 'exclude.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    lines = ['# 再チェックの結果（2026-09-28）', '',
             f'- 問題 {total_q}問：問題なし {oks}、指摘があったが元のまま {len(keeps_q)}、修正 {len(fixes_q)}、削除 {len(drops_q)}' + (f'、未判定 {total_q - done_q}' if total_q - done_q else ''),
             f'- 用語 {total_t}語：問題なし {oks_t}、元のまま {len(keeps_t)}、修正 {len(fixes_t)}、削除 {len(drops_t)}', '']
    def sec(title, items, kind):
        lines.append(f'## {title}（{len(items)}）'); lines.append('')
        for x in items:
            lines.append(f'### {x["id"]}' + (f'　{x["term"]}' if x.get('term') else ''))
            lines.append(f'- 判定の理由: {x.get("reason", "")}')
            if x.get('evidence'): lines.append(f'- 根拠: {x["evidence"]}')
            if x.get('checker'): lines.append(f'- 校閲者: {x["checker"].get("verdict")} — {x["checker"].get("problems", "")}')
            if x.get('solver'): lines.append(f'- 答えを見ずに解いたAI: {json.dumps(x["solver"].get("chosen"))}（{x["solver"].get("confidence")}）{x["solver"].get("issue") or ""}')
            if kind == 'fix' and 'stem' in x['set']:
                lines.append(f'- 直した後の問題文: {x["set"]["stem"]}')
                lines.append(f'- 直した後の選択肢: {json.dumps(x["set"]["choices"], ensure_ascii=False)}　正解: {x["set"]["answer"]}')
                lines.append(f'- 直した後の解説: {x["set"]["explanation"]}')
            elif kind == 'fix':
                lines.append(f'- 直した後: {x["set"]["meaning"]}　例: {x["set"]["example"]}')
            lines.append('')
    sec('修正した問題', fixes_q, 'fix'); sec('削除した問題', drops_q, 'drop'); sec('指摘があったが、確認の結果そのままにした問題', keeps_q, 'keep')
    sec('修正した用語', fixes_t, 'fix'); sec('削除した用語', drops_t, 'drop'); sec('指摘があったが、そのままにした用語', keeps_t, 'keep')
    open(os.path.join(ROOT, 'tools', 'recheck_report.md'), 'w', encoding='utf-8').write('\n'.join(lines))
    print('書き出し: tools/recheck.json, tools/exclude.json, tools/recheck_report.md')

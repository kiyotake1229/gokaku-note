// 記録：学習ログ・問題の結果・受験の予定と結果・書き出し
import { store } from '../store.js'
import { orderedCerts, cert as getCert, meta } from '../data.js'
import { icon } from '../icons.js'
import { esc, today, addDays, fmtDate, fmtMin, pct, download, toCSV, toTSV, parseYmd, ymd } from '../util.js'
import { sheet, toast, confirmDialog, barChart, bar, animateIn, emptyState, certMark } from '../ui.js'
import { mentorName } from '../nav.js'
import { streak } from '../srs.js'
import { openShareSheet } from './sharesheet.js'

let tab = 'logs'

const certOptions = (sel) => `<option value="">（選ぶ）</option>` + orderedCerts().map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('') + `<option value="other" ${sel === 'other' ? 'selected' : ''}>その他</option>`
const certLabel = (id) => (id === 'other' ? 'その他' : getCert(id)?.short || '—')
const certColor = (id) => getCert(id)?.color || 'var(--faint)'

// ---- 学習ログの入力 ----
export function openLogForm(prefill = {}, id = null) {
  const e = id ? store.get().logs.find((x) => x.id === id) : null
  const v = { date: today(), cert: store.get().profile.focusCert || '', what: '', minutes: 30, learned: '', ask: '', comment: '', ...(e || {}), ...prefill }
  const m = mentorName()
  sheet({
    title: e ? '学習ログを直す' : '学習ログを書く',
    body: `<form id="lf" autocomplete="off">
      <div class="grid2">
        <div class="field"><label for="lf-date">日付</label><input class="input" type="date" id="lf-date" value="${esc(v.date)}" required></div>
        <div class="field"><label for="lf-min">時間（分）</label><input class="input" type="number" inputmode="numeric" min="1" max="600" id="lf-min" value="${esc(v.minutes)}" required></div>
      </div>
      <div class="stepper" style="margin:-6px 0 14px">${[15, 30, 45, 60, 90].map((n) => `<button type="button" data-min="${n}" class="${Number(v.minutes) === n ? 'on' : ''}">${n}分</button>`).join('')}</div>
      <div class="field"><label for="lf-cert">資格</label><select class="select" id="lf-cert" required>${certOptions(v.cert)}</select></div>
      <div class="field"><label for="lf-what">やったこと（コース名・章・ページ）</label><input class="input" id="lf-what" value="${esc(v.what)}" placeholder="例：レッスン03 運用の流れ／練習問題10問"></div>
      <div class="field"><label for="lf-learned">分かったこと（1行）</label><input class="input" id="lf-learned" value="${esc(v.learned)}" placeholder="例：通数は「送った回数×人数」で数える"></div>
      <div class="field"><label for="lf-ask">分からなかったこと・聞きたいこと</label><textarea class="textarea" id="lf-ask" placeholder="1つでよいので具体的に。次の出勤日に${esc(m)}に聞く材料になります">${esc(v.ask)}</textarea></div>
      <div class="field"><label for="lf-comment">${esc(m)}のコメント</label><textarea class="textarea" id="lf-comment" placeholder="聞いたあとに、答えをメモしておけます">${esc(v.comment)}</textarea></div>
      <div class="row" style="gap:10px">
        ${e ? `<button type="button" class="btn danger" id="lf-del" aria-label="削除">${icon('trash', 'sm')}</button>` : ''}
        <button class="btn primary grow" type="submit">${icon('check', 'sm')}保存する</button>
      </div>
    </form>`,
    onMount(body, close) {
      const f = body.querySelector('#lf')
      body.querySelectorAll('[data-min]').forEach((b) => (b.onclick = () => {
        body.querySelector('#lf-min').value = b.dataset.min
        body.querySelectorAll('[data-min]').forEach((x) => x.classList.toggle('on', x === b))
      }))
      f.onsubmit = (ev) => {
        ev.preventDefault()
        const data = {
          date: body.querySelector('#lf-date').value || today(),
          minutes: Math.max(1, Math.min(600, Number(body.querySelector('#lf-min').value) || 30)),
          cert: body.querySelector('#lf-cert').value,
          what: body.querySelector('#lf-what').value.trim(),
          learned: body.querySelector('#lf-learned').value.trim(),
          ask: body.querySelector('#lf-ask').value.trim(),
          comment: body.querySelector('#lf-comment').value.trim(),
        }
        if (!data.cert) { toast('資格を選んでください'); body.querySelector('#lf-cert').focus(); return }
        if (e) store.updateLog(e.id, data)
        else store.addLog(data)
        close()
        toast(e ? '直しました' : `記録しました（${fmtMin(data.minutes)}）`)
      }
      body.querySelector('#lf-del')?.addEventListener('click', async () => {
        if (await confirmDialog({ title: 'このログを削除しますか？', ok: '削除する', danger: true })) {
          store.removeLog(e.id); close(); toast('削除しました')
        }
      })
    },
  })
}

// ---- 問題の結果（公式サンプル問題などを手で記録） ----
export function openResultForm() {
  sheet({
    title: '問題の結果を書く',
    body: `<p class="small muted" style="margin-top:0">アプリの練習問題の結果は自動で記録されます。ここには、公式のサンプル問題や市販の問題集などの結果を書きます。</p>
    <form id="rf">
      <div class="grid2">
        <div class="field"><label for="rf-date">日付</label><input class="input" type="date" id="rf-date" value="${today()}"></div>
        <div class="field"><label for="rf-cert">資格</label><select class="select" id="rf-cert">${certOptions(store.get().profile.focusCert)}</select></div>
      </div>
      <div class="field"><label for="rf-src">何の問題か</label><input class="input" id="rf-src" placeholder="例：公式のサンプル問題"></div>
      <div class="grid2">
        <div class="field"><label for="rf-total">問題数</label><input class="input" type="number" inputmode="numeric" min="1" id="rf-total" required></div>
        <div class="field"><label for="rf-ok">正解数</label><input class="input" type="number" inputmode="numeric" min="0" id="rf-ok" required></div>
      </div>
      <div class="field"><label for="rf-weak">間違えた分野（次に復習するところ）</label><input class="input" id="rf-weak"></div>
      <button class="btn primary block" type="submit">${icon('check', 'sm')}保存する</button>
    </form>`,
    onMount(body, close) {
      body.querySelector('#rf').onsubmit = (ev) => {
        ev.preventDefault()
        const total = Number(body.querySelector('#rf-total').value)
        const correct = Number(body.querySelector('#rf-ok').value)
        const certId = body.querySelector('#rf-cert').value
        if (!certId) return toast('資格を選んでください')
        if (!total || correct < 0 || correct > total) return toast('問題数と正解数を確かめてください')
        store.addSession({
          date: body.querySelector('#rf-date').value || today(), cert: certId, mode: 'manual',
          title: body.querySelector('#rf-src').value.trim() || '問題集', total, correct, weak: body.querySelector('#rf-weak').value.trim(),
          source: body.querySelector('#rf-src').value.trim() || '手入力',
        })
        close()
        toast(`記録しました（正答率 ${pct(correct, total)}%）`)
      }
    },
  })
}

// ---- 受験の予定と結果 ----
export function openExamForm(certId) {
  const c = getCert(certId)
  const e = store.get().exams[certId] || {}
  sheet({
    title: `${c.short}の受験`,
    body: `<form id="ef">
      <div class="grid2">
        <div class="field"><label for="ef-applied">申し込んだ日</label><input class="input" type="date" id="ef-applied" value="${esc(e.applied || '')}"></div>
        <div class="field"><label for="ef-date">受験日</label><input class="input" type="date" id="ef-date" value="${esc(e.date || '')}"></div>
      </div>
      <div class="field"><span class="lab">結果</span><div class="stepper" id="ef-result">${['', '合格', '不合格'].map((r) => `<button type="button" data-r="${r}" class="${(e.result || '') === r ? 'on' : ''}">${r || 'まだ'}</button>`).join('')}</div></div>
      <div class="field"><label for="ef-score">点数・正答率</label><input class="input" id="ef-score" value="${esc(e.score || '')}" placeholder="例：85%"></div>
      <div class="field"><label for="ef-expiry">有効期限（更新が必要な資格）</label><input class="input" type="date" id="ef-expiry" value="${esc(e.expiry || '')}">
        ${c.validityDays ? `<span class="hint">この資格の有効期間は${esc(c.validity)}です。合格にすると、受験日から自動で入ります。</span>` : `<span class="hint">この資格は更新がいりません。</span>`}</div>
      <div class="field"><label for="ef-proof">証明の保存場所</label><input class="input" id="ef-proof" value="${esc(e.proof || '')}" placeholder="例：Skillshop のプロフィール／合格証書のファイル"></div>
      <div class="field"><label for="ef-memo">メモ</label><textarea class="textarea" id="ef-memo">${esc(e.memo || '')}</textarea></div>
      <button class="btn primary block" type="submit">${icon('check', 'sm')}保存する</button>
    </form>`,
    onMount(body, close) {
      let result = e.result || ''
      body.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => {
        result = b.dataset.r
        body.querySelectorAll('[data-r]').forEach((x) => x.classList.toggle('on', x === b))
        const exp = body.querySelector('#ef-expiry')
        const d = body.querySelector('#ef-date').value
        if (result === '合格' && c.validityDays && d && !exp.value) exp.value = addDays(d, c.validityDays)
      }))
      body.querySelector('#ef').onsubmit = (ev) => {
        ev.preventDefault()
        store.setExam(certId, {
          applied: body.querySelector('#ef-applied').value, date: body.querySelector('#ef-date').value, result,
          score: body.querySelector('#ef-score').value.trim(), expiry: body.querySelector('#ef-expiry').value,
          proof: body.querySelector('#ef-proof').value.trim(), memo: body.querySelector('#ef-memo').value.trim(),
        })
        close()
        toast(result === '合格' ? '合格おめでとうございます！' : '保存しました')
        if (result === '合格') import('../ui.js').then((m) => m.confetti())
      }
    },
  })
}

// ---- 書き出し ----
function rowsLogs() {
  const s = store.get()
  return [['日付', '資格', 'やったこと（コース名・章・ページ）', '時間（分）', '分かったこと（1行）', '分からなかったこと・聞きたいこと', `${mentorName()}のコメント`],
    ...s.logs.slice().reverse().map((x) => [x.date, getCert(x.cert)?.name || certLabel(x.cert), x.what, x.minutes, x.learned, x.ask, x.comment])]
}
function rowsResults() {
  const s = store.get()
  return [['日付', '資格', '何の問題か', '問題数', '正解数', '正答率', '間違えた分野（次に復習するところ）'],
    ...s.sessions.slice().reverse().map((x) => {
      const weak = x.weak || (x.cats ? Object.entries(x.cats).filter(([, v]) => v[1] / v[0] < 0.8).map(([k]) => getCert(x.cert)?.catById[k]?.name || k).join('、') : '')
      return [x.date, getCert(x.cert)?.name || certLabel(x.cert), x.mode === 'manual' ? x.title : `アプリ：${x.title}`, x.total, x.correct, `${pct(x.correct, x.total)}%`, weak]
    })]
}
function rowsExams() {
  const s = store.get()
  return [['資格', '申し込んだ日', '受験日', '結果（合格・不合格）', '点数・正答率', '有効期限（更新が必要な資格）', '証明の保存場所', 'メモ'],
    ...orderedCerts().map((c) => { const e = s.exams[c.id] || {}; return [c.name, e.applied, e.date, e.result, e.score, e.expiry, e.proof, e.memo] })]
}

// ---- 画面 ----
export async function render(el) {
  const draw = () => {
    const s = store.get()
    const d = today()
    const days = Array.from({ length: 7 }, (_, i) => addDays(d, i - 6))
    const WD = ['日', '月', '火', '水', '木', '金', '土']
    const items = days.map((x) => ({ label: WD[parseYmd(x).getDay()], value: s.logs.filter((l) => l.date === x).reduce((a, l) => a + (Number(l.minutes) || 0), 0), today: x === d }))
    const totalMin = s.logs.reduce((a, l) => a + (Number(l.minutes) || 0), 0)
    const weekMin = items.reduce((a, x) => a + x.value, 0)
    const byCert = orderedCerts().map((c) => ({ c, m: s.logs.filter((l) => l.cert === c.id).reduce((a, l) => a + (Number(l.minutes) || 0), 0) })).filter((x) => x.m > 0)
    const maxC = Math.max(1, ...byCert.map((x) => x.m))
    const m = mentorName()

    el.innerHTML = `
      <div class="topbar"><div class="title"></div></div>
      <div class="eyebrow">記録</div>
      <h1 class="big-title">学習の記録</h1>
      <button class="btn primary block section" data-act="share">${icon('share', 'sm')}${esc(m)}に進み具合を送る</button>
      <div class="card section">
        <div class="stat-row" style="margin-top:0">
          <div class="stat"><b>${(totalMin / 60).toFixed(1)}</b><span>合計（時間）</span></div>
          <div class="stat"><b>${weekMin}</b><span>この7日（分）</span></div>
          <div class="stat"><b>${streak()}</b><span>連続（日）</span></div>
        </div>
        <div style="margin-top:12px">${barChart(items, { goal: s.profile.dailyGoal })}</div>
        <div class="xsmall muted row" style="gap:6px;justify-content:flex-end"><svg width="18" height="4" aria-hidden="true"><line x1="0" x2="18" y1="2" y2="2" stroke="var(--ok)" stroke-dasharray="4 3" stroke-width="2"/></svg>1日の目標 ${s.profile.dailyGoal}分</div>
        ${byCert.length ? `<hr class="hr"><div class="col" style="gap:10px">${byCert.map((x) => `<div><div class="row between small"><span class="row" style="gap:8px"><i class="dot" style="background:${x.c.color}"></i><b>${esc(x.c.short)}</b></span><span class="muted">${fmtMin(x.m)}</span></div>${bar(x.m / maxC)}</div>`).join('')}</div>` : ''}
      </div>

      <div class="seg section" role="tablist" style="position:static">
        ${[['logs', '学習ログ'], ['results', '問題の結果'], ['exams', '受験'], ['export', '書き出し']].map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-tab="${k}">${l}</button>`).join('')}
      </div>
      <div class="section" id="tabbody">${tabBody(s, m)}</div>`
    animateIn(el)
  }

  function tabBody(s, m) {
    if (tab === 'logs') {
      return `<button class="btn primary block" data-act="addlog">${icon('plus', 'sm')}学習ログを書く</button>
        <div class="card section">${s.logs.length ? s.logs.slice(0, 200).map((x) => `
          <div class="log-item" data-log="${x.id}" role="button" tabindex="0">
            <div class="top"><i class="dot" style="background:${certColor(x.cert)}"></i><span>${fmtDate(x.date)}</span><span>・</span><b style="color:var(--ink-2)">${esc(certLabel(x.cert))}</b><span class="grow"></span><span class="chip">${fmtMin(x.minutes)}</span></div>
            ${x.what ? `<div class="what">${esc(x.what)}</div>` : ''}
            ${x.learned ? `<div class="note">${icon('check', 'xs')} ${esc(x.learned)}</div>` : ''}
            ${x.ask ? `<div class="ask"><b>${esc(m)}に聞くこと：</b>${esc(x.ask)}</div>` : ''}
            ${x.comment ? `<div class="note muted" style="margin-top:6px">${icon('message', 'xs')} ${esc(x.comment)}</div>` : ''}
          </div>`).join('') : emptyState('edit', 'まだ記録がありません。<br>勉強した日に1行書きましょう。')}</div>`
    }
    if (tab === 'results') {
      return `<button class="btn soft block" data-act="addres">${icon('plus', 'sm')}公式のサンプル問題などの結果を書く</button>
        <div class="card section">${s.sessions.length ? s.sessions.slice(0, 200).map((x) => { const r = x.correct / x.total; return `
          <div class="log-item">
            <div class="top"><i class="dot" style="background:${certColor(x.cert)}"></i><span>${fmtDate(x.date)}</span><span>・</span><b style="color:var(--ink-2)">${esc(certLabel(x.cert))}</b><span class="grow"></span>
              <span class="chip ${r >= 0.8 ? 'ok' : r >= 0.6 ? 'warn' : 'ng'}">${pct(x.correct, x.total)}%</span>
              <button class="icon-btn" data-delres="${x.id}" aria-label="この結果を削除" style="margin:-8px -8px -8px 0">${icon('trash', 'xs')}</button></div>
            <div class="what">${esc(x.title)}${x.mode === 'mock' ? ' <span class="chip primary">模試</span>' : ''}</div>
            <div class="note muted">${x.total}問中 ${x.correct}問正解${x.durationSec ? ` ・ ${Math.max(1, Math.round(x.durationSec / 60))}分` : ''}${x.weak ? ` ・ 弱い所：${esc(x.weak)}` : ''}</div>
          </div>` }).join('') : emptyState('target', '問題を解くと、ここに結果がたまります。')}</div>`
    }
    if (tab === 'exams') {
      return `<div class="card">${orderedCerts().map((c) => { const e = s.exams[c.id] || {}; return `
        <button class="list-row" data-exam="${c.id}">
          ${certMark(c)}
          <div class="grow"><b>${esc(c.short)}</b><div class="small muted">${e.result ? `${esc(e.result)}${e.date ? '・' + fmtDate(e.date, false) : ''}${e.expiry ? `・期限 ${fmtDate(e.expiry, false)}` : ''}` : e.date ? `受験予定 ${fmtDate(e.date)}` : e.applied ? `申込み ${fmtDate(e.applied, false)}` : 'まだ'}</div></div>
          ${e.result === '合格' ? `<span class="chip ok">${icon('medal', 'xs')}合格</span>` : ''}${icon('right', 'sm chev')}
        </button>` }).join('')}</div>`
    }
    // 書き出し
    return `<div class="card">
        <p class="small muted" style="margin-top:0">共有フォルダの「学習記録.xlsx」に貼り付けたり、${esc(m)}に送ったりするための書き出しです。</p>
        <div class="section-h" style="margin-top:6px"><h2 style="font-size:15px">Excel に貼り付ける（コピー）</h2></div>
        <div class="col">
          <button class="btn ghost block" data-copy="logs">${icon('clipboard', 'sm')}学習ログをコピー</button>
          <button class="btn ghost block" data-copy="results">${icon('clipboard', 'sm')}問題の結果をコピー</button>
          <button class="btn ghost block" data-copy="exams">${icon('clipboard', 'sm')}受験の予定と結果をコピー</button>
        </div>
        <p class="xsmall muted">コピーしたあと、Excel の同じ名前のシートで、見出しの次の行（A2）を選んで貼り付けます。1行目の見出しはコピーに含まれません。</p>
        <hr class="hr">
        <div class="section-h"><h2 style="font-size:15px">ファイルで保存（CSV）</h2></div>
        <div class="col">
          <button class="btn ghost block" data-csv="logs">${icon('download', 'sm')}学習ログ.csv</button>
          <button class="btn ghost block" data-csv="results">${icon('download', 'sm')}問題の結果.csv</button>
          <button class="btn ghost block" data-csv="exams">${icon('download', 'sm')}受験の予定と結果.csv</button>
        </div>
      </div>
      <div class="card section">
        <div class="section-h"><h2 style="font-size:15px">バックアップ</h2></div>
        <p class="small muted" style="margin-top:0">記録はこの端末の中にだけ保存されています。機種変更の前や、ときどき、バックアップを保存しておくと安心です。</p>
        <div class="grid2">
          <button class="btn soft" data-act="backup">${icon('download', 'sm')}保存</button>
          <button class="btn ghost" data-act="restore">${icon('upload', 'sm')}読み込む</button>
        </div>
        <input type="file" id="restore-file" accept="application/json,.json" hidden>
      </div>`
  }

  const ROWS = { logs: rowsLogs, results: rowsResults, exams: rowsExams }
  const NAMES = { logs: '学習ログ', results: '問題の結果', exams: '受験の予定と結果' }

  el.addEventListener('click', async (e) => {
    const t = e.target.closest('button, [data-log]')
    if (!t) return
    if (t.dataset.tab) {
      tab = t.dataset.tab
      const y0 = window.scrollY
      draw()
      // 新しいタブの先頭が見えるようにする
      const seg = el.querySelector('.seg')
      if (seg) window.scrollTo(0, Math.min(y0, Math.max(0, seg.getBoundingClientRect().top + window.scrollY - 12)))
      return
    }
    if (t.dataset.log) return openLogForm({}, t.dataset.log)
    if (t.dataset.exam) return openExamForm(t.dataset.exam)
    if (t.dataset.delres) {
      if (await confirmDialog({ title: 'この結果を削除しますか？', ok: '削除する', danger: true })) { store.removeSession(t.dataset.delres); toast('削除しました') }
      return
    }
    if (t.dataset.copy) {
      const rows = ROWS[t.dataset.copy]().slice(1)
      if (!rows.length) return toast('まだ記録がありません')
      try {
        await navigator.clipboard.writeText(toTSV(rows))
        toast(`${NAMES[t.dataset.copy]}をコピーしました（${rows.length}行）`)
      } catch (err) {
        download(`${NAMES[t.dataset.copy]}.tsv`, toTSV(rows), 'text/tab-separated-values')
        toast('コピーできなかったので、ファイルで保存しました')
      }
      return
    }
    if (t.dataset.csv) {
      download(`${NAMES[t.dataset.csv]}_${today()}.csv`, toCSV(ROWS[t.dataset.csv]()), 'text/csv')
      return
    }
    const act = t.dataset.act
    if (act === 'addlog') openLogForm()
    else if (act === 'addres') openResultForm()
    else if (act === 'share') openShareSheet()
    else if (act === 'backup') { download(`合格ノート_バックアップ_${today()}.json`, store.exportJSON(), 'application/json'); toast('バックアップを保存しました') }
    else if (act === 'restore') el.querySelector('#restore-file').click()
  })
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset && e.target.dataset.log) openLogForm({}, e.target.dataset.log)
  })
  el.addEventListener('change', async (e) => {
    if (e.target.id !== 'restore-file') return
    const f = e.target.files[0]
    if (!f) return
    try {
      const j = JSON.parse(await f.text())
      const data = j.data || j
      const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v)
      if (!isObj(data) || !Array.isArray(data.logs) || !isObj(data.q)) throw new Error('形式が違います')
      const ok = await confirmDialog({ title: 'バックアップを読み込みますか？', message: `いまの記録は、バックアップの内容（学習ログ ${data.logs.length}件）に置きかわります。`, ok: '読み込む', danger: true })
      if (!ok) return
      store.replace(data)
      toast('読み込みました')
    } catch (err) {
      toast('このファイルは読み込めませんでした')
    } finally {
      e.target.value = ''
    }
  })
  const unsub = store.subscribe(() => draw())
  draw()
  return () => unsub()
}

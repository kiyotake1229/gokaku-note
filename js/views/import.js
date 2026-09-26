// 相談相手からの返信（コメント）を受け取る
import { store } from '../store.js'
import { cert as getCert } from '../data.js'
import { icon } from '../icons.js'
import { esc, fmtDate } from '../util.js'
import { toast, confetti } from '../ui.js'
import { decode, normalizeReply } from '../share.js'
import { go, mentorName } from '../nav.js'
import { isIOSSafariTab } from '../pwa.js'

export async function render(el, p) {
  const code = p.query.r
  let data = null, unsupported = false
  try { if (code) data = normalizeReply(await decode(code)) } catch (e) { data = null; unsupported = e && e.code === 'unsupported' }
  const shell = (inner) => {
    el.innerHTML = `<div class="topbar glass"><a class="icon-btn" href="#/home" aria-label="ホームへ">${icon('left')}</a><div class="title">返信を受け取る</div></div>${inner}`
  }
  if (!data || data.v !== 1 || typeof data.c !== 'object') {
    shell(`<div class="empty" style="padding-top:18vh">${icon('alert')}<div><b>返信を読み込めませんでした</b><br>${unsupported ? 'お使いのスマホのブラウザが古いため開けません。OSやブラウザを最新にしてから、もう一度開いてください。' : 'リンクが途中で切れている可能性があります。もう一度送ってもらってください。'}</div><a class="btn soft" style="margin-top:14px" href="#/home">ホームへ</a></div>`)
    return
  }
  const s = store.get()
  const from = data.from || mentorName()
  const entries = Object.entries(data.c || {})
  const byId = Object.fromEntries(s.logs.map((l) => [l.id, l]))
  const matched = entries.filter(([id]) => byId[id])
  const already = (s.imported || []).includes(data.t)

  // 記録のない場所で開いた（iPhoneのSafariなど）ときは、ホーム画面のアプリへ持っていく方法を案内する
  const hasContent = entries.length || data.msg
  if (hasContent && !matched.length && (!s.profile.onboarded || isIOSSafariTab())) {
    const link = location.href
    shell(`
      <div class="card section">
        <div class="row" style="gap:10px">${icon('info')}<b>このリンクは、ホーム画面の「合格ノート」で受け取ってください</b></div>
        <p class="small" style="margin:10px 0">いま開いている場所には、学習の記録がありません（iPhone では、Safari とホーム画面のアプリで記録が別々になります）。</p>
        <ol class="small" style="padding-left:1.3em;line-height:1.9;margin:0 0 12px">
          <li>下の「リンクをコピー」を押す</li>
          <li>ホーム画面の「合格ノート」を開く</li>
          <li>「記録」→「${esc(data.from || mentorName())}に進み具合を送る」→ いちばん下の欄に貼り付けて「返信を受け取る」</li>
        </ol>
        <button class="btn primary block" id="copy">${icon('clipboard', 'sm')}リンクをコピー</button>
      </div>
      ${data.msg ? `<div class="card section mentor-msg"><div class="eyebrow">${esc(from)}からのひとこと</div><p style="margin:6px 0 0;white-space:pre-wrap">${esc(data.msg)}</p></div>` : ''}`)
    el.querySelector('#copy').onclick = async () => {
      try { await navigator.clipboard.writeText(link); toast('コピーしました') } catch (e) { toast('コピーできませんでした。アドレス欄から長押しでコピーしてください') }
    }
    return
  }

  shell(`
    <div class="eyebrow" style="margin-top:6px">${esc(from)}から</div>
    <h1 class="big-title" style="font-size:24px">返信が届きました</h1>
    ${already ? `<div class="alert info section">${icon('check')}<div><b>この返信は受け取り済みです</b><span class="small">もう一度受け取ると、同じコメントが重ならないように入ります。</span></div></div>` : ''}
    ${data.msg ? `<div class="card section mentor-msg"><div class="eyebrow">ひとこと</div><p style="margin:6px 0 0;white-space:pre-wrap">${esc(data.msg)}</p></div>` : ''}
    ${entries.length ? `<div class="card section"><div class="section-h"><h2>質問への答え</h2><span class="small muted">${entries.length}件</span></div>
      ${entries.map(([id, text]) => { const l = byId[id]; return `<div class="ask-item">
        ${l ? `<div class="xsmall muted">${fmtDate(l.date)} ・ ${esc(getCert(l.cert)?.short || '')}</div><div class="ask-q">${esc(l.ask || l.what || '')}</div>` : `<div class="xsmall muted">（この端末にない学習ログへの答えです）</div>`}
        <div class="note" style="background:var(--ok-soft);border-radius:10px;padding:8px 10px;white-space:pre-wrap">${esc(text)}</div></div>` }).join('')}</div>` : ''}
    <div class="section col">
      <button class="btn primary block lg" id="take">${icon('download', 'sm')}受け取って学習ログに入れる</button>
      <a class="btn ghost block" href="#/home">あとで</a>
    </div>
    <p class="xsmall muted">答えは、それぞれの学習ログの「${esc(mentorName())}のコメント」に入ります。コメントが入った質問は「聞くことリスト」から消えます。</p>`)

  el.querySelector('#take').onclick = () => {
    const st = store.get()
    let n = 0, missing = 0
    for (const [id, text] of entries) {
      const l = st.logs.find((x) => x.id === id)
      if (!l) { missing++; continue }
      if (!text) continue
      const cur = (l.comment || '').trim()
      // 同じ行がすでに入っているときだけ飛ばす（短いコメントを取りこぼさない）
      if (cur.split('\n').map((x) => x.trim()).includes(text.trim())) continue
      l.comment = cur ? `${cur}\n${text.trim()}` : text.trim()
      n++
    }
    st.mentorNotes = Array.isArray(st.mentorNotes) ? st.mentorNotes : []
    if (data.msg && !st.mentorNotes.some((x) => x.t === data.t)) st.mentorNotes.unshift({ t: data.t, from, msg: data.msg, read: false })
    st.mentorNotes = st.mentorNotes.slice(0, 30)
    st.imported = [...new Set([...(st.imported || []), data.t])].slice(-500)
    store.commit(true)
    const miss = missing ? `（${missing}件は、元の学習ログが見つからず入れられませんでした）` : ''
    toast((n ? `${n}件のコメントを学習ログに入れました` : data.msg ? 'ひとことを受け取りました' : '新しいコメントはありませんでした') + miss, { ms: missing ? 6000 : 2600 })
    if (n || data.msg) confetti()
    go('#/home', { replace: true })
  }
}

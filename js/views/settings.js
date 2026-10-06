// 設定
import { store } from '../store.js'
import { orderedCerts, meta } from '../data.js'
import { icon } from '../icons.js'
import { esc } from '../util.js'
import { toast, confirmDialog, animateIn } from '../ui.js'
import { canPrompt, promptInstall, installHelpHTML, isStandalone, syncThemeColor, isIOSSafariTab } from '../pwa.js'
import { go, mentorName } from '../nav.js'
import { canSpeak, speak } from '../speech.js'
import { openCalendarSheet } from './calsheet.js'
import { openSyncSheet, syncStatusText } from './syncsheet.js'
import { openFlagList, flagList } from './flagsheet.js'
import { saveBackup, readBackupFile, backupSummary, lastBackupDays } from '../backup.js'

export const APP_VERSION = '1.4.0'
export const FONT_SIZES = [['s', '小'], ['m', '標準'], ['l', '大'], ['xl', '特大']]

function applyTheme(th) {
  if (th === 'light' || th === 'dark') document.documentElement.setAttribute('data-theme', th)
  else document.documentElement.removeAttribute('data-theme')
  syncThemeColor()
}
export function applyFontSize(fs) {
  if (fs && fs !== 'm') document.documentElement.setAttribute('data-fs', fs)
  else document.documentElement.removeAttribute('data-fs')
}

export async function render(el) {
  const draw = () => {
    const s = store.get()
    const p = s.profile
    const certs = orderedCerts()
    const totalQ = certs.reduce((a, c) => a + ((c.counts && c.counts.total) || 0), 0)
    const totalT = certs.reduce((a, c) => a + ((c.counts && c.counts.terms) || 0), 0)
    const totalL = certs.reduce((a, c) => a + ((c.counts && c.counts.lessons) || 0), 0)
    const totalD = certs.reduce((a, c) => a + ((c.counts && c.counts.dict) || 0), 0)
    const pastQ = certs.reduce((a, c) => a + (c.extras || []).filter((x) => x.kind === 'past').reduce((b, x) => b + ((c.counts.extra || {})[x.set] || 0), 0), 0)
    el.innerHTML = `
      <div class="topbar"><div class="title"></div></div>
      <div class="eyebrow">設定</div>
      <h1 class="big-title">設定</h1>

      <div class="card section">
        <div class="section-h"><h2>あなたのこと</h2></div>
        <div class="field"><label for="st-name">呼び名</label><input class="input" id="st-name" value="${esc(p.name)}" placeholder="例：たろう" maxlength="20" autocomplete="nickname"></div>
        <div class="field" style="margin-bottom:0"><label for="st-mentor">分からないことを聞く相手</label><input class="input" id="st-mentor" value="${esc(p.mentor)}" placeholder="例：〇〇さん" maxlength="20">
          <span class="hint">学習ログの「聞きたいこと」や、ガイドの説明に使います。</span></div>
      </div>

      <div class="card section">
        <div class="section-h"><h2>学習</h2></div>
        <div class="field"><span class="lab">1日の目標</span><div class="stepper">${[15, 30, 45, 60, 90].map((n) => `<button data-goal="${n}" class="${p.dailyGoal === n ? 'on' : ''}">${n}分</button>`).join('')}</div></div>
        <div class="field"><span class="lab">1回に解く問題の数</span><div class="stepper">${[5, 10, 15, 20, 30].map((n) => `<button data-size="${n}" class="${p.quizSize === n ? 'on' : ''}">${n}問</button>`).join('')}</div></div>
        <button class="list-row" data-toggle="shuffle"><div class="grow"><b>選択肢の順番を入れかえる</b><div class="small muted">答えの位置で覚えてしまうのを防ぎます</div></div><span class="switch ${p.shuffle ? 'on' : ''}" role="switch" aria-checked="${p.shuffle}"></span></button>
        <button class="list-row" data-toggle="vibrate"><div class="grow"><b>振動で知らせる</b><div class="small muted">回答したときやタイマーの終わり（対応する端末のみ）</div></div><span class="switch ${p.vibrate ? 'on' : ''}" role="switch" aria-checked="${p.vibrate}"></span></button>
      </div>

      <div class="card section">
        <div class="section-h"><h2>表示</h2></div>
        <div class="field"><span class="lab">色</span><div class="stepper">${[['auto', '端末に合わせる', 'settings'], ['light', 'ライト', 'sun'], ['dark', 'ダーク', 'moon']].map(([k, l, ic]) => `<button data-theme="${k}" class="${p.theme === k ? 'on' : ''}" style="display:inline-flex;gap:6px;align-items:center">${icon(ic, 'xs')}${l}</button>`).join('')}</div></div>
        <div class="field" style="margin-bottom:0"><span class="lab">文字の大きさ</span><div class="stepper">${FONT_SIZES.map(([k, l]) => `<button data-fs="${k}" class="${(p.fs || 'm') === k ? 'on' : ''}">${l}</button>`).join('')}</div>
          <span class="hint">問題文・解説・ガイドなど、アプリ全体の文字が変わります。</span></div>
      </div>

      ${canSpeak() ? `<div class="card section">
        <div class="section-h"><h2>読み上げ</h2></div>
        <p class="small muted" style="margin-top:0">問題・解説・用語カードの ${icon('volume', 'xs')} を押すと、声で読み上げます。用語カードの「聞き流し」は、通勤中などに耳で覚えるのに使えます。</p>
        <div class="field" style="margin-bottom:8px"><span class="lab">速さ</span><div class="stepper">${[[0.8, 'ゆっくり'], [1, 'ふつう'], [1.2, '少し速い'], [1.4, '速い']].map(([v, l]) => `<button data-rate="${v}" class="${Number(p.speechRate || 1) === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
        <button class="btn ghost sm" data-act="testspeak">${icon('volume', 'xs')}試しに聞く</button>
      </div>` : ''}

      <div class="card section">
        <div class="section-h"><h2>カレンダー</h2></div>
        <button class="list-row" data-act="calendar"><span class="lr-ic">${icon('calendar', 'sm')}</span><div class="grow"><b>カレンダーに登録</b><div class="small muted">毎日の勉強の時間（${esc(p.studyTime || '20:00')}）・受験日・申込みの締切</div></div>${icon('right', 'sm chev')}</button>
      </div>

      <div class="card section">
        <div class="section-h"><h2>スマホのホーム画面に追加</h2></div>
        ${canPrompt() ? `<button class="btn primary block" data-act="install">${icon('download', 'sm')}アプリとして追加する</button>` : installHelpHTML()}
        ${isStandalone() ? '' : '<p class="xsmall muted" style="margin:10px 0 0">追加すると、アプリのように全画面で開けて、電波がないところでも使えます。</p>'}
      </div>

      <div class="card section">
        <div class="section-h"><h2>データ</h2></div>
        <p class="small muted" style="margin-top:0">記録は、この端末の中にだけ保存されます（外部には送られません）。ブラウザの履歴やデータを消すと、記録も消えるので、ときどきバックアップしてください。${isIOSSafariTab() ? 'iPhone の Safari のタブで使っていると、しばらく開かないときに記録が消えることがあります。ホーム画面に追加して使ってください。' : ''}</p>
        <div class="row small" style="gap:8px;margin-bottom:6px"><span class="dot" style="background:${navigator.serviceWorker && navigator.serviceWorker.controller ? 'var(--ok)' : 'var(--faint)'}"></span>オフライン対応：${navigator.serviceWorker && navigator.serviceWorker.controller ? '準備OK（電波がなくても使えます）' : '準備中（一度インターネットにつながった状態で開いてください）'}</div>
        <div class="grid2" style="margin:4px 0 2px">
          <button class="btn soft" data-act="backup">${icon('archive', 'sm')}バックアップ</button>
          <button class="btn ghost" data-act="restore">${icon('upload', 'sm')}読み込む</button>
        </div>
        <input type="file" id="st-restore" accept="application/json,.json" hidden>
        <p class="xsmall muted" style="margin:6px 0 4px">前回のバックアップ：${lastBackupDays() == null ? 'まだ一度もしていません' : lastBackupDays() === 0 ? '今日' : `${lastBackupDays()}日前`}。iPhone では、共有メニューの「ファイルに保存」（iCloud Drive）や、LINE の自分だけのトークに送っておくと安心です。</p>
        <button class="list-row" data-act="sync"><span class="lr-ic">${icon('cloud', 'sm')}</span><div class="grow"><b>自動で共有（Google スプレッドシート）</b><div class="small muted">${esc(syncStatusText())}・${esc(mentorName())}がいつでも最新を見られる・バックアップにもなる</div></div>${icon('right', 'sm chev')}</button>
        <button class="list-row" data-act="flags"><span class="lr-ic">${icon('flag', 'sm')}</span><div class="grow"><b>報告した問題</b><div class="small muted">${flagList().length}件・まとめて送れます</div></div>${icon('right', 'sm chev')}</button>
        <button class="list-row" data-go="#/log"><span class="lr-ic">${icon('download', 'sm')}</span><div class="grow"><b>Excel・CSV に書き出す</b><div class="small muted">記録 → 書き出し</div></div>${icon('right', 'sm chev')}</button>
        <button class="list-row" data-act="onboard"><span class="lr-ic">${icon('sparkles', 'sm')}</span><div class="grow"><b>はじめの説明をもう一度見る</b></div>${icon('right', 'sm chev')}</button>
        <button class="list-row" data-act="reset" style="color:var(--ng)"><span class="lr-ic" style="background:var(--ng-soft);color:var(--ng)">${icon('trash', 'sm')}</span><div class="grow"><b>すべての記録を消す</b></div></button>
        ${store.storageOk ? '' : `<div class="alert" style="margin-top:10px">${icon('alert')}<div><b>記録を保存できていません</b><span class="small">プライベートブラウズを使っている場合は、通常のモードで開いてください。</span></div></div>`}
      </div>

      <div class="card section">
        <div class="section-h"><h2>このアプリについて</h2></div>
        <p class="small" style="margin-top:0">合格ノート ${APP_VERSION} ・ 収録：${certs.length}資格、教科書 ${totalL}回、問題 ${totalQ}問（うち IPA 公開問題 ${pastQ}問）、用語 ${totalT}語（うち公式の出題範囲の用語辞典 ${totalD}語）、計算ドリル</p>
        <ul class="small muted" style="padding-left:1.2em;margin:0;line-height:1.85">
          <li>練習問題は、このアプリのために作ったオリジナルです。ただし「公式の過去問」は、IPA（情報処理推進機構）が公開している試験問題を、出典を示して原文のまま収録しています（解説はこのアプリが作成）。</li>
          <li>「2027年からの新しい範囲」の問題は、IPA が公開したシラバス案（Ver.0.1）をもとに作りました。シラバスが確定すると、内容が変わることがあります。</li>
          <li>教科書は、アプリの問題・用語・ガイド（事実確認ずみ）をもとに書き、別に点検したものです。公式の教材（シラバスや公式コース）と食い違ったら、公式の方を信じてください。</li>
          <li>用語辞典は、公式のシラバス（ITパスポート・情報セキュリティマネジメント・JSTQB・生成AIパスポート）や公式の学習コースにある用語のうち、アプリで説明が足りなかったものを、1〜2行で説明したものです（作成のあと、別に点検しています）。</li>
          <li>問題は、作成したあとに、答えを見ないで別に解き直す確認と、事実の確認をしています。それでも誤りが残っている可能性があります。公式の教材と食い違ったら、公式の方を信じてください。</li>
          <li>試験の情報（費用・日程・決まり）は ${esc(meta().asOf)} 時点のものです。申込みの前に、公式ページを必ず確認してください。</li>
          <li>試験中にこのアプリやメモを見ることは、試験の決まりで禁止されています。</li>
        </ul>
      </div>`
    animateIn(el)
  }

  el.addEventListener('change', async (e) => {
    const t = e.target
    if (t.id === 'st-restore') {
      const f = t.files[0]
      if (!f) return
      try {
        const data = await readBackupFile(f)
        const ok = await confirmDialog({ title: 'バックアップを読み込みますか？', message: `いまの記録は、バックアップの内容（${backupSummary(data)}）に置きかわります。`, ok: '読み込む', danger: true })
        if (ok) { store.replace(data); applyTheme(store.get().profile.theme); applyFontSize(store.get().profile.fs); toast('読み込みました'); draw() }
      } catch (err) {
        toast('このファイルは読み込めませんでした')
      } finally {
        t.value = ''
      }
      return
    }
    if (t.id === 'st-name') { store.setProfile({ name: t.value.trim() }); toast('保存しました') }
    if (t.id === 'st-mentor') { store.setProfile({ mentor: t.value.trim() }); toast('保存しました') }
  })
  el.addEventListener('click', async (e) => {
    const t = e.target.closest('button')
    if (!t) return
    const s = store.get()
    if (t.dataset.goal) { store.setProfile({ dailyGoal: Number(t.dataset.goal) }); draw(); return }
    if (t.dataset.size) { store.setProfile({ quizSize: Number(t.dataset.size) }); draw(); return }
    if (t.dataset.toggle) { store.setProfile({ [t.dataset.toggle]: !s.profile[t.dataset.toggle] }); draw(); return }
    if (t.dataset.theme) { store.setProfile({ theme: t.dataset.theme }); applyTheme(t.dataset.theme); draw(); return }
    if (t.dataset.fs) { store.setProfile({ fs: t.dataset.fs }); applyFontSize(t.dataset.fs); draw(); return }
    if (t.dataset.rate) { store.setProfile({ speechRate: Number(t.dataset.rate) }); draw(); speak('この速さで読み上げます。', { key: 'test' }); return }
    if (t.dataset.go) return go(t.dataset.go)
    const act = t.dataset.act
    if (act === 'install') { const ok = await promptInstall(); if (ok) toast('ホーム画面に追加しました'); draw() }
    else if (act === 'testspeak') speak('合格ノートです。問題と解説を、この声で読み上げます。', { key: 'test' })
    else if (act === 'calendar') openCalendarSheet()
    else if (act === 'sync') openSyncSheet()
    else if (act === 'flags') openFlagList()
    else if (act === 'backup') { const how = await saveBackup(); if (how !== 'cancel') { toast(how === 'share' ? 'バックアップを送りました' : 'バックアップを保存しました'); draw() } }
    else if (act === 'restore') el.querySelector('#st-restore').click()
    else if (act === 'onboard') { store.setProfile({ onboarded: false }); go('#/onboarding') }
    else if (act === 'reset') {
      const ok = await confirmDialog({ title: 'すべての記録を消しますか？', message: '学習ログ、問題の結果、受験の記録、復習の予定がすべて消えます。元に戻せません。', ok: '消す', danger: true })
      if (!ok) return
      const ok2 = await confirmDialog({ title: '本当に消しますか？', message: '念のため、先にバックアップを保存することをおすすめします。', ok: 'すべて消す', danger: true })
      if (!ok2) return
      store.reset()
      toast('すべての記録を消しました')
      draw()
    }
  })
  const onInstallable = () => draw()
  window.addEventListener('installable', onInstallable)
  let y = 0
  const unsub = store.subscribe(() => {
    if (document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return
    y = window.scrollY; draw(); window.scrollTo(0, y)
  })
  draw()
  return () => { window.removeEventListener('installable', onInstallable); unsub() }
}

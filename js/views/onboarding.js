// はじめての説明
import { store } from '../store.js'
import { icon } from '../icons.js'
import { esc } from '../util.js'
import { go } from '../nav.js'
import { installHelpHTML, isStandalone, canPrompt, promptInstall, isIOSSafariTab, iosNoticeHTML } from '../pwa.js'

export async function render(el) {
  let step = 0
  let moved = false
  const p = store.get().profile
  const STEPS = 4

  const draw = () => {
    const dots = `<div class="steps-dots" aria-hidden="true">${Array.from({ length: STEPS }, (_, i) => `<i class="${i === step ? 'on' : ''}"></i>`).join('')}</div>`
    let body = ''
    if (step === 0) {
      body = `<div class="art">${icon('cap')}</div>
        <h1>合格ノートへ<br>ようこそ</h1>
        <p>これから取る8つの資格を、1回30分ずつ、無理のない順番で進めるためのアプリです。</p>
        ${isIOSSafariTab() ? iosNoticeHTML() : ''}
        <div class="tip"><span class="ti">${icon('bolt')}</span><div><b>練習問題 と 模擬試験</b><span>苦手な分野と、忘れかけた問題を優先して出します。</span></div></div>
        <div class="tip"><span class="ti">${icon('cards')}</span><div><b>用語カード</b><span>意味を1行で言えるかを、カードで確かめます。</span></div></div>
        <div class="tip"><span class="ti">${icon('chart')}</span><div><b>学習の記録</b><span>学習ログ・問題の結果・受験の予定を記録して、Excelにも書き出せます。</span></div></div>`
    } else if (step === 1) {
      body = `<div class="art">${icon('target')}</div>
        <h1>合格までの<br>進め方</h1>
        <div class="tip"><span class="ti">${icon('timer')}</span><div><b>1回30分を基本に</b><span>長くやるより、回数を重ねる方が身につきます。下の真ん中のボタンでタイマーが使えます。</span></div></div>
        <div class="tip"><span class="ti">${icon('help')}</span><div><b>間違えたら、理由を分ける</b><span>「知らなかった」「読み違えた」「迷って外した」。教材に戻るのは「知らなかった」だけ。</span></div></div>
        <div class="tip"><span class="ti">${icon('check')}</span><div><b>8割を超えたら申込み</b><span>練習で安定して8割を超えたら、アプリが「申込OK」と知らせます。</span></div></div>`
    } else if (step === 2) {
      body = `<div class="art">${icon('user')}</div>
        <h1>あなたのことを<br>教えてください</h1>
        <p class="small">どちらも空欄のままで大丈夫です。あとから設定で変えられます。</p>
        <div class="field"><label for="ob-name">呼び名</label><input class="input" id="ob-name" value="${esc(p.name)}" placeholder="例：たろう" maxlength="20" autocomplete="nickname"></div>
        <div class="field"><label for="ob-mentor">分からないことを聞く相手</label><input class="input" id="ob-mentor" value="${esc(p.mentor)}" placeholder="例：〇〇さん" maxlength="20"><span class="hint">学習ログに書いた「聞きたいこと」を、この人に聞くリストにまとめます。</span></div>`
    } else {
      body = `<div class="art">${icon('download')}</div>
        <h1>ホーム画面に<br>追加しましょう</h1>
        <p>${isStandalone() ? 'すでにホーム画面から開いています。準備完了です。' : 'ホーム画面に追加すると、アプリのように開けて、電波がないところでも使えます。'}</p>
        ${canPrompt() ? `<button class="btn primary block" data-install>アプリとして追加する</button>` : `<div class="card">${installHelpHTML()}</div>`}
        <p class="xsmall muted" style="margin-top:14px">記録はこの端末の中にだけ保存されます。練習問題はオリジナルで、実際の試験問題ではありません。公式の教材と食い違ったら、公式を信じてください。</p>`
    }
    el.innerHTML = `<div class="onb">
      <div class="page-enter">${body}</div>
      <div class="spacer"></div>
      ${dots}
      <div class="row" style="gap:10px">
        ${step > 0 ? `<button class="btn ghost" data-act="back" aria-label="戻る">${icon('left')}</button>` : ''}
        <button class="btn primary lg grow" data-act="next">${step === STEPS - 1 ? 'はじめる' : '次へ'}${icon('right')}</button>
      </div>
    </div>`
    const h = el.querySelector('.onb h1')
    if (h) h.setAttribute('tabindex', '-1')
    if (moved) (el.querySelector('.onb input') || h)?.focus({ preventScroll: true })
    moved = true
  }

  function saveProfile() {
    const n = el.querySelector('#ob-name')
    const m = el.querySelector('#ob-mentor')
    if (n) store.setProfile({ name: n.value.trim(), mentor: m.value.trim() })
  }

  el.addEventListener('click', async (e) => {
    if (e.target.closest('[data-install]')) { await promptInstall(); draw(); return }
    const t = e.target.closest('[data-act]')
    if (!t) return
    saveProfile()
    if (t.dataset.act === 'back') { step = Math.max(0, step - 1); draw() }
    else if (step < STEPS - 1) { step++; draw() }
    else {
      store.setProfile({ onboarded: true })
      go('#/home', { replace: true })
    }
  })
  const onInstallable = () => { if (step === STEPS - 1) draw() }
  window.addEventListener('installable', onInstallable)
  draw()
  return () => window.removeEventListener('installable', onInstallable)
}

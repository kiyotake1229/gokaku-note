// 1回30分の学習タイマー
import { store } from '../store.js'
import { orderedCerts, cert as getCert } from '../data.js'
import { icon } from '../icons.js'
import { esc, fmtClock, vibrate } from '../util.js'
import { sheet, ring, toast } from '../ui.js'
import { openLogForm } from './log.js'

export const timerRunning = () => !!store.get().timer

function elapsedSec(t) {
  const now = t.pausedAt || Date.now()
  return Math.max(0, (now - t.start - (t.pausedTotal || 0)) / 1000)
}

function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext
    const ctx = new Ctx()
    ;[0, 0.35, 0.7].forEach((d) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = 'sine'
      o.frequency.value = 880
      g.gain.setValueAtTime(0.0001, ctx.currentTime + d)
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + d + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + d + 0.3)
      o.connect(g).connect(ctx.destination)
      o.start(ctx.currentTime + d)
      o.stop(ctx.currentTime + d + 0.32)
    })
  } catch (e) { /* 音が出せない環境では何もしない */ }
}

export function openTimer() {
  let iv = null
  let chosen = { minutes: 30, cert: store.get().profile.focusCert || orderedCerts()[0].id }
  sheet({
    title: '学習タイマー',
    body: '<div id="tm"></div>',
    onMount(body, close) {
      const root = body.querySelector('#tm')
      const draw = () => {
        const t = store.get().timer
        if (!t) {
          root.innerHTML = `
            <p class="muted small" style="margin-top:0">1回30分が基本です。長くやるより、回数を重ねる方が身につきます。</p>
            <div class="field"><label for="tm-cert">何の勉強をしますか</label>
              <select class="select" id="tm-cert">${orderedCerts().map((c) => `<option value="${c.id}" ${c.id === chosen.cert ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div>
            <div class="field"><span class="lab">時間</span><div class="stepper">${[15, 25, 30, 45, 60].map((n) => `<button type="button" data-m="${n}" class="${n === chosen.minutes ? 'on' : ''}">${n}分</button>`).join('')}</div></div>
            <button class="btn primary block lg" data-act="start">${icon('play', 'sm')}スタート</button>`
          root.querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => { chosen.minutes = Number(b.dataset.m); draw() }))
          root.querySelector('#tm-cert').onchange = (e) => { chosen.cert = e.target.value }
          return
        }
        const total = t.minutes * 60
        const el = elapsedSec(t)
        const left = total - el
        const done = left <= 0
        const c = getCert(t.cert)
        root.innerHTML = `
          <div class="timer-face">${ring(done ? 1 : el / total, { size: 240, stroke: 14, label: done ? '完了' : fmtClock(left), sub: done ? 'おつかれさまでした' : t.pausedAt ? '一時停止中' : `${esc(c ? c.short : '')} ・ ${t.minutes}分` })}</div>
          ${done ? `<button class="btn primary block lg" data-act="log">${icon('edit', 'sm')}学習ログに記録する</button>
            <button class="btn ghost block" style="margin-top:10px" data-act="discard">記録しないで閉じる</button>`
          : `<div class="grid2">
              <button class="btn ghost lg" data-act="${t.pausedAt ? 'resume' : 'pause'}">${icon(t.pausedAt ? 'play' : 'pause', 'sm')}${t.pausedAt ? '再開' : '一時停止'}</button>
              <button class="btn soft lg" data-act="stop">${icon('stop', 'sm')}ここで終える</button>
            </div>
            <p class="xsmall muted" style="text-align:center">画面を閉じても、時間は進みます。</p>`}`
        const circle = root.querySelector('circle.val')
        if (circle) { circle.style.transition = 'none'; circle.style.strokeDashoffset = circle.dataset.target }
      }
      const onAct = (e) => {
        const b = e.target.closest('[data-act]')
        if (!b) return
        const s = store.get()
        const act = b.dataset.act
        if (act === 'start') {
          s.timer = { start: Date.now(), minutes: chosen.minutes, cert: chosen.cert, pausedAt: null, pausedTotal: 0, notified: false }
          s.profile.focusCert = chosen.cert
          store.commit(true)
          toast(`${chosen.minutes}分のタイマーを始めました`)
        } else if (act === 'pause') { s.timer.pausedAt = Date.now(); store.commit(true) }
        else if (act === 'resume') { s.timer.pausedTotal += Date.now() - s.timer.pausedAt; s.timer.pausedAt = null; store.commit(true) }
        else if (act === 'stop' || act === 'log') {
          const t = s.timer
          const minutes = Math.max(1, Math.round(Math.min(elapsedSec(t), t.minutes * 60) / 60))
          s.timer = null
          store.commit(true)
          close()
          openLogForm({ cert: t.cert, minutes })
          return
        } else if (act === 'discard') { s.timer = null; store.commit(true); close(); return }
        draw()
      }
      root.addEventListener('click', onAct)
      draw()
      iv = setInterval(() => {
        const t = store.get().timer
        if (!t || t.pausedAt) return
        const left = t.minutes * 60 - elapsedSec(t)
        if (left <= 0 && !t.notified) {
          t.notified = true
          store.commit(true)
          if (store.get().profile.vibrate) vibrate([200, 100, 200])
          beep()
        }
        draw()
      }, 1000)
    },
    onClose() { clearInterval(iv) },
  })
}

// どの画面にいても、時間になったら知らせる
setInterval(() => {
  const t = store.get().timer
  if (!t || t.pausedAt || t.notified) return
  if (elapsedSec(t) >= t.minutes * 60) {
    t.notified = true
    store.commit(true)
    if (store.get().profile.vibrate) vibrate([200, 100, 200])
    beep()
    if (!document.querySelector('.sheet')) toast('タイマーが終わりました。おつかれさまでした', { action: '記録する', ms: 12000, onAction: () => openTimer() })
  }
}, 5000)

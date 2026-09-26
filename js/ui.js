// 画面部品：トースト、シート、確認ダイアログ、リング、グラフ、紙吹雪
import { esc } from './util.js'
import { icon } from './icons.js'

const layer = () => document.getElementById('layer')

export function toast(msg, { action, onAction, ms = 2600 } = {}) {
  let wrap = document.querySelector('.toast-wrap')
  if (!wrap) {
    wrap = document.createElement('div')
    wrap.className = 'toast-wrap'
    layer().appendChild(wrap)
  }
  wrap.innerHTML = ''
  wrap.classList.toggle('top', !!document.querySelector('.sheet:not(.out)'))
  const t = document.createElement('div')
  t.className = 'toast'
  t.setAttribute('role', 'status')
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`
  wrap.appendChild(t)
  if (action) t.querySelector('button').onclick = () => { onAction && onAction(); close() }
  const timer = setTimeout(close, ms)
  function close() {
    clearTimeout(timer)
    t.classList.add('out')
    setTimeout(() => t.remove(), 260)
  }
}

let openSheets = 0
let lockedY = 0
// iPhone でも背景がスクロールしないよう、body を固定する
function lockScroll() {
  lockedY = window.scrollY
  const b = document.body.style
  b.position = 'fixed'; b.top = `-${lockedY}px`; b.left = '0'; b.right = '0'; b.width = '100%'
  document.documentElement.style.overflow = 'hidden'
}
function unlockScroll() {
  const b = document.body.style
  b.position = ''; b.top = ''; b.left = ''; b.right = ''; b.width = ''
  document.documentElement.style.overflow = ''
  window.scrollTo(0, lockedY)
}
export function sheet({ title = '', body = '', onMount, onClose } = {}) {
  const ov = document.createElement('div')
  ov.className = 'overlay'
  const sh = document.createElement('div')
  sh.className = 'sheet'
  sh.setAttribute('role', 'dialog')
  sh.setAttribute('aria-modal', 'true')
  if (title) sh.setAttribute('aria-label', title)
  sh.innerHTML = `<div class="sheet-grab"></div>
    <div class="sheet-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="閉じる">${icon('x')}</button></div>
    <div class="sheet-body">${body}</div>`
  layer().append(ov, sh)
  if (!openSheets) lockScroll()
  openSheets++
  let closed = false
  const close = (result) => {
    if (closed) return
    closed = true
    ov.classList.add('out')
    sh.classList.add('out')
    openSheets = Math.max(0, openSheets - 1)
    if (!openSheets) unlockScroll()
    document.removeEventListener('keydown', onKey)
    setTimeout(() => { ov.remove(); sh.remove() }, 260)
    onClose && onClose(result)
  }
  const onKey = (e) => { if (e.key === 'Escape') close() }
  document.addEventListener('keydown', onKey)
  ov.onclick = () => close()
  ov.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false })
  sh.querySelector('[data-close]').onclick = () => close()
  // 下にスワイプで閉じる
  let y0 = null
  const grab = sh.querySelector('.sheet-grab')
  const head = sh.querySelector('.sheet-head')
  ;[grab, head].forEach((el) => {
    el.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY }, { passive: true })
    el.addEventListener('touchmove', (e) => {
      if (y0 == null) return
      const dy = e.touches[0].clientY - y0
      if (dy > 0) sh.style.transform = `translateY(${dy}px)`
    }, { passive: true })
    el.addEventListener('touchend', (e) => {
      if (y0 == null) return
      const dy = e.changedTouches[0].clientY - y0
      y0 = null
      if (dy > 90) close()
      else sh.style.transform = ''
    })
  })
  const bodyEl = sh.querySelector('.sheet-body')
  onMount && onMount(bodyEl, close)
  setTimeout(() => {
    const f = sh.querySelector('[autofocus]')
    if (f) f.focus()
  }, 350)
  return close
}

export function confirmDialog({ title, message = '', ok = 'OK', cancel = 'やめる', danger = false }) {
  return new Promise((resolve) => {
    const ov = document.createElement('div')
    ov.className = 'overlay'
    const dg = document.createElement('div')
    dg.className = 'dialog'
    dg.setAttribute('role', 'alertdialog')
    dg.setAttribute('aria-modal', 'true')
    dg.innerHTML = `<h3>${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : ''}
      <div class="actions"><button class="btn ghost" data-v="0">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-v="1">${esc(ok)}</button></div>`
    layer().append(ov, dg)
    const done = (v) => {
      ov.classList.add('out')
      dg.style.opacity = '0'
      dg.style.transition = 'opacity .2s'
      setTimeout(() => { ov.remove(); dg.remove() }, 220)
      document.removeEventListener('keydown', onKey)
      resolve(v)
    }
    const onKey = (e) => { if (e.key === 'Escape') done(false) }
    document.addEventListener('keydown', onKey)
    ov.onclick = () => done(false)
    dg.querySelectorAll('button').forEach((b) => (b.onclick = () => done(b.dataset.v === '1')))
    // 取り消せない操作のときは「やめる」側を最初に選んでおく
    setTimeout(() => dg.querySelector(danger ? '[data-v="0"]' : '[data-v="1"]').focus(), 50)
  })
}

// 円形の進み具合
export function ring(value, { size = 96, stroke = 10, color = 'url(#rg)', label = '', sub = '', id = '' } = {}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const v = Math.max(0, Math.min(1, value || 0))
  const gid = 'rg' + Math.random().toString(36).slice(2, 7)
  const col = color === 'url(#rg)' ? `url(#${gid})` : color
  return `<div class="ring-wrap" style="width:${size}px;height:${size}px" ${id ? `id="${id}"` : ''}>
    <svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="var(--primary)"/><stop offset="1" stop-color="var(--primary-2)"/></linearGradient></defs>
      <circle class="track" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke-width="${stroke}"/>
      <circle class="val" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${col}" stroke-width="${stroke}" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${c}" data-target="${c * (1 - v)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
    </svg>
    <div class="ring-label"><div><b>${label}</b>${sub ? `<br><span>${sub}</span>` : ''}</div></div>
  </div>`
}
// 描画後にリングとバーをアニメーションさせる
export function animateIn(root) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    root.querySelectorAll('circle.val[data-target]').forEach((el) => { el.style.strokeDashoffset = el.dataset.target })
    root.querySelectorAll('.bar > i[data-w]').forEach((el) => { el.style.width = el.dataset.w })
  }))
}
export function bar(value, cls = '', markAt = null) {
  const w = Math.max(0, Math.min(1, value || 0)) * 100
  return `<div class="bar ${cls}"><i style="width:0" data-w="${w}%"></i>${markAt != null ? `<span class="mark" style="left:${markAt * 100}%"></span>` : ''}</div>`
}

// 7日間などの棒グラフ
export function barChart(items, { height = 140, unit = '分', goal = null, width = 320 } = {}) {
  const w = width, padB = 22, padT = 16
  items = items.map((x) => ({ ...x, value: Math.max(0, Number(x.value) || 0) }))
  const max = Math.max(goal || 0, ...items.map((x) => x.value), 1)
  const bw = w / items.length
  const h = height - padB - padT
  let out = `<svg class="chart" viewBox="0 0 ${w} ${height}" role="img" aria-label="学習時間のグラフ">`
  out += `<defs><linearGradient id="bcg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--primary)"/><stop offset="1" stop-color="var(--primary-2)"/></linearGradient></defs>`
  if (goal) {
    const gy = padT + h - (goal / max) * h
    out += `<line x1="0" x2="${w}" y1="${gy}" y2="${gy}" stroke="var(--ok)" stroke-dasharray="4 4" stroke-width="1.5" opacity=".7"/>`
  }
  items.forEach((it, i) => {
    const bh = Math.max(it.value ? 4 : 0, (it.value / max) * h)
    const x = i * bw + bw * 0.22
    const y = padT + h - bh
    out += `<rect class="bar-r" x="${x}" y="${y}" width="${bw * 0.56}" height="${bh}" rx="6" fill="${it.value ? 'url(#bcg)' : 'var(--surface-3)'}" opacity="${it.dim ? 0.45 : 1}"><title>${esc(it.label)} ${Number(it.value) || 0}${esc(unit)}</title></rect>`
    if (!it.value) out += `<rect x="${x}" y="${padT + h - 4}" width="${bw * 0.56}" height="4" rx="2" fill="var(--surface-3)"/>`
    if (it.value) out += `<text x="${x + bw * 0.28}" y="${y - 4}" text-anchor="middle" style="fill:var(--ink-2)">${Number(it.value) || 0}</text>`
    out += `<text x="${x + bw * 0.28}" y="${height - 6}" text-anchor="middle" ${it.today ? 'style="fill:var(--primary);font-weight:800"' : ''}>${esc(it.label)}</text>`
  })
  return out + '</svg>'
}

export function certMark(c, lg = false) {
  return `<div class="cert-mark ${lg ? 'lg' : ''}" style="background:linear-gradient(135deg, ${c.color}, color-mix(in srgb, ${c.color} 70%, #000))" aria-hidden="true">${esc(c.glyph)}</div>`
}

export function confetti() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const cv = document.createElement('canvas')
  cv.className = 'confetti'
  const dpr = window.devicePixelRatio || 1
  cv.width = innerWidth * dpr
  cv.height = innerHeight * dpr
  layer().appendChild(cv)
  const ctx = cv.getContext('2d')
  ctx.scale(dpr, dpr)
  const colors = ['#3355E8', '#5B3FE0', '#12A06A', '#F5A524', '#E0464E', '#06B6D4']
  const parts = Array.from({ length: 140 }, () => ({
    x: innerWidth / 2 + (Math.random() - 0.5) * 120,
    y: innerHeight * 0.35,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 13 - 4,
    r: Math.random() * 6 + 4,
    a: Math.random() * Math.PI,
    va: (Math.random() - 0.5) * 0.3,
    c: colors[(Math.random() * colors.length) | 0],
  }))
  let t = 0
  const tick = () => {
    t++
    ctx.clearRect(0, 0, innerWidth, innerHeight)
    for (const p of parts) {
      p.vy += 0.32
      p.vx *= 0.99
      p.x += p.vx
      p.y += p.vy
      p.a += p.va
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.a)
      ctx.fillStyle = p.c
      ctx.globalAlpha = Math.max(0, 1 - t / 150)
      ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2)
      ctx.restore()
    }
    if (t < 150) requestAnimationFrame(tick)
    else cv.remove()
  }
  requestAnimationFrame(tick)
}

export function emptyState(ic, text) {
  return `<div class="empty">${icon(ic)}<div>${text}</div></div>`
}

// データを読み込めなかったときの表示（もう一度ボタンつき）
export function loadError(el, retry, back = '#/home') {
  el.innerHTML = `<div class="empty" style="padding-top:22vh">${icon('alert')}<div><b>データを読み込めませんでした</b><br>電波のよいところで、もう一度お試しください。</div>
    <div class="row" style="justify-content:center;margin-top:16px;gap:10px"><a class="btn ghost" href="${back}">戻る</a><button class="btn primary" type="button" data-retry>もう一度</button></div></div>`
  el.querySelector('[data-retry]').onclick = retry
}

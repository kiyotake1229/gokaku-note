// 合格ノート：起動と画面の切りかえ
import { store } from './store.js'
import { loadMeta } from './data.js'
import { icon } from './icons.js'
import { toast } from './ui.js'
import { certStats } from './srs.js'
import { meta } from './data.js'
import { openTimer, timerRunning } from './views/timer.js'
import { go } from './nav.js'
import { startAutoSync } from './sync.js'
import './pwa.js'

const views = {
  home: () => import('./views/home.js'),
  cert: () => import('./views/cert.js'),
  quiz: () => import('./views/quiz.js'),
  flash: () => import('./views/flash.js'),
  review: () => import('./views/review.js'),
  log: () => import('./views/log.js'),
  settings: () => import('./views/settings.js'),
  guide: () => import('./views/guide.js'),
  onboarding: () => import('./views/onboarding.js'),
  import: () => import('./views/import.js'),
  drill: () => import('./views/drill.js'),
  search: () => import('./views/search.js'),
  lesson: () => import('./views/lesson.js'),
  tquiz: () => import('./views/termquiz.js'),
}
const TAB_ROUTES = ['home', 'review', 'log', 'settings']
const NO_TAB = ['quiz', 'flash', 'onboarding', 'drill', 'lesson', 'tquiz']

let cleanup = null
let current = ''
let routeToken = 0


function parse() {
  const raw = location.hash.replace(/^#\/?/, '')
  const [path, qs] = raw.split('?')
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const name = parts[0] || 'home'
  const query = Object.fromEntries(new URLSearchParams(qs || ''))
  return { name, parts: parts.slice(1), query }
}

async function route() {
  const token = ++routeToken
  const p = parse()
  const s = store.get()
  if (!s.profile.onboarded && p.name !== 'onboarding' && p.name !== 'import') return go('#/onboarding', { replace: true })
  const loader = views[p.name] || views.home
  const el = document.getElementById('view')
  const key = location.hash
  if (cleanup) { try { cleanup() } catch (e) { console.error(e) } cleanup = null }
  let mod
  try {
    mod = await loader()
  } catch (e) {
    el.innerHTML = `<div class="empty">${icon('alert')}<div>画面を読み込めませんでした。通信状況を確かめて、もう一度開いてください。</div></div>`
    return
  }
  if (token !== routeToken || key !== location.hash) return // 読み込み中に別の画面へ移動した
  const viewKey = p.name + '/' + (p.parts[0] || '')
  const sameView = current === viewKey
  current = viewKey
  el.className = 'view' + (NO_TAB.includes(p.name) ? ' no-tab' : '')
  document.body.classList.toggle('no-tab-mode', NO_TAB.includes(p.name))
  el.innerHTML = ''
  const inner = document.createElement('div')
  inner.className = sameView ? '' : 'page-enter'
  el.appendChild(inner)
  if (!sameView) window.scrollTo(0, 0)
  try {
    const c = (await mod.render(inner, p)) || null
    if (token !== routeToken) { if (c) try { c() } catch (e) { /* 片付けの失敗は無視 */ } return }
    cleanup = c
  } catch (e) {
    console.error(e)
    inner.innerHTML = `<div class="empty">${icon('alert')}<div>表示中にエラーが起きました。<br><small>${String(e.message || e)}</small></div></div>`
  }
  try {
    renderTabbar(p.name)
  } catch (e) {
    // 集計に失敗しても、タブバー（設定へ行く道）だけは必ず出す
    console.error(e)
    const nav = document.getElementById('tabbar')
    nav.hidden = false
    nav.innerHTML = `<div class="tabbar-inner" style="grid-template-columns:repeat(2,1fr)"><a class="tab" href="#/home">${icon('home')}<span>ホーム</span></a><a class="tab" href="#/settings">${icon('settings')}<span>設定</span></a></div>`
  }
}

export function renderTabbar(active = parse().name) {
  const nav = document.getElementById('tabbar')
  const hide = NO_TAB.includes(active)
  nav.hidden = hide
  if (hide) return
  const tabName = TAB_ROUTES.includes(active) ? active : active === 'cert' || active === 'guide' || active === 'search' ? 'home' : ''
  const dueTotal = meta() ? meta().certs.reduce((a, c) => a + certStats(c.id).due, 0) : 0
  const t = (id, label, ic, badge) => `<a class="tab ${tabName === id ? 'on' : ''}" href="#/${id}" ${tabName === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span>${badge ? `<i class="badge">${badge > 99 ? '99+' : badge}</i>` : ''}</a>`
  nav.innerHTML = `<div class="tabbar-inner">
    ${t('home', 'ホーム', 'home')}
    ${t('review', '復習', 'repeat', dueTotal)}
    <div class="tab-center"><button class="tab-fab ${timerRunning() ? 'running' : ''}" id="fab-timer" aria-label="30分タイマー">${icon('timer', 'lg')}</button></div>
    ${t('log', '記録', 'chart')}
    ${t('settings', '設定', 'settings')}
  </div>`
  nav.querySelector('#fab-timer').onclick = () => openTimer()
}

async function boot() {
  registerSW()
  try {
    await loadMeta()
  } catch (e) {
    const v = document.getElementById('view')
    v.innerHTML = `<div class="empty" style="padding-top:25vh">${icon('alert')}<div>データを読み込めませんでした。<br>インターネットにつながった状態で、もう一度開いてください。</div><button class="btn primary" style="margin-top:16px" type="button" id="boot-retry">もう一度</button></div>`
    v.querySelector('#boot-retry').onclick = () => location.reload()
    return
  }
  window.addEventListener('hashchange', route)
  try { startAutoSync() } catch (e) { console.error(e) }
  store.subscribe(() => {
    // バッジなどを最新にする（画面そのものは各画面が必要に応じて描き直す）
    const n = parse().name
    if (!NO_TAB.includes(n)) try { renderTabbar(n) } catch (e) { console.error(e) }
  })
  route()
}

function registerSW() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return
  // 開発中（手元のサーバー）はキャッシュしない。以前に登録したものが残っていれば外す
  if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) && !/[?&]sw=1/.test(location.search)) {
    navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {})
    if (window.caches) caches.keys().then((ks) => ks.filter((k) => k.startsWith('gokaku-')).forEach((k) => caches.delete(k))).catch(() => {})
    return
  }
  const hadController = !!navigator.serviceWorker.controller
  let userAccepted = false
  const showUpdate = (worker) => {
    if (!worker || document.getElementById('update-bar')) return
    const bar = document.createElement('div')
    bar.id = 'update-bar'
    bar.className = 'update-bar'
    bar.setAttribute('role', 'status')
    bar.innerHTML = `${icon('sparkles', 'sm')}<span class="grow">新しいバージョンがあります</span><button type="button">更新する</button>`
    bar.querySelector('button').onclick = () => { userAccepted = true; worker.postMessage('skipWaiting') }
    document.getElementById('layer').appendChild(bar)
  }
  const watch = (reg, w) => {
    w.addEventListener('statechange', () => {
      if (w.state === 'installed') {
        if (navigator.serviceWorker.controller) showUpdate(w)
      } else if (w.state === 'activated' && !hadController) {
        toast('オフラインでも使えるようになりました')
      } else if (w.state === 'redundant' && !navigator.serviceWorker.controller) {
        setTimeout(() => reg.update().catch(() => {}), 30000)
      }
    })
  }
  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting)
    if (reg.installing) watch(reg, reg.installing)
    reg.addEventListener('updatefound', () => { if (reg.installing) watch(reg, reg.installing) })
    // アプリに戻るたびに、新しい版がないか確かめる
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {})
    })
  }).catch(() => {})
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // 初めて開いたときの切りかえでは再読み込みしない（入力中の内容が消えるため）
    if (reloaded || !hadController || !userAccepted) return
    reloaded = true
    location.reload()
  })
  // 記録が勝手に消されにくくする（対応しているブラウザのみ）
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {})
}

boot()

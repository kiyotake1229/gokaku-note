// オフラインで使うための Service Worker（tools/gen_sw.py で自動生成）
const VERSION = '58afbe881c'
// 同じ github.io の別リポジトリとぶつからないよう、公開場所のパスを名前に含める
const PREFIX = 'gokaku-' + new URL(self.registration.scope).pathname + '-'
const CACHE = PREFIX + VERSION
const FILES = [
"./",
"css/app.css",
"data/certs.json",
"data/guides/ga4.json",
"data/guides/gads.json",
"data/guides/genai.json",
"data/guides/intro.json",
"data/guides/itpass.json",
"data/guides/jstqb.json",
"data/guides/line.json",
"data/guides/sg.json",
"data/questions/ga4.json",
"data/questions/gads.json",
"data/questions/genai.json",
"data/questions/itpass.json",
"data/questions/jstqb.json",
"data/questions/line-adv.json",
"data/questions/line-basic.json",
"data/questions/sg.json",
"data/terms/ga4.json",
"data/terms/gads.json",
"data/terms/genai.json",
"data/terms/itpass.json",
"data/terms/jstqb.json",
"data/terms/line-adv.json",
"data/terms/line-basic.json",
"data/terms/sg.json",
"icons/apple-touch-icon.png",
"icons/icon-192.png",
"icons/icon-512.png",
"icons/icon.svg",
"icons/maskable-512.png",
"index.html",
"js/app.js",
"js/boot.js",
"js/data.js",
"js/icons.js",
"js/nav.js",
"js/pwa.js",
"js/report-build.js",
"js/report.js",
"js/share.js",
"js/srs.js",
"js/store.js",
"js/ui.js",
"js/util.js",
"js/views/cert.js",
"js/views/flash.js",
"js/views/guide.js",
"js/views/home.js",
"js/views/import.js",
"js/views/log.js",
"js/views/onboarding.js",
"js/views/quiz.js",
"js/views/review.js",
"js/views/settings.js",
"js/views/sharesheet.js",
"js/views/timer.js",
"manifest.webmanifest",
"report.html"
]

self.addEventListener('install', (e) => {
  // ブラウザのHTTPキャッシュに残った古いファイルを取り込まないよう、必ずネットから取り直す
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((u) => new Request(u, { cache: 'reload' })))))
})
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})
self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting()
})
self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  e.respondWith(
    caches.open(CACHE).then((c) => c.match(req, { ignoreSearch: true })).then((hit) => {
      if (hit) return hit
      return fetch(req).then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }
        return res
      }).catch(() => (req.mode === 'navigate' ? caches.open(CACHE).then((c) => c.match('index.html')) : Response.error()))
    })
  )
})

#!/usr/bin/env python3
"""オフライン用の sw.js を作る（全ファイルの一覧と、内容から作ったバージョン番号を入れる）"""
import os, hashlib, json
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
files = ['./', 'index.html', 'report.html', 'manifest.webmanifest']
for d in ['css', 'js', 'data', 'icons']:
    for dp, dirs, fns in os.walk(os.path.join(ROOT, d)):
        dirs.sort()
        for fn in sorted(fns):
            if fn.startswith('.') or fn.startswith('_'):
                continue
            files.append(os.path.relpath(os.path.join(dp, fn), ROOT).replace(os.sep, '/'))
files = ['./'] + sorted(set(files) - {'./'})
h = hashlib.sha256()
for f in files[1:]:
    h.update(f.encode()); h.update(open(os.path.join(ROOT, f), 'rb').read())
ver = h.hexdigest()[:10]
sw = f"""// オフラインで使うための Service Worker（tools/gen_sw.py で自動生成）
const VERSION = '{ver}'
// 同じ github.io の別リポジトリとぶつからないよう、公開場所のパスを名前に含める
const PREFIX = 'gokaku-' + new URL(self.registration.scope).pathname + '-'
const CACHE = PREFIX + VERSION
const FILES = {json.dumps(sorted(set(files)), ensure_ascii=False, indent=0)}

self.addEventListener('install', (e) => {{
  // ブラウザのHTTPキャッシュに残った古いファイルを取り込まないよう、必ずネットから取り直す
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES.map((u) => new Request(u, {{ cache: 'reload' }})))))
}})
self.addEventListener('activate', (e) => {{
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith(PREFIX) && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
}})
self.addEventListener('message', (e) => {{
  if (e.data === 'skipWaiting') self.skipWaiting()
}})
self.addEventListener('fetch', (e) => {{
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return
  e.respondWith(
    caches.open(CACHE).then((c) => c.match(req, {{ ignoreSearch: true }})).then((hit) => {{
      if (hit) return hit
      return fetch(req).then((res) => {{
        if (res.ok && res.type === 'basic') {{
          const copy = res.clone()
          caches.open(CACHE).then((c) => c.put(req, copy))
        }}
        return res
      }}).catch(() => (req.mode === 'navigate' ? caches.open(CACHE).then((c) => c.match('index.html')) : Response.error()))
    }})
  )
}})
"""
open(os.path.join(ROOT, 'sw.js'), 'w', encoding='utf-8').write(sw)
print('sw.js', ver, len(files), 'files')

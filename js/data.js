// 問題・用語・ガイドの読み込み（読み込んだものはメモリに保持）
const cache = new Map()

async function getJSON(path) {
  if (cache.has(path)) return cache.get(path)
  const p = fetch(path).then((r) => {
    if (!r.ok) throw new Error(`${path}: ${r.status}`)
    return r.json()
  })
  cache.set(path, p)
  try {
    return await p
  } catch (e) {
    cache.delete(path)
    throw e
  }
}

let META = null
export async function loadMeta() {
  META = await getJSON('data/certs.json')
  META.byId = Object.fromEntries(META.certs.map((c) => [c.id, c]))
  META.certs.forEach((c) => {
    c.catById = Object.fromEntries(c.categories.map((x) => [x.id, x]))
  })
  return META
}
export const meta = () => META
export const cert = (id) => META && META.byId[id]
export const orderedCerts = () => META.order.map((id) => META.byId[id]).filter(Boolean)

// 読み込みに失敗したときは例外を投げる（「0件」と区別するため）
export async function questions(certId) {
  return getJSON(`data/questions/${certId}.json`)
}
export async function terms(certId) {
  return getJSON(`data/terms/${certId}.json`)
}
export async function guide(guideId) {
  return getJSON(`data/guides/${guideId}.json`)
}
export async function allQuestions() {
  const lists = await Promise.all(META.order.map((id) => questions(id)))
  return lists.flat()
}
export function catName(certId, catId) {
  const c = cert(certId)
  return (c && c.catById[catId] && c.catById[catId].name) || '基本用語'
}

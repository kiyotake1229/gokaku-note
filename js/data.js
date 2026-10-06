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
// 公式の過去問（IPA 公開問題）や、2027年からの新しい範囲の問題も、同じ資格の問題としてまとめて返す
const merged = new Map()
export async function questions(certId) {
  if (merged.has(certId)) return merged.get(certId)
  const c = cert(certId)
  const extras = (c && c.extras) || []
  const p = Promise.all([getJSON(`data/questions/${certId}.json`), ...extras.map((x) => getJSON(x.file))])
    .then(([main, ...rest]) => main.concat(...rest.map((list, i) => list.map((q) => ({ ...q, set: extras[i].set, kind: extras[i].kind })))))
  merged.set(certId, p)
  try {
    return await p
  } catch (e) {
    merged.delete(certId)
    throw e
  }
}
export async function summaries(certId) {
  return getJSON(`data/summaries/${certId}.json`)
}
export const extrasOf = (certId) => ((cert(certId) && cert(certId).extras) || [])
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
